// backend/routes/admin-hospitals.js
import express from 'express';
import bcrypt from 'bcryptjs';
import fs from 'fs/promises';
import path from 'path';
import mysql from 'mysql2/promise';
import { fileURLToPath } from 'url';
import multer from 'multer';
import xlsx from 'xlsx';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getCentralPool } from '../db/centralPool.js';
import { getTenantPoolByHospitalId } from '../db/tenantManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const TEMPLATE_PATH = path.resolve(__dirname, '../sql/hospital_template.sql');

// إعداد multer لرفع ملفات Excel
const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  storage: multer.memoryStorage()
});

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
    console.error('❌ SQL Error Code:', err.code);
    console.error('❌ SQL State:', err.sqlState);
    console.error('❌ SQL Message:', err.sqlMessage);
    if (err.sql) {
      console.error('❌ SQL Query (first 500 chars):', err.sql.substring(0, 500));
    }
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
    nameAr, nameEn, code, cityAr, regionAr, facilityType, isActive,
    departments: [{ nameAr, nameEn, code, defaultEmail, headName, headEmail }],
    adminUser: { fullName, username, email, mobile, passwordPlain }
  }
*/
router.post('/', requireAuth, async (req, res) => {
  const central = await getCentralPool();

  // التحقق من صلاحية إضافة مستشفى
  // مدير تجمع (RoleID = 1) أو مدير نظام (RoleID = 2) لديهم صلاحية تلقائية
  const roleId = Number(req.user?.RoleID || req.user?.roleId || 0);
  const isCentral = req.user?.scope === 'central' || req.user?.HospitalID == null;
  const isSystemAdmin = roleId === 2; // مدير النظام
  const isClusterAdmin = roleId === 1 || roleId === 4; // مدير تجمع أو مركزي
  
  let allowed = isCentral || isSystemAdmin || isClusterAdmin;
  
  // إذا لم يكن مدير تجمع أو مدير نظام، تحقق من الصلاحية في قاعدة مستشفاه
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
    facilityType = '', // النوع من central_facilities
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
       (NameAr, NameEn, Code, CityAr, RegionAr, FacilityType, IsActive, Active, DbName, DbHost, DbUser, DbPass, CreatedAt)
       VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?, NOW())`,
      [nameAr, nameEn, code, cityAr, regionAr, facilityType || null, dbName, dbHost, dbUser, dbPass]
    );
    hospitalId = insHosp.insertId;
    
    console.log('✅ [Provision] تم إنشاء سجل المستشفى:', {
      hospitalId,
      code,
      dbName
    });

    // 4) إنشاء قاعدة المستشفى (حذف القديمة إن كانت موجودة من محاولة فاشلة)
    // ملاحظة: في الإنتاج قد ترغبين بالاحتفاظ بالبيانات، لكن للتطوير نعيد إنشاء القاعدة
    try {
      await central.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
      console.log(`🗑️ [Provision] تم حذف القاعدة القديمة (إن كانت موجودة): ${dbName}`);
    } catch (dropErr) {
      console.warn('⚠️ [Provision] تحذير عند حذف القاعدة:', dropErr.message);
    }
    
    await central.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;`);
    console.log(`✅ [Provision] تم إنشاء القاعدة: ${dbName}`);

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
    console.error('❌ Provision Hospital Error:', err);
    console.error('❌ Error Stack:', err.stack);
    console.error('❌ Error Details:', {
      message: err.message,
      code: err.code,
      sqlState: err.sqlState,
      sqlMessage: err.sqlMessage
    });

    // محاولة تنظيف جزئي (اختياري): حذف سجل المستشفى إن فشل كل شيء قبل الإكمال
    try {
      if (hospitalId) {
        await central.query('DELETE FROM hospitals WHERE HospitalID = ?', [hospitalId]);
        console.log('✅ تم حذف سجل المستشفى من القاعدة المركزية');
      }
      // ملاحظة: حذف قاعدة البيانات تلقائيًا قد لا يكون مرغوبًا في بيئة الإنتاج
      // لو حبيتي أضيف حذف القاعدة DB نفّذه بحذر:
      // await central.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
    } catch (e) {
      console.error('⚠️ Rollback note:', e.message);
    }

    // إرسال تفاصيل الخطأ للعميل (في بيئة التطوير فقط)
    const errorMessage = process.env.NODE_ENV === 'production' 
      ? 'تعذر إنشاء المستشفى. راجعي السجل.'
      : `تعذر إنشاء المستشفى: ${err.message}${err.sqlMessage ? ` (SQL: ${err.sqlMessage})` : ''}`;

    return res.status(500).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV !== 'production' ? {
        message: err.message,
        code: err.code,
        sqlState: err.sqlState,
        sqlMessage: err.sqlMessage
      } : undefined
    });
  }
});

/**
 * POST /api/admin/hospitals/import
 * استيراد مستشفيات من ملف Excel
 * الملف يجب أن يحتوي على الأعمدة:
 * - HospitalCo: كود المستشفى
 * - HospitalNar: اسم المستشفى بالعربي
 * - HospitalNameEn (اختياري): الاسم بالإنجليزية
 * - City: المدينة
 * - Region: المنطقة
 * - Address (اختياري): العنوان
 * - Phone (اختياري): الهاتف
 * - Email (اختياري): البريد الإلكتروني
 * - DepartmentName: اسم القسم
 * - DepartmentCode (اختياري): كود القسم
 * - AdminFullN: اسم مدير النظام
 * - AdminEmail: بريد مدير النظام
 * - AdminMobile: جوال مدير النظام
 * - AdminUser: اسم مستخدم مدير النظام
 * - AdminPassword: كلمة مرور مدير النظام
 */
router.post('/import', requireAuth, upload.single('file'), async (req, res) => {
  const central = await getCentralPool();

  // التحقق من الصلاحيات
  const roleId = Number(req.user?.RoleID || req.user?.roleId || 0);
  const isCentral = req.user?.scope === 'central' || req.user?.HospitalID == null;
  const isSystemAdmin = roleId === 2;
  const isClusterAdmin = roleId === 1 || roleId === 4;
  
  if (!isCentral && !isSystemAdmin && !isClusterAdmin) {
    return res.status(403).json({ 
      ok: false, 
      error: 'ليس لديك صلاحية لاستيراد المستشفيات' 
    });
  }

  if (!req.file) {
    return res.status(400).json({ ok: false, error: 'لم يتم رفع ملف' });
  }

  try {
    // قراءة ملف Excel
    const wb = xlsx.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws || !ws['!ref']) {
      return res.status(400).json({ ok: false, error: 'ملف Excel فارغ أو غير صحيح' });
    }

    // قراءة البيانات مع الاحتفاظ بجميع المفاتيح
    const rows = xlsx.utils.sheet_to_json(ws, { defval: '', raw: false });
    if (!rows || rows.length === 0) {
      return res.status(400).json({ ok: false, error: 'لا توجد بيانات في الملف' });
    }

    // دالة مساعدة للبحث عن حقل بطرق متعددة (تدعم الأسماء المقطوعة)
    function getFieldValue(row, possibleKeys) {
      if (!row) return '';
      
      // أولاً: البحث المباشر في المفاتيح
      for (const key of possibleKeys) {
        if (row[key] !== undefined && row[key] !== null) {
          const val = String(row[key]).trim();
          if (val) return val;
        }
      }
      
      // ثانياً: البحث في جميع مفاتيح الصف (حتى لو كانت مقطوعة)
      const rowKeys = Object.keys(row);
      for (const key of possibleKeys) {
        const lowerKey = key.toLowerCase().replace(/\s+/g, '');
        for (const rowKey of rowKeys) {
          const lowerRowKey = String(rowKey).toLowerCase().replace(/\s+/g, '');
          // مطابقة إذا كان المفتاح يبدأ بالاسم المطلوب أو العكس
          if (lowerRowKey.includes(lowerKey) || lowerKey.includes(lowerRowKey)) {
            const val = String(row[rowKey]).trim();
            if (val && val.toLowerCase() !== lowerRowKey) { // تجنب أخذ اسم العمود نفسه
              return val;
            }
          }
        }
      }
      
      return '';
    }

    // طباعة أول صف للتشخيص
    if (rows.length > 0) {
      console.log('📋 أسماء الأعمدة في الملف:', Object.keys(rows[0]));
    }

    // تجميع البيانات حسب المستشفى (كل صف = مستشفى)
    const hospitalsMap = new Map();
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      
      // البحث عن كود المستشفى بطرق متعددة
      const code = (getFieldValue(row, ['HospitalCo', 'Hospital Code', 'Code', 'Co']) || '').toUpperCase();
      if (!code || code === 'CODE' || code === 'HOSPITALCO') continue; // تخطي صف العناوين

      // البحث عن اسم المستشفى بالعربي
      const nameAr = getFieldValue(row, ['HospitalNar', 'HospitalNa', 'Hospital Name Ar', 'Name Ar', 'NameAr', 'اسم المستشفى']);
      if (!nameAr || nameAr === 'NAME' || nameAr === 'HOSPITALNAR') continue; // تخطي صف العناوين

      // البحث عن اسم المستشفى بالإنجليزية
      const nameEn = getFieldValue(row, ['HospitalNameEn', 'HospitalNa City', 'Hospital Name En', 'Name En', 'NameEn', 'اسم المستشفى بالإنجليزية']);

      // البحث عن بيانات إدارية (قد تكون منفصلة في عمودين)
      const adminFullN1 = getFieldValue(row, ['AdminFullN', 'AdminFull', 'Admin Full Name', 'Admin Full', 'AdminFull']);
      // البحث في عمود منفصل (مثل M و N في Excel)
      let adminFullN2 = '';
      for (const key of Object.keys(row)) {
        const lowerKey = String(key).toLowerCase();
        if ((lowerKey.includes('admin') && (lowerKey.includes('name') || lowerKey.length <= 3)) || 
            lowerKey === 'm' || lowerKey === 'n') {
          const val = String(row[key]).trim();
          if (val && val !== adminFullN1 && !val.toLowerCase().includes('admin')) {
            adminFullN2 = val;
            break;
          }
        }
      }
      const adminFullN = (adminFullN1 + ' ' + adminFullN2).trim() || adminFullN1 || adminFullN2;

      // البحث عن كلمة المرور (قد تكون منفصلة في عمودين مثل R و S)
      const adminPass1 = getFieldValue(row, ['AdminPas', 'AdminPass', 'Admin Password', 'Password']);
      let adminPass2 = '';
      for (const key of Object.keys(row)) {
        const lowerKey = String(key).toLowerCase();
        if (lowerKey === 'sword' || lowerKey === 's' || (lowerKey.includes('pass') && !lowerKey.includes('adminpas'))) {
          const val = String(row[key]).trim();
          if (val && val !== adminPass1) {
            adminPass2 = val;
            break;
          }
        }
      }
      const adminPassword = (adminPass1 + adminPass2).trim() || adminPass1 || adminPass2;

      if (!hospitalsMap.has(code)) {
        hospitalsMap.set(code, {
          code,
          nameAr,
          nameEn: nameEn || nameAr,
          cityAr: getFieldValue(row, ['City', 'المدينة']),
          regionAr: getFieldValue(row, ['Region', 'المنطقة']),
          address: getFieldValue(row, ['Address', 'العنوان']),
          phone: getFieldValue(row, ['Phone', 'Phone', 'هاتف']),
          email: getFieldValue(row, ['Email', 'البريد الإلكتروني']),
          facilityType: 'hospital',
          departments: [],
          adminUser: {
            fullName: adminFullN,
            username: getFieldValue(row, ['AdminUser', 'AdminUse', 'Admin Username', 'Username']),
            email: getFieldValue(row, ['AdminEma', 'AdminEmail', 'Admin Email', 'Email']),
            mobile: getFieldValue(row, ['AdminMob', 'AdminMobile', 'Admin Mobile', 'Mobile']),
            passwordPlain: adminPassword
          }
        });
      }

      // إضافة القسم
      const deptName = getFieldValue(row, ['DepartmentName', 'Department Name', 'Department', 'اسم القسم']);
      if (deptName && deptName !== 'DEPARTMENTNAME') {
        const hospital = hospitalsMap.get(code);
        if (hospital) {
          hospital.departments.push({
            nameAr: deptName,
            nameEn: deptName,
            code: getFieldValue(row, ['DepartmentCode', 'Department Code', 'DeptCode', 'Code']) || deptName.substring(0, 5).toUpperCase().replace(/\s/g, '')
          });
        }
      }
    }

    if (hospitalsMap.size === 0) {
      console.log('❌ لم يتم العثور على مستشفيات صحيحة. عدد الصفوف:', rows.length);
      if (rows.length > 0) {
        console.log('📋 مثال على الصف الأول:', rows[0]);
      }
      return res.status(400).json({ 
        ok: false, 
        error: 'لم يتم العثور على بيانات صحيحة في الملف',
        debug: {
          totalRows: rows.length,
          sampleRow: rows.length > 0 ? Object.keys(rows[0]) : []
        }
      });
    }

    console.log(`✅ تم العثور على ${hospitalsMap.size} مستشفى في الملف`);

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    const errorDetails = [];

    // معالجة كل مستشفى
    for (const [code, hospitalData] of hospitalsMap.entries()) {
      try {
        // التحقق من وجود المستشفى
        const [existing] = await central.query(
          'SELECT HospitalID FROM hospitals WHERE Code = ? LIMIT 1',
          [code]
        );

        if (existing.length > 0) {
          // تخطي المستشفى الموجود (لا نحدثه في الاستيراد)
          skipped++;
          continue;
        }

        // إنشاء مستشفى جديد (استخدام نفس منطق POST /)
        const dbName = `hosp_${code}`;
        const dbHost = process.env.DB_HOST || '127.0.0.1';
        const dbUser = process.env.DB_USER || 'root';
        const dbPass = process.env.DB_PASS || 'SamarAmer12345@';

        const [insHosp] = await central.query(
          `INSERT INTO hospitals
           (NameAr, NameEn, Code, CityAr, RegionAr, FacilityType, IsActive, Active, DbName, DbHost, DbUser, DbPass, CreatedAt)
           VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?, NOW())`,
          [
            hospitalData.nameAr,
            hospitalData.nameEn || hospitalData.nameAr,
            code,
            hospitalData.cityAr,
            hospitalData.regionAr,
            hospitalData.facilityType || 'hospital',
            dbName,
            dbHost,
            dbUser,
            dbPass
          ]
        );

        const hospitalId = insHosp.insertId;

        // إنشاء قاعدة البيانات وتطبيق القالب
        try {
          await central.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
          await central.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
          await applyHospitalTemplate({ host: dbHost, user: dbUser, password: dbPass, dbName });

          // إنشاء الأقسام
          const tenantPool = await getTenantPoolByHospitalId(hospitalId);
          for (const dept of hospitalData.departments) {
            if (dept.nameAr) {
              await tenantPool.query(
                `INSERT INTO departments (HospitalID, NameAr, NameEn, Code, IsActive, CreatedAt)
                 VALUES (?, ?, ?, ?, 1, NOW())`,
                [hospitalId, dept.nameAr, dept.nameEn || dept.nameAr, dept.code || '']
              );
            }
          }

          // إنشاء مدير النظام
          if (hospitalData.adminUser.username && hospitalData.adminUser.passwordPlain) {
            const hashedPassword = await bcrypt.hash(hospitalData.adminUser.passwordPlain, 10);
            await tenantPool.query(
              `INSERT INTO users 
               (HospitalID, FullName, Username, Email, Mobile, PasswordHash, RoleID, IsActive, CreatedAt)
               VALUES (?, ?, ?, ?, ?, ?, 1, 1, NOW())`,
              [
                hospitalId,
                hospitalData.adminUser.fullName,
                hospitalData.adminUser.username,
                hospitalData.adminUser.email,
                hospitalData.adminUser.mobile,
                hashedPassword
              ]
            );
          }

          created++;
        } catch (err) {
          console.error(`❌ خطأ في إنشاء قاعدة بيانات المستشفى ${code}:`, err);
          // حذف السجل من القاعدة المركزية
          await central.query('DELETE FROM hospitals WHERE HospitalID = ?', [hospitalId]);
          errors++;
          errorDetails.push(`المستشفى ${code}: ${err.message}`);
        }
      } catch (err) {
        console.error(`❌ خطأ في معالجة المستشفى ${code}:`, err);
        errors++;
        errorDetails.push(`المستشفى ${code}: ${err.message}`);
      }
    }

    res.json({
      ok: true,
      created,
      updated,
      skipped,
      errors,
      details: errorDetails.length > 0 ? errorDetails.join('\n') : undefined,
      message: `تم استيراد ${created} مستشفى جديد و ${updated} مستشفى محدث`
    });

  } catch (err) {
    console.error('❌ خطأ في استيراد المستشفيات:', err);
    res.status(500).json({
      ok: false,
      error: 'فشل استيراد المستشفيات',
      details: err.message
    });
  }
});

export default router;
