// backend/middleware/uploads.js
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// إعداد التخزين لبلاغات إدارة التجمع
const clusterStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      // الحصول على hospitalId من query string أو body
      const hospitalId = Number(req.query.hospitalId || req.body.hospitalId || 0);
      
      if (!hospitalId || hospitalId === 0) {
        return cb(new Error('valid hospitalId is required in query string'));
      }
      
      // إنشاء مجلد لحفظ الملفات حسب المستشفى
      const dir = path.join(process.cwd(), 'uploads', 'cluster-reports', String(hospitalId));
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    } catch (e) {
      cb(e);
    }
  },
  filename: (req, file, cb) => {
    // إنشاء اسم فريد للملف
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    // تنظيف اسم الملف من الأحرف الخاصة
    const safe = file.originalname.replace(/[^\w.\-()+\s\u0600-\u06FF]/g, '_');
    cb(null, unique + '-' + safe);
  }
});

// Middleware لرفع ملفات بلاغات إدارة التجمع
export const uploadCluster = multer({
  storage: clusterStorage,
  limits: { 
    fileSize: 25 * 1024 * 1024 // 25MB لكل ملف
  },
  fileFilter: (req, file, cb) => {
    // قبول أنواع الملفات: صور، PDF، Word
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/;
    const mimetype = allowedTypes.test(file.mimetype);
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('نوع الملف غير مدعوم. يُسمح بالصور و PDF و Word فقط'));
    }
  }
});

