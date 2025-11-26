import { getTenantPoolByHospitalId } from '../db/tenantManager.js';

/**
 * الحصول على قائمة الأقسام
 * GET /api/meta/departments?hospitalId=H
 */
export async function getDepartments(req, res) {
  try {
    const { hospitalId } = req.query;
    const { HospitalID } = req.user;

    // التحقق من أن المستخدم يطلب بيانات من مستشفاه فقط
    if (Number(hospitalId) !== Number(HospitalID)) {
      return res.status(403).json({
        ok: false,
        error: 'غير مسموح بالوصول لهذا المستشفى'
      });
    }

    const tenant = await getTenantPoolByHospitalId(HospitalID);

    const [departments] = await tenant.query(`
      SELECT 
        DepartmentID,
        NameAr,
        NameEn,
        Description,
        IsActive
      FROM departments 
      WHERE HospitalID = ? AND IsActive = 1
      ORDER BY NameAr ASC
    `, [HospitalID]);

    res.json({
      ok: true,
      data: departments
    });

  } catch (error) {
    console.error('خطأ في الحصول على الأقسام:', error);
    res.status(500).json({
      ok: false,
      error: 'خطأ في الحصول على الأقسام'
    });
  }
}

/**
 * الحصول على قائمة المستخدمين
 * GET /api/meta/users?hospitalId=H&departmentId=D
 */
export async function getUsers(req, res) {
  try {
    const { hospitalId, departmentId } = req.query;
    const { HospitalID } = req.user;

    // التحقق من أن المستخدم يطلب بيانات من مستشفاه فقط
    if (Number(hospitalId) !== Number(HospitalID)) {
      return res.status(403).json({
        ok: false,
        error: 'غير مسموح بالوصول لهذا المستشفى'
      });
    }

    const tenant = await getTenantPoolByHospitalId(HospitalID);

    let query = `
      SELECT 
        u.UserID,
        u.Username,
        u.FullName,
        u.Email,
        u.DepartmentID,
        u.IsActive,
        d.NameAr as DepartmentName
      FROM users u
      LEFT JOIN departments d ON u.DepartmentID = d.DepartmentID
      WHERE u.HospitalID = ? AND u.IsActive = 1
    `;
    
    const params = [HospitalID];

    // فلترة بالقسم إذا تم تحديده
    if (departmentId) {
      query += ` AND u.DepartmentID = ?`;
      params.push(departmentId);
    }

    query += ` ORDER BY u.FullName ASC, u.Username ASC`;

    const [users] = await tenant.query(query, params);

    res.json({
      ok: true,
      data: users
    });

  } catch (error) {
    console.error('خطأ في الحصول على المستخدمين:', error);
    res.status(500).json({
      ok: false,
      error: 'خطأ في الحصول على المستخدمين'
    });
  }
}

/**
 * الحصول على قائمة حالات البلاغات
 * GET /api/meta/complaint-statuses?hospitalId=H
 */
export async function getComplaintStatuses(req, res) {
  try {
    const { hospitalId } = req.query;
    const { HospitalID } = req.user;

    // التحقق من أن المستخدم يطلب بيانات من مستشفاه فقط
    if (Number(hospitalId) !== Number(HospitalID)) {
      return res.status(403).json({
        ok: false,
        error: 'غير مسموح بالوصول لهذا المستشفى'
      });
    }

    const tenant = await getTenantPoolByHospitalId(HospitalID);

    const [statuses] = await tenant.query(`
      SELECT 
        StatusID,
        NameAr,
        NameEn,
        Description,
        Color,
        IsActive
      FROM complaint_statuses 
      WHERE HospitalID = ? AND IsActive = 1
      ORDER BY SortOrder ASC, NameAr ASC
    `, [HospitalID]);

    res.json({
      ok: true,
      data: statuses
    });

  } catch (error) {
    console.error('خطأ في الحصول على حالات البلاغات:', error);
    res.status(500).json({
      ok: false,
      error: 'خطأ في الحصول على حالات البلاغات'
    });
  }
}

/**
 * الحصول على قائمة أنواع البلاغات
 * GET /api/meta/complaint-types?hospitalId=H
 */
export async function getComplaintTypes(req, res) {
  try {
    const { hospitalId } = req.query;
    const { HospitalID, RoleID } = req.user;

    // التحقق من صلاحيات مدير التجمع (RoleID === 1 أو 4)
    const isClusterManager = RoleID === 1 || RoleID === 4;
    
    // تحديد المستشفى الهدف
    let targetHospitalId = null;
    if (hospitalId) {
      targetHospitalId = Number(hospitalId);
    } else {
      targetHospitalId = Number(HospitalID);
    }

    // التحقق من الصلاحيات: الموظف العادي فقط يمكنه رؤية مستشفاه
    if (!isClusterManager && Number(targetHospitalId) !== Number(HospitalID)) {
      return res.status(403).json({
        ok: false,
        error: 'غير مسموح بالوصول لهذا المستشفى'
      });
    }

    // إذا كان مدير تجمع ولم يحدد مستشفى، نستخدم مستشفاه (أو يمكن إرجاع جميع التصنيفات)
    if (isClusterManager && !hospitalId && HospitalID) {
      targetHospitalId = Number(HospitalID);
    }
    
    // التأكد من وجود targetHospitalId
    if (!targetHospitalId || isNaN(targetHospitalId)) {
      return res.status(400).json({
        ok: false,
        error: 'يجب تحديد معرف المستشفى'
      });
    }

    const tenant = await getTenantPoolByHospitalId(targetHospitalId);

    // استخدام ComplaintTypeID بدلاً من TypeID للحفاظ على التوافق
    const [types] = await tenant.query(`
      SELECT 
        ComplaintTypeID AS id,
        ComplaintTypeID AS TypeID,
        ComplaintTypeID AS ComplaintTypeID,
        TypeName AS nameAr,
        TypeName AS NameAr,
        TypeNameEn AS nameEn,
        TypeNameEn AS NameEn,
        TypeCode,
        1 AS IsActive
      FROM complaint_types 
      ORDER BY TypeName ASC
    `);

    res.json(types);

  } catch (error) {
    console.error('خطأ في الحصول على أنواع البلاغات:', error);
    res.status(500).json({
      ok: false,
      error: 'خطأ في الحصول على أنواع البلاغات',
      message: error.message
    });
  }
}
