// controllers/complaintTargetsController.js
// Controller للتعامل مع البلاغات الموجهة للموظفين

import { getContextualPool } from '../config/db.js';

/**
 * البحث عن موظفين
 * GET /api/complaint-targets/search-employees?q=اسم_الموظف
 */
export async function searchEmployees(req, res) {
  try {
    const user = req.user;
    const hospitalId = Number(user?.HospitalID || user?.hospitalId);
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

    const hospitalPool = await getContextualPool(user);

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
    const user = req.user;
    const hospitalId = Number(user?.HospitalID || user?.hospitalId);
    const { complaintId, targetEmployeeId, targetEmployeeName, targetDepartmentId, targetDepartmentName } = req.body;

    if (!hospitalId) {
      return res.status(400).json({
        success: false,
        message: 'Hospital ID مفقود في التوكن'
      });
    }

    if (!complaintId || !targetEmployeeName) {
      return res.status(400).json({
        success: false,
        message: 'ComplaintID و TargetEmployeeName مطلوبان'
      });
    }

    const hospitalPool = await getContextualPool(user);
    conn = await hospitalPool.getConnection();
    await conn.beginTransaction();

    // إدراج البلاغ على الموظف
    const [result] = await conn.query(
      `INSERT INTO complaint_targets (ComplaintID, TargetEmployeeID, TargetEmployeeName, TargetDepartmentID, TargetDepartmentName)
       VALUES (?, ?, ?, ?, ?)`,
      [complaintId, targetEmployeeId || null, targetEmployeeName, targetDepartmentId || null, targetDepartmentName || null]
    );

    await conn.commit();
    conn.release(); conn = null;

    res.status(201).json({
      success: true,
      message: 'تم إنشاء بلاغ على موظف بنجاح',
      data: { targetId: result.insertId, complaintId }
    });

  } catch (error) {
    if (conn) { try { await conn.rollback(); } catch(e){} }
    console.error('خطأ في إنشاء بلاغ على موظف:', error);
    res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء إنشاء بلاغ على موظف',
      error: error.message
    });
  } finally {
    if (conn) conn.release?.();
  }
}

/**
 * جلب جميع البلاغات على الموظفين
 * GET /api/complaint-targets
 */
export async function getAllComplaintTargets(req, res) {
  try {
    const user = req.user;
    const hospitalId = Number(user?.HospitalID || user?.hospitalId);
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

    const hospitalPool = await getContextualPool(user);
    
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
    const hospitalId = Number(user?.HospitalID || user?.hospitalId);
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

    const hospitalPool = await getContextualPool(user);

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
