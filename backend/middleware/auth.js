// middleware/auth.js - نظام المصادقة الذكي متعدد المستشفيات
import jwt from 'jsonwebtoken';
import { getTenantPoolByHospitalId } from '../db/tenantManager.js';

export async function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  
  console.log('🔐 [AUTH] التحقق من التوكن:', {
    hasHeader: !!auth,
    hasToken: !!token,
    tokenPreview: token ? token.substring(0, 50) + '...' : 'none'
  });
  
  if (!token) {
    console.log('❌ [AUTH] لا يوجد توكن');
    return res.status(401).json({ 
      success: false, 
      message: 'مطلوب تسجيل الدخول' 
    });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    
    // ✅ تطبيع الأسماء - توحيد الحقول داخل التوكن
    const UserID = payload.UserID ?? payload.uid ?? payload.userId ?? null;
    const RoleID = payload.RoleID ?? payload.role ?? payload.roleId ?? null;
    const HospitalID = payload.HospitalID ?? payload.hosp ?? payload.hospitalId ?? payload.hospitalID ?? null;
    const DepartmentID = payload.DepartmentID ?? payload.dept ?? payload.departmentId ?? null;
    
    // تنسيق بيانات المستخدم للتوافق مع النظام الجديد
    req.user = {
      ...payload,
      UserID,
      RoleID,
      HospitalID,
      DepartmentID,
      // للتوافق مع الكود القديم
      id: UserID,
      roleId: RoleID,
      hospitalId: HospitalID,
      username: payload.username,
      departmentId: DepartmentID
    };
    
    console.log('✅ [AUTH] التوكن صالح:', {
      UserID: req.user.UserID,
      RoleID: req.user.RoleID,
      HospitalID: req.user.HospitalID,
      DepartmentID: req.user.DepartmentID,
      username: req.user.username
    });
    
    // إذا لم يكن DepartmentID موجوداً في التوكن، اقرأه من قاعدة البيانات
    if (!req.user.DepartmentID && req.user.HospitalID && req.user.UserID) {
      try {
        const tenant = await getTenantPoolByHospitalId(req.user.HospitalID);
        const [[row]] = await tenant.query(
          'SELECT DepartmentID FROM users WHERE UserID=? AND IsActive=1',
          [req.user.UserID]
        );
        if (row) {
          req.user.DepartmentID = row.DepartmentID;
          req.user.departmentId = row.DepartmentID;
          console.log('🔄 [AUTH] تم تحديث DepartmentID من قاعدة البيانات:', row.DepartmentID);
        }
      } catch (err) {
        console.error('⚠️ [AUTH] خطأ في قراءة DepartmentID:', err.message);
        // نستمر بدون DepartmentID
      }
    }
    
    next();
  } catch (err) {
    console.log('❌ [AUTH] التوكن غير صالح:', err.message);
    return res.status(401).json({ 
      success: false, 
      message: 'انتهت الجلسة، سجّل دخولك' 
    });
  }
}

// ميدلوير اختياري للتحقق من الصلاحيات (للمسارات العامة)
export function optionalAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (t) {
    try {
      const p = jwt.verify(t, process.env.JWT_SECRET);
      
      // ✅ تطبيع الأسماء - توحيد الحقول داخل التوكن
      const UserID = p.UserID ?? p.uid ?? p.userId ?? null;
      const RoleID = p.RoleID ?? p.role ?? p.roleId ?? null;
      const HospitalID = p.HospitalID ?? p.hosp ?? p.hospitalId ?? p.hospitalID ?? null;
      const DepartmentID = p.DepartmentID ?? p.dept ?? p.departmentId ?? null;
      
      req.user = { 
        ...p,
        UserID,
        RoleID,
        HospitalID,
        DepartmentID,
        // للتوافق مع الكود القديم
        id: UserID,
        roleId: RoleID,
        hospitalId: HospitalID,
        username: p.username,
        departmentId: DepartmentID
      };
    } catch { /* تجاهل */ }
  }
  next();
}

// مساعد لنطاق المستشفى (للاستعلامات في القاعدة المركزية)
export function hospitalScopeSQL(user, alias='c', req=null) {
  const A = alias;            // alias لجدول complaints
  const params = [];
  let where = '';

  // مدير التجمع يشوف الكل إلا إذا حدد hospitalId بالبارام
  const roleId = Number(user?.RoleID ?? user?.roleId ?? 0);
  const cluster = [1, 4].includes(roleId); // SUPER_ADMIN, CLUSTER_MANAGER

  const qHosp = Number(req?.query?.hospitalId || 0);

  if (!user) {
    // للزوار: إذا كان هناك ?hospitalId= استخدمه، وإلا لا تقيد
    if (req && req.query.hospitalId) {
      const hid = parseInt(req.query.hospitalId, 10);
      if (Number.isFinite(hid)) {
        where = ` AND ${A}.HospitalID = ?`;
        params.push(hid);
      }
    }
  } else if (cluster && qHosp) {
    // مدير التجمع يحدد مستشفى معين
    where = ` AND ${A}.HospitalID = ?`;
    params.push(qHosp);
  } else if (!cluster) {
    // موظف مستشفى: إجباري على مستشفاه فقط
    const hid = Number(user?.HospitalID ?? user?.hospitalId ?? 0);
    if (hid) {
      where = ` AND ${A}.HospitalID = ?`;
      params.push(hid);
    }
  }
  // else: مدير تجمع بدون hospitalId ⇒ الكل (where = '')

  // لا تعرض المحذوفات
  where += ` AND (${A}.IsDeleted IS NULL OR ${A}.IsDeleted = 0)`;

  return { where, params };
}

// ميدلوير اختياري للتحقق من الصلاحيات
export function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        message: 'مطلوب تسجيل الدخول' 
      });
    }

    if (!roles.includes(req.user.roleId)) {
      return res.status(403).json({ 
        success: false, 
        message: 'ليس لديك صلاحية للوصول لهذا المورد' 
      });
    }

    next();
  };
}

// ميدلوير للتحقق من صلاحية Admin فقط
export function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ 
      success: false, 
      message: 'مطلوب تسجيل الدخول' 
    });
  }

  const ADMIN_ROLES = [1]; // SUPER_ADMIN, CLUSTER_MANAGER (نفس الرول)
  if (!ADMIN_ROLES.includes(req.user.roleId)) {
    return res.status(403).json({ 
      success: false, 
      message: 'هذا الإجراء متاح للمديرين فقط' 
    });
  }

  next();
}

/**
 * Middleware للتحقق من أن البلاغ غير محذوف
 * يُستخدم قبل إرجاع تفاصيل البلاغ أو الردود
 */
import { getContextualPool } from '../config/db.js';

export async function ensureNotDeleted(req, res, next) {
  const id = Number(req.params.id || req.params.complaintId);
  
  if (!id || isNaN(id)) {
    return res.status(400).json({ 
      success: false, 
      message: 'معرّف البلاغ غير صحيح' 
    });
  }

  try {
    // استخدام الاتصال المناسب حسب المستخدم
    const pool = await getContextualPool(req.user, req);
    
    const [rows] = await pool.query(
      `SELECT ComplaintID, IsDeleted FROM complaints WHERE ComplaintID = ?`,
      [id]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'البلاغ غير موجود' 
      });
    }

    const complaint = rows[0];

    if (complaint.IsDeleted === 1) {
      return res.status(404).json({ 
        success: false, 
        message: 'تم حذف هذا البلاغ. يمكنك استرجاعه من سلة المحذوفات.',
        isDeleted: true
      });
    }

    // البلاغ موجود وغير محذوف
    req.complaint = complaint;
    next();

  } catch (error) {
    console.error('خطأ في التحقق من حالة البلاغ:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'حدث خطأ في التحقق من البلاغ' 
    });
  }
}

// تصدير افتراضي
export default { 
  requireAuth, 
  requireRole, 
  requireAdmin,
  optionalAuth,
  hospitalScopeSQL,
  ensureNotDeleted
};