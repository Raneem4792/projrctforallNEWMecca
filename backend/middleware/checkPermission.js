// middleware/checkPermission.js
// دالة مساعدة للتحقق من صلاحيات المستخدم
import { getTenantPoolByHospitalId } from '../db/tenantManager.js';

/**
 * دالة للتحقق من وجود صلاحية معينة للمستخدم
 * @param {number} userId - معرف المستخدم
 * @param {number} hospitalId - معرف المستشفى
 * @param {string} permissionKey - مفتاح الصلاحية (مثل: 'HOSPITAL_TRASH')
 * @returns {Promise<boolean>} - true إذا كانت الصلاحية موجودة
 */
export async function hasPermissionFor(userId, hospitalId, permissionKey) {
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

/**
 * Middleware للتحقق من صلاحية معينة
 * يسمح تلقائياً لمدير التجمع (central admin)
 * @param {string} permissionKey - مفتاح الصلاحية المطلوبة
 * @returns {Function} Express middleware
 * 
 * @example
 * router.get('/admin/trash', requireAuth, requirePermission('HOSPITAL_TRASH'), async (req, res) => {
 *   // سيصل هنا فقط إذا كان المستخدم لديه صلاحية HOSPITAL_TRASH أو كان مدير تجمع
 * });
 */
export function requirePermission(permissionKey) {
  return async (req, res, next) => {
    try {
      // مدير التجمع (Central Admin) لديه جميع الصلاحيات
      const isCentral = req.user?.scope === 'central' || req.user?.HospitalID == null;
      
      if (isCentral) {
        console.log(`✅ مدير التجمع - صلاحية ${permissionKey} ممنوحة تلقائياً`);
        return next();
      }

      // التحقق من الصلاحية في قاعدة المستشفى
      const userId = req.user?.UserID;
      const hospitalId = req.user?.HospitalID;

      if (!userId || !hospitalId) {
        console.log(`❌ بيانات المستخدم غير مكتملة - userId: ${userId}, hospitalId: ${hospitalId}`);
        return res.status(401).json({
          ok: false,
          error: 'بيانات المستخدم غير مكتملة'
        });
      }

      const allowed = await hasPermissionFor(userId, hospitalId, permissionKey);

      if (!allowed) {
        console.log(`❌ ممنوع - المستخدم ${userId} ليس لديه صلاحية ${permissionKey}`);
        return res.status(403).json({
          ok: false,
          error: `ليس لديك صلاحية الوصول (${permissionKey})`
        });
      }

      console.log(`✅ مسموح - المستخدم ${userId} لديه صلاحية ${permissionKey}`);
      next();
    } catch (err) {
      console.error('requirePermission middleware error:', err);
      return res.status(500).json({
        ok: false,
        error: 'خطأ في التحقق من الصلاحيات'
      });
    }
  };
}

/**
 * دالة مساعدة للتحقق من عدة صلاحيات (OR logic)
 * يمر المستخدم إذا كان لديه أي واحدة من الصلاحيات
 * @param {string[]} permissionKeys - مصفوفة من مفاتيح الصلاحيات
 * @returns {Function} Express middleware
 * 
 * @example
 * router.get('/admin/view', requireAuth, requireAnyPermission(['HOSPITAL_LOGS', 'HOSPITAL_TRASH']), (req, res) => {
 *   // سيصل هنا إذا كان لديه صلاحية LOGS أو TRASH
 * });
 */
export function requireAnyPermission(permissionKeys) {
  return async (req, res, next) => {
    try {
      const isCentral = req.user?.scope === 'central' || req.user?.HospitalID == null;
      
      if (isCentral) {
        return next();
      }

      const userId = req.user?.UserID;
      const hospitalId = req.user?.HospitalID;

      if (!userId || !hospitalId) {
        return res.status(401).json({
          ok: false,
          error: 'بيانات المستخدم غير مكتملة'
        });
      }

      // تحقق من أي صلاحية
      for (const key of permissionKeys) {
        const allowed = await hasPermissionFor(userId, hospitalId, key);
        if (allowed) {
          console.log(`✅ مسموح - المستخدم ${userId} لديه صلاحية ${key}`);
          return next();
        }
      }

      console.log(`❌ ممنوع - المستخدم ${userId} ليس لديه أي من الصلاحيات: ${permissionKeys.join(', ')}`);
      return res.status(403).json({
        ok: false,
        error: 'ليس لديك الصلاحية المطلوبة'
      });
    } catch (err) {
      console.error('requireAnyPermission middleware error:', err);
      return res.status(500).json({
        ok: false,
        error: 'خطأ في التحقق من الصلاحيات'
      });
    }
  };
}

