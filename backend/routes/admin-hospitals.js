// backend/routes/admin-hospitals.js
import express from 'express';
import bcrypt from 'bcryptjs';
import fs from 'fs/promises';
import path from 'path';
import mysql from 'mysql2/promise';
import { fileURLToPath } from 'url';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getCentralPool } from '../db/centralPool.js';
import { getTenantPoolByHospitalId } from '../db/tenantManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const TEMPLATE_PATH = path.resolve(__dirname, '../sql/hospital_template.sql');

// دالة robust لتنفيذ القالب على قاعدة المستشفى
async function applyHospitalTemplate({ host, user, password, dbName }) {
  const conn = await mysql.createConnection({
    host, user, password, database: dbName,
    multipleStatements: true,
    charset: 'utf8mb4'
  });

  try {
    console.log('📄 قراءة ملف القالب...');
    let raw = await fs.readFile(TEMPLATE_PATH, 'utf8');

    // 🔹 نظفي القالب من أوامر DELIMITER فقط، لا تقسّمينه
    raw = raw
      .replace(/DELIMITER\s+\$\$/gi, '')
      .replace(/DELIMITER\s*;\s*/gi, '')
      .replace(/\$\$/g, ';'); // نستبدل $$ بنهاية عادية

    // 🔧 إصلاح مشاكل جدول logs
    // 1) جعل ActorUserID يقبل NULL حتى يعمل ON DELETE SET NULL
    raw = raw.replace(
      /`ActorUserID`\s+INT\s+UNSIGNED\s+NOT\s+NULL/gi,
      '`ActorUserID` INT UNSIGNED NULL'
    );

    // 2) إزالة FK على hospitals لأنه غير موجود في قاعدة المستشفى (إبقي الفهارس)
    raw = raw.replace(
      /,\s*CONSTRAINT\s+`fk_logs_hospital`[\s\S]*?ON\s+UPDATE\s+CASCADE,?/i,
      ','
    ).replace(
      /,\s*CONSTRAINT\s+`fk_logs_hospital`[\s\S]*?ON\s+UPDATE\s+CASCADE/i,
      ''
    );

    // ⚙️ عطلي المفاتيح مؤقتًا
    await conn.query('SET FOREIGN_KEY_CHECKS=0;');

    // 🔹 نفذي القالب دفعة وحدة (MySQL2 يدعم multipleStatements)
    await conn.query(raw);

    await conn.query('SET FOREIGN_KEY_CHECKS=1;');
    console.log(`✅ تم تنفيذ القالب بنجاح على القاعدة ${dbName}`);
  } catch (err) {
    console.error('❌ خطأ أثناء تنفيذ القالب:', err.message);
    throw err;
  } finally {
    await conn.end();
  }
}

const router = express.Router();

// دالة مساعدة للتحقق من صلاحية HOSPITAL_CREATE
async function hasPermissionFor(userId, hospitalId, permissionKey) {
  try {
    const pool = await getTenantPoolByHospitalId(hospitalId);
    const [rows] = await pool.query(
      'SELECT 1 FROM user_permissions WHERE UserID=? AND HospitalID=? AND PermissionKey=? LIMIT 1',
      [userId, hospitalId, permissionKey]
    );
    return rows.length > 0;
  } catch (err) {
    console.error('hasPermissionFor error:', err);
    return false;
  }
}

/* 
  POST /api/admin/hospitals
  body:
  {
    nameAr, nameEn, code, cityAr, regionAr, isActive,
    departments: [{ nameAr, nameEn, code, defaultEmail, headName, headEmail }],
    adminUser: { fullName, username, email, mobile, passwordPlain }
  }
*/
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const central = await getCentralPool();

  // التحقق من صلاحية إضافة مستشفى
  const isCentral = req.user?.scope === 'central' || req.user?.HospitalID == null;
  let allowed = isCentral;
  
  // إذا لم يكن مركزياً، تحقق من الصلاحية في قاعدة مستشفاه
  if (!allowed && req.user?.HospitalID) {
    allowed = await hasPermissionFor(req.user.UserID, req.user.HospitalID, 'HOSPITAL_CREATE');
  }
  
  if (!allowed) {
    return res.status(403).json({ 
      ok: false, 
      error: 'ليس لديك صلاحية لإضافة مستشفى' 
    });
  }

  // 1) التحقق من المدخلات
    const { 
    nameAr, nameEn = '',
    code: rawCode,
    cityAr = '', regionAr = '',
    isActive = 1,
      departments = [],
    adminUser
    } = req.body || {};

  const code = (rawCode || '').trim().toUpperCase();
    if (!nameAr || !code) {
    return res.status(400).json({ error: 'الاسم العربي والكود مطلوبان' });
  }
  if (!adminUser || !adminUser.username || !adminUser.passwordPlain) {
    return res.status(400).json({ error: 'بيانات مدير النظام غير مكتملة' });
  }

  // نستخدم هذا الاسم لقاعدة المستشفى
  const dbName = `hosp_${code}`;

  // إعدادات الاتصال بقاعدة البيانات
  const dbHost = process.env.DB_HOST || '127.0.0.1';
  const dbUser = process.env.DB_USER || 'root';
  const dbPass = process.env.DB_PASS || 'SamarAmer12345@';

  // 2) فحص عدم تكرار الكود/القاعدة في المركزي
  const [dup] = await central.query(
    'SELECT HospitalID FROM hospitals WHERE Code = ? OR DbName = ? LIMIT 1',
    [code, dbName]
  );
  if (dup.length) {
    return res.status(409).json({ error: 'الكود/قاعدة المستشفى موجودة مسبقًا' });
  }

  // سنحتاج نلف ونعيد لو صار فشل
  let tenantPool;
  let hospitalId = null;
  let adminCreated = false;
  let departmentsCount = 0;

  try {
    // 3) إنشاء سجل المستشفى في القاعدة المركزية
    const [insHosp] = await central.query(
      `INSERT INTO hospitals
       (NameAr, NameEn, Code, CityAr, RegionAr, IsActive, Active, DbName, DbHost, DbUser, DbPass, CreatedAt)
       VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?, NOW())`,
      [nameAr, nameEn, code, cityAr, regionAr, dbName, dbHost, dbUser, dbPass]
    );
    hospitalId = insHosp.insertId;
    
    console.log('✅ [Provision] تم إنشاء سجل المستشفى:', {
      hospitalId,
      code,
      dbName
    });

    // 4) إنشاء قاعدة المستشفى (إن لم تكن موجودة) + فتح اتصال Tenant
    await central.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;`);

    // 5) تنفيذ قالب المستشفى من ملف hospital_template.sql
    console.log('🔍 [Provision] تنفيذ قالب المستشفى...');
    await applyHospitalTemplate({
      host: dbHost,
      user: dbUser,
      password: dbPass,
      dbName
    });

    // ✅ استخدام hospitalId (رقم) بدل code (نص)
    console.log('🔍 [Provision] فتح اتصال بقاعدة المستشفى:', hospitalId);
    tenantPool = await getTenantPoolByHospitalId(hospitalId);
    console.log('✅ [Provision] تم فتح اتصال بقاعدة المستشفى بنجاح');

    // 6) إدخال الأقسام المرسلة (بناءً على تعريف القالب)
    if (Array.isArray(departments) && departments.length) {
      const vals = [];
      for (const d of departments) {
        if (!d?.nameAr) continue;
        vals.push([
          hospitalId,
          null,                           // ParentDepartmentID
          (d.code || null),               // Code
          d.nameAr,
          d.nameEn || d.nameAr,
          1,                              // IsActive
          0                               // SortOrder
        ]);
      }
      if (vals.length) {
        await tenantPool.query(
          `INSERT INTO departments
            (HospitalID, ParentDepartmentID, Code, NameAr, NameEn, IsActive, SortOrder)
           VALUES ?`,
          [vals]
        );
        departmentsCount = vals.length;
      }
    }

    // 7) إنشاء مدير النظام داخل قاعدة المستشفى
    const passHash = await bcrypt.hash(adminUser.passwordPlain, 10);
    
    // ✅ تأكيد: استخدام HospitalID الصحيح من القاعدة المركزية
    console.log('🔍 [Provision] إنشاء مدير النظام بـ HospitalID:', hospitalId);
    
    const [insAdmin] = await tenantPool.query(
      `INSERT INTO users
        (RoleID, HospitalID, FullName, Username, Email, Mobile, PasswordHash, IsActive)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        2,                       // RoleID = 2 (Hospital Admin/System Admin)
        hospitalId,              // ✅ HospitalID الصحيح من insHosp.insertId
        adminUser.fullName || adminUser.username,
        adminUser.username,
        adminUser.email || null,
        adminUser.mobile || null,
        passHash
      ]
    );
    
    console.log('✅ [Provision] تم إنشاء مدير النظام:', {
      UserID: insAdmin.insertId,
      HospitalID: hospitalId,
      Username: adminUser.username
    });
    adminCreated = !!insAdmin.insertId;

    // 8) منحة صلاحيات مدير النظام الافتراضية (RoleID = 2)
    const [rolePerms] = await tenantPool.query(
      'SELECT PermissionKey, DefaultViewScope FROM role_default_permissions WHERE RoleID = 2'
    );

    if (rolePerms.length) {
      const values = rolePerms.map(p => [
        insAdmin.insertId, hospitalId, p.PermissionKey, p.DefaultViewScope || 'HOSPITAL'
      ]);
      await tenantPool.query(
        'INSERT IGNORE INTO user_permissions (UserID, HospitalID, PermissionKey, ViewScope) VALUES ?',
        [values]
      );
      console.log('✅ [Provision] تم منح صلاحيات مدير النظام:', values.length, 'صلاحية');
    }

    // 9) إضافة المستخدم في الدليل المركزي user_directory (للرؤية المجمعة)
    await central.query(`
      CREATE TABLE IF NOT EXISTS user_directory (
        Username VARCHAR(80) PRIMARY KEY,
        HospitalID INT UNSIGNED NOT NULL,
        RoleID TINYINT UNSIGNED NOT NULL DEFAULT 1,
        IsActive TINYINT(1) DEFAULT 1,
        CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UpdatedAt TIMESTAMP NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // ادراج/تحديث
    await central.query(
      `INSERT INTO user_directory (Username, HospitalID, RoleID, IsActive)
       VALUES (?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE HospitalID=VALUES(HospitalID), RoleID=VALUES(RoleID), IsActive=1, UpdatedAt=NOW()`,
      [adminUser.username, hospitalId, 1]
    );

    // 10) رجوع استجابة بالشكل المتوقع من الواجهة
    res.json({
      ok: true,
      dbName,
      dbUser: 'tenant_app_user',          // فقط معلومات لعرض النجاح (غير إلزامية)
      departmentsCount,
      adminCreated,
      hospitalId
    });

  } catch (err) {
    console.error('Provision Hospital Error:', err);

    // محاولة تنظيف جزئي (اختياري): حذف سجل المستشفى إن فشل كل شيء قبل الإكمال
    try {
      if (hospitalId) {
        await central.query('DELETE FROM hospitals WHERE HospitalID = ?', [hospitalId]);
      }
      // ملاحظة: حذف قاعدة البيانات تلقائيًا قد لا يكون مرغوبًا في بيئة الإنتاج
      // لو حبيتي أضيف حذف القاعدة DB نفّذه بحذر:
      // await central.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
    } catch (e) {
      console.error('Rollback note:', e.message);
    }

    return res.status(500).json({ error: 'تعذر إنشاء المستشفى. راجعي السجل.' });
  }
});

export default router;
