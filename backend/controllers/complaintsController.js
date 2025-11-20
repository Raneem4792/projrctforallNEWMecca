// controllers/complaintsController.js
import { getHospitalPool } from '../middleware/hospitalPool.js';
import { addToTrash } from './trashController.js';
import { resolveHospitalIdForComplaint, resolveResponderUserId } from './_helpers.js';

export async function deleteComplaint(req, res) {
  let conn;
  try {
    const complaintId = Number(req.params.id);
    if (!complaintId) {
      return res.status(400).json({ success: false, message: 'Invalid complaint ID' });
    }

    // سبب الحذف (اختياري)
    const deleteReason = (req.body?.deleteReason || '').trim() || null;

    // ✅ حددي المستشفى بشكل صحيح (يتجاهل 15 إن كان غير موجود)
    const hospitalId = await resolveHospitalIdForComplaint(req, complaintId);

    // تأكدي من المستخدم المحلي داخل قاعدة هذا المستشفى
    const localUserId = await resolveResponderUserId(req, hospitalId);

    const pool = await getHospitalPool(hospitalId);

    console.log('🏥 [deleteComplaint] المستشفى المحدد:', hospitalId);

    // لقطة قبل الحذف (لـ trash_bin)
    const [rows] = await pool.query(
      `SELECT * FROM complaints WHERE ComplaintID=? LIMIT 1`,
      [complaintId]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'البلاغ غير موجود في قاعدة المستشفى' });
    }
    const snap = rows[0];
    if (snap.IsDeleted === 1) {
      return res.status(409).json({ success: false, message: 'البلاغ محذوف مسبقاً' });
    }

    // ابدأ معاملة
    conn = await pool.getConnection();
    await conn.beginTransaction();

    await conn.query(
      `UPDATE complaints
          SET IsDeleted=1,
              DeletedAt=NOW(),
              DeletedByUserID=?,
              DeleteReason=?
        WHERE ComplaintID=?`,
      [localUserId, deleteReason, complaintId]
    );

    await conn.commit();
    conn.release(); conn = null;

    // أرشفة في trash_bin (قاعدة مركزية)
    console.log('[before addToTrash]', { 
      hospitalId, 
      complaintId, 
      deletedByUserId: localUserId,
      entityTitle: snap.TicketNumber || snap.PatientFullName || `Complaint #${complaintId}`
    });
    
    await addToTrash({
      hospitalId,
      entityType: 'COMPLAINT',
      entityTable: 'complaints',
      entityId: complaintId,
      entityTitle: snap.TicketNumber || snap.PatientFullName || `Complaint #${complaintId}`,
      entitySnapshot: snap,
      deleteReason,
      deletedByUserId: localUserId
    });

    return res.json({ success: true, data: { complaintId, hospitalId } });

  } catch (err) {
    if (conn) { try { await conn.rollback(); } catch(e){} }
    console.error('deleteComplaint error:', err);
    return res.status(500).json({ success: false, message: 'خطأ أثناء حذف البلاغ' });
  } finally {
    if (conn) conn.release?.();
  }
}

export async function transferComplaintDepartment(req, res) {
  const hospitalId = Number(req.hospitalId || req.query?.hospitalId || req.user?.HospitalID);
  const actorUserId = await resolveResponderUserId(req, hospitalId);
  if (!actorUserId) {
    return res.status(403).json({ ok:false, message:'ليس لديك حساب فعّال داخل هذه المستشفى.' });
  }

  const conn = await req.hospitalPool.getConnection();
  try {
    const complaintId = Number(req.params.id);
    const { toDepartmentId, note } = req.body || {};

    if (!complaintId || !toDepartmentId) {
      return res.status(400).json({ ok:false, message:'toDepartmentId مطلوب' });
    }

    // 1) التحقق من البلاغ والقسم الحالي
    const [[c]] = await conn.query(
      `SELECT ComplaintID, DepartmentID, StatusCode FROM complaints WHERE ComplaintID=?`,
      [complaintId]
    );
    if (!c) return res.status(404).json({ ok:false, message:'البلاغ غير موجود' });
    if (Number(c.DepartmentID) === Number(toDepartmentId)) {
      return res.status(400).json({ ok:false, message:'القسم الهدف يطابق القسم الحالي' });
    }

    // 2) التحقق من القسم الهدف
    const [[d]] = await conn.query(
      `SELECT DepartmentID FROM departments 
       WHERE DepartmentID=? AND COALESCE(IsActive,1)=1`,
      [toDepartmentId]
    );
    if (!d) return res.status(400).json({ ok:false, message:'القسم الهدف غير صالح' });

    await conn.beginTransaction();

    // 3) تحديث قسم البلاغ
    await conn.query(
      `UPDATE complaints 
       SET DepartmentID=?, UpdatedAt=CURRENT_TIMESTAMP 
       WHERE ComplaintID=?`,
      [toDepartmentId, complaintId]
    );

    // 4) سجل تتبّع (اختياري: جدول history أو رد داخلي)
    await conn.query(
      `INSERT INTO complaint_responses
        (ComplaintID, ResponderUserID, ReplyTypeID, TargetStatusCode, Message, IsInternal)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        complaintId,
        actorUserId,
        1,                      // ReplyType: system/internal
        c.StatusCode || null,   // لا نغيّر الحالة هنا
        `تحويل البلاغ من قسم ${c.DepartmentID} إلى ${toDepartmentId}` + 
          (note?.trim()? ` — ملاحظة: ${note.trim()}` : ''),
        1
      ]
    );

    await conn.commit();
    return res.json({ ok:true, complaintId, fromDepartmentId: c.DepartmentID, toDepartmentId });
  } catch (e) {
    try { await conn.rollback(); } catch {}
    console.error('transferComplaintDepartment error:', e);
    return res.status(500).json({ ok:false, message:'خطأ عند تحويل البلاغ' });
  } finally {
    conn.release();
  }
}

// تحويل البلاغ بين الموظفين
export async function transferComplaintEmployee(req, res) {
  const conn = await req.hospitalPool.getConnection();
  try {
    const complaintId = Number(req.params.id);
    const { fromUserId, toUserId, note } = req.body || {};
    const actorUserId = Number(req.user?.uid || req.user?.UserID);

    if (!complaintId || !toUserId) {
      return res.status(400).json({ ok:false, message:'toUserId مطلوب' });
    }

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
}