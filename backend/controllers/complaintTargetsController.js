// controllers/complaintTargetsController.js
// Controller للتعامل مع البلاغات الموجهة للموظفين

import { getContextualPool, getHospitalPool } from '../config/db.js';

/**
 * البحث عن موظفين
 * GET /api/complaint-targets/search-employees?q=اسم_الموظف
 */
export async function searchEmployees(req, res) {
  try {
    const user = req.user;
    const hospitalId = Number(req.hospitalId || user?.HospitalID || user?.hospitalId);
    const query = (req.query.q || '').trim();

    if (!hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'Hospital ID مفقود في التوكن'
      });
    }

    if (!query) {
      return res.json({ success: true, data: [] });
    }

    const hospitalPool = req.hospitalPool || await getContextualPool(user, req);

    // البحث عن الموظفين في قاعدة المستشفى
    const [rows] = await hospitalPool.query(
      `SELECT UserID, FullName, DepartmentID,
              (SELECT NameAr FROM departments WHERE DepartmentID = users.DepartmentID) as DepartmentName
       FROM users
       WHERE HospitalID = ? AND IsActive = 1 AND FullName LIKE ?
       LIMIT 10`,
      [hospitalId, `%${query}%`]
    );

    res.json({ success: true, data: rows });

  } catch (error) {
    console.error('خطأ في البحث عن الموظفين:', error);
    res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء البحث عن الموظفين',
      error: error.message
    });
  }
}

/**
 * إنشاء بلاغ على موظف
 * POST /api/complaint-targets
 */
export async function createComplaintTarget(req, res) {
  let conn;
  try {
    console.log('📥 [createComplaintTarget] ====== بدء معالجة طلب إنشاء بلاغ على موظف ======');
    console.log('📥 [createComplaintTarget] Headers:', {
      'x-hospital-id': req.headers['x-hospital-id'],
      'X-Hospital-Id': req.headers['X-Hospital-Id'],
      'authorization': req.headers['authorization'] ? 'موجود' : 'غير موجود'
    });
    console.log('📥 [createComplaintTarget] Body:', req.body);
    console.log('📥 [createComplaintTarget] User:', {
      UserID: req.user?.UserID,
      HospitalID: req.user?.HospitalID,
      hospitalId: req.user?.hospitalId
    });
    console.log('📥 [createComplaintTarget] req.hospitalId:', req.hospitalId);

    const user = req.user || {};
    const headers = req.headers || {};
    
    // ✅ استخراج hospitalId من جميع المصادر المحتملة
    let hospitalId =
      req.hospitalId ||
      headers['x-hospital-id'] ||
      headers['X-Hospital-Id'] ||
      headers['X-hospital-id'] ||
      req.body?.hospitalId ||
      req.body?.HospitalID ||
      user.HospitalID ||
      user.hospitalId ||
      null;

    if (typeof hospitalId === 'string') hospitalId = hospitalId.trim();
    if (hospitalId && !isNaN(hospitalId)) hospitalId = Number(hospitalId);
    else hospitalId = null;

    console.log(`🏥 [createComplaintTarget] hospitalId المستخرج: ${hospitalId}`);

    if (!hospitalId) {
      console.error('❌ [createComplaintTarget] لم يتم تحديد hospitalId');
      console.error('❌ [createComplaintTarget] المصادر المتاحة:', {
        reqHospitalId: req.hospitalId,
        headerXHospitalId: headers['x-hospital-id'],
        headerXHospitalIdCapital: headers['X-Hospital-Id'],
        userHospitalID: user.HospitalID,
        userHospitalId: user.hospitalId
      });
      return res.status(400).json({
        success: false,
        message: 'لم يتم تحديد معرف المستشفى (X-Hospital-Id)'
      });
    }

    let hospitalPool = req.hospitalPool;
    if (!hospitalPool) {
      console.warn('⚠️ [createComplaintTarget] لا يوجد hospitalPool مرفق، سيتم إنشاؤه يدوياً');
      try {
        hospitalPool = await getHospitalPool(hospitalId);
        req.hospitalPool = hospitalPool;
      } catch (poolErr) {
        console.error(`❌ لا يوجد اتصال لقاعدة بيانات المستشفى رقم ${hospitalId}:`, poolErr.message);
        return res.status(500).json({
          success: false,
          message: `فشل الاتصال بقاعدة بيانات المستشفى رقم ${hospitalId}`
        });
      }
    }

    if (!hospitalPool) {
      console.error(`❌ لم يتم العثور على hospitalPool للمستشفى ${hospitalId}`);
      return res.status(500).json({
        success: false,
        message: `تعذر الوصول لقاعدة بيانات المستشفى رقم ${hospitalId}`
      });
    }

    const { complaintId, targetEmployeeId, targetEmployeeName, targetDepartmentId, targetDepartmentName } = req.body;

    console.log('📋 [createComplaintTarget] البيانات المستلمة:', {
      complaintId,
      targetEmployeeId,
      targetEmployeeName,
      targetDepartmentId,
      targetDepartmentName
    });

    if (!complaintId) {
      console.error('❌ [createComplaintTarget] بيانات ناقصة:', {
        hasComplaintId: !!complaintId
      });
      return res.status(400).json({
        success: false,
        message: 'ComplaintID مطلوب'
      });
    }

    // ✅ اسم الموظف: نستخدم الاسم أو اسم القسم أو قيمة افتراضية
    let finalEmployeeName = (targetEmployeeName || '').trim();
    if (!finalEmployeeName && targetDepartmentName) {
      finalEmployeeName = `موظف في ${targetDepartmentName}`;
    } else if (!finalEmployeeName) {
      finalEmployeeName = 'موظف غير محدد';
    }
    
    console.log('📋 [createComplaintTarget] البيانات النهائية:', {
      complaintId,
      targetEmployeeId,
      targetEmployeeName: finalEmployeeName,
      targetDepartmentId,
      targetDepartmentName
    });

    console.log('🔌 [createComplaintTarget] الحصول على اتصال قاعدة البيانات...');
    conn = await hospitalPool.getConnection();
    await conn.beginTransaction();
    console.log('✅ [createComplaintTarget] تم بدء المعاملة');

    // حاول إيجاد البلاغ مع إعادة المحاولة في حال تأخر الكوميت السابق
    const findComplaintWithRetry = async (connection) => {
      let foundComplaint = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const [[row]] = await connection.query(
          `SELECT ComplaintID FROM complaints WHERE ComplaintID = ? LIMIT 1`,
          [complaintId]
        );
        if (row) {
          foundComplaint = row;
          break;
        }
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 150));
        }
      }
      return foundComplaint;
    };

    let existingComplaint = await findComplaintWithRetry(conn);

    if (!existingComplaint) {
      await conn.rollback();
      conn.release(); conn = null;

      // ⚙️ البحث في القاعدة المركزية عند عدم العثور في قاعدة المستشفى الحالية
      const centralPool = await getContextualPool(null, req);
      const [[centralComplaint]] = await centralPool.query(
        `SELECT ComplaintID, HospitalID FROM complaints WHERE ComplaintID = ? LIMIT 1`,
        [complaintId]
      );

      if (!centralComplaint) {
        return res.status(404).json({
          success: false,
          message: 'البلاغ غير موجود في أي قاعدة بيانات'
        });
      }

      const targetHospitalId = Number(centralComplaint.HospitalID);
      if (!targetHospitalId) {
        return res.status(500).json({
          success: false,
          message: 'تعذر تحديد المستشفى المرتبط بالبلاغ'
        });
      }

      // ✅ تحديث معرّف المستشفى والـ pool حسب نتيجة القاعدة المركزية
      req.hospitalId = targetHospitalId;
      hospitalPool = await getHospitalPool(targetHospitalId);
      req.hospitalPool = hospitalPool;

      conn = await hospitalPool.getConnection();
      await conn.beginTransaction();

      existingComplaint = await findComplaintWithRetry(conn);

      if (!existingComplaint) {
        await conn.rollback();
        conn.release(); conn = null;
        return res.status(404).json({
          success: false,
          message: 'البلاغ موجود مركزياً لكن غير متوفر في قاعدة المستشفى الهدف'
        });
      }
    }

    // إدراج البلاغ على الموظف
    console.log('💾 [createComplaintTarget] بدء إدراج السجل في complaint_targets...');
    const insertValues = [
      Number(complaintId),
      targetEmployeeId ? Number(targetEmployeeId) : null,
      finalEmployeeName,
      targetDepartmentId ? Number(targetDepartmentId) : null,
      targetDepartmentName || null
    ];
    
    console.log('💾 [createComplaintTarget] القيم المراد إدراجها:', insertValues);
    
    const [result] = await conn.query(
      `INSERT INTO complaint_targets 
       (ComplaintID, TargetEmployeeID, TargetEmployeeName, TargetDepartmentID, TargetDepartmentName, CreatedAt)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      insertValues
    );

    console.log('✅ [createComplaintTarget] تم إدراج السجل بنجاح:', {
      insertId: result.insertId,
      affectedRows: result.affectedRows
    });

    await conn.commit();
    console.log('✅ [createComplaintTarget] تم commit المعاملة بنجاح');
    conn.release(); conn = null;

    res.status(201).json({
      success: true,
      message: 'تم إنشاء بلاغ على موظف بنجاح',
      data: { 
        targetId: result.insertId, 
        complaintId: Number(complaintId),
        targetEmployeeName: finalEmployeeName
      }
    });
    
    console.log('✅ [createComplaintTarget] ====== اكتمل بنجاح ======');

  } catch (error) {
    console.error('❌ [createComplaintTarget] ====== خطأ في إنشاء بلاغ على موظف ======');
    console.error('❌ [createComplaintTarget] نوع الخطأ:', error.name);
    console.error('❌ [createComplaintTarget] رسالة الخطأ:', error.message);
    console.error('❌ [createComplaintTarget] Stack:', error.stack);
    
    if (conn) { 
      try { 
        await conn.rollback(); 
        console.log('🔄 [createComplaintTarget] تم rollback المعاملة');
      } catch(rollbackErr) {
        console.error('❌ [createComplaintTarget] فشل rollback:', rollbackErr.message);
      }
    }
    
    res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء إنشاء بلاغ على موظف',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  } finally {
    if (conn) {
      try {
        conn.release?.();
        console.log('🔌 [createComplaintTarget] تم إغلاق الاتصال');
      } catch(releaseErr) {
        console.error('❌ [createComplaintTarget] فشل إغلاق الاتصال:', releaseErr.message);
      }
    }
    console.log('🏁 [createComplaintTarget] ====== انتهت المعالجة ======');
  }
}

/**
 * جلب جميع البلاغات على الموظفين
 * GET /api/complaint-targets
 */
export async function getAllComplaintTargets(req, res) {
  try {
    const user = req.user;
    const hospitalId = Number(req.hospitalId || user?.HospitalID || user?.hospitalId);
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize || '20', 10)));
    const offset = (page - 1) * pageSize;

    // الفلاتر
    const employeeSearch = (req.query.employeeSearch || '').trim();
    const status = (req.query.status || '').trim();
    const priority = (req.query.priority || '').trim();

    if (!hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'Hospital ID مفقود في التوكن'
      });
    }

    const hospitalPool = req.hospitalPool || await getContextualPool(user, req);
    
    // بناء شروط البحث
    const whereConditions = ['c.HospitalID = ?'];
    const params = [hospitalId];

    if (employeeSearch) {
      whereConditions.push('(ct.TargetEmployeeName LIKE ? OR ct.TargetEmployeeID LIKE ?)');
      params.push(`%${employeeSearch}%`, `%${employeeSearch}%`);
    }

    if (status) {
      whereConditions.push('c.StatusCode = ?');
      params.push(status);
    }

    if (priority) {
      whereConditions.push('c.PriorityCode = ?');
      params.push(priority);
    }

    const whereClause = whereConditions.join(' AND ');

    // جلب البيانات مع الترقيم
    const [rows] = await hospitalPool.query(
      `SELECT 
        ct.TargetID,
        ct.ComplaintID,
        ct.TargetEmployeeID,
        ct.TargetEmployeeName,
        ct.TargetDepartmentID,
        ct.TargetDepartmentName,
        ct.CreatedAt,
        c.TicketNumber as ticket,
        c.PatientFullName as fullName,
        c.StatusCode as status,
        c.PriorityCode as priority,
        c.Description,
        c.CreatedAt as ComplaintCreatedAt,
        c.CreatedAt as createdAt,
        d.NameAr as DepartmentName
       FROM complaint_targets ct
       JOIN complaints c ON c.ComplaintID = ct.ComplaintID
       LEFT JOIN departments d ON d.DepartmentID = ct.TargetDepartmentID
       WHERE ${whereClause}
       ORDER BY ct.CreatedAt DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    // جلب العدد الإجمالي
    const [[countResult]] = await hospitalPool.query(
      `SELECT COUNT(*) as total
       FROM complaint_targets ct
       JOIN complaints c ON c.ComplaintID = ct.ComplaintID
       WHERE ${whereClause}`,
      params
    );

    const total = countResult.total;

    res.json({
      success: true,
      data: rows,
      pagination: {
        page,
        pageSize,
        total,
        pages: Math.ceil(total / pageSize)
      }
    });

  } catch (error) {
    console.error('خطأ في جلب البلاغات على الموظفين:', error);
    res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء جلب البلاغات',
      error: error.message
    });
  }
}

/**
 * حذف بلاغ على موظف
 * DELETE /api/complaint-targets/:targetId
 */
export async function deleteComplaintTarget(req, res) {
  try {
    const user = req.user;
    const hospitalId = Number(req.hospitalId || user?.HospitalID || user?.hospitalId);
    const targetId = parseInt(req.params.targetId, 10);

    if (!hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'Hospital ID مفقود في التوكن'
      });
    }

    if (!targetId || isNaN(targetId)) {
      return res.status(400).json({
        success: false,
        message: 'Target ID غير صحيح'
      });
    }

    const hospitalPool = req.hospitalPool || await getContextualPool(user, req);

    // التحقق من وجود البلاغ
    const [existing] = await hospitalPool.query(
      `SELECT ct.TargetID, c.HospitalID 
       FROM complaint_targets ct
       JOIN complaints c ON c.ComplaintID = ct.ComplaintID
       WHERE ct.TargetID = ? AND c.HospitalID = ?`,
      [targetId, hospitalId]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'البلاغ على الموظف غير موجود'
      });
    }

    // حذف البلاغ
    await hospitalPool.query(
      'DELETE FROM complaint_targets WHERE TargetID = ?',
      [targetId]
    );

    res.json({
      success: true,
      message: 'تم حذف البلاغ على الموظف بنجاح'
    });

  } catch (error) {
    console.error('خطأ في حذف البلاغ على الموظف:', error);
    res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء حذف البلاغ',
      error: error.message
    });
  }
}
