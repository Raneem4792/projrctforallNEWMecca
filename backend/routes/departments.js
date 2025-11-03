// routes/departments.js
import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { resolveHospitalId } from '../middleware/resolveHospitalId.js';
import { attachHospitalPool } from '../middleware/hospitalPool.js';
import { listDepartments } from '../controllers/departmentsController.js';

const router = express.Router();

router.get(
  '/departments',
  requireAuth,
  resolveHospitalId,
  attachHospitalPool,
  listDepartments
);

export default router;
