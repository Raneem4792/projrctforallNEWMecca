// middleware/permissionGuard.js
import { getTenantPoolByHospitalId } from '../db/tenantManager.js';

export function requirePermission(permissionKey) {
  return async (req, res, next) => {
    try {
      // RoleID=1 مدير التجمع = bypass
      if (req.user?.RoleID === 1) return next();

      const userId = req.user?.UserID;
      const hospitalId = Number(req.query.hospitalId || req.headers['x-hospital-id'] || req.user?.HospitalID || 0);
      if (!userId || !hospitalId) return res.status(401).json({ ok:false, error: 'UNAUTHENTICATED_OR_NO_HOSPITAL' });

      const tenant = await getTenantPoolByHospitalId(hospitalId);
      const [rows] = await tenant.query(
        `SELECT 1
           FROM user_permissions
          WHERE UserID=? AND HospitalID=? AND PermissionKey=? LIMIT 1`,
        [userId, hospitalId, permissionKey]
      );
      if (!rows.length) {
        return res.status(403).json({ ok:false, error: 'FORBIDDEN_NO_PERMISSION', permissionKey });
      }
      next();
    } catch (e) {
      console.error('requirePermission error:', e);
      res.status(500).json({ ok:false, error: 'SERVER_ERROR' });
    }
  };
}
