// middleware/permissions.js - حارس الصلاحيات
import { getTenantPoolByHospitalId } from '../db/tenantManager.js';

// middleware للتحقق من صلاحية معينة
export function requirePermission(permissionKey) {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ 
          success: false, 
          message: 'مطلوب تسجيل الدخول' 
        });
      }

      const { UserID, HospitalID } = req.user;
      const tenant = await getTenantPoolByHospitalId(HospitalID);
      
      const [rows] = await tenant.query(`
        SELECT 1 FROM user_permissions
        WHERE UserID=? AND HospitalID=? AND PermissionKey=?
        LIMIT 1
      `, [UserID, HospitalID, permissionKey]);
      
      if (!rows.length) {
        return res.status(403).json({ 
          success: false,
          error: 'Permission denied',
          message: `ليس لديك صلاحية: ${permissionKey}` 
        });
      }
      
      next();
    } catch (error) {
      console.error('خطأ في التحقق من الصلاحية:', error);
      return res.status(500).json({ 
        success: false,
        message: 'خطأ في التحقق من الصلاحية' 
      });
    }
  };
}

// middleware للتحقق من نطاق عرض البلاغات
export function requireViewScope(req, res, next) {
  // هذا middleware سيتم تطبيقه على API البلاغات
  // سيقوم بتطبيق الفلترة حسب نطاق المستخدم
  next();
}

// دالة مساعدة للحصول على نطاق المستخدم
export async function getUserViewScope(userId, hospitalId) {
  try {
    const tenant = await getTenantPoolByHospitalId(hospitalId);
    const [rows] = await tenant.query(`
      SELECT ViewScope FROM user_permissions
      WHERE UserID=? AND HospitalID=? AND PermissionKey='COMPLAINT_HISTORY_SCOPE'
      LIMIT 1
    `, [userId, hospitalId]);
    
    return rows.length > 0 ? rows[0].ViewScope : null;
  } catch (error) {
    console.error('خطأ في الحصول على نطاق المستخدم:', error);
    return null;
  }
}

// دالة مساعدة لبناء SQL حسب النطاق
export function buildScopeSQL(user, hospitalId, departmentId, alias = 'c') {
  const scope = user.historyScope;
  const A = alias;
  let where = '';
  const params = [];

  switch (scope) {
    case 'HOSPITAL':
      where = ` AND ${A}.HospitalID = ?`;
      params.push(hospitalId);
      break;
    case 'DEPARTMENT':
      where = ` AND ${A}.HospitalID = ? AND ${A}.DepartmentID = ?`;
      params.push(hospitalId, departmentId);
      break;
    case 'ASSIGNED':
      where = ` AND ${A}.HospitalID = ? AND (${A}.AssignedToUserID = ? OR EXISTS(
        SELECT 1 FROM complaint_assignee_history h 
        WHERE h.ComplaintID = ${A}.ComplaintID AND h.ToUserID = ?
      ))`;
      params.push(hospitalId, user.UserID, user.UserID);
      break;
    default:
      // بدون نطاق - لا توجد صلاحية عرض
      where = ` AND 1=0`; // منع عرض أي شيء
  }

  return { where, params };
}
