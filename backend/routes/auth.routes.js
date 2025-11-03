// backend/routes/auth.routes.js
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getCentralPool } from '../db/centralPool.js';
import { getTenantPoolByHospitalId } from '../db/tenantManager.js';
import config from '../config/multi-tenant.js';

const router = express.Router();

// تسجيل حساب "موظف" في قاعدة المستشفى (الدور يتم تعيينه تلقائياً على EMPLOYEE)
router.post('/register', async (req, res) => {
  try {
    const {
      hospitalId,        // إلزامي
      fullName, username, email, mobile, nationalId, password,
      departmentId, subDepartmentId
    } = req.body;

    // إجبار الدور على EMPLOYEE تلقائياً (لا نأخذ roleId من العميل)
    const roleId = config.roles.EMPLOYEE; // 3 = موظف

    if (!hospitalId) return res.status(400).json({ 
      success: false,
      message: 'hospitalId مطلوب' 
    });

    const pool = await getTenantPoolByHospitalId(Number(hospitalId));

    // تحقق فريد username داخل قاعدة المستشفى
    const [u] = await pool.query('SELECT UserID FROM users WHERE Username=? LIMIT 1', [username]);
    if (u.length) return res.status(409).json({ 
      success: false,
      message: 'اسم المستخدم مستخدم مسبقاً' 
    });

    const hash = await bcrypt.hash(password, 10);

    await pool.query(`
      INSERT INTO users (RoleID, HospitalID, DepartmentID, SubDepartmentID, FullName, Username, Email, Mobile, NationalID, PasswordHash, IsActive)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `, [roleId, hospitalId, departmentId, subDepartmentId, fullName, username, email, mobile, nationalId, hash]);

    // إضافة/تحديث المستخدم في الفهرس المركزي
    const central = await getCentralPool();
    await central.query(`
      INSERT INTO user_directory (Username, HospitalID, RoleID, IsActive)
      VALUES (?, ?, ?, 1)
      ON DUPLICATE KEY UPDATE HospitalID=VALUES(HospitalID), RoleID=VALUES(RoleID), IsActive=1, UpdatedAt=NOW()
    `, [username, Number(hospitalId), Number(roleId)]);

    return res.json({ 
      success: true,
      message: 'تم إنشاء الحساب بنجاح' 
    });
  } catch (err) {
    console.error('register error', err);
    return res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
});

// تسجيل حساب "مدير التجمّع" في القاعدة المركزية فقط (مرّة واحدة عادةً)
router.post('/register-cluster-manager', async (req, res) => {
  try {
    const { fullName, username, email, mobile, password } = req.body;
    const pool = await getCentralPool();

    const [u] = await pool.query('SELECT UserID FROM users_central WHERE Username=? LIMIT 1', [username]);
    if (u.length) return res.status(409).json({ 
      success: false,
      message: 'اسم المستخدم مستخدم مسبقاً' 
    });

    const hash = await bcrypt.hash(password, 10);
    await pool.query(`
      INSERT INTO users_central (RoleID, FullName, Username, Email, Mobile, PasswordHash, IsActive)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `, [config.roles.CLUSTER_MANAGER, fullName, username, email, mobile, hash]);

    return res.json({ 
      success: true,
      message: 'تم إنشاء حساب مدير التجمّع بنجاح' 
    });
  } catch (err) {
    console.error('register CM error', err);
    return res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
});

/**
 * تسجيل الدخول التلقائي:
 * - يستقبل: { username, password } فقط.
 * - يحاول أولاً إيجاد المستخدم في user_directory (مركزي).
 * - إن لم يوجد: يحاول users_central (مدير التجمع).
 * - إن لم يوجد: يبحث تلقائياً في قواعد المستشفيات الفعّالة ويضيفه للدليل.
 */
router.post('/login', async (req, res) => {
  try {
    // تشخيص: طباعة نوع المحتوى وجسم الطلب
    console.log('LOGIN BODY:', req.headers['content-type'], req.body);
    
    // مهم جداً: تأكدي app.use(express.json()) قبل الراوترات
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'اسم المستخدم وكلمة المرور مطلوبة' });
    }

    const central = await getCentralPool();

    // 1) ✅ أولوية قصوى: البحث في جدول users المركزي عن مستخدمين بدون مستشفى (HospitalID IS NULL)
    //    هذا يضمن أن cluster.admin وأي مستخدم مركزي آخر يتم التعرف عليه أولاً
    {
      const [centralUsers] = await central.query(
        `SELECT u.UserID, u.RoleID, u.FullName, u.Username, u.PasswordHash, u.IsActive,
                u.HospitalID, u.DepartmentID
         FROM users u
         WHERE u.Username = ? AND u.IsActive = 1 AND u.HospitalID IS NULL
         LIMIT 1`,
        [username]
      );
      const centralUser = centralUsers[0];
      if (centralUser) {
        console.log('✅ LOGIN: مستخدم مركزي وُجد في جدول users:', centralUser.Username);
        const ok = await bcrypt.compare(password, centralUser.PasswordHash);
        if (!ok) {
          console.log('❌ LOGIN: كلمة مرور خاطئة للمستخدم المركزي');
          return res.status(401).json({ success: false, message: 'بيانات غير صحيحة' });
        }

        const token = jwt.sign(
          { 
            uid: centralUser.UserID,
            userId: centralUser.UserID, 
            roleId: centralUser.RoleID,
            scope: 'central',
            roleScope: 'cluster',
            HospitalID: null,
            hospitalId: null
          },
          config.jwt.secret,
          { expiresIn: config.jwt.expires }
        );
        
        console.log('✅ LOGIN: تسجيل دخول ناجح للمستخدم المركزي');
        return res.json({
          success: true,
          token,
          user: { 
            UserID: centralUser.UserID,
            id: centralUser.UserID, 
            FullName: centralUser.FullName, 
            Username: centralUser.Username,
            RoleID: centralUser.RoleID,
            HospitalID: null,
            Scope: 'central'
          },
          redirect: '/NewProjectMecca/index/index.html'
        });
      }
    }

    // 2) لو كان مدير تجمع في users_central (جدول منفصل)
    {
      const [cm] = await central.query(
        'SELECT * FROM users_central WHERE Username=? AND IsActive=1 LIMIT 1',
        [username]
      );
      const cmUser = cm[0];
      if (cmUser) {
        console.log('✅ LOGIN: مستخدم مركزي وُجد في جدول users_central');
        const ok = await bcrypt.compare(password, cmUser.PasswordHash);
        if (!ok) return res.status(401).json({ success: false, message: 'بيانات غير صحيحة' });

        const token = jwt.sign(
          { 
            uid: cmUser.UserID,
            userId: cmUser.UserID, 
            roleId: cmUser.RoleID || 1, 
            scope: 'central',
            roleScope: 'cluster',
            HospitalID: null
          },
          config.jwt.secret,
          { expiresIn: config.jwt.expires }
        );
        return res.json({
          success: true,
          token,
          user: { 
            UserID: cmUser.UserID,
            id: cmUser.UserID, 
            FullName: cmUser.FullName, 
            RoleID: cmUser.RoleID || 1,
            HospitalID: null,
            Scope: 'central'
          },
          redirect: '/NewProjectMecca/index/index.html'
        });
      }
    }

    // 3) ابحث في الدليل المركزي user_directory
    let hospitalId = null;
    {
      const [dir] = await central.query(
        'SELECT HospitalID FROM user_directory WHERE Username=? AND IsActive=1 LIMIT 1',
        [username]
      );
      if (dir.length) {
        const rawId = dir[0].HospitalID;
        // ✅ معاملة 0 كـ NULL (قيمة غير صالحة)
        hospitalId = (rawId && Number(rawId) > 0) ? Number(rawId) : null;
        if (hospitalId === null) {
          console.log('⚠️ LOGIN: user_directory يحتوي على HospitalID غير صالح (0 أو NULL) لـ', username);
        }
      }
    }

    // 3) إن لم يوجد بالدليل: جرّب اكتشافه تلقائياً من قواعد المستشفيات الفعالة ثم خزّنه بالدليل
    if (!hospitalId) {
      const [hosp] = await central.query(
        'SELECT HospitalID, DbHost, DbUser, DbPass, DbName FROM hospitals WHERE (IsActive=1 OR Active=1)'
      );
      for (const h of hosp) {
        try {
          const pool = await getTenantPoolByHospitalId(Number(h.HospitalID));
          const [rows] = await pool.query(
            'SELECT UserID FROM users WHERE Username=? AND IsActive=1 LIMIT 1',
            [username]
          );
          if (rows.length) {
            hospitalId = Number(h.HospitalID);
            // خزّنه/حدّثه في الدليل
            await central.query(`
              INSERT INTO user_directory (Username, HospitalID, RoleID, IsActive)
              VALUES (?, ?, 3, 1)
              ON DUPLICATE KEY UPDATE HospitalID=VALUES(HospitalID), IsActive=1, UpdatedAt=NOW()
            `, [username, hospitalId]);
            break;
          }
        } catch {}
      }
    }

    if (!hospitalId) {
      // مستخدم غير معروف لا في المركزي ولا في أي مستشفى
      return res.status(401).json({ success: false, message: 'اسم المستخدم غير معروف' });
    }

    // 4) تحقق من المستخدم في قاعدة المستشفى + جلب اسم المستشفى
    const tpool = await getTenantPoolByHospitalId(hospitalId);
    const [users] = await tpool.query(
      'SELECT * FROM users WHERE Username=? AND IsActive=1 LIMIT 1',
      [username]
    );
    const user = users[0];
    if (!user) return res.status(401).json({ success: false, message: 'بيانات غير صحيحة' });

    const ok = await bcrypt.compare(password, user.PasswordHash);
    if (!ok) return res.status(401).json({ success: false, message: 'بيانات غير صحيحة' });

    // جلب اسم المستشفى من القاعدة المركزية
    const [hospRows] = await central.query(
      'SELECT NameAr FROM hospitals WHERE HospitalID=? LIMIT 1',
      [hospitalId]
    );
    const hospitalName = hospRows[0]?.NameAr || `مستشفى #${hospitalId}`;

    const token = jwt.sign(
      { 
        uid: user.UserID,
        userId: user.UserID, 
        roleId: user.RoleID, 
        hosp: user.HospitalID,
        hospitalId: user.HospitalID, 
        scope: 'tenant' 
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expires }
    );

    const redirect = '/NewProjectMecca/index/index.html';

    res.json({
      success: true,
      token,
      user: { 
        UserID: user.UserID,
        id: user.UserID, 
        FullName: user.FullName, 
        RoleID: user.RoleID, 
        HospitalID: user.HospitalID,
        HospitalName: hospitalName,
        DepartmentID: user.DepartmentID
      },
      redirect
    });
  } catch (err) {
    console.error('login error', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/auth/me
 * جلب معلومات المستخدم الحالي من التوكن
 */
router.get('/me', async (req, res) => {
  try {
    // التحقق من وجود التوكن
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'غير مصرح - التوكن مفقود' 
      });
    }

    const token = authHeader.substring(7);
    let decoded;
    
    try {
      decoded = jwt.verify(token, config.jwt.secret);
    } catch (err) {
      return res.status(401).json({ 
        success: false, 
        message: 'غير مصرح - توكن غير صالح' 
      });
    }

    const central = await getCentralPool();
    let userInfo = null;

    // إذا كان المستخدم مركزي (مدير التجمع)
    if (decoded.scope === 'central' || decoded.HospitalID === null || decoded.hospitalId === null) {
      // ابحث في جدول users المركزي أولاً
      const [centralUsers] = await central.query(
        `SELECT UserID, RoleID, FullName, Username, Email, Mobile, HospitalID, DepartmentID
         FROM users
         WHERE UserID = ? AND IsActive = 1 AND HospitalID IS NULL
         LIMIT 1`,
        [decoded.userId || decoded.uid]
      );

      if (centralUsers.length > 0) {
        const u = centralUsers[0];
        userInfo = {
          UserID: u.UserID,
          userId: u.UserID,
          FullName: u.FullName,
          Username: u.Username,
          Email: u.Email,
          Mobile: u.Mobile,
          RoleID: u.RoleID,
          roleId: u.RoleID,
          HospitalID: null,
          hospitalId: null,
          DepartmentID: null,
          isClusterManager: true,
          role: 'cluster_admin',
          scope: 'central'
        };
      } else {
        // جرب users_central
        const [cmUsers] = await central.query(
          `SELECT UserID, RoleID, FullName, Username, Email, Mobile
           FROM users_central
           WHERE UserID = ? AND IsActive = 1
           LIMIT 1`,
          [decoded.userId || decoded.uid]
        );

        if (cmUsers.length > 0) {
          const u = cmUsers[0];
          userInfo = {
            UserID: u.UserID,
            userId: u.UserID,
            FullName: u.FullName,
            Username: u.Username,
            Email: u.Email,
            Mobile: u.Mobile,
            RoleID: u.RoleID || 1,
            roleId: u.RoleID || 1,
            HospitalID: null,
            hospitalId: null,
            DepartmentID: null,
            isClusterManager: true,
            role: 'cluster_admin',
            scope: 'central'
          };
        }
      }
    } else {
      // مستخدم من قاعدة مستشفى
      const hospitalId = decoded.hospitalId || decoded.hosp;
      if (!hospitalId) {
        return res.status(400).json({ 
          success: false, 
          message: 'معرف المستشفى مفقود في التوكن' 
        });
      }

      const tpool = await getTenantPoolByHospitalId(Number(hospitalId));
      const [users] = await tpool.query(
        `SELECT UserID, RoleID, FullName, Username, Email, Mobile, HospitalID, DepartmentID
         FROM users
         WHERE UserID = ? AND IsActive = 1
         LIMIT 1`,
        [decoded.userId || decoded.uid]
      );

      if (users.length > 0) {
        const u = users[0];
        
        // جلب اسم المستشفى
        const [hospRows] = await central.query(
          'SELECT NameAr FROM hospitals WHERE HospitalID=? LIMIT 1',
          [hospitalId]
        );
        const hospitalName = hospRows[0]?.NameAr || `مستشفى #${hospitalId}`;

        userInfo = {
          UserID: u.UserID,
          userId: u.UserID,
          FullName: u.FullName,
          Username: u.Username,
          Email: u.Email,
          Mobile: u.Mobile,
          RoleID: u.RoleID,
          roleId: u.RoleID,
          HospitalID: u.HospitalID,
          hospitalId: u.HospitalID,
          HospitalName: hospitalName,
          DepartmentID: u.DepartmentID,
          isClusterManager: false,
          role: u.RoleID === 1 ? 'admin' : u.RoleID === 2 ? 'manager' : 'employee',
          scope: 'tenant'
        };
      }
    }

    if (!userInfo) {
      return res.status(404).json({ 
        success: false, 
        message: 'المستخدم غير موجود' 
      });
    }

    return res.json(userInfo);
  } catch (err) {
    console.error('GET /api/auth/me error:', err);
    return res.status(500).json({ 
      success: false, 
      message: 'خطأ في الخادم' 
    });
  }
});

/**
 * GET /api/auth/me-permissions
 * جلب صلاحيات المستخدم الحالي للصفحة الرئيسية
 */
router.get('/me-permissions', async (req, res) => {
  try {
    // التحقق من وجود التوكن
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'غير مصرح - التوكن مفقود' 
      });
    }

    const token = authHeader.substring(7);
    let decoded;
    
    try {
      decoded = jwt.verify(token, config.jwt.secret);
    } catch (err) {
      return res.status(401).json({ 
        success: false, 
        message: 'غير مصرح - توكن غير صالح' 
      });
    }

    const central = await getCentralPool();
    let userInfo = null;
    let permissions = {
      canSubmit: false,
      canTrack: false,
      historyScope: null,
      improvements: {
        view: false,
        create: false,
        edit: false,
        delete: false
      }
    };

    // إذا كان المستخدم مركزي (مدير التجمع)
    console.log('🔍 Debug - Token decoded:', {
      scope: decoded.scope,
      HospitalID: decoded.HospitalID,
      hospitalId: decoded.hospitalId,
      userId: decoded.userId || decoded.uid
    });
    
    if (decoded.scope === 'central' || decoded.HospitalID === null || decoded.hospitalId === null) {
      console.log('🔍 Debug - Detected central admin');
      // مدير التجمع له جميع الصلاحيات
      const [centralUsers] = await central.query(
        `SELECT UserID, RoleID, FullName, Username, HospitalID, DepartmentID
         FROM users
         WHERE UserID = ? AND IsActive = 1 AND HospitalID IS NULL
         LIMIT 1`,
        [decoded.userId || decoded.uid]
      );
      
      console.log('🔍 Debug - Central users found:', centralUsers.length);

      if (centralUsers.length > 0) {
        const u = centralUsers[0];
        console.log('🔍 Debug - Central user found:', {
          UserID: u.UserID,
          RoleID: u.RoleID,
          FullName: u.FullName
        });
        
        userInfo = {
          UserID: u.UserID,
          HospitalID: null,
          DepartmentID: null,
          RoleID: u.RoleID
        };
        // مدير التجمع له جميع الصلاحيات دائماً
        permissions = {
          canSubmit: true,
          canTrack: true,
          historyScope: 'HOSPITAL', // يمكنه رؤية جميع المستشفيات
          reply: true,
          transfer: true,
          transferDept: true,
          transferUser: true,
          improvements: {
            view: true,
            create: true,
            edit: true,
            delete: true
          },
          // صلاحيات الزائر السري - مدير التجمع له الكل
          mysteryModule: true,
          mysteryView: true,
          mysteryReplyAdd: true,
          mysteryStatusUpdate: true,
          mysteryTransferDept: true,
          mysteryTransferEmp: true,
          mysteryDelete: true,
          statusUpdate: true,
          remove: true,
          adminPanel: true, // مدير التجمع دائماً له صلاحية الإدارة
          adminDepartments: true, // إدارة الأقسام
          adminHospital: true,    // إدارة المستشفى
          adminClusters: true,    // إدارة المستشفيات (التجمع)
          canCreateHospital: true, // إضافة مستشفى
          // صلاحيات إدارة المستشفى (الأيقونات الأربعة) - مدير التجمع له الكل
          hospitalTrash: true,
          hospitalLogs: true,
          hospitalPermissions: true,
          hospitalUsers: true,
          canCreateUser: true, // إضافة مستخدم جديد
          canEditHospitalUser: true, // تعديل المستخدم
          canDeleteHospitalUser: true, // حذف المستخدم
          // صلاحيات الاستيراد - مدير التجمع له الكل
          importsPage: true,
          importDepartments: true,
          importMystery: true,
          import937: true,
          // صلاحيات بلاغات إدارة التجمع - مدير التجمع له الكل
          clusterSubmit: true,
          clusterView: true,
          clusterDetails: true,
          clusterReply: true,
          clusterStatus: true,
          // صلاحيات الأرشيف - مدير التجمع له الكل
          archiveView: true,
          archiveUpload: true
        };
        
        console.log('🔍 Debug - Central admin permissions set:', permissions);
      } else {
        console.log('🔍 Debug - No central user found');
      }
    } else {
      // مستخدم من قاعدة مستشفى - جلب صلاحياته
      const hospitalId = decoded.hospitalId || decoded.hosp;
      if (!hospitalId) {
        return res.status(400).json({ 
          success: false, 
          message: 'معرف المستشفى مفقود في التوكن' 
        });
      }

      const tpool = await getTenantPoolByHospitalId(Number(hospitalId));
      const [users] = await tpool.query(
        `SELECT UserID, RoleID, FullName, Username, HospitalID, DepartmentID
         FROM users
         WHERE UserID = ? AND IsActive = 1
         LIMIT 1`,
        [decoded.userId || decoded.uid]
      );

      if (users.length > 0) {
        const u = users[0];
        userInfo = {
          UserID: u.UserID,
          HospitalID: u.HospitalID,
          DepartmentID: u.DepartmentID,
          RoleID: u.RoleID
        };

        // جلب صلاحيات المستخدم
        const [perms] = await tpool.query(`
          SELECT PermissionKey, ViewScope
          FROM user_permissions
          WHERE UserID=? AND HospitalID=?
        `, [u.UserID, hospitalId]);

        // تحديد الصلاحيات
        const hasPermission = (key) => perms.some(p => p.PermissionKey === key);
        const historyScope = perms.find(p => p.PermissionKey === 'COMPLAINT_HISTORY_SCOPE')?.ViewScope || null;

        permissions = {
          canSubmit: hasPermission('COMPLAINT_SUBMIT'),
          canTrack: hasPermission('COMPLAINT_VIEW'),
          historyScope: historyScope,
          reply: hasPermission('COMPLAINT_REPLY'),
          transfer: hasPermission('COMPLAINT_TRANSFER'),
          transferDept: hasPermission('COMPLAINT_TRANSFER_DEPT'),
          transferUser: hasPermission('COMPLAINT_TRANSFER_USER'),
          statusUpdate: hasPermission('COMPLAINT_STATUS_UPDATE'),
          remove: hasPermission('COMPLAINT_DELETE'),
          // مدير التجمع (مركزي) دائماً له صلاحية الإدارة
          adminPanel: hasPermission('ADMIN_PANEL_ACCESS'),
          adminDepartments: hasPermission('ADMIN_DEPARTMENTS'),
          adminHospital: hasPermission('ADMIN_HOSPITAL'),
          adminClusters: hasPermission('ADMIN_CLUSTERS'),
          canCreateHospital: hasPermission('HOSPITAL_CREATE'),
          // صلاحيات إدارة المستشفى (الأيقونات الأربعة)
          hospitalTrash: hasPermission('HOSPITAL_TRASH'),
          hospitalLogs: hasPermission('HOSPITAL_LOGS'),
          hospitalPermissions: hasPermission('HOSPITAL_PERMISSIONS'),
          hospitalUsers: hasPermission('HOSPITAL_USERS'),
          canCreateUser: hasPermission('HOSPITAL_USER_CREATE'),
          canEditHospitalUser: hasPermission('HOSPITAL_USER_EDIT'),
          canDeleteHospitalUser: hasPermission('HOSPITAL_USER_DELETE'),
          // صلاحيات المشاريع التحسينية
          improvements: {
            view: hasPermission('IMPROVEMENTS_VIEW') || u.RoleID === 2, // مدير مستشفى أو صلاحية عرض
            create: hasPermission('IMPROVEMENTS_CREATE') || u.RoleID === 2, // مدير مستشفى أو صلاحية إنشاء
            edit: hasPermission('IMPROVEMENTS_EDIT') || u.RoleID === 2, // مدير مستشفى أو صلاحية تعديل
            delete: hasPermission('IMPROVEMENTS_DELETE') || u.RoleID === 2 // مدير مستشفى أو صلاحية حذف
          },
          // صلاحيات الزائر السري
          mysteryModule: hasPermission('MYSTERY_MODULE'),
          mysteryView: hasPermission('MYSTERY_VIEW'),
          mysteryReplyAdd: hasPermission('MYSTERY_REPLY_ADD'),
          mysteryStatusUpdate: hasPermission('MYSTERY_STATUS_UPDATE'),
          mysteryTransferDept: hasPermission('MYSTERY_TRANSFER_DEPT'),
          mysteryTransferEmp: hasPermission('MYSTERY_TRANSFER_EMP'),
          mysteryDelete: hasPermission('MYSTERY_DELETE'),
          // صلاحيات الاستيراد
          importsPage: hasPermission('IMPORTS_PAGE'),
          importDepartments: hasPermission('IMPORTS_DEPARTMENTS'),
          importMystery: hasPermission('IMPORTS_MYSTERY'),
          import937: hasPermission('IMPORTS_937'),
          // صلاحيات بلاغات إدارة التجمع
          clusterSubmit: hasPermission('CLUSTER_REPORT_CREATE'),
          clusterView: hasPermission('CLUSTER_REPORT_VIEW'),
          clusterDetails: hasPermission('CLUSTER_REPORT_DETAILS'),
          clusterReply: hasPermission('CLUSTER_REPORT_REPLY'),
          clusterStatus: hasPermission('CLUSTER_REPORT_STATUS'),
          // صلاحيات الأرشيف
          archiveView: hasPermission('ARCHIVE_VIEW'),
          archiveUpload: hasPermission('ARCHIVE_UPLOAD')
        };
      }
    }

    if (!userInfo) {
      return res.status(404).json({ 
        success: false, 
        message: 'المستخدم غير موجود' 
      });
    }

    // Debug: يمكن إزالته لاحقاً
    // console.log('🔍 Debug - Final response:', {
    //   userInfo,
    //   permissions,
    //   adminPanel: permissions.adminPanel,
    //   isCentralUser: userInfo?.HospitalID == null,
    //   userScope: decoded.scope,
    //   mysteryPermissions: {
    //     module: permissions.mysteryModule,
    //     view: permissions.mysteryView,
    //     replyAdd: permissions.mysteryReplyAdd,
    //     statusUpdate: permissions.mysteryStatusUpdate,
    //     transferDept: permissions.mysteryTransferDept,
    //     transferEmp: permissions.mysteryTransferEmp,
    //     delete: permissions.mysteryDelete
    //   }
    // });
    
    return res.json({
      ok: true,
      canSubmit: permissions.canSubmit,
      canTrack: permissions.canTrack,
      historyScope: permissions.historyScope,
      reply: permissions.reply,
      transfer: permissions.transfer,
      transferDept: permissions.transferDept,
      transferUser: permissions.transferUser,
      statusUpdate: permissions.statusUpdate,
      remove: permissions.remove,
      adminPanel: permissions.adminPanel,
      adminDepartments: permissions.adminDepartments,
      adminHospital: permissions.adminHospital,
      adminClusters: permissions.adminClusters,
      canCreateHospital: permissions.canCreateHospital,
      // صلاحيات إدارة المستشفى (الأيقونات الأربعة)
      hospitalTrash: permissions.hospitalTrash,
      hospitalLogs: permissions.hospitalLogs,
      hospitalPermissions: permissions.hospitalPermissions,
      hospitalUsers: permissions.hospitalUsers,
      canCreateUser: permissions.canCreateUser,
      canEditHospitalUser: permissions.canEditHospitalUser,
      canDeleteHospitalUser: permissions.canDeleteHospitalUser,
      // صلاحيات المشاريع التحسينية
      improvements: permissions.improvements,
      // صلاحيات الزائر السري
      mystery: {
        module: permissions.mysteryModule || false,
        view: permissions.mysteryView || false,
        replyAdd: permissions.mysteryReplyAdd || false,
        statusUpdate: permissions.mysteryStatusUpdate || false,
        transferDept: permissions.mysteryTransferDept || false,
        transferEmp: permissions.mysteryTransferEmp || false,
        delete: permissions.mysteryDelete || false
      },
      // صلاحيات الاستيراد
      imports: {
        importsPage: permissions.importsPage || false,
        importDepartments: permissions.importDepartments || false,
        importMystery: permissions.importMystery || false,
        import937: permissions.import937 || false
      },
      // صلاحيات بلاغات إدارة التجمع
      clusterSubmit: permissions.clusterSubmit || false,
      clusterView: permissions.clusterView || false,
      clusterDetails: permissions.clusterDetails || false,
      clusterReply: permissions.clusterReply || false,
      clusterStatus: permissions.clusterStatus || false,
      // صلاحيات الأرشيف
      archiveView: permissions.archiveView || false,
      archiveUpload: permissions.archiveUpload || false,
      user: userInfo
    });
  } catch (err) {
    console.error('GET /api/auth/me-permissions error:', err);
    return res.status(500).json({ 
      success: false, 
      message: 'خطأ في الخادم' 
    });
  }
});

export default router;
