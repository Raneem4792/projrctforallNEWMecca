import { getTenantPoolByHospitalId } from '../db/tenantManager.js';

/**
 * تحويل البلاغ بين الأقسام
 */
export async function transferBetweenDepartments(req, res) {
  const complaintId = req.params.id;
  const { toDepartmentId, note } = req.body;
  const { UserID, HospitalID } = req.user;

  // التحقق من البيانات المطلوبة
  if (!toDepartmentId) {
    return res.status(400).json({
      ok: false,
      error: 'حدد القسم الهدف'
    });
  }

  const tenant = await getTenantPoolByHospitalId(HospitalID);
  const conn = await tenant.getConnection();

  try {
    await conn.beginTransaction();

    // قراءة البلاغ الحالي
    const [[complaint]] = await conn.query(
      `SELECT ComplaintID, DepartmentID, StatusID, AssignedToUserID 
       FROM complaints 
       WHERE ComplaintID = ? AND HospitalID = ? 
       FOR UPDATE`,
      [complaintId, HospitalID]
    );

    if (!complaint) {
      throw new Error('البلاغ غير موجود');
    }

    // التحقق من أن القسم الهدف مختلف
    if (Number(complaint.DepartmentID) === Number(toDepartmentId)) {
      throw new Error('القسم الهدف مطابق للقسم الحالي');
    }

    // التحقق من وجود القسم الهدف
    const [[targetDept]] = await conn.query(
      `SELECT DepartmentID FROM departments 
       WHERE DepartmentID = ? AND HospitalID = ?`,
      [toDepartmentId, HospitalID]
    );

    if (!targetDept) {
      throw new Error('القسم الهدف غير موجود');
    }

    // منع التحويل إذا كان البلاغ مغلق
    const closedStatuses = [4, 5]; // مثال: 4 = مغلق، 5 = مرفوض
    if (closedStatuses.includes(Number(complaint.StatusID))) {
      throw new Error('لا يمكن تحويل بلاغ مغلق أو مرفوض');
    }

    // تحديث قسم البلاغ
    await conn.query(
      `UPDATE complaints 
       SET DepartmentID = ? 
       WHERE ComplaintID = ? AND HospitalID = ?`,
      [toDepartmentId, complaintId, HospitalID]
    );

    // تسجيل تاريخ التحويل
    await conn.query(
      `INSERT INTO complaint_department_history
       (ComplaintID, FromDepartmentID, ToDepartmentID, Note, ChangedByUserID)
       VALUES (?, ?, ?, ?, ?)`,
      [complaintId, complaint.DepartmentID, toDepartmentId, note || null, UserID]
    );

    // إلغاء الإسناد الحالي عند تغيير القسم (اختياري)
    if (complaint.AssignedToUserID) {
      await conn.query(
        `UPDATE complaints 
         SET AssignedToUserID = NULL 
         WHERE ComplaintID = ? AND HospitalID = ?`,
        [complaintId, HospitalID]
      );

      // تسجيل إلغاء الإسناد
      await conn.query(
        `INSERT INTO complaint_assignee_history
         (ComplaintID, FromUserID, ToUserID, Note, ChangedByUserID)
         VALUES (?, ?, NULL, 'تم إلغاء الإسناد بسبب تغيير القسم', ?)`,
        [complaintId, complaint.AssignedToUserID, UserID]
      );
    }

    await conn.commit();

    res.json({
      ok: true,
      message: 'تم تحويل البلاغ بنجاح',
      data: {
        complaintId,
        fromDepartmentId: complaint.DepartmentID,
        toDepartmentId,
        note
      }
    });

  } catch (error) {
    await conn.rollback();
    console.error('خطأ في تحويل البلاغ بين الأقسام:', error);
    res.status(400).json({
      ok: false,
      error: error.message
    });
  } finally {
    conn.release();
  }
}

/**
 * تحويل البلاغ بين الموظفين
 */
export async function transferBetweenEmployees(req, res) {
  const complaintId = req.params.id;
  const { toUserId, note } = req.body;
  const { UserID, HospitalID } = req.user;

  // التحقق من البيانات المطلوبة
  if (!toUserId) {
    return res.status(400).json({
      ok: false,
      error: 'حدد الموظف الهدف'
    });
  }

  const tenant = await getTenantPoolByHospitalId(HospitalID);
  const conn = await tenant.getConnection();

  try {
    await conn.beginTransaction();

    // قراءة البلاغ الحالي
    const [[complaint]] = await conn.query(
      `SELECT ComplaintID, AssignedToUserID, StatusID, DepartmentID 
       FROM complaints 
       WHERE ComplaintID = ? AND HospitalID = ? 
       FOR UPDATE`,
      [complaintId, HospitalID]
    );

    if (!complaint) {
      throw new Error('البلاغ غير موجود');
    }

    // التحقق من أن الموظف الهدف مختلف
    if (Number(complaint.AssignedToUserID) === Number(toUserId)) {
      throw new Error('الموظف الهدف مطابق للموظف الحالي');
    }

    // التحقق من وجود الموظف الهدف
    const [[targetUser]] = await conn.query(
      `SELECT UserID, FullName, Username FROM users 
       WHERE UserID = ? AND HospitalID = ?`,
      [toUserId, HospitalID]
    );

    if (!targetUser) {
      throw new Error('الموظف الهدف غير موجود');
    }

    // منع التحويل إذا كان البلاغ مغلق
    const closedStatuses = [4, 5]; // مثال: 4 = مغلق، 5 = مرفوض
    if (closedStatuses.includes(Number(complaint.StatusID))) {
      throw new Error('لا يمكن تحويل بلاغ مغلق أو مرفوض');
    }

    // التحقق من أن الموظف الهدف ينتمي لنفس قسم البلاغ (اختياري)
    const [[userDept]] = await conn.query(
      `SELECT DepartmentID FROM users 
       WHERE UserID = ? AND HospitalID = ?`,
      [toUserId, HospitalID]
    );

    if (userDept && Number(userDept.DepartmentID) !== Number(complaint.DepartmentID)) {
      // تحذير فقط، لا نمنع التحويل
      console.warn(`تحويل بلاغ من قسم ${complaint.DepartmentID} إلى موظف من قسم ${userDept.DepartmentID}`);
    }

    // تحديث إسناد البلاغ
    await conn.query(
      `UPDATE complaints 
       SET AssignedToUserID = ? 
       WHERE ComplaintID = ? AND HospitalID = ?`,
      [toUserId, complaintId, HospitalID]
    );

    // تسجيل تاريخ التحويل
    await conn.query(
      `INSERT INTO complaint_assignee_history
       (ComplaintID, FromUserID, ToUserID, Note, ChangedByUserID)
       VALUES (?, ?, ?, ?, ?)`,
      [complaintId, complaint.AssignedToUserID || null, toUserId, note || null, UserID]
    );

    await conn.commit();

    res.json({
      ok: true,
      message: 'تم تحويل البلاغ بنجاح',
      data: {
        complaintId,
        fromUserId: complaint.AssignedToUserID,
        toUserId,
        toUserName: targetUser.FullName || targetUser.Username,
        note
      }
    });

  } catch (error) {
    await conn.rollback();
    console.error('خطأ في تحويل البلاغ بين الموظفين:', error);
    res.status(400).json({
      ok: false,
      error: error.message
    });
  } finally {
    conn.release();
  }
}

/**
 * الحصول على تاريخ تحويلات البلاغ
 */
export async function getTransferHistory(req, res) {
  const complaintId = req.params.id;
  const { HospitalID } = req.user;

  try {
    const tenant = await getTenantPoolByHospitalId(HospitalID);

    // التحقق من وجود البلاغ
    const [[complaint]] = await tenant.query(
      `SELECT ComplaintID FROM complaints 
       WHERE ComplaintID = ? AND HospitalID = ?`,
      [complaintId, HospitalID]
    );

    if (!complaint) {
      return res.status(404).json({
        ok: false,
        error: 'البلاغ غير موجود'
      });
    }

    // الحصول على تاريخ تحويل الأقسام
    const [deptHistory] = await tenant.query(`
      SELECT 
        cdh.Id,
        cdh.ComplaintID,
        cdh.FromDepartmentID,
        cdh.ToDepartmentID,
        cdh.Note,
        cdh.ChangedAt,
        cdh.ChangedByUserID,
        u.FullName as ChangedByUserName,
        fd.NameAr as FromDepartmentName,
        td.NameAr as ToDepartmentName
      FROM complaint_department_history cdh
      LEFT JOIN users u ON cdh.ChangedByUserID = u.UserID
      LEFT JOIN departments fd ON cdh.FromDepartmentID = fd.DepartmentID
      LEFT JOIN departments td ON cdh.ToDepartmentID = td.DepartmentID
      WHERE cdh.ComplaintID = ?
      ORDER BY cdh.ChangedAt DESC
    `, [complaintId]);

    // الحصول على تاريخ تحويل الموظفين
    const [userHistory] = await tenant.query(`
      SELECT 
        cah.Id,
        cah.ComplaintID,
        cah.FromUserID,
        cah.ToUserID,
        cah.Note,
        cah.ChangedAt,
        cah.ChangedByUserID,
        u.FullName as ChangedByUserName,
        fu.FullName as FromUserName,
        tu.FullName as ToUserName
      FROM complaint_assignee_history cah
      LEFT JOIN users u ON cah.ChangedByUserID = u.UserID
      LEFT JOIN users fu ON cah.FromUserID = fu.UserID
      LEFT JOIN users tu ON cah.ToUserID = tu.UserID
      WHERE cah.ComplaintID = ?
      ORDER BY cah.ChangedAt DESC
    `, [complaintId]);

    res.json({
      ok: true,
      data: {
        departmentHistory: deptHistory,
        userHistory: userHistory
      }
    });

  } catch (error) {
    console.error('خطأ في الحصول على تاريخ التحويل:', error);
    res.status(500).json({
      ok: false,
      error: 'خطأ في الحصول على تاريخ التحويل'
    });
  }
}
