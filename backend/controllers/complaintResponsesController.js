// controllers/complaintResponsesController.js
import { getCentralPool, getHospitalPool, getActiveHospitals, complaintExistsInHospital } from '../middleware/hospitalPool.js';

// كاش بسيط لتسريع التكرار
const complaintToHospitalCache = new Map(); // key: GlobalID || `id:<ComplaintID>`

// دالة ذكية لتحديد hospitalId للبلاغ (آمنة)
async function resolveHospitalIdForComplaint(req, complaintId) {
  const central = await getCentralPool();

  // حاول تجيب GlobalID وحقل HospitalID المقترح من المركزي (إن وجد)
  let globalId = null, suggestedH = null;
  try {
    const [[row]] = await central.query(
      'SELECT GlobalID, HospitalID FROM complaints WHERE ComplaintID = ? LIMIT 1',
      [complaintId]
    );
    globalId = row?.GlobalID || null;
    suggestedH = row?.HospitalID ? Number(row.HospitalID) : null;
  } catch (e) {
    // تجاهل الأخطاء والكمل
  }

  // مرشّحات أولية: من الكويري ثم من التوكن ثم من المركزي
  const candidates = [
    Number(req.query?.hospitalId || 0) || null,
    Number(req.user?.HospitalID  || 0) || null,
    suggestedH
  ].filter(Boolean);

  // 1) جرّبي المرشّحين بسرعة (بدون سقوط)
  for (const h of candidates) {
    const found = await complaintExistsInHospital(h, { complaintId, globalId });
    if (found) {
      // حفظ في الكاش
      const cacheKey = globalId || `id:${complaintId}`;
      complaintToHospitalCache.set(cacheKey, h);
      return h;
    }
  }

  // 2) لفي على جميع المستشفيات المفعّلة
  try {
    const hospitals = await getActiveHospitals(); // SELECT ... WHERE COALESCE(IsActive, Active, 1) = 1
    for (const h of hospitals) {
      const hid = Number(h.HospitalID);
      const found = await complaintExistsInHospital(hid, { complaintId, globalId });
      if (found) {
        // حفظ في الكاش
        const cacheKey = globalId || `id:${complaintId}`;
        complaintToHospitalCache.set(cacheKey, hid);
        return hid;
      }
    }
  } catch (e) {
    // تجاهل الأخطاء والكمل
  }

  throw new Error(`تعذّر تحديد قاعدة المستشفى لهذا البلاغ (${complaintId}).`);
}

// دالة لضمان وجود Shadow User في جدول users من user_directory
async function ensureLocalUserForDirectory(pool, username, hospitalId, departmentId = 0) {
  try {
    // تحقق من وجود المستخدم في جدول users
    const [[existingUser]] = await pool.query(
      'SELECT UserID FROM users WHERE Username = ? LIMIT 1',
      [username]
    );
    
    if (existingUser) {
      return existingUser.UserID;
    }

    // جلب بيانات المستخدم من user_directory
    const [[dirUser]] = await pool.query(
      `SELECT Username, FullName, Email, Phone, RoleID, DepartmentID
       FROM user_directory 
       WHERE Username = ? LIMIT 1`,
      [username]
    );

    if (!dirUser) {
      throw new Error(`المستخدم ${username} غير موجود في user_directory`);
    }

    // إنشاء Shadow User في جدول users
    const [insertResult] = await pool.query(
      `INSERT INTO users 
       (Username, FullName, Email, Phone, RoleID, DepartmentID, HospitalID, IsActive, CreatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, NOW())`,
      [
        dirUser.Username,
        dirUser.FullName || dirUser.Username,
        dirUser.Email || null,
        dirUser.Phone || null,
        dirUser.RoleID || 1,
        dirUser.DepartmentID || departmentId,
        hospitalId,
      ]
    );

    return insertResult.insertId;
  } catch (error) {
    console.error('خطأ في ensureLocalUserForDirectory:', error);
    throw error;
  }
}

// جلب البلاغ بواسطة التذكرة
export const getComplaintByTicket = async (req, res) => {
  try {
    const { ticket } = req.query;
    
    if (!ticket) {
      return res.status(400).json({ message: 'Missing ticket parameter' });
    }

    const central = await getCentralPool();
    const [rows] = await central.query(
      `SELECT ComplaintID, TicketNumber, StatusCode, HospitalID
       FROM complaints 
       WHERE TicketNumber = ? OR CONCAT('C-', ComplaintID) = ?`,
      [ticket, ticket]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Complaint not found' });
    }

    res.json({
      ok: true,
      items: rows
    });
  } catch (e) {
    console.error('getComplaintByTicket error:', e);
    res.status(500).json({ message: 'Server error' });
  }
};

// جلب أنواع الردود
export const listReplyTypes = async (req, res) => {
  try {
    const activeOnly = String(req.query.active || '1') === '1';
    let hid = Number(req.query.hospitalId || 0);

    console.log('🔍 listReplyTypes - hospitalId:', hid);
    console.log('🔍 req.query:', req.query);
    console.log('🔍 req.user:', req.user);

    // محاولة الحصول على hospitalId من مصادر متعددة
    if (!hid) {
      // 1) محاولة من التوكِن (للموظفين المصادق عليهم)
      hid = Number(req.user?.HospitalID || req.user?.hospitalId || 0);
      
      if (hid) {
        console.log('✅ تم استخراج hospitalId من التوكِن:', hid);
      } else {
        // 2) محاولة من complaintId
        const complaintId = Number(req.query.complaintId || 0);
        if (!complaintId) {
          return res.status(400).json({ 
            ok: false,
            message: 'يجب تمرير hospitalId أو complaintId، أو تسجيل الدخول كموظف مستشفى' 
          });
        }
        // استخدام نفس الدالة للردود لتحديد قاعدة المستشفى
        hid = await resolveHospitalIdForComplaint(req, complaintId);
        console.log('🔍 تم استنتاج hospitalId من complaintId:', complaintId, '->', hid);
      }
    }

    const pool = await getHospitalPool(hid);

    const [rows] = await pool.query(
      `SELECT ReplyTypeID, NameAr, NameEn, IsActive, SortOrder
         FROM reply_types
        ${activeOnly ? 'WHERE IsActive = 1' : ''}
        ORDER BY SortOrder ASC, ReplyTypeID ASC`
    );

    console.log('✅ تم جلب', rows.length, 'نوع رد من قاعدة المستشفى', hid);
    res.json({ ok: true, items: rows, hospitalId: hid });
  } catch (e) {
    console.error('❌ listReplyTypes error:', e);
    res.status(500).json({ message: 'خطأ في جلب أنواع الردود: ' + e.message });
  }
};

// جلب الردود على بلاغ معين
export const listComplaintResponses = async (req, res) => {
  try {
    const complaintId = Number(req.params.id);
    
    if (!complaintId || isNaN(complaintId)) {
      return res.status(400).json({ message: 'Invalid complaint ID' });
    }

    const hid = await resolveHospitalIdForComplaint(req, complaintId);
    const pool = await getHospitalPool(hid);

    // الردود مع أسماء المستجيبين وأنواع الردود
    const [responses] = await pool.query(
      `SELECT
          r.ResponseID,
          r.ComplaintID,
          r.ReplyTypeID,
          rt.NameAr   AS ReplyTypeNameAr,
          rt.NameEn   AS ReplyTypeNameEn,
          r.TargetStatusCode,
          r.Message,
          r.IsInternal,
          r.CreatedAt,
          u.UserID    AS ResponderUserID,
          u.FullName  AS ResponderFullName
        FROM complaint_responses r
        JOIN reply_types rt ON rt.ReplyTypeID = r.ReplyTypeID
        JOIN users u        ON u.UserID = r.ResponderUserID
       WHERE r.ComplaintID = ?
       ORDER BY r.CreatedAt ASC, r.ResponseID ASC`,
      [complaintId]
    );

    // مرفقات لكل رد
    const respIds = responses.map(r => r.ResponseID);
    let attachmentsByResp = {};
    if (respIds.length) {
      const [atts] = await pool.query(
        `SELECT RespAttachmentID, ResponseID, FileName, FilePath, FileSize, UploadedByUserID, UploadDate, Description
           FROM response_attachments
          WHERE ResponseID IN (${respIds.map(() => '?').join(',')})
          ORDER BY RespAttachmentID ASC`,
        respIds
      );
      attachmentsByResp = atts.reduce((acc, a) => {
        (acc[a.ResponseID] ||= []).push(a);
        return acc;
      }, {});
    }

    const withAtts = responses.map(r => ({ 
      ...r, 
      attachments: attachmentsByResp[r.ResponseID] || [] 
    }));
    
    res.json({ ok: true, items: withAtts });
  } catch (e) {
    console.error('listComplaintResponses error:', e);
    res.status(500).json({ message: 'Server error' });
  }
};

// إنشاء رد جديد
export const createComplaintResponse = async (req, res) => {
  let conn;
  try {
    const complaintId = Number(req.params.id);
    const { ReplyTypeID, Message, TargetStatusCode, IsInternal } = req.body;

    // تحقق أساسي
    if (!complaintId || isNaN(complaintId)) {
      return res.status(400).json({ message: 'Invalid complaint ID' });
    }
    
    if (!ReplyTypeID || !Message) {
      return res.status(400).json({ message: 'ReplyTypeID و Message مطلوبان' });
    }

    // تحقق من وجود المستخدم في JWT
    if (!req.user) {
      return res.status(401).json({ message: 'المستخدم غير مسجل دخول' });
    }

    const hid = await resolveHospitalIdForComplaint(req, complaintId);
    const pool = await getHospitalPool(hid);
    conn = await pool.getConnection();

    // تحديد UserID المحلي (Shadow User للموظفين)
    let responderUserId;
    if (req.user.UserID && req.user.UserID > 0) {
      // مستخدم عادي من جدول users
      responderUserId = req.user.UserID;
      
      // تحقق سريع أن المستخدم موجود
      const [[u]] = await conn.query('SELECT UserID FROM users WHERE UserID = ?', [responderUserId]);
      if (!u) {
        return res.status(400).json({ message: 'المستخدم غير موجود في هذه القاعدة' });
      }
    } else if (req.user.username) {
      // موظف من user_directory - إنشاء Shadow User
      responderUserId = await ensureLocalUserForDirectory(
        pool, 
        req.user.username, 
        hid, 
        req.user.DepartmentID || 0
      );
    } else {
      return res.status(400).json({ message: 'بيانات المستخدم غير مكتملة' });
    }

    await conn.beginTransaction();

    // إدراج الرد
    const [ins] = await conn.query(
      `INSERT INTO complaint_responses
        (ComplaintID, ResponderUserID, ReplyTypeID, TargetStatusCode, Message, IsInternal, CreatedAt)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        complaintId,
        responderUserId,
        Number(ReplyTypeID),
        TargetStatusCode || null,
        String(Message),
        Number(IsInternal || 0)
      ]
    );
    const responseId = ins.insertId;

    // تحديث حالة البلاغ إن تم تحديدها
    if (TargetStatusCode && TargetStatusCode.trim() !== '') {
      await conn.query(
        `UPDATE complaints SET StatusCode = ?, UpdatedAt = CURRENT_TIMESTAMP WHERE ComplaintID = ?`,
        [TargetStatusCode, complaintId]
      );
    }

    // حفظ المرفقات في response_attachments
    if (req.files && req.files.length > 0) {
      const values = req.files.map(f => [
        responseId,
        f.filename,
        `/uploads/responses/${f.filename}`,
        f.size,
        responderUserId,
        new Date(),
        null
      ]);
      
      await conn.query(
        `INSERT INTO response_attachments
          (ResponseID, FileName, FilePath, FileSize, UploadedByUserID, UploadDate, Description)
         VALUES ?`,
        [values]
      );
    }

    await conn.commit();

    // رجّع الرد الجديد مع المرفقات
    const [[row]] = await pool.query(
      `SELECT
          r.ResponseID,
          r.ComplaintID,
          r.ReplyTypeID,
          rt.NameAr   AS ReplyTypeNameAr,
          rt.NameEn   AS ReplyTypeNameEn,
          r.TargetStatusCode,
          r.Message,
          r.IsInternal,
          r.CreatedAt,
          u.UserID    AS ResponderUserID,
          u.FullName  AS ResponderFullName
        FROM complaint_responses r
        JOIN reply_types rt ON rt.ReplyTypeID = r.ReplyTypeID
        JOIN users u        ON u.UserID = r.ResponderUserID
       WHERE r.ResponseID = ?`,
      [responseId]
    );
    
    const [atts] = await pool.query(
      `SELECT RespAttachmentID, FileName, FilePath, FileSize, UploadedByUserID, UploadDate, Description
         FROM response_attachments
        WHERE ResponseID = ?
        ORDER BY RespAttachmentID ASC`,
      [responseId]
    );

    res.status(201).json({ ok: true, item: { ...row, attachments: atts }, statusUpdated: !!TargetStatusCode });
  } catch (e) {
    if (conn) await conn.rollback();
    console.error('createComplaintResponse error:', e);
    res.status(500).json({ message: 'خطأ في حفظ الرد' });
  } finally {
    if (conn) conn.release();
  }
};
