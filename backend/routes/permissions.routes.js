// routes/permissions.routes.js
import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { allowRoles } from '../middleware/roleGuard.js';
import {
  listUsersForHospital,
  getUserPermissions,
  saveUserPermissions,
  getMyPermissions
} from '../controllers/permissions.controller.js';

const router = express.Router();

// قائمة المستخدمين حسب المستشفى
router.get('/users', 
  requireAuth,
  allowRoles(1,2,3), 
  listUsersForHospital
);

// صلاحيات مستخدم واحد
router.get('/users/:userId', 
  requireAuth,
  allowRoles(1,2,3), 
  getUserPermissions
);

// حفظ صلاحيات مستخدم واحد
router.put('/users/:userId', 
  requireAuth,
  allowRoles(1,2), 
  saveUserPermissions
);

// صلاحيات المستخدم الحالي (للموظفين العاديين)
router.get('/me', 
  requireAuth,
  allowRoles(1,2,3), 
  getMyPermissions
);

export default router;
