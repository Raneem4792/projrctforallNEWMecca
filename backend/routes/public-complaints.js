// backend/routes/public-complaints.js
import express from 'express';
import mysql from 'mysql2/promise';
import { getCentralPool } from '../db/centralPool.js';
import { getTenantPoolByHospitalId } from '../db/tenantManager.js';

const router = express.Router();

/**
 * GET /api/public/complaints/timeline?ticket=B1544096
 * يرجّع خط الزمن العام (بدون الردود الداخلية IsInternal=1)
 */
router.get('/complaints/timeline', async (req, res) => {
  const ticket = (req.query.ticket || '').trim();
  if (!ticket) return res.status(400).json({ ok:false, error:'ticket مطلوب' });

  try {
    const central = await getCentralPool();

    // نجيب قائمة المستشفيات ونبحث عن البلاغ بالتذكرة
    const [hospitals] = await central.query(
      'SELECT HospitalID, NameAr FROM hospitals WHERE IsActive=1'
    );

    let found = null;
    let pool = null;

    for (const h of hospitals) {
      const p = await getTenantPoolByHospitalId(h.HospitalID);
      const [rows] = await p.query(
        'SELECT ComplaintID, GlobalID, HospitalID, DepartmentID, PriorityCode, StatusCode, CreatedAt, TicketNumber \
         FROM complaints WHERE TicketNumber = ? LIMIT 1',
        [ticket]
      );
      if (rows.length) {
        found = { ...rows[0], HospitalName: h.NameAr };
        pool = p;
        break;
      }
    }

    if (!found) {
      return res.status(404).json({ ok:false, error:'لم يتم العثور على البلاغ بهذا الرقم' });
    }

    // تجميع خط الزمن (أحداث الحالة + الردود العامة فقط)
    // مع Fallback للقواعد القديمة التي لا تحتوي على عمود Note
    let hist;
    try {
      [hist] = await pool.query(
        'SELECT ChangedAt AS EventAt, OldStatusCode, NewStatusCode, Note, ChangedByUserID \
         FROM complaint_status_history WHERE ComplaintID=? ORDER BY ChangedAt ASC',
        [found.ComplaintID]
      );
    } catch (err) {
      if (err && err.code === 'ER_BAD_FIELD_ERROR') {
        // نسخة قديمة بدون Note → رجّع NULL بدلًا منه
        [hist] = await pool.query(
          'SELECT ChangedAt AS EventAt, OldStatusCode, NewStatusCode, NULL AS Note, ChangedByUserID \
           FROM complaint_status_history WHERE ComplaintID=? ORDER BY ChangedAt ASC',
          [found.ComplaintID]
        );
      } else {
        throw err;
      }
    }

    const [replies] = await pool.query(
      'SELECT CreatedAt AS EventAt, Message, ReplyTypeID, TargetStatusCode, ResponderUserID \
       FROM complaint_responses WHERE ComplaintID=? AND IsInternal=0 ORDER BY CreatedAt ASC',
      [found.ComplaintID]
    );

    const timeline = [
      { type:'created',  at: found.CreatedAt, status: found.StatusCode, note: 'تم إنشاء البلاغ' },
      ...hist.map(h => ({ type:'status', at: h.EventAt, old: h.OldStatusCode, new: h.NewStatusCode, note: h.Note })),
      ...replies.map(r => ({ type:'reply',  at: r.EventAt, msg: r.Message, targetStatus: r.TargetStatusCode, replyTypeId: r.ReplyTypeID }))
    ].sort((a,b)=> new Date(a.at) - new Date(b.at));

    res.json({
      ok: true,
      ticket: found.TicketNumber,
      hospitalId: found.HospitalID,
      hospitalName: found.HospitalName,
      priority: found.PriorityCode,
      status: found.StatusCode,
      createdAt: found.CreatedAt,
      timeline
    });

  } catch (err) {
    console.error('Public timeline error:', err);
    res.status(500).json({ ok:false, error:'تعذّر تحميل سير البلاغ' });
  }
});

/**
 * GET /api/public/complaints/urgent-all
 * 🔍 جلب البلاغات الحرجة
 * - إذا كان hospitalId موجود: يجلب فقط من هذا المستشفى
 * - إذا لم يكن موجود: يجلب من جميع المستشفيات (لمدير التجمع)
 * لا يتطلب تسجيل دخول - يعمل للجميع
 */
router.get('/complaints/urgent-all', async (req, res) => {
  try {
    const centralPool = await getCentralPool();
    const hospitalId = req.query.hospitalId ? Number(req.query.hospitalId) : null;

    // بناء استعلام المستشفيات
    let hospitalsQuery = `
      SELECT HospitalID, NameAr, NameEn, DbHost, DbUser, DbPass, DbName
      FROM hospitals
      WHERE COALESCE(IsActive, Active, 1) = 1 AND DbName IS NOT NULL
    `;
    const hospitalsParams = [];

    // إذا كان hospitalId موجود، نفلتر حسبه
    if (hospitalId) {
      hospitalsQuery += ` AND HospitalID = ?`;
      hospitalsParams.push(hospitalId);
    }

    // جلب المستشفيات (مفلترة أو كلها)
    const [hospitals] = await centralPool.query(hospitalsQuery, hospitalsParams);

    if (!hospitals || hospitals.length === 0) {
      return res.json({ 
        success: true, 
        hasUrgent: false, 
        complaints: [],
        count: 0
      });
    }

    const urgentComplaints = [];

    // المرور على كل قاعدة مستشفى
    for (const hospital of hospitals) {
      try {
        const pool = mysql.createPool({
          host: hospital.DbHost || 'localhost',
          user: hospital.DbUser || 'root',
          password: hospital.DbPass || '',
          database: hospital.DbName,
          waitForConnections: true,
          connectionLimit: 3
        });

        const [rows] = await pool.query(`
          SELECT 
            c.ComplaintID,
            c.TicketNumber,
            c.HospitalID,
            c.DepartmentID,
            c.Description,
            c.PriorityCode,
            c.StatusCode,
            c.CreatedAt,
            d.NameAr AS DepartmentNameAr,
            d.NameEn AS DepartmentNameEn
          FROM complaints c
          LEFT JOIN departments d ON c.DepartmentID = d.DepartmentID
          WHERE c.PriorityCode IN ('URGENT', 'urgent', 'حرجة', 'عاجل', 'CRITICAL', 'critical')
            AND c.IsDeleted = 0
            AND c.StatusCode != 'CLOSED'
          ORDER BY c.CreatedAt DESC
        `);

        for (const c of rows) {
          urgentComplaints.push({
            ComplaintID: c.ComplaintID,
            TicketNumber: c.TicketNumber,
            HospitalID: hospital.HospitalID,
            HospitalNameAr: hospital.NameAr || 'غير محدد',
            HospitalNameEn: hospital.NameEn || 'Unknown',
            DepartmentID: c.DepartmentID,
            DepartmentNameAr: c.DepartmentNameAr || 'غير محدد',
            DepartmentNameEn: c.DepartmentNameEn || 'Unknown',
            Description: c.Description || '',
            PriorityCode: c.PriorityCode,
            StatusCode: c.StatusCode,
            CreatedAt: c.CreatedAt
          });
        }

        await pool.end();
      } catch (err) {
        console.warn(`⚠️ فشل جلب البلاغات من ${hospital.NameAr || hospital.HospitalID}:`, err.message);
        // نكمل البحث في المستشفيات الأخرى
      }
    }

    return res.json({
      success: true,
      hasUrgent: urgentComplaints.length > 0,
      count: urgentComplaints.length,
      complaints: urgentComplaints
    });

  } catch (err) {
    console.error('❌ خطأ في جلب البلاغات الحرجة:', err);
    res.status(500).json({ 
      success: false, 
      message: 'حدث خطأ أثناء جلب البلاغات الحرجة', 
      error: err.message 
    });
  }
});

/**
 * GET /api/public/complaints/check-urgent
 * فحص مستمر للبلاغات الحرجة الجديدة
 * لا يتطلب تسجيل دخول - يعمل للجميع
 * يمكن تمرير lastChecked لتجنب إظهار البلاغات القديمة
 */
router.get('/complaints/check-urgent', async (req, res) => {
  try {
    const lastChecked = req.query.lastChecked ? new Date(req.query.lastChecked) : null;
    const centralPool = await getCentralPool();
    
    // جلب جميع المستشفيات النشطة مع أسمائها
    const [hospitalsRows] = await centralPool.query(`
      SELECT HospitalID, NameAr, NameEn, DbHost, DbUser, DbPass, DbName
      FROM hospitals 
      WHERE COALESCE(IsActive, Active, 1) = 1 AND DbName IS NOT NULL
    `);
    
    if (!hospitalsRows || hospitalsRows.length === 0) {
      return res.json({
        success: true,
        hasNewUrgent: false,
        message: 'لا توجد مستشفيات نشطة'
      });
    }

    let latestUrgent = null;
    let latestCreatedAt = null;
    let hospitalInfo = null;

    // البحث في كل مستشفى عن البلاغات الحرجة الجديدة
    for (const hospital of hospitalsRows) {
      try {
        const hospitalPool = mysql.createPool({
          host: hospital.DbHost || 'localhost',
          user: hospital.DbUser || 'root',
          password: hospital.DbPass || '',
          database: hospital.DbName,
          waitForConnections: true,
          connectionLimit: 3
        });

        // بناء الاستعلام مع فلتر الوقت إذا كان موجوداً
        let sql = `
          SELECT 
            c.ComplaintID,
            c.TicketNumber,
            c.HospitalID,
            c.DepartmentID,
            c.Description,
            c.PriorityCode,
            c.CreatedAt,
            d.NameAr AS DepartmentNameAr,
            d.NameEn AS DepartmentNameEn
          FROM complaints c
          LEFT JOIN departments d ON c.DepartmentID = d.DepartmentID
          WHERE c.PriorityCode IN ('URGENT', 'urgent', 'حرجة', 'عاجل', 'CRITICAL', 'critical')
            AND c.IsDeleted = 0
            AND c.StatusCode != 'CLOSED'
        `;
        
        const params = [];
        if (lastChecked) {
          sql += ` AND c.CreatedAt > ?`;
          params.push(lastChecked);
        }
        
        sql += ` ORDER BY c.CreatedAt DESC LIMIT 1`;

        const [urgentComplaints] = await hospitalPool.query(sql, params);

        if (urgentComplaints && urgentComplaints.length > 0) {
          const complaint = urgentComplaints[0];
          const complaintCreatedAt = new Date(complaint.CreatedAt);
          
          // مقارنة مع أحدث بلاغ موجود
          if (!latestCreatedAt || complaintCreatedAt > latestCreatedAt) {
            latestUrgent = complaint;
            latestCreatedAt = complaintCreatedAt;
            hospitalInfo = {
              HospitalID: hospital.HospitalID,
              NameAr: hospital.NameAr || 'غير محدد',
              NameEn: hospital.NameEn || 'Unknown'
            };
          }
        }

        await hospitalPool.end();
      } catch (error) {
        console.error(`❌ خطأ في البحث في مستشفى ${hospital.HospitalID}:`, error.message);
        // نكمل البحث في المستشفيات الأخرى
      }
    }

    if (latestUrgent) {
      return res.json({
        success: true,
        hasNewUrgent: true,
        complaint: {
          ComplaintID: latestUrgent.ComplaintID,
          TicketNumber: latestUrgent.TicketNumber,
          HospitalID: latestUrgent.HospitalID,
          HospitalNameAr: hospitalInfo?.NameAr || 'غير محدد',
          HospitalNameEn: hospitalInfo?.NameEn || 'Unknown',
          DepartmentID: latestUrgent.DepartmentID,
          DepartmentNameAr: latestUrgent.DepartmentNameAr || 'غير محدد',
          DepartmentNameEn: latestUrgent.DepartmentNameEn || 'Unknown',
          Description: latestUrgent.Description,
          PriorityCode: latestUrgent.PriorityCode,
          CreatedAt: latestUrgent.CreatedAt
        }
      });
    }

    return res.json({
      success: true,
      hasNewUrgent: false,
      message: 'لا توجد بلاغات حرجة جديدة'
    });

  } catch (error) {
    console.error('❌ خطأ في فحص البلاغات الحرجة:', error);
    res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء فحص البلاغات الحرجة',
      error: error.message
    });
  }
});

export default router;
