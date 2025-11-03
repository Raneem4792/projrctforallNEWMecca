// backend/provisioner.js
import fs from 'fs/promises';
import path from 'path';
import mysql from 'mysql2/promise';
import { URL } from 'url';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * تحويل DSN إلى كائن إعدادات MySQL مع التحقق من الصحة
 */
function dsnToObj(dsn, nameForError = 'DSN') {
  // التحقق من وجود القيمة
  if (!dsn || typeof dsn !== 'string') {
    throw new Error(`❌ ${nameForError} غير موجود أو فارغ. تحقق من ملف .env`);
  }

  // التحقق من صحة الصيغة
  let u;
  try {
    u = new URL(dsn);
  } catch (e) {
    throw new Error(`❌ ${nameForError} بصيغة خاطئة: "${dsn}"\n` +
      `الصيغة الصحيحة: mysql://username:password@host:port/database\n` +
      `مثال: mysql://root:pass@127.0.0.1:3306/mydb\n` +
      `تنبيه: إذا كان الباسورد يحتوي على رموز خاصة (@#$&/), استخدم URL encoding`);
  }

  // التحقق من البروتوكول
  if (u.protocol !== 'mysql:') {
    throw new Error(`❌ ${nameForError} يجب أن يبدأ بـ mysql://`);
  }

  return {
    host: u.hostname,
    port: u.port || 3306,
    user: decodeURIComponent(u.username || ''),
    password: decodeURIComponent(u.password || ''),
    database: u.pathname && u.pathname !== '/' ? u.pathname.slice(1) : undefined,
    multipleStatements: true,
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 10
  };
}

/**
 * الحصول على اتصال Root (للإنشاء والمنح)
 */
async function getRootConn() {
  const dsn = process.env.MYSQL_ROOT_DSN;
  const cfg = dsnToObj(dsn, 'MYSQL_ROOT_DSN');
  
  // بدون database (صلاحيات عامة على السيرفر)
  delete cfg.database;
  
  try {
    return await mysql.createConnection(cfg);
  } catch (error) {
    throw new Error(`❌ فشل الاتصال بـ MySQL Root:\n${error.message}\n` +
      `تحقق من: صلاحيات Root، كلمة المرور، وأن MySQL يعمل على المنفذ ${cfg.port}`);
  }
}

/**
 * الحصول على اتصال بالقاعدة المركزية
 */
async function getCentralPool() {
  const dsn = process.env.CENTRAL_DSN;
  const cfg = dsnToObj(dsn, 'CENTRAL_DSN');
  
  // التحقق من وجود اسم القاعدة
  if (!cfg.database) {
    throw new Error(`❌ CENTRAL_DSN يجب أن يحتوي على اسم القاعدة في النهاية\n` +
      `الصيغة الصحيحة: mysql://user:pass@host:port/database_name\n` +
      `مثال: mysql://root:pass@127.0.0.1:3306/hospitals_mecca`);
  }
  
  try {
    return await mysql.createPool(cfg);
  } catch (error) {
    throw new Error(`❌ فشل الاتصال بالقاعدة المركزية:\n${error.message}\n` +
      `تحقق من: وجود قاعدة "${cfg.database}"، صلاحيات المستخدم "${cfg.user}"`);
  }
}

/**
 * توليد اسم القاعدة من كود المستشفى
 * مثال: KA → hosp_ka
 */
function makeDbNameFromCode(code) {
  return 'hosp_' + String(code || '').toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

/**
 * إنشاء مستشفى جديد بقاعدة بيانات منفصلة
 * @param {Object} params - بيانات المستشفى
 * @param {string} params.nameAr - الاسم بالعربية
 * @param {string} params.nameEn - الاسم بالإنجليزية (اختياري)
 * @param {string} params.code - كود المستشفى (مطلوب)
 * @param {string} params.city - المدينة (اختياري)
 * @param {number} params.isActive - حالة التفعيل (1 أو 0)
 * @param {Array} params.departments - قائمة الأقسام [{nameAr, nameEn, code, headName, headEmail}]
 * @param {Object} params.adminUser - بيانات مدير النظام {fullName, username, email, mobile, passwordPlain}
 */
export async function provisionHospital({ 
  nameAr, 
  nameEn, 
  code, 
  city, 
  isActive = 1,
  departments = [],
  adminUser = null
}) {
  if (!code) throw new Error('كود المستشفى مطلوب');
  
  // التحقق من متغيرات البيئة الأساسية
  if (!process.env.DB_HOST) {
    throw new Error('❌ DB_HOST غير موجود في ملف .env');
  }
  if (!process.env.MYSQL_ROOT_DSN) {
    throw new Error('❌ MYSQL_ROOT_DSN غير موجود في ملف .env');
  }
  if (!process.env.CENTRAL_DSN) {
    throw new Error('❌ CENTRAL_DSN غير موجود في ملف .env');
  }

  const dbName = makeDbNameFromCode(code);
  const dbUser = `u_${dbName}`;
  // توليد كلمة مرور عشوائية (للإنتاج، استخدمي Secrets Manager)
  const dbPass = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const host = process.env.DB_HOST || '127.0.0.1';

  let root;
  let dbConn;
  let central;

  try {
    // 1) التحقق من عدم تكرار الكود في القاعدة المركزية
    central = await getCentralPool();
    const [existing] = await central.query(
      'SELECT HospitalID FROM hospitals WHERE Code = ?',
      [code]
    );
    if (existing && existing.length > 0) {
      throw new Error(`الكود ${code} مستخدم مسبقًا`);
    }

    // 2) إنشاء قاعدة البيانات والمستخدم
    root = await getRootConn();
    
    await root.query(
      `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`
    );
    
    // إنشاء المستخدم لكل من 127.0.0.1 و localhost (لتجنب مشاكل الاتصال)
    const hosts = ['127.0.0.1', 'localhost'];
    
    for (const h of hosts) {
      // إنشاء المستخدم إذا لم يكن موجوداً
      await root.query(
        `CREATE USER IF NOT EXISTS '${dbUser}'@'${h}' IDENTIFIED BY ?`,
        [dbPass]
      );
      
      // تحديث كلمة المرور (للتأكد من التطابق إذا كان موجوداً)
      await root.query(
        `ALTER USER '${dbUser}'@'${h}' IDENTIFIED BY ?`,
        [dbPass]
      );
      
      // منح الصلاحيات على قاعدة المستشفى
      await root.query(
        `GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO '${dbUser}'@'${h}'`
      );
    }
    
    await root.query(`FLUSH PRIVILEGES`);

    console.log(`✅ تم إنشاء القاعدة: ${dbName}`);
    console.log(`✅ تم إنشاء المستخدم ${dbUser} لـ 127.0.0.1 و localhost`);

    // 3) تشغيل التمبليت على القاعدة الجديدة
    const templatePath = path.join(__dirname, 'sql', 'hospital_template.sql');
    let templateSql;
    
    try {
      templateSql = await fs.readFile(templatePath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`❌ ملف التمبليت غير موجود: ${templatePath}\n` +
          `تأكد من وجود ملف hospital_template.sql في مجلد backend/sql/`);
      }
      throw error;
    }

    // اتصال على قاعدة المستشفى الجديدة
    // نستخدم 127.0.0.1 صراحةً لتجنب مشاكل localhost
    dbConn = await mysql.createConnection({
      host: '127.0.0.1',
      user: dbUser,
      password: dbPass,
      database: dbName,
      multipleStatements: true,
      charset: 'utf8mb4'
    });

    // دالة ذكية لتشغيل ملف SQL يحتوي على DELIMITER $$
    async function runSqlFile(connection, sqlText) {
      // 1) استخراج التريجرات ككتل مستقلة
      const triggers = [];
      const triggerRegex = /CREATE\s+TRIGGER[\s\S]*?END\s*\$\$/gi;

      let cleaned = sqlText.replace(triggerRegex, (block) => {
        triggers.push(block);
        return ''; // نحذفها مؤقتًا من النص
      });

      // 2) حذف أسطر DELIMITER من النص
      cleaned = cleaned
        .replace(/^\s*DELIMITER\s+\$\$\s*$/gmi, '')
        .replace(/^\s*DELIMITER\s*;\s*$/gmi, '');

      // 3) تنفيذ الجمل العادية (غير التريجرات) جملة جملة
      const stmts = cleaned
        .split(/;\s*[\r\n]+/g)
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.match(/^(--|\/\*)/)); // تجاهل التعليقات

      for (const stmt of stmts) {
        if (stmt) {
          try {
            await connection.query(stmt);
          } catch (err) {
            // لو كان خطأ بسيط (مثل IF EXISTS لشيء غير موجود)، تجاهله
            if (!err.message.includes('check the manual')) {
              console.warn(`⚠️ تحذير في تنفيذ جملة SQL:`, err.message);
            }
          }
        }
      }

      // 4) تنفيذ التريجرات واحدة واحدة
      for (let trigger of triggers) {
        trigger = trigger
          .replace(/DELIMITER\s+\$\$/gi, '')
          .replace(/DELIMITER\s*;/gi, '')
          .replace(/\s*\$\$\s*$/i, ';'); // END $$ → END;
        
        try {
          await connection.query(trigger);
        } catch (err) {
          console.error(`❌ خطأ في إنشاء trigger:`, err.message);
          // نكمل رغم الخطأ
        }
      }
    }

    // تشغيل التمبليت
    await runSqlFile(dbConn, templateSql);
    console.log(`✅ تم تطبيق التمبليت على ${dbName}`);

    // 3.1) ضمان وجود أعمدة departments (تلقائياً لكل القوالب)
    // تم حذف دالة ensureDeptColumns - الأعمدة القديمة غير مطلوبة في القالب الجديد

    // تم حذف ensureDeptColumns - الأعمدة القديمة غير مطلوبة في القالب الجديد

    // 4) زرع الأقسام في قاعدة المستشفى الجديدة
    if (Array.isArray(departments) && departments.length > 0) {
      // دالة لإزالة التكرارات من قائمة الأقسام
      function dedupeDepartments(arr) {
        const seen = new Set();
        const deduped = [];
        for (const d of arr) {
          const nameAr = (d.nameAr || d.name || '').trim();
          const nameEn = (d.nameEn || nameAr || '').trim();
          const key = nameAr.toLowerCase() + '|' + nameEn.toLowerCase();
          
          if (!seen.has(key) && nameAr) {
            seen.add(key);
            deduped.push(d);
          }
        }
        return deduped;
      }

      const depts = dedupeDepartments(departments);
      
      // استخدام UPSERT (INSERT ... ON DUPLICATE KEY UPDATE)
      // لتجنب أخطاء التكرار إذا كان القسم موجوداً مسبقاً
      const deptSql = `INSERT INTO departments 
                       (HospitalID, NameAr, NameEn, Code, IsActive, SortOrder)
                       VALUES (1, ?, ?, ?, 1, ?)
                       ON DUPLICATE KEY UPDATE
                         Code = VALUES(Code),
                         IsActive = VALUES(IsActive),
                         SortOrder = VALUES(SortOrder)`;
      
      let sort = 1;
      for (const dept of depts) {
        await dbConn.query(deptSql, [
          dept.nameAr || dept.name,
          dept.nameEn || dept.nameAr || dept.name,
          dept.code || null,
          sort++
        ]);
      }
      console.log(`✅ تم إضافة/تحديث ${depts.length} قسم بالبيانات الكاملة`);
    }

    // 5) إنشاء مدير النظام في قاعدة المستشفى
    if (adminUser?.username && adminUser?.passwordPlain) {
      const bcrypt = (await import('bcryptjs')).default;
      const passwordHash = await bcrypt.hash(adminUser.passwordPlain, 10);
      
      const userSql = `INSERT INTO users (RoleID, HospitalID, FullName, Username, Email, Mobile, PasswordHash, IsActive, CreatedAt)
                       VALUES (2, 1, ?, ?, ?, ?, ?, 1, NOW())`;
      
      await dbConn.query(userSql, [
        adminUser.fullName || adminUser.full_name || 'مدير النظام',
        adminUser.username,
        adminUser.email || '',
        adminUser.mobile || null,
        passwordHash
      ]);
      console.log(`✅ تم إنشاء مدير النظام: ${adminUser.username}`);
    }

    await dbConn.end();
    dbConn = null;

    // 6) تسجيل المستشفى في القاعدة المركزية
    const [insertResult] = await central.query(
      `INSERT INTO hospitals (NameAr, NameEn, Code, CityAr, IsActive, DbName, DbHost, DbUser, DbPass, CreatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        nameAr,
        nameEn || nameAr,
        code,
        city || null,
        isActive,
        dbName,
        host,
        dbUser,
        dbPass
      ]
    );

    const hospitalId = insertResult.insertId;
    console.log(`✅ تم تسجيل المستشفى في القاعدة المركزية: ID=${hospitalId}`);

    return {
      ok: true,
      hospitalId,
      dbName,
      dbUser,
      departmentsCount: departments?.length || 0,
      adminCreated: !!(adminUser?.username),
      message: `تم إنشاء المستشفى ${nameAr} بنجاح`
    };

  } catch (error) {
    console.error('❌ خطأ في provisioning:', error);
    throw error;
  } finally {
    // إغلاق جميع الاتصالات
    if (root) await root.end();
    if (dbConn) await dbConn.end();
    if (central) await central.end();
  }
}

/**
 * حذف مستشفى (قاعدة البيانات + السجل المركزي)
 * تحذير: هذه عملية خطرة!
 */
export async function deprovisionHospital(hospitalId) {
  let central;
  let root;

  try {
    // 1) الحصول على معلومات المستشفى من المركزية
    central = await getCentralPool();
    const [rows] = await central.query(
      'SELECT DbName, DbUser FROM hospitals WHERE HospitalID = ?',
      [hospitalId]
    );

    if (!rows || rows.length === 0) {
      throw new Error('المستشفى غير موجود');
    }

    const { DbName, DbUser } = rows[0];

    // 2) حذف القاعدة والمستخدم
    root = await getRootConn();
    
    await root.query(`DROP DATABASE IF EXISTS \`${DbName}\``);
    await root.query(`DROP USER IF EXISTS ?@?`, [DbUser, process.env.DB_HOST || '127.0.0.1']);
    await root.query(`FLUSH PRIVILEGES`);

    console.log(`✅ تم حذف القاعدة: ${DbName}`);

    // 3) حذف السجل من المركزية
    await central.query('DELETE FROM hospitals WHERE HospitalID = ?', [hospitalId]);

    console.log(`✅ تم حذف المستشفى من القاعدة المركزية: ID=${hospitalId}`);

    return {
      ok: true,
      message: 'تم حذف المستشفى بنجاح'
    };

  } catch (error) {
    console.error('❌ خطأ في deprovisioning:', error);
    throw error;
  } finally {
    if (central) await central.end();
    if (root) await root.end();
  }
}

