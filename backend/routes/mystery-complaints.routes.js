// routes/mystery-complaints.routes.js
import express from 'express';
import { getTenantPoolByHospitalId } from '../db/tenantManager.js';
import { getCentralPool } from '../db/centralPool.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissionGuard.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(requireAuth);

// التحقق من وجود السجل
router.get('/mystery-complaints/:id/exists', 
  requirePermission('MYSTERY_VIEW'),
  async (req, res) => {
  try {
    const mysteryId = req.params.id;
    const hospitalId = Number(req.query.hospitalId || req.user?.HospitalID);
    
    if (!hospitalId) {
      return res.status(400).json({ error: 'hospitalId is required' });
    }

    const pool = await getTenantPoolByHospitalId(hospitalId);
    if (!pool) return res.status(500).json({ error: 'No pool for hospital' });

    // التحقق من وجود السجل
    const [rows] = await pool.query(
      'SELECT MysteryID FROM mystery_complaints WHERE MysteryID = ? LIMIT 1',
      [mysteryId]
    );
    
    const exists = rows.length > 0;
    
    if (!exists) {
      // جلب أقصى ID متاح
      const [maxRow] = await pool.query('SELECT MAX(MysteryID) as maxId FROM mystery_complaints');
      const maxId = maxRow[0].maxId;
      
      return res.json({
        exists: false,
        maxId: maxId,
        message: `Mystery ID ${mysteryId} not found. Max available: ${maxId}`
      });
    }
    
    res.json({ exists: true, message: 'Mystery exists' });
  } catch (err) {
    console.error('Check mystery exists error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/mystery-complaints
 * Query:
 *  - hospitalId (إلزامي للموظف العادي، اختياري لمدير التجمع)
 *  - q, domain, department, from, to, status, priority
 */
router.get('/mystery-complaints', 
  requirePermission('MYSTERY_MODULE'),
  requirePermission('MYSTERY_VIEW'),
  async (req, res) => {
  try {
    // 1) تحديد المستشفى
    const hospitalId = Number(req.query.hospitalId || req.user?.HospitalID);
    const isClusterManager = req.user?.RoleID === 1 || req.user?.IsClusterManager === true;
    
    if (!hospitalId && !isClusterManager) {
      return res.status(400).json({ error: 'hospitalId is required for regular users' });
    }

    // 2) لمدير التجمع: نجلب من جميع المستشفيات
    if (isClusterManager && !hospitalId) {
      return await fetchAllHospitalsData(req, res);
    }

    // 3) للموظف العادي أو مدير التجمع مع مستشفى محدد
    const pool = await getTenantPoolByHospitalId(hospitalId);
    if (!pool) return res.status(500).json({ error: 'No pool for hospital' });

    // 4) فلاتر
    const { q, domain, department, from, to, status, priority } = req.query;
    const where = [];
    const args = [];

    if (q) {
      where.push(`(DomainAr LIKE ? OR DomainEn LIKE ? OR QuestionAr LIKE ? OR QuestionEn LIKE ? OR DepartmentName LIKE ? OR Comment LIKE ?)`);
      for (let i = 0; i < 6; i++) args.push(`%${q}%`);
    }
    if (domain)     { where.push(`(DomainAr LIKE ? OR DomainEn LIKE ?)`); args.push(`%${domain}%`,`%${domain}%`); }
    if (department) { where.push(`DepartmentName LIKE ?`); args.push(`%${department}%`); }
    if (from)       { where.push(`(VisitDate IS NULL OR VisitDate >= ?)`); args.push(from); }
    if (to)         { where.push(`(VisitDate IS NULL OR VisitDate <= ?)`); args.push(to); }
    if (status)     { where.push(`Status = ?`);    args.push(status); }
    if (priority)   { where.push(`Priority = ?`);  args.push(priority); }

    // 5) الاستعلام مع fallback (بدون جدول hospitals لأنه في القاعدة المركزية)
    let rows;
    try {
      [rows] = await pool.query(`
        SELECT
          m.MysteryID, m.HospitalID, m.VisitDate,
          m.DepartmentID, 
          COALESCE(m.DepartmentName, d.NameAr) AS DepartmentName,
          m.AssignedToUserID,
          m.DomainAr, m.DomainEn,
          m.QuestionAr, m.QuestionEn,
          m.MeanScore, m.Score, m.Comment,
          m.Priority, m.Status,
          m.TicketNumber, m.PeriodFrom, m.PeriodTo,
          m.SourceFile, m.CreatedByUserID,
          m.CreatedAt, m.UpdatedAt,
          u1.FullName AS CreatedByUserName,
          u2.FullName AS AssignedToUserName
        FROM mystery_complaints m
        LEFT JOIN departments d ON d.DepartmentID = m.DepartmentID
        LEFT JOIN users u1 ON u1.UserID = m.CreatedByUserID
        LEFT JOIN users u2 ON u2.UserID = m.AssignedToUserID
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY COALESCE(m.VisitDate, m.CreatedAt) DESC, m.MysteryID DESC
        LIMIT 500
      `, args);
    } catch (e) {
      if (e.code === 'ER_BAD_FIELD_ERROR') {
        [rows] = await pool.query(`
          SELECT
            m.MysteryID, m.HospitalID, m.VisitDate,
            m.DepartmentID,
            COALESCE(m.DepartmentName, d.NameAr) AS DepartmentName,
            m.DomainAr, m.DomainEn,
            m.QuestionAr, m.QuestionEn,
            m.MeanScore, m.Score, m.Comment,
            m.Priority, m.Status,
            m.TicketNumber, m.PeriodFrom, m.PeriodTo,
            m.SourceFile, m.CreatedByUserID,
            m.CreatedAt, m.UpdatedAt,
            u1.FullName AS CreatedByUserName,
            NULL AS AssignedToUserID,
            NULL AS AssignedToUserName
          FROM mystery_complaints m
          LEFT JOIN departments d ON d.DepartmentID = m.DepartmentID
          LEFT JOIN users u1 ON u1.UserID = m.CreatedByUserID
          ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
          ORDER BY COALESCE(m.VisitDate, m.CreatedAt) DESC, m.MysteryID DESC
          LIMIT 500
        `, args);
      } else {
        throw e;
      }
    }
    
    // جلب أسماء المستشفيات من القاعدة المركزية
    if (rows && rows.length > 0) {
      try {
        const centralPool = await getCentralPool();
        if (centralPool) {
          const [[hospital]] = await centralPool.query(
            'SELECT NameAr FROM hospitals WHERE HospitalID = ? LIMIT 1',
            [hospitalId]
          );
          const hospitalName = hospital?.NameAr || null;
          // إضافة اسم المستشفى لكل صف
          rows = rows.map(row => ({ ...row, HospitalName: hospitalName }));
        }
      } catch (e) {
        console.error('Error fetching hospital name:', e);
      }
    }
    
    return res.json(rows);
  } catch (err) {
    console.error('GET /api/mystery-complaints error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// دالة لجلب البيانات من جميع المستشفيات لمدير التجمع
async function fetchAllHospitalsData(req, res) {
  try {
    const centralPool = await getCentralPool();
    if (!centralPool) return res.status(500).json({ error: 'Central database connection failed' });

    // جلب قائمة المستشفيات النشطة
    const [hospitals] = await centralPool.query(`
      SELECT HospitalID, NameAr, NameEn, Code 
      FROM hospitals 
      WHERE IsActive = 1 
      ORDER BY SortOrder ASC, NameAr ASC
    `);

    const allResults = [];
    const { q, domain, department, from, to, status, priority } = req.query;

    // بناء الفلاتر
    const where = [];
    const args = [];

    if (q) {
      where.push(`(DomainAr LIKE ? OR DomainEn LIKE ? OR QuestionAr LIKE ? OR QuestionEn LIKE ? OR DepartmentName LIKE ? OR Comment LIKE ?)`);
      for (let i = 0; i < 6; i++) args.push(`%${q}%`);
    }
    if (domain)     { where.push(`(DomainAr LIKE ? OR DomainEn LIKE ?)`); args.push(`%${domain}%`,`%${domain}%`); }
    if (department) { where.push(`DepartmentName LIKE ?`); args.push(`%${department}%`); }
    if (from)       { where.push(`(VisitDate IS NULL OR VisitDate >= ?)`); args.push(from); }
    if (to)         { where.push(`(VisitDate IS NULL OR VisitDate <= ?)`); args.push(to); }
    if (status)     { where.push(`Status = ?`);    args.push(status); }
    if (priority)   { where.push(`Priority = ?`);  args.push(priority); }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    // جلب البيانات من كل مستشفى
    for (const hospital of hospitals) {
      try {
        const pool = await getTenantPoolByHospitalId(hospital.HospitalID);
        if (!pool) continue;

        let rows;
        try {
          [rows] = await pool.query(`
            SELECT
              m.MysteryID, m.HospitalID, m.VisitDate,
              m.DepartmentID,
              COALESCE(m.DepartmentName, d.NameAr) AS DepartmentName,
              m.AssignedToUserID,
              m.DomainAr, m.DomainEn,
              m.QuestionAr, m.QuestionEn,
              m.MeanScore, m.Score, m.Comment,
              m.Priority, m.Status,
              m.TicketNumber, m.PeriodFrom, m.PeriodTo,
              m.SourceFile, m.CreatedByUserID,
              m.CreatedAt, m.UpdatedAt,
              '${hospital.NameAr}' as HospitalName,
              u1.FullName AS CreatedByUserName,
              u2.FullName AS AssignedToUserName
            FROM mystery_complaints m
            LEFT JOIN departments d ON d.DepartmentID = m.DepartmentID
            LEFT JOIN users u1 ON u1.UserID = m.CreatedByUserID
            LEFT JOIN users u2 ON u2.UserID = m.AssignedToUserID
            ${whereClause}
            ORDER BY COALESCE(m.VisitDate, m.CreatedAt) DESC, m.MysteryID DESC
            LIMIT 100
          `, args);
        } catch (e) {
          if (e.code === 'ER_BAD_FIELD_ERROR') {
            [rows] = await pool.query(`
              SELECT
                m.MysteryID, m.HospitalID, m.VisitDate,
                m.DepartmentID,
                COALESCE(m.DepartmentName, d.NameAr) AS DepartmentName,
                m.DomainAr, m.DomainEn,
                m.QuestionAr, m.QuestionEn,
                m.MeanScore, m.Score, m.Comment,
                m.Priority, m.Status,
                m.TicketNumber, m.PeriodFrom, m.PeriodTo,
                m.SourceFile, m.CreatedByUserID,
                m.CreatedAt, m.UpdatedAt,
                '${hospital.NameAr}' as HospitalName,
                u1.FullName AS CreatedByUserName,
                NULL AS AssignedToUserID,
                NULL AS AssignedToUserName
              FROM mystery_complaints m
              LEFT JOIN departments d ON d.DepartmentID = m.DepartmentID
              LEFT JOIN users u1 ON u1.UserID = m.CreatedByUserID
              ${whereClause}
              ORDER BY COALESCE(m.VisitDate, m.CreatedAt) DESC, m.MysteryID DESC
              LIMIT 100
            `, args);
          } else {
            throw e;
          }
        }
        allResults.push(...rows);
      } catch (err) {
        console.error(`Error fetching data for hospital ${hospital.HospitalID}:`, err);
        continue;
      }
    }

    // ترتيب النتائج حسب التاريخ
    allResults.sort((a, b) => {
      const dateA = new Date(a.VisitDate || a.CreatedAt);
      const dateB = new Date(b.VisitDate || b.CreatedAt);
      return dateB - dateA;
    });

    return res.json(allResults.slice(0, 1000)); // حد أقصى 1000 نتيجة
  } catch (err) {
    console.error('fetchAllHospitalsData error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

/**
 * GET /api/mystery-complaints/:id
 * الحصول على تفاصيل تقييم واحد
 */
router.get('/mystery-complaints/:id', 
  requirePermission('MYSTERY_VIEW'),
  async (req, res) => {
  try {
    const mysteryId = req.params.id;
    const hospitalId = Number(req.query.hospitalId || req.user?.HospitalID);
    
    if (!hospitalId) {
      return res.status(400).json({ error: 'hospitalId is required' });
    }

    const pool = await getTenantPoolByHospitalId(hospitalId);
    if (!pool) return res.status(500).json({ error: 'No pool for hospital' });

    let row;
    try {
      // محاولة مع AssignedToUserID (إذا كان موجوداً)
      const [rows] = await pool.query(`
        SELECT
          m.MysteryID, m.HospitalID, m.VisitDate,
          m.DepartmentID, 
          COALESCE(m.DepartmentName, d.NameAr) AS DepartmentName,
          m.AssignedToUserID,
          m.DomainAr, m.DomainEn,
          m.QuestionAr, m.QuestionEn,
          m.MeanScore, m.Score, m.Comment,
          m.Priority, m.Status,
          m.TicketNumber, m.PeriodFrom, m.PeriodTo,
          m.SourceFile, m.CreatedByUserID,
          m.CreatedAt, m.UpdatedAt,
          u1.FullName AS CreatedByUserName,
          u2.FullName AS AssignedToUserName
        FROM mystery_complaints m
        LEFT JOIN departments d ON d.DepartmentID = m.DepartmentID
        LEFT JOIN users u1 ON u1.UserID = m.CreatedByUserID
        LEFT JOIN users u2 ON u2.UserID = m.AssignedToUserID
        WHERE m.MysteryID = ?
        LIMIT 1
      `, [mysteryId]);
      row = rows[0];
    } catch (e) {
      // إذا فشل بسبب عدم وجود AssignedToUserID، جرب بدونه
      if (e.code === 'ER_BAD_FIELD_ERROR') {
        const [rows2] = await pool.query(`
          SELECT
            m.MysteryID, m.HospitalID, m.VisitDate,
            m.DepartmentID,
            COALESCE(m.DepartmentName, d.NameAr) AS DepartmentName,
            m.DomainAr, m.DomainEn,
            m.QuestionAr, m.QuestionEn,
            m.MeanScore, m.Score, m.Comment,
            m.Priority, m.Status,
            m.TicketNumber, m.PeriodFrom, m.PeriodTo,
            m.SourceFile, m.CreatedByUserID,
            m.CreatedAt, m.UpdatedAt,
            u1.FullName AS CreatedByUserName,
            NULL AS AssignedToUserID,
            NULL AS AssignedToUserName
          FROM mystery_complaints m
          LEFT JOIN departments d ON d.DepartmentID = m.DepartmentID
          LEFT JOIN users u1 ON u1.UserID = m.CreatedByUserID
          WHERE m.MysteryID = ?
          LIMIT 1
        `, [mysteryId]);
        row = rows2[0];
      } else {
        throw e;
      }
    }

    if (!row) return res.status(404).json({ error: 'Mystery complaint not found' });
    
    // جلب اسم المستشفى من القاعدة المركزية
    if (row && row.HospitalID) {
      try {
        const centralPool = await getCentralPool();
        if (centralPool) {
          const [[hospital]] = await centralPool.query(
            'SELECT NameAr FROM hospitals WHERE HospitalID = ? LIMIT 1',
            [row.HospitalID]
          );
          row.HospitalName = hospital?.NameAr || null;
        }
      } catch (e) {
        console.error('Error fetching hospital name:', e);
        row.HospitalName = null;
      }
    }
    
    return res.json(row);
  } catch (err) {
    console.error('GET /api/mystery-complaints/:id error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/mystery-complaints/summary
 * يحفظ ملخص الزائر السري كصف في جدول mystery_complaints
 */
router.post('/mystery-complaints/summary', async (req, res) => {
  try {
    console.log('🔍 Mystery summary save request:', req.body);
    console.log('👤 User:', req.user?.UserID, 'Role:', req.user?.role);
    
    const {
      HospitalID,
      PeriodFrom,
      PeriodTo,
      TicketNumber,
      RawSummary,
      UnappliedCount,
      ItemsCount,
      RepetitionSum
    } = req.body || {};

    const hospitalId = Number(HospitalID || req.user?.HospitalID);
    if (!hospitalId) {
      return res.status(400).json({ success: false, message: 'HospitalID مطلوب' });
    }

    console.log('💾 Saving mystery summary for hospital:', hospitalId);

    // الاتصال بقاعدة بيانات المستشفى (multi-tenant)
    const pool = await getTenantPoolByHospitalId(hospitalId);
    if (!pool) return res.status(500).json({ success: false, message: 'لا يمكن الاتصال بقاعدة بيانات المستشفى' });

    // الإدخال في الجدول
    const sql = `
      INSERT INTO mystery_complaints
      (HospitalID, PeriodFrom, PeriodTo, TicketNumber,
       Comment, Priority, Status,
       DomainAr, DepartmentName,
       MeanScore, Score, SourceFile,
       CreatedByUserID, CreatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;

    const values = [
      hospitalId,
      PeriodFrom || null,
      PeriodTo || null,
      TicketNumber || null,
      RawSummary || '',
      'MEDIUM', // أولوية افتراضية
      'OPEN',   // حالة افتراضية
      'ملخص الزائر السري', // مجال افتراضي
      'إدارة الجودة',
      UnappliedCount || 0,
      RepetitionSum || 0,
      'manual-summary', // للتتبع
      req.user?.UserID || null
    ];

    console.log('📝 Inserting values:', values);

    const [result] = await pool.query(sql, values);
    
    console.log('✅ Mystery summary saved with ID:', result.insertId);
    
    return res.status(201).json({ 
      success: true, 
      SummaryID: result.insertId,
      message: 'تم حفظ الملخص بنجاح'
    });

  } catch (err) {
    console.error('❌ POST /api/mystery-complaints/summary error:', err);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal Server Error',
      error: err.message 
    });
  }
});

/**
 * POST /api/mystery-complaints/bulk-from-text
 * يحوّل نص الزائر السري إلى سجلات متعددة داخل mystery_complaints
 * Body: { HospitalID?, TicketNumber, PeriodFrom, PeriodTo, RawText }
 */
router.post('/mystery-complaints/bulk-from-text', async (req, res) => {
  try {
    console.log('🔍 Bulk from text request:', req.body);
    console.log('👤 User:', req.user?.UserID, 'Role:', req.user?.role);
    
    const { HospitalID, TicketNumber, PeriodFrom, PeriodTo, RawText } = req.body || {};

    // التحقق الإلزامي
    const hospitalId = Number(HospitalID || req.user?.HospitalID);
    if (!hospitalId) return res.status(400).json({ success:false, message:'HospitalID مطلوب' });
    if (!TicketNumber || !PeriodFrom || !PeriodTo)
      return res.status(400).json({ success:false, message:'رقم التذكرة و(من/إلى) تاريخ إلزامية' });
    if (!RawText || !RawText.trim())
      return res.status(400).json({ success:false, message:'النص فارغ' });

    console.log('💾 Processing bulk insert for hospital:', hospitalId);

    const pool = await getTenantPoolByHospitalId(hospitalId);
    if (!pool) return res.status(500).json({ success:false, message:'فشل الاتصال بقاعدة المستشفى' });

    // 1) تقسيم الأسطر المراد حفظها: كل سطر يبدأ بـ "في "
    const lines = RawText.replace(/\r/g,'').split('\n')
      .map(s => s.trim())
      .filter(s => s && /^في\s/.test(s));

    console.log('📝 Found lines starting with "في":', lines.length);

    if (lines.length === 0)
      return res.status(400).json({ success:false, message:'لم يتم العثور على أسطر تبدأ بـ "في "' });

    // 2) تحليل كل سطر:
    // "في <القسم> ( <المجال> ) <وصف> (PXIC|IC) ( عدد التكرار = n)"
    const items = [];
    const R = /^في\s+(.+?)\s*\(\s*([^)]+?)\s*\)\s*(.+?)\s+(?:PXIC|IC)\s*\(\s*عدد\s*التكرار\s*=\s*(\d+)\s*\)\s*$/i;

    for (const raw of lines) {
      let dept = '', domain = '', question = raw, repeat = 1;

      const m = raw.match(R);
      if (m) {
        dept = (m[1] || '').trim();
        domain = (m[2] || '').trim();
        question = (m[3] || '').trim();
        repeat = parseInt(m[4], 10) || 1;
      } else {
        // fallback بسيط: حاول أخذ القسم قبل أول قوس
        const m2 = raw.match(/^في\s+([^()]+)\s*\(([^)]+)\)/);
        if (m2) { dept = m2[1].trim(); domain = m2[2].trim(); }
        // عدد التكرار
        const m3 = raw.match(/عدد\s*التكرار\s*=\s*(\d+)/i);
        if (m3) repeat = parseInt(m3[1], 10) || 1;
      }

      items.push({
        DepartmentName: dept || 'غير محدد',
        DomainAr: domain || 'غير محدد',
        QuestionAr: question,
        Score: repeat,
        Comment: raw
      });
    }

    console.log('📊 Parsed items:', items.length);

    // 3) إدخال جماعي داخل معاملة
    const sql = `
      INSERT INTO mystery_complaints
      (HospitalID, PeriodFrom, PeriodTo, TicketNumber,
       DepartmentName, DomainAr, QuestionAr,
       Score, Priority, Status,
       Comment, SourceFile, CreatedByUserID, CreatedAt)
      VALUES ?
    `;

    const rows = items.map(it => ([
      hospitalId,
      PeriodFrom, PeriodTo, TicketNumber,
      it.DepartmentName, it.DomainAr, it.QuestionAr,
      it.Score, 'MEDIUM', 'OPEN',
      it.Comment, 'manual-text', req.user?.UserID || null, new Date()
    ]));

    console.log('💾 Starting bulk insert transaction...');

    await pool.query('START TRANSACTION');
    const [result] = await pool.query(sql, [rows]);
    await pool.query('COMMIT');

    console.log('✅ Bulk insert completed:', result.affectedRows, 'rows');

    return res.status(201).json({
      success: true,
      inserted: result.affectedRows || items.length,
      ticket: TicketNumber,
      hospitalId,
      from: PeriodFrom,
      to: PeriodTo,
      message: `تم حفظ ${result.affectedRows || items.length} سجل بنجاح`
    });
  } catch (err) {
    try { 
      const pool = await getTenantPoolByHospitalId(req.body?.HospitalID || req.user?.HospitalID); 
      await pool?.query('ROLLBACK'); 
    } catch {}
    console.error('❌ bulk-from-text error:', err);
    return res.status(500).json({ 
      success:false, 
      message:'Internal Server Error', 
      error: err.message 
    });
  }
});

export default router;