// backend/middleware/authGuards.js
// نظام حماية المسارات والتحكم بالصلاحيات (RBAC)

/**
 * التحقق من تسجيل الدخول
 * يجب أن يكون المستخدم مسجل دخول وله token صالح
 */
export function requireAuth(req, res, next) {
  if (!req.user || !req.user.UserID) {
    return res.status(401).json({ 
      ok: false,
      error: 'غير مصرّح - يجب تسجيل الدخول أولاً' 
    });
  }
  next();
}

/**
 * التحقق من صلاحية الوصول للمستشفى
 * - RoleID=1 (مدير التجمع): يستطيع الوصول لكل المستشفيات
 * - RoleID=2 (مدير المستشفى): يستطيع الوصول لمستشفاه فقط
 * - RoleID=3,4: يستطيع الوصول لمستشفاه فقط
 */
export function restrictToHospital(req, res, next) {
  const hospitalId = Number(
    req.params.hospitalId || 
    req.query.hospitalId || 
    req.headers['x-hospital-id'] ||
    req.body?.hospitalId
  );

  if (!hospitalId || hospitalId <= 0) {
    return res.status(400).json({ 
      ok: false,
      error: 'معرّف المستشفى مطلوب (hospitalId)' 
    });
  }

  const { RoleID, HospitalID } = req.user;

  // RoleID=1 (مدير التجمع) يستطيع الوصول لكل المستشفيات
  if (RoleID === 1) {
    req.hospitalId = hospitalId;
    return next();
  }

  // باقي المستخدمين: يجب أن يطابق مستشفاه
  if (HospitalID !== hospitalId) {
    return res.status(403).json({ 
      ok: false,
      error: 'ممنوع - ليس لديك صلاحية الوصول لهذا المستشفى' 
    });
  }

  req.hospitalId = hospitalId;
  next();
}

/**
 * السماح فقط لمدير التجمع (RoleID=1)
 */
export function requireClusterAdmin(req, res, next) {
  if (!req.user || req.user.RoleID !== 1) {
    return res.status(403).json({ 
      ok: false,
      error: 'ممنوع - هذه الصفحة لمدير التجمع فقط' 
    });
  }
  next();
}

/**
 * السماح لمدير التجمع أو مدير المستشفى فقط (RoleID=1 أو 2)
 */
export function requireHospitalAdmin(req, res, next) {
  if (!req.user || (req.user.RoleID !== 1 && req.user.RoleID !== 2)) {
    return res.status(403).json({ 
      ok: false,
      error: 'ممنوع - هذه الصفحة للمديرين فقط' 
    });
  }
  next();
}

/**
 * التحقق من صلاحية الوصول للقسم
 * - RoleID=1,2: يستطيع الوصول لكل الأقسام في المستشفى
 * - RoleID=3 (مشرف قسم): يستطيع الوصول لأقسامه فقط
 */
export function restrictToDepartment(req, res, next) {
  const departmentId = Number(
    req.params.departmentId || 
    req.query.departmentId || 
    req.headers['x-department-id'] ||
    req.body?.departmentId
  );

  if (!departmentId || departmentId <= 0) {
    return res.status(400).json({ 
      ok: false,
      error: 'معرّف القسم مطلوب (departmentId)' 
    });
  }

  const { RoleID, DepartmentID } = req.user;

  // RoleID=1,2 (مديرين): يستطيع الوصول لكل الأقسام
  if (RoleID === 1 || RoleID === 2) {
    req.departmentId = departmentId;
    return next();
  }

  // RoleID=3 (مشرف قسم): يجب أن يطابق قسمه
  if (RoleID === 3 && DepartmentID !== departmentId) {
    return res.status(403).json({ 
      ok: false,
      error: 'ممنوع - ليس لديك صلاحية الوصول لهذا القسم' 
    });
  }

  req.departmentId = departmentId;
  next();
}

/**
 * التحقق من صلاحية الوصول لشكوى معينة
 * - RoleID=1,2,3: يستطيع الوصول حسب المستشفى/القسم
 * - RoleID=4 (موظف): فقط الشكاوى الموكلة له
 */
export async function restrictToComplaint(req, res, next) {
  const complaintId = Number(
    req.params.complaintId || 
    req.params.id ||
    req.query.complaintId
  );

  if (!complaintId || complaintId <= 0) {
    return res.status(400).json({ 
      ok: false,
      error: 'معرّف الشكوى مطلوب (complaintId)' 
    });
  }

  const { RoleID, UserID, HospitalID, DepartmentID } = req.user;

  // RoleID=1,2,3: تحقق من المستشفى والقسم فقط (يتم في middleware أخرى)
  if (RoleID === 1 || RoleID === 2 || RoleID === 3) {
    req.complaintId = complaintId;
    return next();
  }

  // RoleID=4 (موظف): يجب أن تكون الشكوى موكلة له
  // هنا نحتاج للتحقق من قاعدة البيانات
  // يمكن تطبيق هذا لاحقاً حسب الحاجة
  req.complaintId = complaintId;
  next();
}

/**
 * Middleware مساعد: إضافة معلومات الصلاحيات للطلب
 */
export function attachPermissions(req, res, next) {
  if (!req.user) return next();

  req.permissions = {
    isClusterAdmin: req.user.RoleID === 1,
    isHospitalAdmin: req.user.RoleID === 2,
    isDepartmentHead: req.user.RoleID === 3,
    isEmployee: req.user.RoleID === 4,
    canAccessAllHospitals: req.user.RoleID === 1,
    canAccessHospital: (hospitalId) => {
      return req.user.RoleID === 1 || req.user.HospitalID === hospitalId;
    },
    canAccessDepartment: (departmentId) => {
      return req.user.RoleID === 1 || req.user.RoleID === 2 || req.user.DepartmentID === departmentId;
    }
  };

  next();
}

// تصدير كل الـ middleware
export default {
  requireAuth,
  restrictToHospital,
  requireClusterAdmin,
  requireHospitalAdmin,
  restrictToDepartment,
  restrictToComplaint,
  attachPermissions
};

