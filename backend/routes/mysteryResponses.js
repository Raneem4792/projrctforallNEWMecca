// routes/mysteryResponses.js
import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissionGuard.js';
import { resolveHospitalId } from '../middleware/resolveHospitalId.js';
import { attachHospitalPool } from '../middleware/hospitalPool.js';
import {
  listMysteryResponses,
  createMysteryResponse,
  updateMysteryStatus,
  softDeleteMystery,
  transferMysteryDepartment,
  transferMysteryEmployee
} from '../controllers/mysteryResponsesController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const router = express.Router();

// تخزين مرفقات ردود الزائر السري
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'uploads', 'mystery-responses')),
  filename: (req, file, cb) => {
    const ext = file.originalname.split('.').pop();
    cb(null, `mresp_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10*1024*1024, files: 10 },
});

// ⭐ نفس شغل البلاغات: نستخدم reply_types الموجودة مسبقاً عبر /api/reply-types

// ردود التقييم (قراءة/إضافة)
router.get('/mystery-complaints/:id/responses', 
  requireAuth, 
  requirePermission('MYSTERY_VIEW'),
  resolveHospitalId, 
  attachHospitalPool, 
  listMysteryResponses);

router.post('/mystery-complaints/:id/responses', 
  requireAuth, 
  requirePermission('MYSTERY_REPLY_ADD'),
  resolveHospitalId, 
  attachHospitalPool, 
  upload.array('files', 10), 
  createMysteryResponse);

// تغيير الحالة + حذف ناعم
router.put('/mystery-complaints/:id/status', 
  requireAuth, 
  requirePermission('MYSTERY_STATUS_UPDATE'),
  resolveHospitalId, 
  attachHospitalPool, 
  updateMysteryStatus);

router.delete('/mystery-complaints/:id', 
  requireAuth, 
  requirePermission('MYSTERY_DELETE'),
  resolveHospitalId, 
  attachHospitalPool, 
  softDeleteMystery);

// تحويل بين الأقسام والموظفين
router.post('/mystery-complaints/:id/transfer/department', 
  requireAuth, 
  requirePermission('MYSTERY_TRANSFER_DEPT'),
  resolveHospitalId, 
  attachHospitalPool, 
  transferMysteryDepartment);

router.post('/mystery-complaints/:id/transfer/employee', 
  requireAuth, 
  requirePermission('MYSTERY_TRANSFER_EMP'),
  resolveHospitalId, 
  attachHospitalPool, 
  transferMysteryEmployee);

export default router;
