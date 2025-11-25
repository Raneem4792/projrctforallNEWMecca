// controllers/complaintStatusesController.js
// import { pool } from '../config/db.js'; // ❌ أشّره/احذفه

// جلب حالات البلاغات
export const listComplaintStatuses = async (req, res) => {
  try {
    console.log('🔍 [listComplaintStatuses] بدء جلب الحالات:', {
      hospitalId: req.hospitalId,
      hasHospitalPool: !!req.hospitalPool,
      user: req.user?.UserID
    });

    if (!req.hospitalPool) {
      console.error('❌ [listComplaintStatuses] req.hospitalPool غير موجود');
      return res.status(500).json({ message: 'خطأ في الاتصال بقاعدة البيانات' });
    }

    const [rows] = await req.hospitalPool.query(
      `SELECT StatusCode, LabelAr, LabelEn, SortOrder
       FROM complaint_statuses
       WHERE COALESCE(IsActive,1)=1
       ORDER BY SortOrder ASC, StatusCode ASC`
    );
    
    console.log('✅ [listComplaintStatuses] تم جلب', rows.length, 'حالة');
    res.json(rows);
  } catch (e) {
    console.error('❌ [listComplaintStatuses] خطأ:', e);
    res.status(500).json({ message: 'Server error' });
  }
};

// تغيير حالة البلاغ
export const updateComplaintStatus = async (req, res) => {
  const conn = await req.hospitalPool.getConnection(); // ✅ بدل pool.getConnection()
  try {
    const complaintId = Number(req.params.id);
    const { statusCode, note } = req.body || {};
    const userId = Number(req.user?.uid || req.user?.UserID);

    if (!complaintId || !statusCode) {
      return res.status(400).json({ message: 'statusCode مطلوب' });
    }
    if (!userId) {
      return res.status(401).json({ message: 'المستخدم غير مسجل دخول' });
    }

    const [[st]] = await conn.query(
      `SELECT StatusCode FROM complaint_statuses WHERE StatusCode = ? AND COALESCE(IsActive,1)=1`,
      [statusCode]
    );
    if (!st) {
      return res.status(400).json({ message: 'حالة غير صالحة' });
    }

    const [[complaint]] = await conn.query(
      `SELECT ComplaintID, CreatedAt, StatusCode FROM complaints WHERE ComplaintID = ?`,
      [complaintId]
    );
    if (!complaint) {
      return res.status(404).json({ message: 'البلاغ غير موجود' });
    }

    await conn.beginTransaction();

    // تحديد إذا كانت الحالة الجديدة هي إغلاق
    // استخدام uppercase للمقارنة لضمان التعامل مع جميع أشكال الحالة
    const statusCodeUpper = String(statusCode || '').toUpperCase();
    const closedStatuses = ['CLOSED', 'RESOLVED', 'CANCELLED'];
    const isClosing = closedStatuses.includes(statusCodeUpper);
    const complaintStatusCodeUpper = String(complaint.StatusCode || '').toUpperCase();
    const wasAlreadyClosed = closedStatuses.includes(complaintStatusCodeUpper);

    // حساب ActualClosingHours إذا تم الإغلاق لأول مرة
    let actualClosingHours = null;
    // نحسب فقط إذا كانت الحالة الجديدة "مغلق" ولم يكن "مغلقاً" من قبل
    if (isClosing && !wasAlreadyClosed) {
      const createdAt = new Date(complaint.CreatedAt);
      const now = new Date();
      // حساب الفرق بالساعات (مع التقريب للأعلى لضمان عدم وجود 0 ساعة)
      // مثلاً: 15 دقيقة تُحسب كساعة واحدة لضمان ظهورها في التقارير
      const hours = Math.ceil((now - createdAt) / (1000 * 60 * 60));
      actualClosingHours = hours > 0 ? hours : 1; 
    }

    // تحديث حالة البلاغ مع ActualClosingHours إذا لزم الأمر
    if (actualClosingHours !== null) {
      await conn.query(
        `UPDATE complaints
         SET StatusCode = ?, 
             UpdatedAt = CURRENT_TIMESTAMP,
             ActualClosingHours = ?
         WHERE ComplaintID = ?`,
        [statusCode, actualClosingHours, complaintId]
      );
    } else {
      await conn.query(
        `UPDATE complaints
         SET StatusCode = ?, UpdatedAt = CURRENT_TIMESTAMP
         WHERE ComplaintID = ?`,
        [statusCode, complaintId]
      );
    }

    if (note && note.trim() !== '') {
      await conn.query(
        `INSERT INTO complaint_responses
          (ComplaintID, ResponderUserID, ReplyTypeID, TargetStatusCode, Message, IsInternal)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [complaintId, userId, 1, statusCode, `تغيير حالة البلاغ: ${statusCode} — ${note}`, 1]
      );
    }

    await conn.commit();
    res.json({ ok: true, complaintId, statusCode, message: 'تم تحديث حالة البلاغ بنجاح' });
  } catch (e) {
    try { await conn.rollback(); } catch {}
    console.error('updateComplaintStatus error:', e);
    res.status(500).json({ message: 'خطأ في تحديث حالة البلاغ' });
  } finally {
    conn.release();
  }
};
