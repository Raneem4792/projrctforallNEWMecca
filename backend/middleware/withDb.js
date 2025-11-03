// backend/middleware/withDb.js
import jwt from 'jsonwebtoken';
import { getCentralPool } from '../db/centralPool.js';
import { getTenantPoolByHospitalId } from '../db/tenantManager.js';
import config from '../config/multi-tenant.js';

async function withDb(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ 
      success: false,
      message: 'No token provided' 
    });

    const payload = jwt.verify(token, config.jwt.secret);
    req.user = payload;

    if (payload.scope === config.scopes.CENTRAL && payload.roleId === config.roles.CLUSTER_MANAGER) {
      req.db = await getCentralPool(); // مدير التجمّع
    } else if (payload.scope === config.scopes.TENANT && payload.hospitalId) {
      req.db = await getTenantPoolByHospitalId(Number(payload.hospitalId)); // مستشفى معيّن
    } else {
      return res.status(403).json({ 
        success: false,
        message: 'Invalid scope or role' 
      });
    }

    next();
  } catch (e) {
    console.error('withDb error', e);
    return res.status(401).json({ 
      success: false,
      message: 'Invalid/Expired token' 
    });
  }
}

export { withDb };
