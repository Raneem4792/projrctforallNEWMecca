// routes/complaintTargets.js
// Routes للتعامل مع البلاغات الموجهة للموظفين

import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  searchEmployees,
  createComplaintTarget,
  getAllComplaintTargets,
  deleteComplaintTarget
} from '../controllers/complaintTargetsController.js';

const router = express.Router();

// البحث عن موظفين
router.get('/complaint-targets/search-employees', requireAuth, searchEmployees);

// إنشاء بلاغ على موظف
router.post('/complaint-targets', requireAuth, createComplaintTarget);

// جلب جميع البلاغات على الموظفين
router.get('/complaint-targets', requireAuth, getAllComplaintTargets);

// حذف بلاغ على موظف
router.delete('/complaint-targets/:targetId', requireAuth, deleteComplaintTarget);

export default router;
