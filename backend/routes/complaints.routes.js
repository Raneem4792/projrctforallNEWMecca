// backend/routes/complaints.routes.js
// راوتر البلاغات للنظام المتعدد (Multi-tenant)
import express from 'express';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import mysql from 'mysql2/promise';
import { getCentralPool } from '../db/centralPool.js';
import config from '../config/multi-tenant.js';
import { requireAuth } from '../middleware/auth.js';
import { resolveHospitalId } from '../middleware/resolveHospitalId.js';
import { attachHospitalPool, getActiveHospitals } from '../middleware/hospitalPool.js';
import { exportComplaintsExcel, exportComplaintsPDF } from '../controllers/complaints.export.controller.js';

const router = express.Router();

// ✅ إعداد multer لقراءة FormData والمرفقات
const upload = multer({
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB لكل ملف
  storage: multer.memoryStorage() // تخزين في الذاكرة (أو استخدم diskStorage)
});


/**
 * POST /api/complaints
 * إنشاء بلاغ جديد (يتطلب تسجيل دخول)
 * HospitalID يؤخذ من التوكن، لا يُرسل من العميل
 * ✅ يدعم FormData مع المرفقات
 */
router.post('/', requireAuth, resolveHospitalId, attachHospitalPool, upload.array('attachments', 10), async (req, res) => {
  try {
    const user = req.user;
    const userId = Number(user.uid || user.userId);
    
    // ✅ تحديد HospitalID حسب نوع المستخدم
    // 🟦 مدير التجمع: يختار المستشفى من الواجهة (req.body.HospitalID)
    // 🟩 موظف مستشفى: المستشفى من التوكن (user.hosp)
    const isCluster = user.scope === 'central' || 
                      user.scope === 'cluster' || 
                      user.roleScope === 'cluster';
    
    let hospitalId;
    if (isCluster) {
      // مدير تجمع: استخدم HospitalID من req.body
      hospitalId = Number(req.body.HospitalID || 0);
      console.log('🟦 وضع مدير التجمع: المستشفى من الواجهة =', hospitalId);
    } else {
      // موظف مستشفى: استخدم HospitalID من التوكن
      hospitalId = Number(user.hosp || user.hospitalId || user.HospitalID);
      console.log('🟩 وضع موظف المستشفى: المستشفى من التوكن =', hospitalId);
    }
    
    if (!hospitalId || hospitalId === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Hospital ID مفقود - يرجى اختيار المستشفى' 
      });
    }

    console.log('📥 البيانات المستلمة:', {
      body: req.body,
      files: req.files?.length || 0
    });

    // استخدام req.hospitalPool الذي تم إعداده بواسطة middleware
    const pool = req.hospitalPool;
    
    // ✅ التحقق من القاعدة المُستخدمة
    const [[dbInfo]] = await pool.query('SELECT DATABASE() AS dbName');
    console.log(`🔹 الإدراج سيتم في قاعدة: ${dbInfo.dbName} (Hospital ID: ${hospitalId})`);

    // ✅ دعم الاسمين (PascalCase و camelCase)
    const DepartmentID     = Number(req.body.DepartmentID || req.body.departmentId || 0);
    const PatientFullName  = (req.body.PatientFullName || req.body.patientName || '').trim();
    const Description      = (req.body.Description || req.body.description || '').trim();
    
    const VisitDate        = req.body.VisitDate || req.body.visitDate || null;
    const PatientIDNumber  = req.body.PatientIDNumber || req.body.patientIdNumber || null;
    const PatientMobile    = req.body.PatientMobile || req.body.patientMobile || null;
    const GenderCode       = req.body.GenderCode || req.body.genderCode || null;
    const FileNumber       = req.body.FileNumber || req.body.fileNumber || null;
    const ComplaintTypeID  = Number(req.body.ComplaintTypeID || req.body.complaintTypeId || 0) || null;
    const SubTypeID        = Number(req.body.SubTypeID || req.body.subTypeId || 0) || null;
    const ProcessingDurationHours = req.body.ProcessingDuration ? Number(req.body.ProcessingDuration) : null;
    
    // ✅ تحديد الأولوية: إذا كان التصنيف "الأدوية" (ComplaintTypeID = 6) أو "سوء معاملة" (ComplaintTypeID = 17) → URGENT
    let PriorityCode;
    if (ComplaintTypeID === 6) {
      // الأدوية → حرج/عاجل
      PriorityCode = 'URGENT';
      console.log('🚨 تم تعيين الأولوية إلى URGENT لأن التصنيف هو "الأدوية"');
    } else if (ComplaintTypeID === 17) {
      // سوء معاملة → حرج/عاجل
      PriorityCode = 'URGENT';
      console.log('🚨 تم تعيين الأولوية إلى URGENT لأن التصنيف هو "سوء معاملة"');
    } else {
      // 🔍 استنتاج الأولوية من الكلمات المفتاحية
      const { detectPriorityByKeywords } = await import('../utils/priorityDetect.js');
      const detection = await detectPriorityByKeywords(req.hospitalPool, Description);
      PriorityCode = (detection.priority || 'MEDIUM').toUpperCase();
      
      console.log('🎯 تحديد الأولوية التلقائي:', {
        description: Description?.substring(0, 50) + '...',
        detectedPriority: PriorityCode,
        matchedKeywords: detection.matched?.map(m => m.keyword) || []
      });
    }
    const SubmissionType   = req.body.SubmissionType || req.body.submissionType || '937';
    
    // ✅ تأكيد StatusCode بحروف كبيرة
    const StatusCode       = 'OPEN';

    console.log('📋 البيانات المُعالجة:', {
      DepartmentID,
      PatientFullName: PatientFullName?.substring(0, 20),
      Description: Description?.substring(0, 30),
      HospitalID: hospitalId
    });

    // التحقق من الحقول الإلزامية
    if (!DepartmentID || !PatientFullName || !Description) {
      return res.status(400).json({
        success: false,
        message: 'الحقول الإلزامية مفقودة',
        missing: {
          DepartmentID: !DepartmentID,
          PatientFullName: !PatientFullName,
          Description: !Description
        },
        received: { DepartmentID, PatientFullName, Description }
      });
    }

    // 🔢 توليد رقم التذكرة باستخدام ticket_counters (atomic)
    const year = new Date().getFullYear();
    
    // ✅ زيادة العداد بشكل ذري (atomic) باستخدام LAST_INSERT_ID
    await pool.query(`
      INSERT INTO ticket_counters (YearSmall, LastSeq)
      VALUES (YEAR(CURDATE()), 0)
      ON DUPLICATE KEY UPDATE LastSeq = LAST_INSERT_ID(LastSeq + 1)
    `);

    // ✅ جلب الرقم الذي زاد للتو (آمن من التزامن)
    const [[{ seq }]] = await pool.query('SELECT LAST_INSERT_ID() AS seq');
    
    const ticketNumber = `C-${year}-${String(seq).padStart(6, '0')}`;

    // ملاحظة: ProcessingDeadline سيتم حسابه بعد الحفظ باستخدام CreatedAt من DB
    // نتركه NULL هنا وسنحدثه بعد INSERT

    // إدخال البلاغ في قاعدة المستشفى
    const [result] = await pool.query(`
      INSERT INTO complaints (
        TicketNumber,
        HospitalID,
        DepartmentID,
        SubmissionType,
        VisitDate,
        PatientFullName,
        PatientIDNumber,
        PatientMobile,
        GenderCode,
        FileNumber,
        ComplaintTypeID,
        SubTypeID,
        Description,
        PriorityCode,
        StatusCode,
        ProcessingDurationHours,
        ProcessingDeadline,
        CreatedByUserID
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `, [
      ticketNumber,
      hospitalId,
      DepartmentID,
      SubmissionType,
      VisitDate,
      PatientFullName,
      PatientIDNumber,
      PatientMobile,
      GenderCode,
      FileNumber,
      ComplaintTypeID,
      SubTypeID,
      Description,
      PriorityCode,
      StatusCode,
      ProcessingDurationHours,
      null, // ProcessingDeadline سيتم حسابه بعد INSERT
      userId
    ]);

    const complaintId = result.insertId;

    // ✅ تحديث ProcessingDeadline بعد الحفظ (لأن CreatedAt يتم تعيينه من DB)
    if (ProcessingDurationHours && ProcessingDurationHours > 0) {
      await pool.query(`
        UPDATE complaints 
        SET ProcessingDeadline = DATE_ADD(CreatedAt, INTERVAL ? HOUR)
        WHERE ComplaintID = ?
      `, [ProcessingDurationHours, complaintId]);
    }

    // ✅ الـ trigger سيُدخل في outbox_events تلقائياً

    console.log(`✅ تم إنشاء البلاغ #${complaintId} - ${ticketNumber} في قاعدة المستشفى #${hospitalId}`);

    // ✅ حفظ نسخة في القاعدة المركزية (للتقارير التجميعية)
    try {
      const centralPool = await getCentralPool();
      await centralPool.query(`
        INSERT INTO complaints (
          ComplaintID,
          TicketNumber,
          HospitalID,
          DepartmentID,
          SubmissionType,
          VisitDate,
          PatientFullName,
          PatientIDNumber,
          PatientMobile,
          GenderCode,
          FileNumber,
          ComplaintTypeID,
          SubTypeID,
          Description,
          PriorityCode,
          StatusCode,
          CreatedByUserID,
          CreatedAt
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW()
        )
        ON DUPLICATE KEY UPDATE
          StatusCode = VALUES(StatusCode),
          UpdatedAt = NOW()
      `, [
        complaintId,      // نفس الـ ID من قاعدة المستشفى
        ticketNumber,
        hospitalId,
        DepartmentID,
        SubmissionType,
        VisitDate,
        PatientFullName,
        PatientIDNumber,
        PatientMobile,
        GenderCode,
        FileNumber,
        ComplaintTypeID,
        SubTypeID,
        Description,
        PriorityCode,
        StatusCode,
        userId
      ]);
      console.log(`✅ تم حفظ نسخة من البلاغ في القاعدة المركزية`);
    } catch (centralError) {
      console.error('⚠️ تحذير: فشل حفظ البلاغ في القاعدة المركزية:', centralError.message);
      // لا نوقف العملية - البلاغ موجود في قاعدة المستشفى
    }

    // ✅ حفظ المرفقات إذا كانت موجودة
    if (req.files && req.files.length > 0) {
      console.log(`📎 معالجة ${req.files.length} مرفق للبلاغ ${complaintId}`);
      
      const fs = await import('fs');
      const path = await import('path');
      
      // إنشاء مجلد المرفقات
      const baseDir = path.join(process.cwd(), 'uploads', `h${hospitalId}`, 'complaints', String(complaintId));
      fs.mkdirSync(baseDir, { recursive: true });
      
      // حفظ كل مرفق
      for (const file of req.files) {
        try {
          // إنشاء اسم آمن للملف
          const timestamp = Date.now();
          const safeName = `${timestamp}-${file.originalname.replace(/[^\w.\-أ-ي\s]/g, '_')}`;
          const fullPath = path.join(baseDir, safeName);
          
          // حفظ الملف
          fs.writeFileSync(fullPath, file.buffer);
          
          // إدراج سجل في جدول attachments
          await pool.query(`
            INSERT INTO attachments
              (ComplaintID, FileName, FilePath, FileSize, UploadedByUserID, UploadDate, Description)
            VALUES (?,?,?,?,?,NOW(),?)
          `, [
            complaintId,
            file.originalname,
            `/uploads/h${hospitalId}/complaints/${complaintId}/${safeName}`, // URL للوصول
            file.size,
            userId,
            `مرفق للبلاغ ${ticketNumber}`
          ]);
          
          console.log(`✅ تم حفظ المرفق: ${file.originalname} -> ${safeName}`);
        } catch (fileError) {
          console.error(`❌ خطأ في حفظ المرفق ${file.originalname}:`, fileError.message);
          // لا نوقف العملية - البلاغ تم إنشاؤه بنجاح
        }
      }
    }

    res.status(201).json({
      success: true,
      message: 'تم إنشاء البلاغ بنجاح',
      data: {
        ComplaintID: complaintId,
        TicketNumber: ticketNumber,
        PriorityCode: PriorityCode,
        StatusCode: 'OPEN',
        HospitalID: hospitalId,
        attachmentsCount: req.files ? req.files.length : 0
      }
    });

  } catch (error) {
    console.error('❌ خطأ في إنشاء البلاغ:', error);
    res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء إنشاء البلاغ',
      error: error.message
    });
  }
});

/**
 * POST /api/complaints/:id/transfer/employee
 * تحويل البلاغ بين الموظفين
 */
router.post('/:id/transfer/employee', requireAuth, resolveHospitalId, attachHospitalPool, async (req, res) => {
  try {
    const complaintId = Number(req.params.id);
    const { fromUserId, toUserId, note } = req.body || {};
    const actorUserId = Number(req.user?.uid || req.user?.UserID);

    if (!complaintId || !toUserId) {
      return res.status(400).json({ ok:false, message:'toUserId مطلوب' });
    }

    // استخدام req.hospitalPool الذي تم إعداده بواسطة middleware
    const conn = await req.hospitalPool.getConnection();
    try {
      // البلاغ الحالي + الموظف الحالي
      const [[c]] = await conn.query(
        `SELECT ComplaintID, DepartmentID, AssignedToUserID, StatusCode
         FROM complaints WHERE ComplaintID=?`, [complaintId]
      );
      if (!c) return res.status(404).json({ ok:false, message:'البلاغ غير موجود' });

      if (Number(c.AssignedToUserID || 0) === Number(toUserId)) {
        return res.status(400).json({ ok:false, message:'الموظف الهدف يطابق الموظف الحالي' });
      }

      // تحقّق من صحة الموظف الهدف وأنه ضمن نفس المستشفى
      const [[uTo]] = await conn.query(
        `SELECT UserID, DepartmentID, FullName FROM users
         WHERE UserID=? AND COALESCE(IsActive,1)=1`, [toUserId]
      );
      if (!uTo) return res.status(400).json({ ok:false, message:'الموظف الهدف غير صالح' });

      // تحقّق من fromUserId إن تم تمريره
      if (fromUserId) {
        if (Number(c.AssignedToUserID || 0) !== Number(fromUserId)) {
          return res.status(409).json({ ok:false, message:'fromUserId لا يطابق الموظف الحالي' });
        }
      }

      await conn.beginTransaction();

      // 1) تحديث البلاغ (المُسند إليه الآن)
      await conn.query(
        `UPDATE complaints
           SET AssignedToUserID=?, AssignedAt=CURRENT_TIMESTAMP, AssignedByUserID=?
         WHERE ComplaintID=?`,
        [toUserId, actorUserId || null, complaintId]
      );

      // 2) سجل تاريخ التحويل
      await conn.query(
        `INSERT INTO complaint_assignee_history
           (ComplaintID, FromUserID, ToUserID, Note, ChangedByUserID)
         VALUES (?,?,?,?,?)`,
        [complaintId, c.AssignedToUserID || null, toUserId, (note||null), actorUserId || null]
      );

      // 3) نضيف ردًّا داخلياً للتوثيق
      await conn.query(
        `INSERT INTO complaint_responses
          (ComplaintID, ResponderUserID, ReplyTypeID, TargetStatusCode, Message, IsInternal)
         VALUES (?,?,?,?,?,?)`,
        [
          complaintId,
          actorUserId || null,
          1, // نوع ردّ داخلي/سيستمي
          c.StatusCode || null,
          `تحويل البلاغ بين الموظفين: من ${c.AssignedToUserID || '—'} إلى ${uTo.FullName || toUserId}` + 
            (note?.trim()? ` — ملاحظة: ${note.trim()}` : ''),
          1
        ]
      );

      await conn.commit();
      return res.json({ 
        ok:true, 
        complaintId, 
        fromUserId: c.AssignedToUserID || null, 
        toUserId,
        toUserName: uTo.FullName || null
      });
    } catch (e) {
      try { await conn.rollback(); } catch {}
      console.error('transferComplaintEmployee error:', e);
      return res.status(500).json({ ok:false, message:'خطأ عند تحويل البلاغ بين الموظفين' });
    } finally {
      conn.release();
    }

  } catch (error) {
    console.error('❌ خطأ في تحويل البلاغ بين الموظفين:', error);
    res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء تحويل البلاغ',
      error: error.message
    });
  }
});

/**
 * GET /api/complaints/repeat-check
 * التحقق من تكرار البلاغات في آخر X يوم لنفس القسم
 * يُستخدم لإظهار زر "مشروع تحسيني" عند التكرار ≥ 3
 */
router.get('/repeat-check', requireAuth, resolveHospitalId, attachHospitalPool, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const hospitalId = req.hospitalId;
    const pool = req.hospitalPool;

    // التحقق من تكرار البلاغات في آخر X يوم لنفس القسم + نفس التصنيف الفرعي
    const [results] = await pool.query(`
      SELECT 
        DepartmentID,
        ComplaintSubTypeID,
        COUNT(*) as cnt
      FROM complaints 
      WHERE HospitalID = ? 
        AND CreatedAt >= DATE_SUB(NOW(), INTERVAL ? DAY)
        AND IsDeleted = 0
      GROUP BY DepartmentID, ComplaintSubTypeID
      HAVING cnt >= 3
    `, [hospitalId, days]);

    const hasRepeatedComplaints = results.length > 0;

    res.json({
      ok: true,
      hasRepeatedComplaints,
      repeatedDepartments: results,
      days: Number(days)
    });
  } catch (err) {
    console.error('GET /api/complaints/repeat-check error:', err);
    res.status(500).json({ error: 'Failed to check repeat complaints' });
  }
});

/**
 * GET /api/complaints/export-excel
 * تصدير البلاغات إلى Excel مع الفلاتر
 */
router.get('/export-excel', requireAuth, exportComplaintsExcel);

/**
 * POST /api/complaints/export-pdf
 * تصدير البلاغات إلى PDF (يستقبل صورة من html2canvas)
 */
router.post('/export-pdf', requireAuth, exportComplaintsPDF);

/**
 * PUT /api/complaints/:id/duration
 * تحديث مدة معالجة البلاغ
 */
router.put('/:id/duration', requireAuth, resolveHospitalId, attachHospitalPool, async (req, res) => {
  const pool = req.hospitalPool;

  try {
    if (!pool) {
      return res.status(500).json({ ok: false, message: 'فشل الاتصال بقاعدة بيانات المستشفى' });
    }

    const complaintId = Number(req.params.id);
    if (!complaintId) {
      return res.status(400).json({ ok: false, message: 'معرف البلاغ غير صالح' });
    }

    const rawHours =
      req.body?.ProcessingDurationHours ??
      req.body?.processingDurationHours ??
      req.body?.duration ??
      req.body?.hours;

    const hours = Number(rawHours);
    if (!Number.isFinite(hours) || hours <= 0) {
      return res.status(400).json({ ok: false, message: 'مدة المعالجة غير صالحة' });
    }

    const note = typeof req.body?.Note === 'string' ? req.body.Note.trim() : '';

    const [result] = await pool.query(
      `UPDATE complaints
         SET ProcessingDurationHours = ?, UpdatedAt = CURRENT_TIMESTAMP
       WHERE ComplaintID = ?`,
      [hours, complaintId]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ ok: false, message: 'البلاغ غير موجود' });
    }

    // إضافة رد داخلي للتوثيق
    try {
      const user = req.user || {};
      const responderId = Number(user?.uid || user?.UserID || user?.userId) || null;
      const actorName =
        user?.FullName ||
        user?.fullName ||
        user?.Name ||
        user?.name ||
        user?.username ||
        (responderId ? `المستخدم ${responderId}` : 'النظام');

      const message = note
        ? `[تغيير مدة المعالجة إلى ${hours} ساعة] ${note}`
        : `🕓 تم تغيير مدة المعالجة إلى ${hours} ساعة بواسطة ${actorName}`;

      await pool.query(
        `INSERT INTO complaint_responses
          (ComplaintID, ResponderUserID, ReplyTypeID, TargetStatusCode, Message, IsInternal)
         VALUES (?,?,?,?,?,1)`,
        [
          complaintId,
          responderId,
          1,
          null,
          message
        ]
      );
    } catch (logError) {
      console.warn('⚠️ فشل تسجيل رد تغيير المدة:', logError.message);
    }

    return res.json({
      ok: true,
      message: 'تم تحديث مدة المعالجة بنجاح',
      ProcessingDurationHours: hours
    });
  } catch (error) {
    console.error('❌ خطأ في تحديث المدة:', error);
    return res.status(500).json({
      ok: false,
      message: 'حدث خطأ أثناء تحديث مدة المعالجة',
      error: error.message
    });
  }
});

/**
 * PUT /api/complaints/:id/priority
 * تغيير أولوية البلاغ
 */
router.put('/:id/priority', requireAuth, resolveHospitalId, attachHospitalPool, async (req, res) => {
  const pool = req.hospitalPool;
  try {
    // التحقق من وجود pool
    if (!pool) {
      return res.status(500).json({ success: false, message: 'فشل الاتصال بقاعدة البيانات' });
    }

    const complaintId = Number(req.params.id);
    const { PriorityCode } = req.body;
    const userId = Number(req.user?.uid || req.user?.UserID || req.user?.userId);

    if (!complaintId) {
      return res.status(400).json({ success: false, message: 'معرف البلاغ مطلوب' });
    }

    if (!PriorityCode || !['URGENT', 'MEDIUM', 'LOW', 'HIGH'].includes(PriorityCode.toUpperCase())) {
      return res.status(400).json({ success: false, message: 'أولوية غير صالحة. يجب أن تكون: URGENT, MEDIUM, LOW, أو HIGH' });
    }

    const priorityCode = PriorityCode.toUpperCase();

    // التحقق من وجود البلاغ
    const [[complaint]] = await pool.query(
      `SELECT ComplaintID, PriorityCode FROM complaints WHERE ComplaintID = ?`,
      [complaintId]
    );

    if (!complaint) {
      return res.status(404).json({ success: false, message: 'البلاغ غير موجود' });
    }

    // تحديث الأولوية
    await pool.query(
      `UPDATE complaints 
       SET PriorityCode = ?, UpdatedAt = CURRENT_TIMESTAMP 
       WHERE ComplaintID = ?`,
      [priorityCode, complaintId]
    );

    res.json({ 
      success: true, 
      message: 'تم تحديث الأولوية بنجاح',
      priorityCode: priorityCode,
      complaintId: complaintId
    });
  } catch (err) {
    console.error('❌ خطأ في تحديث الأولوية:', err);
    res.status(500).json({ success: false, message: 'خطأ في قاعدة البيانات: ' + err.message });
  }
});

export default router;

