// controllers/complaints.transfer.controller.js
import { getTenantPoolByHospitalId, getCentralPool } from '../db/tenantManager.js';

/**
 * تحويل البلاغ بين المستشفيات (فوري مباشر)
 * POST /api/complaints/transfer-hospital
 */
export async function transferComplaintDirect(req, res) {
  let sourceConn = null;
  let targetConn = null;
  
  try {
    // ✅ التحقق من req.user أولاً
    console.log('✅ [Transfer] Authenticated user:', {
      UserID: req.user?.UserID,
      RoleID: req.user?.RoleID,
      HospitalID: req.user?.HospitalID,
      username: req.user?.username
    });

    if (!req.user || !req.user.UserID) {
      return res.status(401).json({ 
        ok: false, 
        error: 'معلومات المستخدم غير مكتملة - يرجى تسجيل الدخول مرة أخرى' 
      });
    }

    let sourceHospitalId = req.user.HospitalID;      // المستشفى الحالي (قد يكون null لمدير التجمع)
    const { complaintId, targetHospitalId, sourceHospitalId: providedSourceId } = req.body;

    if (!complaintId || !targetHospitalId) {
      return res.status(400).json({ ok: false, error: 'البيانات ناقصة' });
    }

    // ✅ إذا كان Cluster Manager، نحتاج تحديد المستشفى المصدر من البلاغ أو من body
    if (!sourceHospitalId) {
      sourceHospitalId = providedSourceId;
      
      if (!sourceHospitalId) {
        // البحث عن البلاغ في جميع المستشفيات لتحديد المصدر
        const central = await getCentralPool();
        const [hospitals] = await central.query('SELECT HospitalID FROM hospitals WHERE IsActive=1');
        
        for (const h of hospitals) {
          try {
            const pool = await getTenantPoolByHospitalId(h.HospitalID);
            const [rows] = await pool.query('SELECT ComplaintID FROM complaints WHERE ComplaintID=?', [complaintId]);
            if (rows.length > 0) {
              sourceHospitalId = h.HospitalID;
              break;
            }
          } catch (e) {
            continue;
          }
        }
        
        if (!sourceHospitalId) {
          return res.status(404).json({ ok: false, error: 'البلاغ غير موجود في أي مستشفى' });
        }
      }
    }

    if (Number(targetHospitalId) === Number(sourceHospitalId)) {
      return res.status(400).json({ ok: false, error: 'المستشفى الهدف نفس الحالي' });
    }

    // 1️⃣ التحقق من المستشفى الهدف
    const central = await getCentralPool();
    const [hRows] = await central.query(
      'SELECT HospitalID, NameAr FROM hospitals WHERE HospitalID=? AND IsActive=1',
      [targetHospitalId]
    );
    if (!hRows.length) {
      return res.status(404).json({ ok: false, error: 'المستشفى الهدف غير موجود أو غير مفعل' });
    }

    // 2️⃣ جلب البلاغ من قاعدة المستشفى المصدر
    const sourcePool = await getTenantPoolByHospitalId(sourceHospitalId);
    sourceConn = await sourcePool.getConnection();
    
    await sourceConn.beginTransaction();
    
    const [rows] = await sourceConn.query(
      'SELECT * FROM complaints WHERE ComplaintID=? AND (IsDeleted=0 OR IsDeleted IS NULL) FOR UPDATE',
      [complaintId]
    );

    if (!rows.length) {
      await sourceConn.rollback();
      return res.status(404).json({ ok: false, error: 'البلاغ غير موجود' });
    }

    const complaint = rows[0];

    // 3️⃣ جلب المرفقات والردود (إذا كانت الجداول موجودة)
    let attachments = [];
    let replies = [];
    
    try {
      const [attRows] = await sourceConn.query('SELECT * FROM complaint_attachments WHERE ComplaintID=?', [complaintId]);
      attachments = attRows || [];
    } catch (e) {
      if (e.code !== 'ER_NO_SUCH_TABLE') throw e;
    }

    try {
      const [repRows] = await sourceConn.query('SELECT * FROM complaint_replies WHERE ComplaintID=? ORDER BY CreatedAt', [complaintId]);
      replies = repRows || [];
    } catch (e) {
      if (e.code !== 'ER_NO_SUCH_TABLE') throw e;
    }

    // 4️⃣ جلب القسم الافتراضي للمستشفى الهدف (أو قسم عام)
    let defaultDepartmentId = 1; // ✅ قيمة افتراضية مضمونة
    try {
      const targetPool = await getTenantPoolByHospitalId(targetHospitalId);
      const [deptRows] = await targetPool.query(
        `SELECT DepartmentID FROM departments 
         WHERE HospitalID = ? AND IsActive = 1 
         ORDER BY DepartmentID ASC 
         LIMIT 1`,
        [targetHospitalId]
      );
      
      if (deptRows.length > 0) {
        defaultDepartmentId = deptRows[0].DepartmentID;
        console.log(`✅ تم العثور على قسم افتراضي للمستشفى ${targetHospitalId}: ${defaultDepartmentId}`);
      } else {
        console.log(`⚠️ لم يتم العثور على قسم في المستشفى ${targetHospitalId} - سيستخدم القسم 1`);
      }
    } catch (e) {
      console.warn('⚠️ خطأ في جلب القسم الافتراضي:', e.message);
      // نستخدم 1 كقيمة fallback (موجودة بالفعل في defaultDepartmentId)
    }

    // 5️⃣ جلب الأعمدة المتاحة في جدول complaints في المستشفى الهدف
    const targetPool = await getTenantPoolByHospitalId(targetHospitalId);
    let targetColumns = [];
    try {
      const [colRows] = await targetPool.query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'complaints'
      `);
      targetColumns = colRows.map(r => r.COLUMN_NAME);
      console.log(`✅ تم العثور على ${targetColumns.length} عمود في جدول complaints للمستشفى ${targetHospitalId}`);
    } catch (e) {
      console.warn('⚠️ خطأ في جلب أعمدة complaints:', e.message);
      // نستخدم قائمة افتراضية من الأعمدة الأساسية
      targetColumns = [
        'GlobalID', 'TicketNumber', 'HospitalID', 'DepartmentID', 'SubmissionType',
        'VisitDate', 'PatientFullName', 'PatientIDNumber', 'PatientMobile', 'GenderCode',
        'FileNumber', 'ComplaintTypeID', 'SubTypeID', 'Description', 'PriorityCode',
        'StatusCode', 'CreatedByUserID', 'CreatedAt', 'UpdatedAt', 'PatientID',
        'IsDeleted', 'DeletedAt', 'DeletedByUserID', 'DeleteReason',
        'AssignedToUserID', 'AssignedAt', 'AssignedByUserID'
      ];
    }

    // 6️⃣ تجهيز نسخة للقاعدة الجديدة (مع إزالة الأعمدة غير الموجودة)
    const newComplaint = {};
    
    // ننسخ فقط الأعمدة الموجودة في قاعدة البيانات الهدف
    for (const key in complaint) {
      if (targetColumns.includes(key)) {
        newComplaint[key] = complaint[key];
      } else {
        console.log(`⚠️ تم تجاهل العمود ${key} (غير موجود في قاعدة البيانات الهدف)`);
      }
    }
    
    // إزالة ComplaintID لتوليد ID جديد
    delete newComplaint.ComplaintID;
    
    // تحديث القيم المطلوبة
    newComplaint.HospitalID = targetHospitalId;
    if (targetColumns.includes('SourceHospitalID')) {
      newComplaint.SourceHospitalID = sourceHospitalId; // (اختياري) لتوثيق من أين أتى
    }
    newComplaint.StatusCode = 'OPEN';
    newComplaint.DepartmentID = defaultDepartmentId; // ✅ استخدام القسم الافتراضي (مضمون أنه ليس null)
    newComplaint.AssignedToUserID = null;
    if (targetColumns.includes('AssignedByUserID')) {
      newComplaint.AssignedByUserID = null;
    }
    if (targetColumns.includes('AssignedAt')) {
      newComplaint.AssignedAt = null;
    }
    newComplaint.CreatedByUserID = null;
    newComplaint.IsDeleted = 0;
    newComplaint.DeletedAt = null;
    newComplaint.DeletedByUserID = null;
    newComplaint.DeleteReason = null;
    newComplaint.CreatedAt = new Date();
    newComplaint.UpdatedAt = new Date();

    // 7️⃣ إدخاله في قاعدة المستشفى الهدف
    if (!targetConn) {
      targetConn = await targetPool.getConnection();
    }
    
    await targetConn.beginTransaction();
    
    const [insertResult] = await targetConn.query('INSERT INTO complaints SET ?', [newComplaint]);
    const newComplaintId = insertResult.insertId;

    // 8️⃣ إدخال المرفقات في قاعدة الهدف (إذا كانت موجودة)
    if (attachments.length > 0) {
      try {
        for (const att of attachments) {
          const { AttachmentID, ComplaintID, ...attData } = att;
          attData.ComplaintID = newComplaintId;
          await targetConn.query('INSERT INTO complaint_attachments SET ?', [attData]);
        }
        console.log(`✅ تم نقل ${attachments.length} مرفق`);
      } catch (e) {
        if (e.code !== 'ER_NO_SUCH_TABLE') throw e;
      }
    }

    // 9️⃣ إدخال الردود في قاعدة الهدف (إذا كانت موجودة)
    if (replies.length > 0) {
      try {
        for (const rep of replies) {
          const { ReplyID, ComplaintID, ...repData } = rep;
          repData.ComplaintID = newComplaintId;
          await targetConn.query('INSERT INTO complaint_replies SET ?', [repData]);
        }
        console.log(`✅ تم نقل ${replies.length} رد`);
      } catch (e) {
        if (e.code !== 'ER_NO_SUCH_TABLE') throw e;
      }
    }

    // 🔟 حذف البلاغ من قاعدة المستشفى الأصلية
    await sourceConn.query('DELETE FROM complaints WHERE ComplaintID=?', [complaintId]);

    // 1️⃣1️⃣ حذف المرفقات والردود من قاعدة المصدر (إذا كانت موجودة)
    try {
      await sourceConn.query('DELETE FROM complaint_attachments WHERE ComplaintID=?', [complaintId]);
    } catch (e) {
      if (e.code !== 'ER_NO_SUCH_TABLE') throw e;
    }

    try {
      await sourceConn.query('DELETE FROM complaint_replies WHERE ComplaintID=?', [complaintId]);
    } catch (e) {
      if (e.code !== 'ER_NO_SUCH_TABLE') throw e;
    }

    // ✅ تأكيد المعاملات
    await targetConn.commit();
    await sourceConn.commit();

    console.log(`✅ Complaint ${complaintId} moved from hospital ${sourceHospitalId} → ${targetHospitalId} (new ID: ${newComplaintId})`);

    res.json({
      ok: true,
      message: 'تم تحويل البلاغ بنجاح إلى المستشفى الجديد',
      newComplaintId: newComplaintId,
      sourceHospitalId: sourceHospitalId,
      targetHospitalId: targetHospitalId
    });

  } catch (err) {
    // التراجع عن المعاملات في حالة الخطأ
    if (targetConn) {
      try {
        await targetConn.rollback();
      } catch (e) {}
    }
    if (sourceConn) {
      try {
        await sourceConn.rollback();
      } catch (e) {}
    }
    
    console.error('❌ transferComplaintDirect error:', err);
    res.status(500).json({ ok: false, error: 'حدث خطأ أثناء التحويل: ' + err.message });
  } finally {
    if (targetConn) targetConn.release();
    if (sourceConn) sourceConn.release();
  }
}

// الاحتفاظ بالاسم القديم للتوافق
export const transferComplaintToHospital = transferComplaintDirect;

/**
 * تحويل البلاغ بين الأقسام
 * POST /api/complaints/:id/transfer/department
 */
export async function transferBetweenDepartments(req, res) {
  const complaintId = req.params.id;
  const { toDepartmentId, note } = req.body;
  const { UserID, HospitalID } = req.user;

  if (!toDepartmentId) {
    return res.status(400).json({ ok: false, error: 'حدد القسم الهدف' });
  }

  try {
    const tenant = await getTenantPoolByHospitalId(HospitalID);
    const conn = await tenant.getConnection();

    try {
      await conn.beginTransaction();

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

      if (Number(complaint.DepartmentID) === Number(toDepartmentId)) {
        throw new Error('القسم الهدف مطابق للقسم الحالي');
      }

      await conn.query(
        `UPDATE complaints SET DepartmentID = ? WHERE ComplaintID = ? AND HospitalID = ?`,
        [toDepartmentId, complaintId, HospitalID]
      );

      await conn.commit();
      res.json({ ok: true, message: 'تم تحويل البلاغ بنجاح' });
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
}

/**
 * تحويل البلاغ بين الموظفين
 * POST /api/complaints/:id/transfer/employee
 */
export async function transferBetweenEmployees(req, res) {
  const complaintId = req.params.id;
  const { toUserId, note } = req.body;
  const { UserID, HospitalID } = req.user;

  if (!toUserId) {
    return res.status(400).json({ ok: false, error: 'حدد الموظف الهدف' });
  }

  try {
    const tenant = await getTenantPoolByHospitalId(HospitalID);
    const conn = await tenant.getConnection();

    try {
      await conn.beginTransaction();

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

      await conn.query(
        `UPDATE complaints SET AssignedToUserID = ? WHERE ComplaintID = ? AND HospitalID = ?`,
        [toUserId, complaintId, HospitalID]
      );

      await conn.commit();
      res.json({ ok: true, message: 'تم تحويل البلاغ بنجاح' });
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
}

/**
 * الحصول على تاريخ تحويلات البلاغ
 * GET /api/complaints/:id/transfer/history
 */
export async function getTransferHistory(req, res) {
  const complaintId = req.params.id;
  const { HospitalID } = req.user;

  try {
    const tenant = await getTenantPoolByHospitalId(HospitalID);
    
    const [[complaint]] = await tenant.query(
      `SELECT ComplaintID FROM complaints WHERE ComplaintID = ? AND HospitalID = ?`,
      [complaintId, HospitalID]
    );

    if (!complaint) {
      return res.status(404).json({ ok: false, error: 'البلاغ غير موجود' });
    }

    res.json({
      ok: true,
      data: {
        departmentHistory: [],
        userHistory: []
      }
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'خطأ في الحصول على تاريخ التحويل' });
  }
}
