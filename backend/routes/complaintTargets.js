// routes/complaintTargets.js
// Routes للتعامل مع البلاغات الموجهة للموظفين

import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { resolveHospitalId } from '../middleware/resolveHospitalId.js';
import { attachHospitalPool } from '../middleware/hospitalPool.js';
import {
  searchEmployees,
  createComplaintTarget,
  getAllComplaintTargets,
  deleteComplaintTarget
} from '../controllers/complaintTargetsController.js';

const router = express.Router();

// البحث عن موظفين
router.get(
  '/complaint-targets/search-employees',
  requireAuth,
  resolveHospitalId,
  attachHospitalPool,
  searchEmployees
);

// إنشاء بلاغ على موظف
router.post(
  '/complaint-targets',
  requireAuth,
  resolveHospitalId,
  attachHospitalPool,
  createComplaintTarget
);

// جلب جميع البلاغات على الموظفين
router.get(
  '/complaint-targets',
  requireAuth,
  resolveHospitalId,
  attachHospitalPool,
  getAllComplaintTargets
);

// حذف بلاغ على موظف
router.delete(
  '/complaint-targets/:targetId',
  requireAuth,
  resolveHospitalId,
  attachHospitalPool,
  deleteComplaintTarget
);

export default router;
