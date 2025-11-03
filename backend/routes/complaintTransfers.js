// routes/complaintTransfers.js
import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { resolveHospitalId } from '../middleware/resolveHospitalId.js';
import { attachHospitalPool } from '../middleware/hospitalPool.js';
import { transferComplaintDepartment } from '../controllers/complaintsController.js';

const router = express.Router();

router.post(
  '/complaints/:id/transfer/department',
  requireAuth,
  resolveHospitalId,
  attachHospitalPool,
  transferComplaintDepartment
);

export default router;
