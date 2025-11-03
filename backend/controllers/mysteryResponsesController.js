// controllers/mysteryResponsesController.js
import { getCentralPool, getHospitalPool, getActiveHospitals, complaintExistsInHospital } from '../middleware/hospitalPool.js';

// ——— مساعد: تحديد قاعدة المستشفى لهذا التقييم (مثل resolveHospitalIdForComplaint)
async function resolveHospitalIdForMystery(req, mysteryId) {
  const central = await getCentralPool();

  let suggestedH = null;
  try {
    const [[row]] = await central.query(
      'SELECT HospitalID FROM mystery_complaints WHERE MysteryID = ? LIMIT 1',
      [mysteryId]
    );
    suggestedH = row?.HospitalID ? Number(row.HospitalID) : null;
  } catch {}

  const candidates = [
    Number(req.query?.hospitalId || 0) || null,
    Number(req.user?.HospitalID  || 0) || null,
    suggestedH
  ].filter(Boolean);

  // لو وجدنا في أي مرشح
  for (const h of candidates) {
    try {
      const pool = await getHospitalPool(h);
      const [[x]] = await pool.query(
        'SELECT MysteryID FROM mystery_complaints WHERE MysteryID = ? LIMIT 1',
        [mysteryId]
      );
      if (x) return h;
    } catch {}
  }

  // جرّبي المفعلة كلها
  const hospitals = await getActiveHospitals();
  for (const h of hospitals) {
    try {
      const hid = Number(h.HospitalID);
      const pool = await getHospitalPool(hid);
      const [[x]] = await pool.query(
        'SELECT MysteryID FROM mystery_complaints WHERE MysteryID = ? LIMIT 1',
        [mysteryId]
      );
      if (x) return hid;
    } catch {}
  }

  throw new Error(`تعذّر تحديد قاعدة المستشفى لهذا التقييم (${mysteryId}).`);
}

// جلب الردود على تقييم زائر سري
export const listMysteryResponses = async (req, res) => {
  try {
    const mysteryId = Number(req.params.id);
    if (!mysteryId) return res.status(400).json({ message: 'Invalid mystery ID' });

    const hid = await resolveHospitalIdForMystery(req, mysteryId);
    const pool = await getHospitalPool(hid);

    const [responses] = await pool.query(
      `SELECT
         r.ResponseID,
         r.MysteryID,
         r.ReplyTypeID,
         rt.NameAr  AS ReplyTypeNameAr,
         rt.NameEn  AS ReplyTypeNameEn,
         r.TargetStatusCode,
         r.Message,
         r.IsInternal,
         r.CreatedAt,
         u.UserID   AS ResponderUserID,
         u.FullName AS ResponderFullName
       FROM mystery_responses r
       JOIN reply_types rt ON rt.ReplyTypeID = r.ReplyTypeID
       JOIN users u        ON u.UserID = r.ResponderUserID
      WHERE r.MysteryID = ?
      ORDER BY r.CreatedAt ASC, r.ResponseID ASC`,
      [mysteryId]
    );

    // مرفقات الردود
    let attachmentsByResp = {};
    if (responses.length) {
      const ids = responses.map(r => r.ResponseID);
      const [atts] = await pool.query(
        `SELECT RespAttachmentID, ResponseID, FileName, FilePath, FileSize, UploadedByUserID, UploadDate, Description
           FROM mystery_response_attachments
          WHERE ResponseID IN (${ids.map(()=>'?' ).join(',')})
          ORDER BY RespAttachmentID ASC`,
        ids
      );
      attachmentsByResp = atts.reduce((a, f) => {
        (a[f.ResponseID] ||= []).push(f);
        return a;
      }, {});
    }

    res.json({
      ok: true,
      items: responses.map(r => ({ ...r, attachments: attachmentsByResp[r.ResponseID] || [] }))
    });
  } catch (e) {
    console.error('listMysteryResponses error:', e);
    res.status(500).json({ message: 'Server error' });
  }
};

// إنشاء رد على تقييم زائر سري (مع مرفقات واختيار تحديث حالة)
export const createMysteryResponse = async (req, res) => {
  let conn;
  try {
    const mysteryId = Number(req.params.id);
    const { ReplyTypeID, Message, TargetStatusCode, IsInternal } = req.body;

    if (!mysteryId || !ReplyTypeID || !Message) {
      return res.status(400).json({ message: 'ReplyTypeID و Message و MysteryID مطلوبة' });
    }
    if (!req.user?.UserID) return res.status(401).json({ message: 'المستخدم غير مسجل دخول' });

    const hid = await resolveHospitalIdForMystery(req, mysteryId);
    const pool = await getHospitalPool(hid);
    conn = await pool.getConnection();
    await conn.beginTransaction();

    // تأكيد وجود المستخدم محليًا
    const [[u]] = await conn.query('SELECT UserID FROM users WHERE UserID = ?', [req.user.UserID]);
    if (!u) return res.status(400).json({ message: 'المستخدم غير موجود في هذه القاعدة' });

    // إدراج الرد
    const [ins] = await conn.query(
      `INSERT INTO mystery_responses
        (MysteryID, ResponderUserID, ReplyTypeID, TargetStatusCode, Message, IsInternal, CreatedAt)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [mysteryId, req.user.UserID, Number(ReplyTypeID), TargetStatusCode || null, String(Message), Number(IsInternal || 0)]
    );
    const responseId = ins.insertId;

    // تحديث حالة التقييم (اختياري)
    if (TargetStatusCode && TargetStatusCode.trim()) {
      await conn.query(
        `UPDATE mystery_complaints SET Status = ?, UpdatedAt = CURRENT_TIMESTAMP WHERE MysteryID = ?`,
        [TargetStatusCode, mysteryId]
      );
    }

    // حفظ المرفقات
    if (req.files?.length) {
      const values = req.files.map(f => [
        responseId,
        f.filename,
        `/uploads/mystery-responses/${f.filename}`,
        f.size,
        req.user.UserID,
        new Date(),
        null
      ]);
      await conn.query(
        `INSERT INTO mystery_response_attachments
          (ResponseID, FileName, FilePath, FileSize, UploadedByUserID, UploadDate, Description)
         VALUES ?`,
        [values]
      );
    }

    await conn.commit();

    // ارجاع العنصر المُنشأ مع مرفقاته
    const [[row]] = await pool.query(
      `SELECT
         r.ResponseID,
         r.MysteryID,
         r.ReplyTypeID,
         rt.NameAr  AS ReplyTypeNameAr,
         rt.NameEn  AS ReplyTypeNameEn,
         r.TargetStatusCode,
         r.Message,
         r.IsInternal,
         r.CreatedAt,
         u.UserID   AS ResponderUserID,
         u.FullName AS ResponderFullName
       FROM mystery_responses r
       JOIN reply_types rt ON rt.ReplyTypeID = r.ReplyTypeID
       JOIN users u        ON u.UserID = r.ResponderUserID
      WHERE r.ResponseID = ?`,
      [responseId]
    );
    const [atts] = await pool.query(
      `SELECT RespAttachmentID, FileName, FilePath, FileSize, UploadedByUserID, UploadDate, Description
         FROM mystery_response_attachments
        WHERE ResponseID = ?
        ORDER BY RespAttachmentID ASC`,
      [responseId]
    );

    res.status(201).json({ ok: true, item: { ...row, attachments: atts }, statusUpdated: !!TargetStatusCode });
  } catch (e) {
    if (conn) await conn.rollback();
    console.error('createMysteryResponse error:', e);
    res.status(500).json({ message: 'خطأ في حفظ الرد' });
  } finally {
    if (conn) conn.release();
  }
};

// تغيير حالة التقييم (لزر "تغيير الحالة")
export const updateMysteryStatus = async (req, res) => {
  try {
    const mysteryId = Number(req.params.id);
    const { statusCode, note } = req.body;
    if (!mysteryId || !statusCode) return res.status(400).json({ ok:false, message:'البيانات ناقصة' });

    const hid = await resolveHospitalIdForMystery(req, mysteryId);
    const pool = await getHospitalPool(hid);

    await pool.query(
      `UPDATE mystery_complaints SET Status = ?, UpdatedAt = CURRENT_TIMESTAMP WHERE MysteryID = ?`,
      [statusCode, mysteryId]
    );

    // اختياري: سجّل ملاحظة كتاريخ/رد داخلي
    if (note?.trim()) {
      await pool.query(
        `INSERT INTO mystery_responses
           (MysteryID, ResponderUserID, ReplyTypeID, TargetStatusCode, Message, IsInternal, CreatedAt)
         VALUES (?, ?, NULL, ?, ?, 1, NOW())`,
        [mysteryId, req.user?.UserID || null, statusCode, note]
      );
    }

    res.json({ ok:true });
  } catch (e) {
    console.error('updateMysteryStatus error:', e);
    res.status(500).json({ ok:false, message:'Server error' });
  }
};

// حذف (نقله لسلة محذوفات)
export const softDeleteMystery = async (req, res) => {
  try {
    const mysteryId = Number(req.params.id);
    const { deleteReason } = req.body || {};
    if (!mysteryId) return res.status(400).json({ message: 'Invalid mystery ID' });

    const hid = await resolveHospitalIdForMystery(req, mysteryId);
    const pool = await getHospitalPool(hid);

    await pool.query(
      `UPDATE mystery_complaints
          SET IsDeleted = 1, DeletedAt = NOW(), DeleteReason = ?
        WHERE MysteryID = ?`,
      [deleteReason || null, mysteryId]
    );

    res.json({ success:true, data:{ hospitalId: hid } });
  } catch (e) {
    console.error('softDeleteMystery error:', e);
    res.status(500).json({ success:false, message:'Server error' });
  }
};

// تحويل التقييم بين الأقسام
export const transferMysteryDepartment = async (req, res) => {
  console.log('🔍 [transferMysteryDepartment] بدء التحويل:', {
    mysteryId: req.params.id,
    body: req.body,
    user: req.user
  });

  let conn;
  try {
    const mysteryId = Number(req.params.id);
    const { fromDepartmentId, toDepartmentId, note } = req.body || {};
    const userId = Number(req.user?.uid || req.user?.UserID);
    
    console.log('🔍 [transferMysteryDepartment] البيانات المحللة:', {
      mysteryId,
      fromDepartmentId,
      toDepartmentId,
      note,
      userId
    });

    if (!mysteryId || !toDepartmentId) {
      return res.status(400).json({ 
        ok: false, 
        message: 'mysteryId و toDepartmentId مطلوبان' 
      });
    }

    if (!userId) {
      return res.status(401).json({ 
        ok: false, 
        message: 'المستخدم غير مسجل دخول' 
      });
    }

    // ✅ حددي المستشفى وخذي الـ pool
    const hid = await resolveHospitalIdForMystery(req, mysteryId);
    const pool = await getHospitalPool(hid);
    conn = await pool.getConnection();
    
    console.log('🔍 [transferMysteryDepartment] تم تحديد المستشفى:', hid);

    // التحقق من وجود التقييم
    const [[mystery]] = await conn.query(
      `SELECT MysteryID, DepartmentID FROM mystery_complaints WHERE MysteryID = ?`,
      [mysteryId]
    );
    
    if (!mystery) {
      return res.status(404).json({ 
        ok: false, 
        message: 'التقييم غير موجود' 
      });
    }

    // التحقق من وجود القسم الهدف
    const [[dept]] = await conn.query(
      `SELECT DepartmentID FROM departments WHERE DepartmentID = ? AND COALESCE(IsActive,1)=1`,
      [toDepartmentId]
    );
    
    if (!dept) {
      return res.status(400).json({ 
        ok: false, 
        message: 'القسم الهدف غير موجود أو غير مفعّل' 
      });
    }

    await conn.beginTransaction();

    // تحديث القسم
    await conn.query(
      `UPDATE mystery_complaints 
       SET DepartmentID = ?, UpdatedAt = CURRENT_TIMESTAMP
       WHERE MysteryID = ?`,
      [toDepartmentId, mysteryId]
    );

    // إضافة رد داخلي للتحويل
    const transferMessage = fromDepartmentId 
      ? `تحويل من قسم ${fromDepartmentId} إلى قسم ${toDepartmentId}${note ? ` - ${note}` : ''}`
      : `تحويل إلى قسم ${toDepartmentId}${note ? ` - ${note}` : ''}`;

    await conn.query(
      `INSERT INTO mystery_responses
        (MysteryID, ResponderUserID, ReplyTypeID, TargetStatusCode, Message, IsInternal)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [mysteryId, userId, 1, null, transferMessage, 1]
    );

    await conn.commit();
    
    res.json({ 
      ok: true, 
      mysteryId, 
      fromDepartmentId: fromDepartmentId || null,
      toDepartmentId, 
      message: 'تم تحويل التقييم بنجاح' 
    });
    
  } catch (e) {
    try { await conn.rollback(); } catch {}
    console.error('❌ [transferMysteryDepartment] خطأ:', e);
    console.error('❌ [transferMysteryDepartment] تفاصيل الخطأ:', {
      message: e.message,
      stack: e.stack,
      name: e.name
    });
    res.status(500).json({ 
      ok: false, 
      message: 'خطأ في تحويل التقييم' 
    });
  } finally {
    if (conn) conn.release();
  }
};

// تحويل التقييم بين الموظفين
export const transferMysteryEmployee = async (req, res) => {
  console.log('🔍 [transferMysteryEmployee] بدء التحويل:', {
    mysteryId: req.params.id,
    body: req.body,
    user: req.user
  });

  let conn;
  try {
    const mysteryId = Number(req.params.id);
    const { fromUserId, toUserId, note } = req.body || {};
    const userId = Number(req.user?.uid || req.user?.UserID);
    
    console.log('🔍 [transferMysteryEmployee] البيانات المحللة:', {
      mysteryId,
      fromUserId,
      toUserId,
      note,
      userId
    });

    if (!mysteryId || !toUserId) {
      return res.status(400).json({ 
        ok: false, 
        message: 'mysteryId و toUserId مطلوبان' 
      });
    }

    if (!userId) {
      return res.status(401).json({ 
        ok: false, 
        message: 'المستخدم غير مسجل دخول' 
      });
    }

    // ✅ حددي المستشفى وخذي الـ pool
    const hid = await resolveHospitalIdForMystery(req, mysteryId);
    const pool = await getHospitalPool(hid);
    conn = await pool.getConnection();
    
    console.log('🔍 [transferMysteryEmployee] تم تحديد المستشفى:', hid);

    // التحقق من وجود التقييم
    console.log('🔍 [transferMysteryEmployee] فحص التقييم...');
    const [[mystery]] = await conn.query(
      `SELECT MysteryID, AssignedToUserID FROM mystery_complaints WHERE MysteryID = ?`,
      [mysteryId]
    );
    
    console.log('🔍 [transferMysteryEmployee] نتيجة فحص التقييم:', mystery);
    
    if (!mystery) {
      return res.status(404).json({ 
        ok: false, 
        message: 'التقييم غير موجود' 
      });
    }

    // التحقق من وجود الموظف الهدف
    console.log('🔍 [transferMysteryEmployee] فحص الموظف الهدف...');
    const [[emp]] = await conn.query(
      `SELECT UserID FROM users WHERE UserID = ? AND COALESCE(IsActive,1)=1`,
      [toUserId]
    );
    
    console.log('🔍 [transferMysteryEmployee] نتيجة فحص الموظف:', emp);
    
    if (!emp) {
      return res.status(400).json({ 
        ok: false, 
        message: 'الموظف الهدف غير موجود أو غير مفعّل' 
      });
    }

    await conn.beginTransaction();
    console.log('🔍 [transferMysteryEmployee] بدء المعاملة...');

    // تحديث الموظف المسند
    console.log('🔍 [transferMysteryEmployee] تحديث الموظف المسند...');
    await conn.query(
      `UPDATE mystery_complaints 
       SET AssignedToUserID = ?, UpdatedAt = CURRENT_TIMESTAMP
       WHERE MysteryID = ?`,
      [toUserId, mysteryId]
    );
    console.log('✅ [transferMysteryEmployee] تم تحديث الموظف المسند');

    // إضافة رد داخلي للتحويل
    const transferMessage = fromUserId 
      ? `تحويل من موظف ${fromUserId} إلى موظف ${toUserId}${note ? ` - ${note}` : ''}`
      : `تحويل إلى موظف ${toUserId}${note ? ` - ${note}` : ''}`;

    console.log('🔍 [transferMysteryEmployee] إضافة رد داخلي:', transferMessage);
    await conn.query(
      `INSERT INTO mystery_responses
        (MysteryID, ResponderUserID, ReplyTypeID, TargetStatusCode, Message, IsInternal)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [mysteryId, userId, 1, null, transferMessage, 1]
    );
    console.log('✅ [transferMysteryEmployee] تم إضافة الرد الداخلي');

    await conn.commit();
    console.log('✅ [transferMysteryEmployee] تم تأكيد المعاملة');
    
    res.json({ 
      ok: true, 
      mysteryId, 
      fromUserId: fromUserId || null,
      toUserId, 
      message: 'تم تحويل التقييم بنجاح' 
    });
    console.log('✅ [transferMysteryEmployee] تم إرسال الاستجابة');
    
  } catch (e) {
    try { await conn.rollback(); } catch {}
    console.error('❌ [transferMysteryEmployee] خطأ:', e);
    console.error('❌ [transferMysteryEmployee] تفاصيل الخطأ:', {
      message: e.message,
      stack: e.stack,
      name: e.name
    });
    res.status(500).json({ 
      ok: false, 
      message: 'خطأ في تحويل التقييم' 
    });
  } finally {
    if (conn) conn.release();
  }
};
