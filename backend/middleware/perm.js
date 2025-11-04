import { getTenantPoolByHospitalId } from '../db/tenantManager.js';

/**
 * Middleware للتحقق من الصلاحيات
 * @param {string} permissionKey - مفتاح الصلاحية المطلوبة
 * @returns {Function} Express middleware function
 */
export function requirePerm(permissionKey) {
  return async (req, res, next) => {
    try {
      const { UserID, HospitalID, RoleID, scope } = req.user || {};
      
      // ✅ السماح لمدير التجمع (Cluster Manager) تلقائياً
      const isClusterManager = RoleID === 1 || scope === 'central' || HospitalID == null;
      
      if (isClusterManager) {
        console.log(`✅ مدير التجمع - صلاحية ${permissionKey} ممنوحة تلقائياً`);
        return next();
      }
      
      if (!UserID || !HospitalID) {
        return res.status(401).json({ 
          ok: false, 
          error: 'معلومات المستخدم غير مكتملة' 
        });
      }

      const tenant = await getTenantPoolByHospitalId(HospitalID);
      
      // التحقق من وجود الصلاحية
      const [rows] = await tenant.query(`
        SELECT 1 FROM user_permissions
        WHERE UserID = ? AND HospitalID = ? AND PermissionKey = ?
        LIMIT 1
      `, [UserID, HospitalID, permissionKey]);

      if (!rows.length) {
        return res.status(403).json({ 
          ok: false, 
          error: `لا تملك صلاحية: ${permissionKey}` 
        });
      }

      next();
    } catch (error) {
      console.error('خطأ في التحقق من الصلاحية:', error);
      res.status(500).json({ 
        ok: false, 
        error: 'خطأ في التحقق من الصلاحية' 
      });
    }
  };
}

/**
 * Middleware للتحقق من عدة صلاحيات (OR logic)
 * @param {string[]} permissionKeys - مصفوفة مفاتيح الصلاحيات
 * @returns {Function} Express middleware function
 */
export function requireAnyPerm(permissionKeys) {
  return async (req, res, next) => {
    try {
      const { UserID, HospitalID } = req.user;
      
      if (!UserID || !HospitalID) {
        return res.status(401).json({ 
          ok: false, 
          error: 'معلومات المستخدم غير مكتملة' 
        });
      }

      const tenant = await getTenantPoolByHospitalId(HospitalID);
      
      // التحقق من وجود أي صلاحية من المطلوبة
      const placeholders = permissionKeys.map(() => '?').join(',');
      const [rows] = await tenant.query(`
        SELECT 1 FROM user_permissions
        WHERE UserID = ? AND HospitalID = ? AND PermissionKey IN (${placeholders})
        LIMIT 1
      `, [UserID, HospitalID, ...permissionKeys]);

      if (!rows.length) {
        return res.status(403).json({ 
          ok: false, 
          error: `لا تملك أي من الصلاحيات المطلوبة` 
        });
      }

      next();
    } catch (error) {
      console.error('خطأ في التحقق من الصلاحيات:', error);
      res.status(500).json({ 
        ok: false, 
        error: 'خطأ في التحقق من الصلاحيات' 
      });
    }
  };
}

/**
 * Middleware للتحقق من نطاق العرض
 * @param {string} permissionKey - مفتاح الصلاحية
 * @returns {Function} Express middleware function
 */
export function requireViewScope(permissionKey) {
  return async (req, res, next) => {
    try {
      const { UserID, HospitalID } = req.user;
      
      const tenant = await getTenantPoolByHospitalId(HospitalID);
      
      // الحصول على نطاق العرض المسموح
      const [rows] = await tenant.query(`
        SELECT ViewScope FROM user_permissions
        WHERE UserID = ? AND HospitalID = ? AND PermissionKey = ?
        LIMIT 1
      `, [UserID, HospitalID, permissionKey]);

      if (!rows.length) {
        return res.status(403).json({ 
          ok: false, 
          error: `لا تملك صلاحية: ${permissionKey}` 
        });
      }

      // إضافة نطاق العرض إلى req للمستخدم في controllers
      req.user.viewScope = rows[0].ViewScope;
      next();
    } catch (error) {
      console.error('خطأ في التحقق من نطاق العرض:', error);
      res.status(500).json({ 
        ok: false, 
        error: 'خطأ في التحقق من نطاق العرض' 
      });
    }
  };
}
