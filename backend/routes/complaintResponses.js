// routes/complaintResponses.js
import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  listReplyTypes,
  listComplaintResponses,
  createComplaintResponse,
  getComplaintByTicket
} from '../controllers/complaintResponsesController.js';
import { requireAuth } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// إعداد الرفع (مرفقات الرد)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '..', 'uploads', 'responses');
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const ext = file.originalname.split('.').pop();
    cb(null, `resp_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`);
  }
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 10 // maximum 10 files
  },
  fileFilter: (req, file, cb) => {
    // Allow common file types
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt|mp4|mp3/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('نوع الملف غير مدعوم'));
    }
  }
});

// المسارات
router.get('/reply-types', requireAuth, listReplyTypes);
router.get('/complaints/track', getComplaintByTicket);
router.get('/complaints/:id/responses', requireAuth, listComplaintResponses);
router.post('/complaints/:id/responses', requireAuth, upload.array('files', 10), createComplaintResponse);

export default router;
