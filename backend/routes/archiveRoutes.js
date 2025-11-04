// routes/archiveRoutes.js
// ركن الأرشيف - رفع وحفظ الملفات
import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { getTenantPoolByHospitalId } from '../db/tenantManager.js';
import { getCentralPool } from '../db/centralPool.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/checkPermission.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// 🔍 Route اختباري للتأكد من أن الراوتر يعمل (بدون مصادقة)
router.get('/test', (req, res) => {
  res.json({ 
    ok: true, 
    message: 'Archive routes are working!',
    timestamp: new Date().toISOString()
  });
});

// 🔧 مؤقتًا: تعطيل فحص الصلاحيات
const allowAll = (_req, _res, next) => next();

// إعداد التخزين الديناميكي حسب المستشفى
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const raw = (req.body?.hospitalId ?? req.user?.hospitalId ?? '').toString().trim();
      const hospId = parseInt(raw, 10);
      if (!hospId || Number.isNaN(hospId)) {
        return cb(new Error('valid hospitalId is required'));
      }
      const dir = path.join(process.cwd(), 'uploads', 'archive', String(hospId));
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    } catch (e) {
      cb(e);
    }
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const safe = file.originalname.replace(/[^\w.\-()+\s\u0600-\u06FF]/g, '_');
    cb(null, unique + '-' + safe);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// Middleware للتحقق من أن hospitalId ليس "all"
const validateHospForUpload = (req, res, next) => {
  const raw = (req.body?.hospitalId ?? req.user?.hospitalId ?? '').toString().trim().toLowerCase();
  if (!raw || raw === 'all') {
    return res.status(400).json({ error: 'يرجى اختيار مستشفى محدد للرفع' });
  }
  next();
};

// 🟢 رفع ملف واحد
// ⚠️ الترتيب مهم: أولاً multer ثم التحقق (لأن multer يملأ req.body)
router.post('/upload', 
  optionalAuth, // التحقق من المصادقة إذا كان موجوداً (لا يرفض الطلب إذا لم يكن)
  upload.single('file'),    // هنا يُعبّي req.body
  validateHospForUpload,    // الآن نقدر نقرأ hospitalId 
  async (req, res) => {
    try {
      const isCM = !!req.user?.isClusterManager || req.user?.RoleID === 1;
      const hospitalId = isCM
        ? parseInt(req.body.hospitalId, 10)
        : parseInt(req.user?.hospitalId || '0', 10);
      
      if (!req.file) {
        return res.status(400).json({ error: 'file required', message: 'لم يتم رفع أي ملف' });
      }

      // قاعدة المستشفى (وليس المركزية)
      console.log(`[archive/upload] محاولة الاتصال بقاعدة المستشفى ${hospitalId}...`);
      let db;
      try {
        db = await getTenantPoolByHospitalId(hospitalId);
        console.log(`[archive/upload] ✅ تم الاتصال بقاعدة المستشفى ${hospitalId}`);
      } catch (dbError) {
        console.error(`[archive/upload] ❌ فشل الاتصال بقاعدة المستشفى ${hospitalId}:`, dbError.message);
        throw new Error(`فشل الاتصال بقاعدة بيانات المستشفى ${hospitalId}: ${dbError.message}`);
      }

      // حساب hash للملف
      console.log(`[archive/upload] حساب hash للملف...`);
      const filePath = req.file.path;
      let fileBuffer;
      let sha;
      try {
        fileBuffer = fs.readFileSync(filePath);
        sha = crypto.createHash('sha256').update(fileBuffer).digest('hex');
        console.log(`[archive/upload] ✅ تم حساب hash: ${sha.substring(0, 16)}...`);
      } catch (hashError) {
        console.error(`[archive/upload] ❌ خطأ في قراءة الملف أو حساب hash:`, hashError.message);
        throw new Error(`فشل قراءة الملف: ${hashError.message}`);
      }

      // المسار النسبي
      const relPath = path.relative(process.cwd(), filePath).split(path.sep).join('/');

      // استقبال الحقول الجديدة
      const customFileName = req.body.fileName || req.body.customFileName || null;
      const sourceName = req.body.sourceName || null;
      const sourceModule = req.body.sourceModule || req.body.source || 'غير محدد';
      
      // INSERT في جدول المستشفى
      console.log(`[archive/upload] إدراج بيانات الملف في قاعدة البيانات...`);
      let result;
      try {
        [result] = await db.execute(
          `INSERT INTO file_archive
           (HospitalID, Category, SourceModule, CustomFileName, SourceName, OriginalName, StoredName, MimeType, FileSizeBytes, StoragePath, Notes, UploadedByUserID, Sha256Hash)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            hospitalId,
            req.body.category || 'archive',
            sourceModule || 'غير محدد',
            customFileName,
            sourceName,
            req.file.originalname,
            req.file.filename,
            req.file.mimetype || null,
            req.file.size || 0,
            relPath,
            req.body.notes || null,
            req.user?.UserID || req.user?.userId || 0,
            sha
          ]
        );
        console.log(`✅ [archive/upload] تم رفع ملف: ${req.file.originalname} (ID: ${result.insertId}) للمستشفى ${hospitalId}`);
      } catch (insertError) {
        console.error(`[archive/upload] ❌ خطأ في إدراج بيانات الملف:`, insertError.message);
        console.error(`[archive/upload] SQL Error Code:`, insertError.code);
        throw new Error(`فشل حفظ بيانات الملف في قاعدة البيانات: ${insertError.message}`);
      }

      res.json({
        ok: true,
        fileId: result.insertId,
        name: req.file.originalname,
        size: req.file.size,
        mime: req.file.mimetype,
        hospitalId: hospitalId
      });
    } catch (err) {
      console.error('[archive/upload] error:', err);
      console.error('[archive/upload] error stack:', err.stack);
      
      // حذف الملف المرفوع في حالة الخطأ
      if (req.file && req.file.path) {
        try {
          fs.unlinkSync(req.file.path);
          console.log('[archive/upload] تم حذف الملف بعد الخطأ');
        } catch (unlinkErr) {
          console.error('[archive/upload] خطأ في حذف الملف:', unlinkErr);
        }
      }

      // رسائل خطأ أوضح للمستخدم
      let errorMessage = 'حدث خطأ أثناء رفع الملف';
      let statusCode = 500;
      
      if (err.message.includes('ER_ACCESS_DENIED') || err.message.includes('Access denied')) {
        errorMessage = 'خطأ في الاتصال بقاعدة البيانات - تحقق من الصلاحيات';
        statusCode = 503;
      } else if (err.message.includes('Unknown database') || err.message.includes('does not exist')) {
        errorMessage = `قاعدة بيانات المستشفى ${hospitalId} غير موجودة`;
        statusCode = 404;
      } else if (err.message.includes('ECONNREFUSED') || err.message.includes('Connection refused')) {
        errorMessage = 'لا يمكن الاتصال بقاعدة البيانات - تأكد من تشغيل MySQL';
        statusCode = 503;
      } else {
        errorMessage = err.message || errorMessage;
      }

      res.status(statusCode).json({ 
        ok: false,
        error: 'Server error',
        message: errorMessage,
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    }
  }
);

// دالة مساعدة: جلب الملفات من جميع المستشفيات
async function getAllHospitalsFiles(req, res, page, pageSize, q, type, source) {
  try {
    const central = await getCentralPool();
    
    // جلب جميع المستشفيات النشطة
    const [hospitals] = await central.query(
      'SELECT HospitalID, NameAr FROM hospitals WHERE (IsActive = 1 OR Active = 1) ORDER BY HospitalID'
    );

    const allFiles = [];
    const hospitalsMap = new Map(); // لربط HospitalID مع NameAr

    // جمع أسماء المستشفيات
    hospitals.forEach(h => {
      hospitalsMap.set(h.HospitalID, h.NameAr);
    });

    // البحث في كل مستشفى
    for (const hospital of hospitals) {
      try {
        const db = await getTenantPoolByHospitalId(hospital.HospitalID);
        
        const where = [];
        const args = [];
        
        if (q) {
          where.push('(fa.OriginalName LIKE ? OR fa.MimeType LIKE ?)');
          args.push(`%${q}%`, `%${q}%`);
        }
        if (type) {
          if (type.endsWith('/')) {
            where.push('fa.MimeType LIKE ?');
            args.push(`${type}%`);
          } else {
            where.push('fa.MimeType = ?');
            args.push(type);
          }
        }
        if (source && source.toLowerCase() !== 'all') {
          where.push('fa.SourceModule = ?');
          args.push(source);
        }

        const whereSql = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
        
        const [rows] = await db.execute(
          `SELECT 
             fa.FileID,
             fa.HospitalID,
             fa.SourceModule,
             fa.CustomFileName,
             fa.SourceName,
             fa.Notes,
             fa.OriginalName,
             fa.FileSizeBytes,
             fa.UploadedByUserID,
             fa.UploadedAt,
             u.FullName,
             u.RoleID
           FROM file_archive fa
           LEFT JOIN users u ON u.UserID = fa.UploadedByUserID
           ${whereSql}
           ORDER BY fa.UploadedAt DESC`,
          args
        );

        // إضافة اسم المستشفى لكل ملف
        rows.forEach(f => {
          allFiles.push({
            ...f,
            hospitalName: hospitalsMap.get(f.HospitalID) || '—'
          });
        });
      } catch (err) {
        console.error(`[archive/list] خطأ في جلب ملفات المستشفى ${hospital.HospitalID}:`, err.message);
        // نستمر في البحث في المستشفيات الأخرى
      }
    }

    // ترتيب جميع الملفات حسب التاريخ
    allFiles.sort((a, b) => new Date(b.UploadedAt) - new Date(a.UploadedAt));

    // تطبيق Pagination
    const total = allFiles.length;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const paginatedFiles = allFiles.slice(start, end);

    // تنسيق النتائج
    const formattedFiles = paginatedFiles.map(f => ({
      fileId: f.FileID,
      hospitalId: f.HospitalID,
      hospitalName: f.hospitalName || '—',
      source: f.SourceModule || '—',
      fileName: f.CustomFileName || f.OriginalName,
      sourceName: f.SourceName || '—',
      notes: f.Notes || '',
      sizeMB: (f.FileSizeBytes / 1024 / 1024).toFixed(2),
      uploadedBy: f.RoleID === 1 ? 'إدارة التجمع' : (f.FullName || 'غير معروف'),
      uploadedAt: f.UploadedAt,
      downloadUrl: `/api/archive/download/${f.FileID}?hospitalId=${f.HospitalID}`
    }));

    return res.json({
      ok: true,
      files: formattedFiles,
      total,
      page,
      pageSize,
      items: formattedFiles,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize)
      }
    });
  } catch (err) {
    console.error('[archive/list] خطأ في جلب ملفات جميع المستشفيات:', err);
    return res.status(500).json({
      ok: false,
      error: 'Server error',
      message: 'حدث خطأ أثناء جلب الملفات',
      total: 0,
      items: []
    });
  }
}

// 🟢 جلب قائمة الملفات من الأرشيف
router.get('/list', optionalAuth, async (req, res) => {
  try {
    // الحصول على hospitalId من query أو من المستخدم
    const qHosp = (req.query.hospitalId || '').toString().trim().toLowerCase();
    const queryHospId = qHosp === 'all' ? 'all' : parseInt(qHosp, 10);
    const userHospId = req.user ? parseInt(req.user?.HospitalID || req.user?.hospitalId || '0', 10) : 0;
    const isCM = req.user ? (!!req.user?.isClusterManager || req.user?.RoleID === 1) : false;
    
    // تحديد hospitalId: المدير يستطيع اختيار "all" أو مستشفى محدد، الآخرون يستخدمون مستشفاهم
    let hospitalId;
    if (isCM) {
      hospitalId = queryHospId === 'all' ? 'all' : (queryHospId || 'all');
    } else {
      hospitalId = userHospId || queryHospId;
      if (!hospitalId || isNaN(hospitalId)) {
        return res.json({ 
          ok: true,
          total: 0, 
          page: 1, 
          pageSize: 20, 
          items: [],
          message: 'يجب تحديد معرف المستشفى'
        });
      }
    }

    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize || '20', 10)));
    const offset = (page - 1) * pageSize;

    const q = (req.query.q || '').trim();
    const type = (req.query.type || '').trim();
    const source = (req.query.source || '').trim();

    // إذا كان "all"، نجمع الملفات من جميع المستشفيات
    if (hospitalId === 'all' && isCM) {
      return await getAllHospitalsFiles(req, res, page, pageSize, q, type, source);
    }

    // قاعدة المستشفى (الفرعية)
    const db = await getTenantPoolByHospitalId(hospitalId);
    
    // جلب اسم المستشفى من القاعدة المركزية
    let hospitalName = '—';
    try {
      const central = await getCentralPool();
      if (central) {
        const [hospRows] = await central.query(
          'SELECT NameAr FROM hospitals WHERE HospitalID = ? LIMIT 1',
          [hospitalId]
        );
        if (hospRows.length > 0) {
          hospitalName = hospRows[0].NameAr || '—';
        }
      }
    } catch (err) {
      console.error('[archive/list] خطأ في جلب اسم المستشفى:', err);
    }

    // بناء شروط WHERE - لا نضيف شرط HospitalID إذا كان "all"
    const where = [];
    const args = [];
    
    if (hospitalId !== 'all') {
      where.push('fa.HospitalID = ?');
      args.push(hospitalId);
    }

    if (q) {
      where.push('(fa.OriginalName LIKE ? OR fa.MimeType LIKE ?)');
      args.push(`%${q}%`, `%${q}%`);
    }
    if (type) {
      if (type.endsWith('/')) { 
        where.push('fa.MimeType LIKE ?'); 
        args.push(`${type}%`); 
      } else { 
        where.push('fa.MimeType = ?'); 
        args.push(type); 
      }
    }
    if (source && source.toLowerCase() !== 'all') {
      where.push('fa.SourceModule = ?');
      args.push(source);
    }

    const whereSql = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

    // العدد
    const [cnt] = await db.execute(
      `SELECT COUNT(*) AS c FROM file_archive fa ${whereSql}`,
      args
    );
    const total = cnt[0]?.c || 0;

    // الصفوف (بدون Placeholders للـ LIMIT/OFFSET لتجنب خطأ 1210)
    const sqlRows = `SELECT 
         fa.FileID,
         fa.HospitalID,
         fa.SourceModule,
         fa.CustomFileName,
         fa.SourceName,
         fa.Notes,
         fa.OriginalName,
         fa.FileSizeBytes,
         fa.UploadedByUserID,
         fa.UploadedAt,
         u.FullName,
         u.RoleID
       FROM file_archive fa
       LEFT JOIN users u ON u.UserID = fa.UploadedByUserID
       ${whereSql}
       ORDER BY fa.UploadedAt DESC
       LIMIT ${Number(pageSize)} OFFSET ${Number(offset)}`;

    const [rows] = await db.execute(sqlRows, args);

    // تنسيق النتائج
    const formattedFiles = rows.map(f => ({
      fileId: f.FileID,
      hospitalId: f.HospitalID,
      hospitalName: hospitalName || '—',
      source: f.SourceModule || '—',
      fileName: f.CustomFileName || f.OriginalName,
      sourceName: f.SourceName || '—',
      notes: f.Notes || '',
      sizeMB: (f.FileSizeBytes / 1024 / 1024).toFixed(2),
      uploadedBy: f.RoleID === 1 ? 'إدارة التجمع' : (f.FullName || 'غير معروف'),
      uploadedAt: f.UploadedAt,
      downloadUrl: `/api/archive/download/${f.FileID}?hospitalId=${f.HospitalID}`
    }));

    res.json({ 
      ok: true,
      files: formattedFiles,
      total, 
      page, 
      pageSize, 
      items: formattedFiles,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize)
      }
    });
  } catch (err) {
    console.error('[archive/list] error:', err);
    console.error('[archive/list] error stack:', err.stack);
    
    // رسائل خطأ أوضح
    let errorMessage = 'حدث خطأ أثناء جلب قائمة الملفات';
    let statusCode = 500;
    
    if (err.message.includes('ER_ACCESS_DENIED') || err.message.includes('Access denied')) {
      errorMessage = 'خطأ في الاتصال بقاعدة البيانات - تحقق من الصلاحيات';
      statusCode = 503;
    } else if (err.message.includes('Unknown database') || err.message.includes('does not exist')) {
      errorMessage = `قاعدة بيانات المستشفى ${hospitalId || 'المحدد'} غير موجودة`;
      statusCode = 404;
    } else if (err.message.includes('ECONNREFUSED') || err.message.includes('Connection refused')) {
      errorMessage = 'لا يمكن الاتصال بقاعدة البيانات - تأكد من تشغيل MySQL';
      statusCode = 503;
    } else {
      errorMessage = err.message || errorMessage;
    }
    
    res.status(statusCode).json({ 
      ok: false,
      error: 'Server error', 
      message: errorMessage,
      total: 0,
      items: [],
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// 🟢 تنزيل/عرض ملف معين
router.get('/download/:fileId', allowAll, async (req, res) => { // مؤقتًا: requireAuth
  try {
    const isCM = !!req.user?.isClusterManager || req.user?.RoleID === 1;
    const qHosp = (req.query.hospitalId || '').toString().trim();
    let hospitalId = parseInt(qHosp, 10);
    
    if (!isCM) hospitalId = parseInt(req.user?.HospitalID || req.user?.hospitalId || '0', 10);
    if (!hospitalId) return res.status(400).json({ error: 'hospitalId required' });

    const fileId = parseInt(req.params.fileId, 10);
    if (!fileId) {
      return res.status(400).json({ error: 'Invalid file ID' });
    }

    // قاعدة المستشفى (الفرعية)
    const db = await getTenantPoolByHospitalId(hospitalId);

    // جلب معلومات الملف
    const [files] = await db.execute(
      `SELECT OriginalName, MimeType, StoragePath, HospitalID
       FROM file_archive WHERE FileID = ? AND HospitalID = ?`,
      [fileId, hospitalId]
    );

    if (files.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = files[0];

    // بناء مسار الملف الكامل
    const filePath = path.join(process.cwd(), file.StoragePath);

    // التحقق من وجود الملف
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    // إرسال الملف
    res.setHeader('Content-Type', file.MimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.OriginalName)}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error('[archive/download] error:', err);
    res.status(500).json({ 
      error: 'Server error',
      message: err.message 
    });
  }
});

export default router;

