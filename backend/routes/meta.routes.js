import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { 
  getDepartments,
  getUsers,
  getComplaintStatuses,
  getComplaintTypes
} from '../controllers/meta.controller.js';

const router = express.Router();

/**
 * الحصول على قائمة الأقسام
 * GET /api/meta/departments?hospitalId=H
 */
router.get('/departments',
  requireAuth,
  getDepartments
);

/**
 * الحصول على قائمة المستخدمين
 * GET /api/meta/users?hospitalId=H&departmentId=D
 */
router.get('/users',
  requireAuth,
  getUsers
);

/**
 * الحصول على قائمة حالات البلاغات
 * GET /api/meta/complaint-statuses?hospitalId=H
 */
router.get('/complaint-statuses',
  requireAuth,
  getComplaintStatuses
);

/**
 * الحصول على قائمة أنواع البلاغات
 * GET /api/meta/complaint-types?hospitalId=H
 */
router.get('/complaint-types',
  requireAuth,
  getComplaintTypes
);

export default router;
