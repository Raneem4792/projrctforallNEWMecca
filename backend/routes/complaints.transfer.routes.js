import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePerm } from '../middleware/perm.js';
import { 
  transferBetweenDepartments, 
  transferBetweenEmployees,
  transferComplaintToHospital,
  getTransferHistory 
} from '../controllers/complaints.transfer.controller.js';

const router = express.Router();

/**
 * تحويل البلاغ بين الأقسام
 * POST /api/complaints/:id/transfer/department
 */
router.post('/:id/transfer/department',
  requireAuth,
  requirePerm('COMPLAINT_TRANSFER_DEPT'),
  transferBetweenDepartments
);

/**
 * تحويل البلاغ بين الموظفين
 * POST /api/complaints/:id/transfer/employee
 */
router.post('/:id/transfer/employee',
  requireAuth,
  requirePerm('COMPLAINT_TRANSFER_USER'),
  transferBetweenEmployees
);

/**
 * تحويل البلاغ بين المستشفيات
 * POST /api/complaints/transfer-hospital
 */
router.post('/transfer-hospital',
  requireAuth,
  requirePerm('COMPLAINT_TRANSFER_DEPT'), // يمكن استخدام نفس الصلاحية أو إنشاء صلاحية جديدة
  transferComplaintToHospital
);

/**
 * الحصول على تاريخ تحويلات البلاغ
 * GET /api/complaints/:id/transfer/history
 */
router.get('/:id/transfer/history',
  requireAuth,
  requirePerm('COMPLAINT_VIEW'),
  getTransferHistory
);

export default router;
