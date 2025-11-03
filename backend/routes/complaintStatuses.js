// routes/complaintStatuses.js
import express from 'express';
import {
  listComplaintStatuses,
  updateComplaintStatus
} from '../controllers/complaintStatusesController.js';
import { requireAuth } from '../middleware/auth.js';
import { resolveHospitalId } from '../middleware/resolveHospitalId.js';
import { attachHospitalPool } from '../middleware/hospitalPool.js';

const router = express.Router();

// ✅ الحالات من قاعدة المستشفى
router.get(
  '/complaint-statuses',
  requireAuth,              // لازم نعرف هو مين
  resolveHospitalId,        // يحط req.hospitalId
  attachHospitalPool,       // يحط req.hospitalPool
  listComplaintStatuses
);

// ✅ تغيير الحالة في قاعدة المستشفى
router.put(
  '/complaints/:id/status',
  requireAuth,
  resolveHospitalId,
  attachHospitalPool,
  updateComplaintStatus
);

export default router;
