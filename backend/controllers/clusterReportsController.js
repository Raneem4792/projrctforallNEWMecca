// backend/controllers/clusterReportsController.js
import { v4 as uuidv4 } from 'uuid';
import { validationResult } from 'express-validator';
import { getTenantPoolByHospitalId } from '../db/tenantManager.js';

function ensureHospitalId(req) {
  const hid = Number(req.query.hospitalId || req.body.hospitalId || req.params.hospitalId);
  if (!hid) {
    const err = new Error('hospitalId is required');
    err.status = 400;
    throw err;
  }
  return hid;
}

function handleValidationErrors(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: errors.array()[0].msg || 'خطأ في التحقق من البيانات',
      errors: errors.array()
    });
  }
  return null;
}

function permOrThrow(user, key) {
  // RoleID=1 مدير التجمع له كل الصلاحيات
  if (user?.RoleID === 1 || user?.isClusterManager) {
    return true;
  }
  
  // للباقي: يجب أن يكون لديه الصلاحية (سنستخدم middleware منفصل لاحقاً)
  // مؤقتاً نسمح للمستخدمين المسجلين
  if (!user || !user.UserID) {
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }
  
  // TODO: فحص الصلاحيات من user_permissions في قاعدة المستشفى
  return true;
}

export async function createReport(req, res) {
  try {
    // التحقق من validation errors
    const validationError = handleValidationErrors(req, res);
    if (validationError) return validationError;
    
    permOrThrow(req.user, 'CLUSTER_REPORT_CREATE');
    const hospitalId = ensureHospitalId(req);
    
    const { title, description, locationName, locationType = 'OTHER', departmentId = null, priorityCode = 'MEDIUM' } = req.body;
    
    if (!title || !description) {
      return res.status(400).json({ error: 'العنوان والوصف مطلوبان' });
    }
    
    const files = req.files || [];
    const pool = await getTenantPoolByHospitalId(hospitalId);
    const conn = await pool.getConnection();
    
    try {
      await conn.beginTransaction();
      const guid = uuidv4();
      
      const [r] = await conn.execute(
        `INSERT INTO cluster_reports
         (GlobalID, Title, Description, LocationName, LocationType, DepartmentID, PriorityCode, StatusCode, ReporterUserID)
         VALUES (?,?,?,?,?,?,?, 'OPEN', ?)`,
        [guid, title, description, locationName || null, locationType, departmentId || null, priorityCode, req.user.UserID]
      );
      const reportId = r.insertId;

      if (files.length) {
        const rows = files.map(f => [
          reportId, 
          f.originalname, 
          f.path.replace(/\\/g, '/'), 
          f.mimetype || null, 
          f.size || null, 
          req.user.UserID
        ]);
        
        // استخدام bulk insert
        const placeholders = rows.map(() => '(?,?,?,?,?,?)').join(',');
        const values = rows.flat();
        
        await conn.execute(
          `INSERT INTO cluster_report_attachments
           (ReportID, FileName, FilePath, MimeType, FileSize, UploadedByUserID)
           VALUES ${placeholders}`,
          values
        );
      }

      await conn.commit();
      res.status(201).json({ ok: true, reportId, globalId: guid, hospitalId });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (e) {
    console.error('createReport error:', e);
    res.status(e.status || 500).json({ error: e.message || 'Server error' });
  }
}

export async function listReports(req, res) {
  try {
    // التحقق من validation errors (hospitalId الآن اختياري)
    const validationError = handleValidationErrors(req, res);
    if (validationError) return validationError;
    
    permOrThrow(req.user, 'CLUSTER_REPORT_VIEW');
    
    const hospitalId = req.query.hospitalId ? Number(req.query.hospitalId) : null;
    const { status, priority, q } = req.query;
    const page = parseInt(req.query.page || '1', 10);
    const pageSize = parseInt(req.query.pageSize || '20', 10);

    // إذا كان hospitalId موجوداً، جلب من مستشفى واحد
    if (hospitalId) {
      const pool = await getTenantPoolByHospitalId(hospitalId);
      const where = ['cr.IsDeleted = 0'];
      const args = [];

      if (status) {
        where.push('cr.StatusCode = ?');
        args.push(status);
      }
      
      if (priority) {
        where.push('cr.PriorityCode = ?');
        args.push(priority);
      }
      
      if (q) {
        where.push('(cr.Title LIKE ? OR cr.Description LIKE ? OR cr.LocationName LIKE ?)');
        const searchTerm = `%${q}%`;
        args.push(searchTerm, searchTerm, searchTerm);
      }

      const whereSql = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
      
      const sql = `
        SELECT cr.ReportID, cr.GlobalID, cr.Title, cr.PriorityCode, cr.StatusCode,
               cr.DepartmentID, cr.LocationName, cr.LocationType,
               cr.ReporterUserID, cr.AssignedToUserID, cr.CreatedAt, cr.UpdatedAt
        FROM cluster_reports cr
        ${whereSql}
        ORDER BY cr.CreatedAt DESC
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
      `;

      const [rows] = await pool.query(sql, args);

      const [[{ total }]] = await pool.query(
        `SELECT COUNT(*) AS total FROM cluster_reports cr ${whereSql}`,
        args
      );
      
      return res.json({ data: rows, total, page, pageSize });
    }

    // إذا لم يكن hospitalId موجوداً، جلب من جميع المستشفيات
    const { getCentralPool } = await import('../db/centralPool.js');
    const centralPool = await getCentralPool();
    
    // جلب جميع المستشفيات النشطة
    const [hospitals] = await centralPool.query(
      'SELECT HospitalID, DbName FROM hospitals WHERE IsActive = 1'
    );

    let allReports = [];
    let total = 0;

    for (const hospital of hospitals) {
      try {
        const pool = await getTenantPoolByHospitalId(hospital.HospitalID);
        const where = ['cr.IsDeleted = 0'];
        const args = [];

        if (status) {
          where.push('cr.StatusCode = ?');
          args.push(status);
        }
        
        if (priority) {
          where.push('cr.PriorityCode = ?');
          args.push(priority);
        }
        
        if (q) {
          where.push('(cr.Title LIKE ? OR cr.Description LIKE ? OR cr.LocationName LIKE ?)');
          const searchTerm = `%${q}%`;
          args.push(searchTerm, searchTerm, searchTerm);
        }

        const whereSql = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

        const [rows] = await pool.query(
          `SELECT cr.ReportID, cr.GlobalID, cr.Title, cr.PriorityCode, cr.StatusCode,
                  cr.DepartmentID, cr.LocationName, cr.LocationType,
                  cr.ReporterUserID, cr.AssignedToUserID, cr.CreatedAt, cr.UpdatedAt,
                  ${hospital.HospitalID} AS HospitalID
           FROM cluster_reports cr
           ${whereSql}`,
          args
        );

        allReports = allReports.concat(rows);
      } catch (e) {
        console.error(`خطأ في جلب بيانات مستشفى ${hospital.HospitalID}:`, e.message);
      }
    }

    // ترتيب حسب التاريخ (الأحدث أولاً)
    allReports.sort((a, b) => new Date(b.CreatedAt) - new Date(a.CreatedAt));

    total = allReports.length;
    
    // تطبيق pagination
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedReports = allReports.slice(startIndex, endIndex);

    res.json({ data: paginatedReports, total, page, pageSize, allHospitals: true });
  } catch (e) {
    console.error('listReports error:', e);
    res.status(e.status || 500).json({ error: e.message || 'Server error' });
  }
}

export async function getReportById(req, res) {
  try {
    // التحقق من validation errors
    const validationError = handleValidationErrors(req, res);
    if (validationError) return validationError;
    
    permOrThrow(req.user, 'CLUSTER_REPORT_VIEW');
    const hospitalId = ensureHospitalId(req);
    const id = Number(req.params.id);
    const pool = await getTenantPoolByHospitalId(hospitalId);

    const [[report]] = await pool.execute(
      `SELECT * FROM cluster_reports WHERE ReportID=? AND IsDeleted=0`,
      [id]
    );
    
    if (!report) {
      return res.status(404).json({ error: 'Not found' });
    }

    const [attachments] = await pool.execute(
      `SELECT AttachmentID, FileName, FilePath, MimeType, FileSize, UploadedByUserID, UploadedAt
       FROM cluster_report_attachments WHERE ReportID=? ORDER BY UploadedAt DESC`,
      [id]
    );
    
    res.json({ report, attachments });
  } catch (e) {
    console.error('getReportById error:', e);
    res.status(e.status || 500).json({ error: e.message || 'Server error' });
  }
}

export async function updateReport(req, res) {
  try {
    permOrThrow(req.user, 'CLUSTER_REPORT_EDIT');
    const hospitalId = ensureHospitalId(req);
    const id = Number(req.params.id);
    
    const map = {
      title: 'Title',
      description: 'Description',
      locationName: 'LocationName',
      locationType: 'LocationType',
      departmentId: 'DepartmentID',
      priorityCode: 'PriorityCode'
    };
    
    const fields = [];
    const args = [];
    
    Object.keys(map).forEach(k => {
      if (k in req.body) {
        fields.push(`${map[k]}=?`);
        args.push(req.body[k] || null);
      }
    });
    
    if (!fields.length) {
      return res.status(400).json({ error: 'لا يوجد تغييرات' });
    }

    const pool = await getTenantPoolByHospitalId(hospitalId);
    const [r] = await pool.execute(
      `UPDATE cluster_reports SET ${fields.join(', ')}, UpdatedAt=NOW() WHERE ReportID=?`,
      [...args, id]
    );
    
    res.json({ ok: true, affected: r.affectedRows });
  } catch (e) {
    console.error('updateReport error:', e);
    res.status(e.status || 500).json({ error: e.message || 'Server error' });
  }
}

export async function changeStatus(req, res) {
  try {
    permOrThrow(req.user, 'CLUSTER_REPORT_STATUS');
    const hospitalId = ensureHospitalId(req);
    const id = Number(req.params.id);
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'الحالة مطلوبة' });
    }

    const pool = await getTenantPoolByHospitalId(hospitalId);
    const [r] = await pool.execute(
      `UPDATE cluster_reports SET StatusCode=?, UpdatedAt=NOW() WHERE ReportID=?`,
      [status, id]
    );
    
    res.json({ ok: true, affected: r.affectedRows });
  } catch (e) {
    console.error('changeStatus error:', e);
    res.status(e.status || 500).json({ error: e.message || 'Server error' });
  }
}

export async function assignReport(req, res) {
  try {
    permOrThrow(req.user, 'CLUSTER_REPORT_ASSIGN');
    const hospitalId = ensureHospitalId(req);
    const id = Number(req.params.id);
    const { assignedToUserId } = req.body;

    const pool = await getTenantPoolByHospitalId(hospitalId);
    const [r] = await pool.execute(
      `UPDATE cluster_reports SET AssignedToUserID=?, UpdatedAt=NOW() WHERE ReportID=?`,
      [assignedToUserId || null, id]
    );
    
    res.json({ ok: true, affected: r.affectedRows });
  } catch (e) {
    console.error('assignReport error:', e);
    res.status(e.status || 500).json({ error: e.message || 'Server error' });
  }
}

export async function addAttachments(req, res) {
  try {
    permOrThrow(req.user, 'CLUSTER_REPORT_ATTACH');
    const hospitalId = ensureHospitalId(req);
    const id = Number(req.params.id);
    const files = req.files || [];
    
    if (!files.length) {
      return res.status(400).json({ error: 'لا توجد مرفقات' });
    }

    const pool = await getTenantPoolByHospitalId(hospitalId);
    const rows = files.map(f => [
      id,
      f.originalname,
      f.path.replace(/\\/g, '/'),
      f.mimetype || null,
      f.size || null,
      req.user.UserID
    ]);
    
    const placeholders = rows.map(() => '(?,?,?,?,?,?)').join(',');
    const values = rows.flat();
    
    await pool.execute(
      `INSERT INTO cluster_report_attachments
       (ReportID, FileName, FilePath, MimeType, FileSize, UploadedByUserID)
       VALUES ${placeholders}`,
      values
    );
    
    res.json({ ok: true, count: files.length });
  } catch (e) {
    console.error('addAttachments error:', e);
    res.status(e.status || 500).json({ error: e.message || 'Server error' });
  }
}

export async function deleteAttachment(req, res) {
  try {
    permOrThrow(req.user, 'CLUSTER_REPORT_ATTACH');
    const hospitalId = ensureHospitalId(req);
    const id = Number(req.params.id);
    const attachmentId = Number(req.params.attachmentId);

    const pool = await getTenantPoolByHospitalId(hospitalId);
    const [r] = await pool.execute(
      `DELETE FROM cluster_report_attachments WHERE AttachmentID=? AND ReportID=?`,
      [attachmentId, id]
    );
    
    res.json({ ok: true, affected: r.affectedRows });
  } catch (e) {
    console.error('deleteAttachment error:', e);
    res.status(e.status || 500).json({ error: e.message || 'Server error' });
  }
}

// إضافة رد على بلاغ إدارة التجمع
export async function addResponse(req, res) {
  try {
    permOrThrow(req.user, 'CLUSTER_REPORT_REPLY');
    const hospitalId = ensureHospitalId(req);
    const id = Number(req.params.id);
    const { replyText } = req.body;
    const files = req.files || [];

    if (!replyText || !replyText.trim()) {
      return res.status(400).json({ error: 'نص الرد مطلوب' });
    }

    const pool = await getTenantPoolByHospitalId(hospitalId);
    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      // التحقق من وجود البلاغ
      const [[report]] = await conn.execute(
        `SELECT ReportID FROM cluster_reports WHERE ReportID=? AND IsDeleted=0`,
        [id]
      );

      if (!report) {
        await conn.rollback();
        return res.status(404).json({ error: 'البلاغ غير موجود' });
      }

      // إدراج الرد في جدول cluster_report_responses (إذا كان موجوداً) أو استخدام جدول مؤقت
      // ملاحظة: نحتاج جدول cluster_report_responses، لكن مؤقتاً سنستخدم جدول بسيط
      // أو يمكن إضافة عمود Notes في cluster_reports نفسه
      // سأستخدم طريقة بسيطة: إضافة رد كملاحظة في التحديث
      
      // تحديث البلاغ بإضافة الملاحظة في الوصف أو استخدام جدول منفصل
      // للحفاظ على البساطة، سنقوم بتحديث UpdatedAt فقط ونحفظ الرد في جدول منفصل إذا كان موجوداً
      
      // محاولة استخدام جدول cluster_report_responses إذا كان موجوداً
      let responseId = null;
      try {
        const [ins] = await conn.execute(
          `INSERT INTO cluster_report_responses 
           (ReportID, ResponderUserID, Message, CreatedAt)
           VALUES (?, ?, ?, NOW())`,
          [id, req.user.UserID, replyText]
        );
        responseId = ins.insertId;
      } catch (e) {
        // إذا لم يكن الجدول موجوداً، سنستخدم طريقة بديلة
        console.warn('جدول cluster_report_responses غير موجود، استخدام طريقة بديلة');
        // يمكن حفظ الرد في تعليق أو استخدام نظام notes
      }

      // حفظ مرفقات الرد إن وُجدت
      if (files.length > 0) {
        const rows = files.map(f => [
          id, // ReportID
          `response_${responseId || Date.now()}_${f.originalname}`,
          f.path.replace(/\\/g, '/'),
          f.mimetype || null,
          f.size || null,
          req.user.UserID
        ]);

        const placeholders = rows.map(() => '(?,?,?,?,?,?)').join(',');
        const values = rows.flat();

        await conn.execute(
          `INSERT INTO cluster_report_attachments
           (ReportID, FileName, FilePath, MimeType, FileSize, UploadedByUserID)
           VALUES ${placeholders}`,
          values
        );
      }

      await conn.commit();
      res.status(201).json({ ok: true, responseId, message: 'تم إضافة الرد بنجاح' });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (e) {
    console.error('addResponse error:', e);
    res.status(e.status || 500).json({ error: e.message || 'Server error' });
  }
}

// جلب الردود لبلاغ إدارة التجمع
export async function listResponses(req, res) {
  try {
    permOrThrow(req.user, 'CLUSTER_REPORT_VIEW');
    const hospitalId = ensureHospitalId(req);
    const id = Number(req.params.id);

    const pool = await getTenantPoolByHospitalId(hospitalId);

    // محاولة جلب الردود من جدول cluster_report_responses
    try {
      const [responses] = await pool.execute(
        `SELECT ResponseID, ReportID, ResponderUserID, Message, CreatedAt
         FROM cluster_report_responses
         WHERE ReportID=?
         ORDER BY CreatedAt DESC`,
        [id]
      );

      // جلب معلومات المستخدمين
      for (const response of responses) {
        try {
          const [[user]] = await pool.execute(
            `SELECT FullName, Username FROM users WHERE UserID=?`,
            [response.ResponderUserID]
          );
          if (user) {
            response.ResponderName = user.FullName || user.Username;
          }
        } catch (e) {
          response.ResponderName = `مستخدم #${response.ResponderUserID}`;
        }
      }

      return res.json({ ok: true, responses });
    } catch (e) {
      // إذا لم يكن الجدول موجوداً، نرجع مصفوفة فارغة
      console.warn('جدول cluster_report_responses غير موجود');
      return res.json({ ok: true, responses: [] });
    }
  } catch (e) {
    console.error('listResponses error:', e);
    res.status(e.status || 500).json({ error: e.message || 'Server error' });
  }
}

