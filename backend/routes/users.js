import express from 'express';
import bcrypt from 'bcryptjs';
import { requireAuth } from '../middleware/auth.js';
import { resolveHospitalId } from '../middleware/resolveHospitalId.js';
import { attachHospitalPool } from '../middleware/hospitalPool.js';
import { getCentralPool } from '../db/centralPool.js';
import { getTenantPoolByHospitalId } from '../db/tenantManager.js';

const router = express.Router();

// دالة مساعدة للتحقق من صلاحية HOSPITAL_USER_CREATE
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

// دالة مساعدة لمزامنة المستخدم إلى القاعدة المركزية
async function syncUserToCentral(userData) {
  try {
    const centralPool = await getCentralPool();
    
    // التحقق من عدم وجود المستخدم في القاعدة المركزية
    const [existing] = await centralPool.query(
      'SELECT Username FROM user_directory WHERE Username = ?',
      [userData.Username]
    );
    
    if (existing.length > 0) {
      console.log('⚠️ User already exists in central database:', userData.Username);
      return { success: true, message: 'User already exists in central' };
    }
    
    // إضافة المستخدم إلى القاعدة المركزية
    await centralPool.query(
      `INSERT INTO user_directory 
       (Username, HospitalID, RoleID, IsActive, CreatedAt, UpdatedAt) 
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        userData.Username,
        userData.HospitalID,
        userData.RoleID,
        userData.IsActive
      ]
    );
    
    console.log('✅ User synced to central database:', userData.Username);
    return { success: true, message: 'User synced to central' };
    
  } catch (error) {
    console.error('❌ Error syncing user to central:', error);
    return { success: false, error: error.message };
  }
}

// دالة مساعدة لمزامنة جميع المستخدمين الموجودين إلى القاعدة المركزية
async function syncAllUsersToCentral(hospitalId) {
  try {
    const centralPool = await getCentralPool();
    const hospitalPool = await getTenantPoolByHospitalId(Number(hospitalId));

    const [users] = await hospitalPool.query(
      `SELECT Username, HospitalID, RoleID, IsActive
       FROM users
       WHERE COALESCE(IsDeleted,0)=0 AND COALESCE(IsActive,1)=1`
    );

    let syncedCount = 0;
    let skippedCount = 0;

    for (const user of users) {
      const [existing] = await centralPool.query(
        'SELECT Username FROM user_directory WHERE Username = ?',
        [user.Username]
      );
      if (existing.length === 0) {
        await centralPool.query(
          `INSERT INTO user_directory
           (Username, HospitalID, RoleID, IsActive, CreatedAt, UpdatedAt)
           VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [user.Username, user.HospitalID, user.RoleID, user.IsActive]
        );
        syncedCount++;
      } else {
        skippedCount++;
      }
    }

    return { success: true, synced: syncedCount, skipped: skippedCount };
  } catch (error) {
    console.error('❌ Error syncing all users to central:', error);
    return { success: false, error: error.message };
  }
}

/* ===================== [GET] /api/users =====================
   - للـ Cluster: يمرر ?hospitalId=..
   - للموظف: يؤخذ HospitalID من التوكن
   - يدعم البحث بالاسم/البريد/اليوزر/الجوال
============================================================= */
router.get('/',
  requireAuth, resolveHospitalId, attachHospitalPool,
  async (req, res) => {
    try {
      const { search } = req.query;
      const args = [];
      let where = ' WHERE COALESCE(IsDeleted,0)=0 ';
      if (search && String(search).trim()) {
        where += ` AND ( FullName LIKE ? OR Username LIKE ? OR Email LIKE ? OR Mobile LIKE ? ) `;
        const s = `%${String(search).trim()}%`;
        args.push(s, s, s, s);
      }
      const sql = `
        SELECT UserID, RoleID, HospitalID, DepartmentID, SubDepartmentID,
               FullName, Username, Email, Mobile, NationalID,
               IsActive, CreatedAt, UpdatedAt
        FROM users
        ${where}
        ORDER BY FullName
        LIMIT 200
      `;
      const [rows] = await req.hospitalPool.query(sql, args);

      // اسم المستشفى لعرضه إن احتجنا
      try {
        const central = await getCentralPool();
        const [h] = await central.query(
          'SELECT NameAr AS HospitalNameAr FROM hospitals WHERE HospitalID=? LIMIT 1',
          [req.hospitalId]
        );
        if (h?.[0]?.HospitalNameAr) {
          rows.forEach(r => r.HospitalNameAr = h[0].HospitalNameAr);
        }
      } catch {}

      res.json({ ok: true, items: rows });
    } catch (e) {
      console.error('GET /users error', e);
      res.status(500).json({ ok:false, message:'server error' });
    }
  }
);

/* =============== [GET] /api/users/list =================
   - قائمة الموظفين من قاعدة المستشفى
   - مع إمكانية التصفية حسب القسم
========================================================= */
router.get('/list',
  requireAuth, resolveHospitalId, attachHospitalPool,
  async (req, res) => {
    try {
      const hospitalId = Number(req.hospitalId);
      const departmentId = req.query.departmentId ? Number(req.query.departmentId) : null;
      const activeOnly = String(req.query.active ?? '1') === '1';

      if (!hospitalId) {
        return res.status(400).json({ 
          ok: false, 
          message: 'hospitalId مطلوب' 
        });
      }

      let sql = `
        SELECT UserID, FullName, Username, DepartmentID, RoleID, IsActive
        FROM users
        WHERE HospitalID = ?`;
      const params = [hospitalId];

      if (activeOnly) {
        sql += ` AND COALESCE(IsActive,1)=1`;
      }
      
      if (departmentId) { 
        sql += ` AND DepartmentID = ?`; 
        params.push(departmentId); 
      }

      sql += ` AND COALESCE(IsDeleted,0)=0 ORDER BY FullName`;

      const [rows] = await req.hospitalPool.query(sql, params);
      
      res.json({ 
        ok: true, 
        items: rows 
      });
    } catch (e) {
      console.error('GET /users/list error:', e);
      res.status(500).json({ 
        ok: false, 
        message: 'Server error' 
      });
    }
  }
);

/* =============== [GET] /api/users/general-stats =================
   - جلب إحصائيات عامة لجميع المستخدمين من جميع المستشفيات + مديري التجمع
   - إجمالي المستخدمين، النشطين، غير النشطين
   - متاح فقط لمديري التجمع (RoleID = 1 أو 4)
========================================================= */
router.get('/general-stats',
  requireAuth,
  async (req, res) => {
    try {
      // التحقق من أن المستخدم هو مدير تجمع
      const roleId = Number(req.user?.RoleID || req.user?.roleId || 0);
      const isCluster = [1, 4].includes(roleId);
      
      if (!isCluster) {
        return res.status(403).json({ 
          ok: false, 
          message: 'غير مصرح - مديري التجمع فقط' 
        });
      }

      const centralPool = await getCentralPool();
      
      // 1. جلب إحصائيات مديري التجمع من القاعدة المركزية
      const [clusterStats] = await centralPool.query(`
        SELECT 
          COUNT(*) AS total,
          SUM(CASE WHEN COALESCE(IsActive, 1) = 1 THEN 1 ELSE 0 END) AS active,
          SUM(CASE WHEN COALESCE(IsActive, 1) = 0 THEN 1 ELSE 0 END) AS inactive
        FROM users_central
        WHERE RoleID = 1
      `);
      
      let totalUsers = Number(clusterStats[0]?.total || 0);
      let activeUsers = Number(clusterStats[0]?.active || 0);
      let inactiveUsers = Number(clusterStats[0]?.inactive || 0);

      // 2. جلب جميع المستشفيات النشطة
      const [hospitals] = await centralPool.query(`
        SELECT HospitalID, NameAr
        FROM hospitals
        WHERE IsActive = 1
      `);

      // 3. المرور على كل مستشفى وجمع إحصائيات المستخدمين
      for (const hospital of hospitals) {
        try {
          const hospitalPool = await getTenantPoolByHospitalId(hospital.HospitalID);
          const [hospitalStats] = await hospitalPool.query(`
            SELECT 
              COUNT(*) AS total,
              SUM(CASE WHEN COALESCE(IsActive, 1) = 1 AND COALESCE(IsDeleted, 0) = 0 THEN 1 ELSE 0 END) AS active,
              SUM(CASE WHEN COALESCE(IsActive, 1) = 0 AND COALESCE(IsDeleted, 0) = 0 THEN 1 ELSE 0 END) AS inactive
            FROM users
            WHERE HospitalID = ? AND COALESCE(IsDeleted, 0) = 0
          `, [hospital.HospitalID]);

          totalUsers += Number(hospitalStats[0]?.total || 0);
          activeUsers += Number(hospitalStats[0]?.active || 0);
          inactiveUsers += Number(hospitalStats[0]?.inactive || 0);
        } catch (err) {
          console.warn(`⚠️ خطأ في جلب إحصائيات المستخدمين من ${hospital.NameAr} (HospitalID: ${hospital.HospitalID}):`, err.message);
          // نكمل مع المستشفيات الأخرى
        }
      }

      res.json({ 
        ok: true, 
        total: totalUsers,
        active: activeUsers,
        inactive: inactiveUsers
      });
    } catch (e) {
      console.error('GET /users/general-stats error:', e);
      res.status(500).json({ 
        ok: false, 
        message: 'server error',
        error: e.message 
      });
    }
  }
);

/* =============== [GET] /api/users/stats =================
   - جلب إحصائيات المستخدمين لمستشفى معين
   - إجمالي المستخدمين، النشطين، غير النشطين
========================================================= */
router.get('/stats',
  requireAuth, resolveHospitalId, attachHospitalPool,
  async (req, res) => {
    try {
      const hospitalId = Number(req.hospitalId);
      if (!hospitalId) {
        return res.status(400).json({ 
          ok: false, 
          message: 'hospitalId مطلوب' 
        });
      }

      const [rows] = await req.hospitalPool.query(`
        SELECT 
          COUNT(*) AS total,
          SUM(CASE WHEN COALESCE(IsActive, 1) = 1 AND COALESCE(IsDeleted, 0) = 0 THEN 1 ELSE 0 END) AS active,
          SUM(CASE WHEN COALESCE(IsActive, 1) = 0 AND COALESCE(IsDeleted, 0) = 0 THEN 1 ELSE 0 END) AS inactive
        FROM users
        WHERE HospitalID = ? AND COALESCE(IsDeleted, 0) = 0
      `, [hospitalId]);

      const stats = rows[0] || { total: 0, active: 0, inactive: 0 };
      
      res.json({ 
        ok: true, 
        total: Number(stats.total) || 0,
        active: Number(stats.active) || 0,
        inactive: Number(stats.inactive) || 0
      });
    } catch (e) {
      console.error('GET /users/stats error:', e);
      res.status(500).json({ 
        ok: false, 
        message: 'server error',
        error: e.message 
      });
    }
  }
);

/* =============== [GET] /api/users/cluster-managers/stats =================
   - جلب إحصائيات مديري التجمع من القاعدة المركزية
   - إجمالي مديري التجمع، النشطين، غير النشطين
   - متاح فقط لمديري التجمع (RoleID = 1)
========================================================= */
router.get('/cluster-managers/stats',
  requireAuth,
  async (req, res) => {
    try {
      // التحقق من وجود المستخدم في الطلب
      if (!req.user) {
        console.error('❌ [cluster-managers/stats] req.user غير موجود');
        return res.status(401).json({ 
          ok: false, 
          message: 'غير مصرح - يجب تسجيل الدخول' 
        });
      }

      // التحقق من أن المستخدم هو مدير تجمع
      const roleId = Number(req.user?.RoleID || req.user?.roleId || 0);
      const isCluster = [1, 4].includes(roleId);
      
      if (!isCluster) {
        console.log('❌ [cluster-managers/stats] محاولة وصول غير مصرح:', {
          UserID: req.user?.UserID,
          RoleID: roleId
        });
        return res.status(403).json({ 
          ok: false, 
          message: 'غير مصرح - مديري التجمع فقط' 
        });
      }

      // التحقق من الاتصال بالقاعدة المركزية
      let centralPool;
      try {
        centralPool = await getCentralPool();
      } catch (poolError) {
        console.error('❌ [cluster-managers/stats] خطأ في الاتصال بالقاعدة المركزية:', poolError);
        return res.status(500).json({ 
          ok: false, 
          message: 'خطأ في الاتصال بالقاعدة المركزية',
          error: poolError.message 
        });
      }

      const [rows] = await centralPool.query(`
        SELECT 
          COUNT(*) AS total,
          SUM(CASE WHEN COALESCE(IsActive, 1) = 1 THEN 1 ELSE 0 END) AS active,
          SUM(CASE WHEN COALESCE(IsActive, 1) = 0 THEN 1 ELSE 0 END) AS inactive
        FROM users_central
        WHERE RoleID = 1
      `);

      const stats = rows[0] || { total: 0, active: 0, inactive: 0 };
      
      console.log('✅ [cluster-managers/stats] تم جلب الإحصائيات:', stats);
      
      res.json({ 
        ok: true, 
        total: Number(stats.total) || 0,
        active: Number(stats.active) || 0,
        inactive: Number(stats.inactive) || 0
      });
    } catch (e) {
      console.error('❌ GET /users/cluster-managers/stats error:', e);
      res.status(500).json({ 
        ok: false, 
        message: 'server error',
        error: e.message 
      });
    }
  }
);

/* =============== [GET] /api/users/cluster-managers =================
   - جلب قائمة مديري التجمع من القاعدة المركزية
   - متاح فقط لمديري التجمع (RoleID = 1)
   - يدعم البحث بالاسم/البريد/اليوزر/الجوال
   - ⚠️ يجب أن يكون قبل /:id لتجنب التقاط cluster-managers كـ id
========================================================= */
router.get('/cluster-managers',
  requireAuth,
  async (req, res) => {
    try {
      // التحقق من وجود المستخدم في الطلب
      if (!req.user) {
        console.error('❌ [cluster-managers] req.user غير موجود');
        return res.status(401).json({ 
          ok: false, 
          message: 'غير مصرح - يجب تسجيل الدخول' 
        });
      }

      // التحقق من أن المستخدم هو مدير تجمع
      const roleId = Number(req.user?.RoleID || req.user?.roleId || 0);
      const isCluster = [1, 4].includes(roleId);
      
      console.log('🔍 [cluster-managers] التحقق من الصلاحيات:', {
        UserID: req.user?.UserID,
        RoleID: roleId,
        isCluster
      });
      
      if (!isCluster) {
        console.log('❌ [cluster-managers] محاولة وصول غير مصرح:', {
          UserID: req.user?.UserID,
          RoleID: roleId
        });
        return res.status(403).json({ 
          ok: false, 
          message: 'غير مصرح - مديري التجمع فقط' 
        });
      }

      const { search } = req.query;
      
      // التحقق من الاتصال بالقاعدة المركزية
      let centralPool;
      try {
        centralPool = await getCentralPool();
      } catch (poolError) {
        console.error('❌ [cluster-managers] خطأ في الاتصال بالقاعدة المركزية:', poolError);
        return res.status(500).json({ 
          ok: false, 
          message: 'خطأ في الاتصال بالقاعدة المركزية',
          error: poolError.message 
        });
      }
      
      let where = ' WHERE RoleID = 1 '; // مدير تجمع فقط
      const args = [];
      
      if (search && String(search).trim()) {
        where += ` AND ( FullName LIKE ? OR Username LIKE ? OR Email LIKE ? OR Mobile LIKE ? ) `;
        const s = `%${String(search).trim()}%`;
        args.push(s, s, s, s);
      }

      const sql = `
        SELECT UserID, RoleID, FullName, Username, Email, Mobile,
               IsActive, CreatedAt, UpdatedAt,
               NULL AS HospitalID, NULL AS DepartmentID,
               'مدير تجمع' AS HospitalNameAr
        FROM users_central
        ${where}
        ORDER BY FullName
        LIMIT 200
      `;
      
      console.log('🔍 [cluster-managers] جلب مديري التجمع:', { 
        search, 
        sql: sql.substring(0, 100) + '...',
        argsCount: args.length 
      });
      
      let rows;
      try {
        [rows] = await centralPool.query(sql, args);
        console.log('✅ [cluster-managers] تم جلب', rows.length, 'مدير تجمع');
      } catch (queryError) {
        console.error('❌ [cluster-managers] خطأ في استعلام قاعدة البيانات:', queryError);
        // إذا كان الخطأ بسبب عدم وجود الجدول، أعط رسالة واضحة
        if (queryError.code === 'ER_NO_SUCH_TABLE' || queryError.message.includes('doesn\'t exist')) {
          return res.status(500).json({ 
            ok: false, 
            message: 'جدول users_central غير موجود في القاعدة المركزية',
            error: 'Table users_central does not exist'
          });
        }
        throw queryError;
      }

      res.json({ ok: true, items: rows });
    } catch (e) {
      console.error('❌ GET /users/cluster-managers error:', e);
      res.status(500).json({ 
        ok: false, 
        message: 'server error',
        error: e.message 
      });
    }
  }
);

/* =============== [GET] /api/users/:id ================= */
router.get('/:id',
  requireAuth, resolveHospitalId, attachHospitalPool,
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!id || Number.isNaN(id)) {
        return res.status(400).json({ ok:false, message:'معرّف مستخدم غير صالح' });
      }

      const [[u]] = await req.hospitalPool.query(
        `SELECT u.*, d.NameAr AS DepartmentNameAr, d.NameEn AS DepartmentNameEn
         FROM users u
         LEFT JOIN departments d
           ON d.DepartmentID = u.DepartmentID
          AND d.HospitalID  = u.HospitalID
         WHERE u.UserID=? AND COALESCE(u.IsDeleted,0)=0
         LIMIT 1`, [id]
      );
      if (!u) return res.status(404).json({ ok:false, message:'not found' });

      u.DepartmentName = u.DepartmentNameAr || u.DepartmentNameEn || null;

      res.json({ ok: true, data: u });
    } catch (e) {
      console.error('GET /users/:id error', e);
      res.status(500).json({ ok:false, message:'server error' });
    }
  }
);

/* =============== [POST] /api/users ====================
   - الإنشاء في قاعدة المستشفى المحددة
   - يتحقق من تكرار Username/Email داخل نفس المستشفى
   - كلمة السر: نتلقى PasswordHash جاهز (اختياري)
======================================================= */
router.post('/',
  requireAuth, resolveHospitalId, attachHospitalPool,
  async (req, res) => {
    try {
      // التحقق من صلاحية إضافة مستخدم
      const isCentral = req.user?.scope === 'central' || req.user?.HospitalID == null;
      let allowed = isCentral;
      
      // إذا لم يكن مركزياً، تحقق من الصلاحية في قاعدة مستشفاه
      if (!allowed && req.user?.HospitalID) {
        allowed = await hasPermissionFor(req.user.UserID, req.user.HospitalID, 'HOSPITAL_USER_CREATE');
      }
      
      if (!allowed) {
        console.log(`❌ ممنوع - المستخدم ${req.user.UserID} ليس لديه صلاحية إضافة مستخدم`);
        return res.status(403).json({ 
          ok: false, 
          error: 'ليس لديك صلاحية إضافة مستخدم جديد' 
        });
      }

      const isCluster = [1,4].includes(Number(req.user?.RoleID));
      if (!isCluster && Number(req.hospitalId) !== Number(req.user.HospitalID)) {
        return res.status(403).json({ ok:false, message:'forbidden' });
      }

      const {
        RoleID=2, DepartmentID=null, SubDepartmentID=null,
        FullName, Username, Email=null, Mobile=null, NationalID=null,
        Password, PasswordHash='', IsActive=1
      } = req.body || {};

      if (!FullName?.trim() || !Username?.trim()) {
        return res.status(400).json({ ok:false, message:'name/username required' });
      }

      // جهّز الهاش
      let storeHash = '';
      if (Password && String(Password).length >= 6) {
        storeHash = await bcrypt.hash(String(Password), 10);
        console.log(`🔐 Hashing password for user: ${Username.trim()}`);
      } else if (PasswordHash && PasswordHash.startsWith('$2')) {
        // دعم لو جاء هاش Bcrypt جاهز (حالات خاصة)
        storeHash = String(PasswordHash);
        console.log(`🔐 Using provided bcrypt hash for user: ${Username.trim()}`);
      } else if (PasswordHash) {
        return res.status(400).json({ ok:false, message:'صيغة PasswordHash غير مدعومة، أرسل Password بدلاً منها' });
      }

      // منع التكرار في قاعدة المستشفى
      const [[dupU]] = await req.hospitalPool.query(
        'SELECT UserID, FullName, Email, IsActive FROM users WHERE Username=? AND COALESCE(IsDeleted,0)=0 LIMIT 1',
        [Username.trim()]
      );
      if (dupU) {
        console.log(`❌ Username conflict: ${Username.trim()} already exists for user ${dupU.FullName} (ID: ${dupU.UserID})`);
        const status = dupU.IsActive ? 'مفعل' : 'موقف';
        const emailInfo = dupU.Email ? `، البريد: ${dupU.Email}` : '';
        return res.status(409).json({ 
          ok:false, 
          message:'username exists',
          details: `اسم المستخدم "${Username.trim()}" موجود مسبقاً للمستخدم "${dupU.FullName}" (الحالة: ${status}${emailInfo})`
        });
      }

      if (Email?.trim()) {
        const [[dupE]] = await req.hospitalPool.query(
          'SELECT UserID, FullName, Username, IsActive FROM users WHERE Email=? AND COALESCE(IsDeleted,0)=0 LIMIT 1',
          [Email.trim()]
        );
        if (dupE) {
          console.log(`❌ Email conflict: ${Email.trim()} already exists for user ${dupE.FullName} (ID: ${dupE.UserID})`);
          const status = dupE.IsActive ? 'مفعل' : 'موقف';
          return res.status(409).json({ 
            ok:false, 
            message:'email exists',
            details: `البريد الإلكتروني "${Email.trim()}" موجود مسبقاً للمستخدم "${dupE.FullName}" (اسم المستخدم: ${dupE.Username}, الحالة: ${status})`
          });
        }
      }

      // التحقق من التكرار في user_directory (اختياري - للتحذير فقط)
      try {
        const centralPool = await getCentralPool();
        const [[dupCentral]] = await centralPool.query(
          'SELECT Username, HospitalID FROM user_directory WHERE Username=? LIMIT 1',
          [Username.trim()]
        );
        if (dupCentral) {
          console.log(`⚠️ Username exists in central user_directory: ${Username.trim()} (HospitalID: ${dupCentral.HospitalID})`);
        }
      } catch (error) {
        console.warn('⚠️ Could not check central user_directory:', error.message);
      }

      const [r] = await req.hospitalPool.query(
        `INSERT INTO users
         (RoleID, HospitalID, DepartmentID, SubDepartmentID,
          FullName, Username, Email, Mobile, NationalID,
          PasswordHash, IsActive, CreatedAt, UpdatedAt, IsDeleted)
         VALUES (?,?,?,?,?,?,?,?,?,?,?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0)`,
        [
          Number(RoleID), Number(req.hospitalId),
          DepartmentID ? Number(DepartmentID) : null,
          SubDepartmentID ? Number(SubDepartmentID) : null,
          FullName.trim(), Username.trim(),
          Email?.trim() || null, Mobile?.trim() || null, NationalID?.trim() || null,
          storeHash, Number(IsActive) ? 1 : 0
        ]
      );

      // مزامنة المستخدم إلى القاعدة المركزية لتسجيل الدخول
      const syncResult = await syncUserToCentral({
        Username: Username.trim(),
        HospitalID: Number(req.hospitalId),
        RoleID: Number(RoleID),
        IsActive: Number(IsActive) ? 1 : 0
      });

      if (!syncResult.success) {
        console.warn('⚠️ Failed to sync user to central, but user created in hospital DB:', syncResult.error);
      }

      res.status(201).json({ 
        ok: true, 
        success: true, 
        message: 'تم إنشاء المستخدم بنجاح', 
        userId: r.insertId,
        centralSync: syncResult.success ? 'تم المزامنة مع القاعدة المركزية' : 'تحذير: فشل المزامنة مع القاعدة المركزية'
      });
    } catch (e) {
      console.error('POST /users error', e);
      res.status(500).json({ ok:false, message:'server error' });
    }
  }
);

/* ================= [PUT] /api/users/:id ================= */
router.put('/:id',
  requireAuth, resolveHospitalId, attachHospitalPool,
  async (req, res) => {
    try {
      // التحقق من صلاحية تعديل المستخدم
      const isCentral = req.user?.scope === 'central' || req.user?.HospitalID == null;
      let allowed = isCentral;
      
      // إذا لم يكن مركزياً، تحقق من الصلاحية في قاعدة مستشفاه
      if (!allowed && req.user?.HospitalID) {
        allowed = await hasPermissionFor(req.user.UserID, req.user.HospitalID, 'HOSPITAL_USER_EDIT');
      }
      
      if (!allowed) {
        console.log(`❌ ممنوع - المستخدم ${req.user.UserID} ليس لديه صلاحية تعديل المستخدم`);
        return res.status(403).json({ 
          ok: false, 
          error: 'ليس لديك صلاحية تعديل المستخدم' 
        });
      }

      const id = Number(req.params.id);
      const isCluster = [1,4].includes(Number(req.user?.RoleID));
      if (!isCluster && Number(req.hospitalId) !== Number(req.user.HospitalID)) {
        return res.status(403).json({ ok:false, message:'forbidden' });
      }

      const {
        RoleID, DepartmentID, SubDepartmentID,
        FullName, Username, Email, Mobile, NationalID,
        PasswordHash, NewPassword, IsActive
      } = req.body || {};

      // منع تكرار اليوزر/الإيميل (مع استثناء نفس السجل)
      if (Username?.trim()) {
        const [[dupU]] = await req.hospitalPool.query(
          'SELECT UserID FROM users WHERE Username=? AND UserID<>? AND COALESCE(IsDeleted,0)=0 LIMIT 1',
          [Username.trim(), id]
        );
        if (dupU) return res.status(409).json({ ok:false, message:'username exists' });
      }
      if (Email?.trim()) {
        const [[dupE]] = await req.hospitalPool.query(
          'SELECT UserID FROM users WHERE Email=? AND UserID<>? AND COALESCE(IsDeleted,0)=0 LIMIT 1',
          [Email.trim(), id]
        );
        if (dupE) return res.status(409).json({ ok:false, message:'email exists' });
      }

      // جهّز الهاش الجديد
      let newHash = null;
      if (NewPassword && String(NewPassword).length >= 6) {
        newHash = await bcrypt.hash(String(NewPassword), 10);
        console.log(`🔐 Updating password hash for user ID: ${id}`);
      } else if (PasswordHash && PasswordHash.startsWith('$2')) {
        // في حال أردتِ تمرير هاش جاهز Bcrypt
        newHash = String(PasswordHash);
        console.log(`🔐 Using provided bcrypt hash for user ID: ${id}`);
      }

      const [r] = await req.hospitalPool.query(
        `UPDATE users SET
           RoleID = COALESCE(?, RoleID),
           DepartmentID = ?,
           SubDepartmentID = ?,
           FullName = COALESCE(?, FullName),
           Username = COALESCE(?, Username),
           Email = ?,
           Mobile = ?,
           NationalID = ?,
           PasswordHash = COALESCE(?, PasswordHash),
           IsActive = COALESCE(?, IsActive),
           UpdatedAt = CURRENT_TIMESTAMP
         WHERE UserID=?`,
        [
          (RoleID!=null ? Number(RoleID) : null),
          (DepartmentID ? Number(DepartmentID) : null),
          (SubDepartmentID ? Number(SubDepartmentID) : null),
          FullName?.trim() || null,
          Username?.trim() || null,
          Email?.trim() || null,
          Mobile?.trim() || null,
          NationalID?.trim() || null,
          (newHash!=null ? newHash : null),
          (IsActive!=null ? (Number(IsActive)?1:0) : null),
          id
        ]
      );
      if (!r.affectedRows) return res.status(404).json({ ok:false, message:'not found' });

      // مزامنة التحديثات إلى القاعدة المركزية (إذا تم تغيير Username أو RoleID أو IsActive)
      if (Username?.trim() || RoleID != null || IsActive != null) {
        // جلب البيانات المحدثة
        const [[updatedUser]] = await req.hospitalPool.query(
          'SELECT Username, HospitalID, RoleID, IsActive FROM users WHERE UserID = ?',
          [id]
        );
        
        if (updatedUser) {
          const syncResult = await syncUserToCentral({
            Username: updatedUser.Username,
            HospitalID: updatedUser.HospitalID,
            RoleID: updatedUser.RoleID,
            IsActive: updatedUser.IsActive
          });
          
          if (!syncResult.success) {
            console.warn('⚠️ Failed to sync user update to central:', syncResult.error);
          }
        }
      }

      res.json({ 
        ok: true, 
        success: true, 
        message: 'تم تحديث المستخدم بنجاح' 
      });
    } catch (e) {
      console.error('PUT /users/:id error', e);
      res.status(500).json({ ok:false, message:'server error' });
    }
  }
);

/* =============== [DELETE] /api/users/:id =================
   - حذف منطقي IsDeleted=1 + IsActive=0
========================================================= */
router.delete('/:id',
  requireAuth, resolveHospitalId, attachHospitalPool,
  async (req, res) => {
    try {
      // التحقق من صلاحية حذف المستخدم
      const isCentral = req.user?.scope === 'central' || req.user?.HospitalID == null;
      let allowed = isCentral;
      
      // إذا لم يكن مركزياً، تحقق من الصلاحية في قاعدة مستشفاه
      if (!allowed && req.user?.HospitalID) {
        allowed = await hasPermissionFor(req.user.UserID, req.user.HospitalID, 'HOSPITAL_USER_DELETE');
      }
      
      if (!allowed) {
        console.log(`❌ ممنوع - المستخدم ${req.user.UserID} ليس لديه صلاحية حذف المستخدم`);
        return res.status(403).json({ 
          ok: false, 
          error: 'ليس لديك صلاحية حذف المستخدم' 
        });
      }

      const id = Number(req.params.id);
      const [r] = await req.hospitalPool.query(
        `UPDATE users
         SET IsDeleted=1, IsActive=0, DeletedAt=CURRENT_TIMESTAMP, DeletedByUserID=?
         WHERE UserID=? AND COALESCE(IsDeleted,0)=0`,
        [req.user?.UserID || null, id]
      );
      if (!r.affectedRows) return res.status(404).json({ ok:false, message:'not found' });
      res.json({ ok:true, success: true, message: 'تم حذف المستخدم بنجاح' });
    } catch (e) {
      console.error('DELETE /users/:id error', e);
      res.status(500).json({ ok:false, message:'server error' });
    }
  }
);

/* =============== [POST] /api/users/sync-to-central =================
   - مزامنة جميع المستخدمين الموجودين إلى القاعدة المركزية
   - للمديرين فقط
========================================================= */
router.post('/sync-to-central',
  requireAuth, resolveHospitalId, attachHospitalPool,
  async (req, res) => {
    try {
      const isCluster = [1,4].includes(Number(req.user?.RoleID));
      if (!isCluster) {
        return res.status(403).json({ ok:false, message:'forbidden - cluster managers only' });
      }

      const syncResult = await syncAllUsersToCentral(req.hospitalId);
      
      if (syncResult.success) {
        res.json({ 
          ok: true, 
          success: true, 
          message: `تم مزامنة ${syncResult.synced} مستخدم، ${syncResult.skipped} موجود مسبقاً`,
          synced: syncResult.synced,
          skipped: syncResult.skipped
        });
      } else {
        res.status(500).json({ 
          ok: false, 
          message: 'فشل في المزامنة', 
          error: syncResult.error 
        });
      }
    } catch (e) {
      console.error('POST /users/sync-to-central error', e);
      res.status(500).json({ ok:false, message:'server error' });
    }
  }
);

/* =============== [GET] /api/users/:id/details =================
   - تفاصيل موظف واحد
========================================================= */
router.get('/:id/details',
  requireAuth, resolveHospitalId, attachHospitalPool,
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!id || Number.isNaN(id)) {
        return res.status(400).json({ 
          ok: false, 
          message: 'معرّف مستخدم غير صالح' 
        });
      }

      const hospitalId = Number(req.hospitalId);
      if (!hospitalId) {
        return res.status(400).json({ 
          ok: false, 
          message: 'hospitalId مطلوب' 
        });
      }

      const [[row]] = await req.hospitalPool.query(
        `SELECT u.UserID, u.FullName, u.Username, u.DepartmentID, u.RoleID, u.IsActive,
                d.NameAr AS DepartmentNameAr, d.NameEn AS DepartmentNameEn
         FROM users u
         LEFT JOIN departments d
           ON d.DepartmentID = u.DepartmentID
          AND d.HospitalID  = u.HospitalID
         WHERE u.UserID = ? AND u.HospitalID = ? AND COALESCE(u.IsDeleted,0)=0
         LIMIT 1`,
        [id, hospitalId]
      );

      if (!row) {
        return res.status(404).json({ 
          ok: false, 
          message: 'الموظف غير موجود' 
        });
      }

      row.DepartmentName = row.DepartmentNameAr || row.DepartmentNameEn || null;

      res.json({ 
        ok: true, 
        user: row 
      });
    } catch (e) {
      console.error('GET /users/:id/details error:', e);
      res.status(500).json({ 
        ok: false, 
        message: 'Server error' 
      });
    }
  }
);

/* =============== [GET] /api/users/me =================
   - جلب بيانات المستخدم الحالي مع أسماء المستشفى والقسم
   - يعتمد على التوكن فقط
======================================================= */
router.get('/me', requireAuth, resolveHospitalId, async (req, res) => {
  try {
    // استخراج البيانات من req.user أو من req (من resolveHospitalId)
    const userId = req.user.UserID || req.user.userId || req.user?.id || req.user;
    const hospitalId = req.user.HospitalID || req.user.hospitalId || req.hospitalId;
    
    console.log('🔍 [GET /me] بيانات التوكن:', {
      userId,
      hospitalId,
      userObject: req.user,
      reqHospitalId: req.hospitalId,
      reqUser: req.user
    });
    
    if (!userId || !hospitalId) {
      console.log('❌ [GET /me] معرف المستخدم أو المستشفى مفقود:', {
        userId,
        hospitalId,
        availableFields: Object.keys(req.user),
        reqKeys: Object.keys(req)
      });
      return res.status(400).json({ 
        ok: false, 
        message: 'معرف المستخدم أو المستشفى مفقود' 
      });
    }

    // جلب بيانات المستخدم مع اسم القسم
    const pool = await getTenantPoolByHospitalId(Number(hospitalId));
    const [users] = await pool.query(`
      SELECT u.UserID, u.Username, u.FullName, u.Email, u.Mobile, u.HospitalID, u.DepartmentID,
             d.NameAr AS DepartmentNameAr, d.NameEn AS DepartmentNameEn
      FROM users u
      LEFT JOIN departments d
        ON d.DepartmentID = u.DepartmentID
       AND d.HospitalID  = u.HospitalID
      WHERE u.UserID = ? AND u.IsActive = 1
      LIMIT 1
    `, [userId]);

    if (users.length === 0) {
      return res.status(404).json({ 
        ok: false, 
        message: 'المستخدم غير موجود' 
      });
    }

    const user = users[0];
    
    // جلب اسم المستشفى من القاعدة المركزية
    const centralPool = await getCentralPool();
    const [[hosp]] = await centralPool.query(
      'SELECT NameAr AS HospitalName FROM hospitals WHERE HospitalID=? LIMIT 1',
      [user.HospitalID]
    );
    user.HospitalName = hosp?.HospitalName || null;

    res.json({ 
      ok: true, 
      data: {
        ...user,
        DepartmentName: user.DepartmentNameAr || user.DepartmentNameEn || null
      }
    });
  } catch (e) {
    console.error('GET /users/me error:', e);
    res.status(500).json({ 
      ok: false, 
      message: 'خطأ في الخادم' 
    });
  }
});

/* =============== [PUT] /api/users/me =================
   - تحديث بيانات المستخدم الحالي (الاسم، الإيميل، الجوال)
   - لا يسمح بتعديل RoleID أو HospitalID
========================================================= */
router.put('/me', requireAuth, async (req, res) => {
  try {
    const userId = req.user.UserID || req.user.userId;
    const hospitalId = req.user.HospitalID || req.user.hospitalId;
    const { FullName, Email, Mobile } = req.body;

    if (!userId || !hospitalId) {
      return res.status(400).json({ 
        ok: false, 
        message: 'معرف المستخدم أو المستشفى مفقود' 
      });
    }

    // التحقق من صحة البيانات
    if (!FullName?.trim()) {
      return res.status(400).json({ 
        ok: false, 
        message: 'الاسم الكامل مطلوب' 
      });
    }

    // التحقق من عدم تكرار الإيميل (مع استثناء نفس المستخدم)
    if (Email?.trim()) {
      const pool = await getTenantPoolByHospitalId(Number(hospitalId));
      const [[dupEmail]] = await pool.query(
        'SELECT UserID FROM users WHERE Email=? AND UserID<>? AND COALESCE(IsDeleted,0)=0 LIMIT 1',
        [Email.trim(), userId]
      );
      if (dupEmail) {
        return res.status(409).json({ 
          ok: false, 
          message: 'البريد الإلكتروني مستخدم مسبقاً' 
        });
      }
    }

    // تحديث البيانات
    const pool = await getTenantPoolByHospitalId(Number(hospitalId));
    await pool.query(
      `UPDATE users 
       SET FullName=?, Email=?, Mobile=?, UpdatedAt=NOW() 
       WHERE UserID=?`,
      [FullName.trim(), Email?.trim() || null, Mobile?.trim() || null, userId]
    );

    res.json({ 
      ok: true, 
      message: 'تم تحديث البيانات بنجاح' 
    });
  } catch (e) {
    console.error('PUT /users/me error:', e);
    res.status(500).json({ 
      ok: false, 
      message: 'خطأ في الخادم' 
    });
  }
});

/* =============== [PUT] /api/users/me/password =============
   - تغيير كلمة مرور المستخدم الحالي
   - يتطلب كلمة المرور القديمة للتحقق
========================================================= */
router.put('/me/password', requireAuth, async (req, res) => {
  try {
    const userId = req.user.UserID || req.user.userId;
    const hospitalId = req.user.HospitalID || req.user.hospitalId;
    const { oldPassword, newPassword } = req.body;

    if (!userId || !hospitalId) {
      return res.status(400).json({ 
        ok: false, 
        message: 'معرف المستخدم أو المستشفى مفقود' 
      });
    }

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ 
        ok: false, 
        message: 'كلمة المرور القديمة والجديدة مطلوبتان' 
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ 
        ok: false, 
        message: 'كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل' 
      });
    }

    // جلب كلمة المرور الحالية
    const pool = await getTenantPoolByHospitalId(Number(hospitalId));
    const [[user]] = await pool.query(
      'SELECT PasswordHash FROM users WHERE UserID=? AND IsActive=1 LIMIT 1',
      [userId]
    );

    if (!user) {
      return res.status(404).json({ 
        ok: false, 
        message: 'المستخدم غير موجود' 
      });
    }

    // التحقق من كلمة المرور القديمة
    const isValidPassword = await bcrypt.compare(oldPassword, user.PasswordHash);
    if (!isValidPassword) {
      return res.status(400).json({ 
        ok: false, 
        message: 'كلمة المرور الحالية غير صحيحة' 
      });
    }

    // تحديث كلمة المرور
    const newHash = await bcrypt.hash(newPassword, 12);
    await pool.query(
      'UPDATE users SET PasswordHash=?, UpdatedAt=NOW() WHERE UserID=?',
      [newHash, userId]
    );

    res.json({ 
      ok: true, 
      message: 'تم تحديث كلمة المرور بنجاح' 
    });
  } catch (e) {
    console.error('PUT /users/me/password error:', e);
    res.status(500).json({ 
      ok: false, 
      message: 'خطأ في الخادم' 
    });
  }
});

export default router;