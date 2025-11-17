// routes/dashboardTotal.js
import express from 'express';
import { pool } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissionGuard.js';
import { resolveHospitalId } from '../middleware/resolveHospitalId.js';
import { attachHospitalPool } from '../middleware/hospitalPool.js';

const router = express.Router();

// ====== Helper: category CASE (نعيده هنا لاستخدامه عدة مرات)
const CATEGORY_SQL = `
  CASE
    WHEN UPPER(c.PriorityCode) IN ('CRITICAL','URGENT','HIGH')
         OR c.PriorityCode IN ('حرجة','عاجلة','عالية','حرج')
      THEN 'critical'
    WHEN (ct.TypeCode = 'SUGGESTION') OR (ct.TypeName LIKE '%اقتراح%')
      THEN 'suggestion'
    ELSE 'complaint'
  END
`;

// ========== GET /api/dashboard/total/summary ==========
router.get('/summary', async (req, res) => {
  try {
    const [[tc]] = await pool.query(`SELECT COUNT(*) AS total_count FROM complaints`);
    const [[th]] = await pool.query(`SELECT COUNT(DISTINCT HospitalID) AS total_hospitals FROM complaints`);
    const [[topDept]] = await pool.query(`
      SELECT d.NameAr AS dept_name, COUNT(*) AS cnt
      FROM complaints c
      LEFT JOIN departments d ON d.DepartmentID = c.DepartmentID
      GROUP BY c.DepartmentID
      ORDER BY cnt DESC
      LIMIT 1
    `);

    res.json({
      total_count: tc?.total_count || 0,
      total_hospitals: th?.total_hospitals || 0,
      top_dept_overall: topDept?.dept_name || null,
      top_dept_count: topDept?.cnt || 0,
    });
  } catch (e) {
    console.error('GET /dashboard/total/summary', e);
    res.status(500).json({ error: 'Database error' });
  }
});

// ========== GET /api/dashboard/total/list ==========
router.get('/list', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 500), 1000);
    const [rows] = await pool.query(`
      SELECT
        c.ComplaintID,
        COALESCE(NULLIF(c.TicketNumber,''), CONCAT('C-', c.ComplaintID)) AS TicketNo,
        c.HospitalID, h.NameAr AS HospitalName,
        c.DepartmentID, d.NameAr AS DepartmentName,
        c.StatusCode, c.PriorityCode, c.CreatedAt,
        ${CATEGORY_SQL} AS Category
      FROM complaints c
      LEFT JOIN hospitals h ON h.HospitalID = c.HospitalID
      LEFT JOIN departments d ON d.DepartmentID = c.DepartmentID
      LEFT JOIN complaint_types ct ON ct.ComplaintTypeID = c.ComplaintTypeID
      ORDER BY c.CreatedAt DESC
      LIMIT ?
    `, [limit]);

    res.json(rows);
  } catch (e) {
    console.error('GET /dashboard/total/list', e);
    res.status(500).json({ error: 'Database error' });
  }
});

// ========== GET /api/dashboard/total/by-hospital ==========
router.get('/by-hospital',
  requireAuth,
  requirePermission('REPORTS_CHART_BY_HOSPITAL_TYPE'),
  async (req, res) => {
  try {
    // التحقق من صلاحيات المستخدم
    const userRoleId = Number(req.user?.RoleID || req.user?.roleId || 0);
    const userHospitalId = Number(req.user?.HospitalID || req.user?.hospitalId || 0);
    const isCluster = userRoleId === 1 || userRoleId === 4; // مدير تجمع أو مركزي
    
    // فلترة حسب hospitalId من query parameter أو من بيانات المستخدم
    const requestedHospitalId = req.query.hospitalId ? Number(req.query.hospitalId) : null;
    let targetHospitalId = null;
    
    if (isCluster) {
      // مدير التجمع: يمكنه رؤية جميع المستشفيات أو مستشفى محدد
      targetHospitalId = requestedHospitalId;
    } else {
      // موظف أو مدير نظام: فقط مستشفاه
      targetHospitalId = userHospitalId || requestedHospitalId;
    }
    
    // بناء SQL query مع فلترة
    let hospitalQuery = `
      SELECT HospitalID, NameAr AS HospitalName, SortOrder
      FROM hospitals 
      WHERE IsActive = 1
    `;
    const queryParams = [];
    
    if (targetHospitalId) {
      hospitalQuery += ` AND HospitalID = ?`;
      queryParams.push(targetHospitalId);
    }
    
    hospitalQuery += ` ORDER BY SortOrder IS NULL, SortOrder ASC, NameAr ASC`;
    
    // جلب المستشفيات المفلترة
    const [allHospitals] = await pool.query(hospitalQuery, queryParams);
    
    console.log('🔍 فلترة المستشفيات:', {
      userRoleId,
      userHospitalId,
      isCluster,
      requestedHospitalId,
      targetHospitalId,
      hospitalsCount: allHospitals.length,
      hospitals: allHospitals.map(h => ({ id: h.HospitalID, name: h.HospitalName }))
    });

    // جلب إحصائيات البلاغات من قواعد بيانات المستشفيات المنفصلة
    const { getHospitalPool } = await import('../config/db.js');
    const counts = [];
    
    for (const hospital of allHospitals) {
      try {
        const hospitalPool = await getHospitalPool(hospital.HospitalID);
        const [hospitalStats] = await hospitalPool.query(`
          SELECT
            COUNT(*) as total_reports,
            SUM(CASE WHEN LOWER(StatusCode) NOT IN ('closed', 'مغلق', 'محلول', 'مكتمل') THEN 1 ELSE 0 END) as open_reports,
            SUM(CASE WHEN StatusCode IN ('closed','CLOSED', 'مغلقة', 'محلولة','مكتمل') THEN 1 ELSE 0 END) as closed_reports,
            SUM(CASE WHEN UPPER(PriorityCode) IN ('CRITICAL','URGENT','HIGH')
                      OR PriorityCode IN ('حرجة','حرج','عاجلة','عاجل','عالية')
                 THEN 1 ELSE 0 END) AS critical_count,
            SUM(CASE WHEN PriorityCode IN ('MEDIUM', 'متوسطة') THEN 1 ELSE 0 END) AS complaint_count,
            SUM(CASE WHEN PriorityCode IN ('LOW', 'منخفضة') THEN 1 ELSE 0 END) AS suggestion_count
          FROM complaints
          WHERE HospitalID = ? AND (IsDeleted = 0 OR IsDeleted IS NULL)
        `, [hospital.HospitalID]);
        
        const stat = hospitalStats[0] || {};
        counts.push({
          HospitalID: hospital.HospitalID,
          HospitalName: hospital.HospitalName,
          critical_count: parseInt(stat.critical_count || 0),
          complaint_count: parseInt(stat.complaint_count || 0),
          suggestion_count: parseInt(stat.suggestion_count || 0),
          total_reports: parseInt(stat.total_reports || 0),
          open_reports: parseInt(stat.open_reports || 0),
          closed_reports: parseInt(stat.closed_reports || 0)
        });
      } catch (error) {
        console.error(`خطأ في جلب بيانات المستشفى ${hospital.HospitalID}:`, error.message);
        // إضافة بيانات افتراضية في حالة الخطأ
        counts.push({
          HospitalID: hospital.HospitalID,
          HospitalName: hospital.HospitalName,
          critical_count: 0,
          complaint_count: 0,
          suggestion_count: 0,
          total_reports: 0,
          open_reports: 0,
          closed_reports: 0
        });
      }
    }

    const [topDept] = await pool.query(`
      SELECT
        x.HospitalID, h.NameAr AS HospitalName, x.DepartmentID,
        d.NameAr AS DepartmentName, x.cnt
      FROM (
        SELECT c.HospitalID, c.DepartmentID, COUNT(*) AS cnt,
               ROW_NUMBER() OVER (PARTITION BY c.HospitalID ORDER BY COUNT(*) DESC) AS rn
        FROM complaints c
        GROUP BY c.HospitalID, c.DepartmentID
      ) x
      LEFT JOIN hospitals h ON h.HospitalID = x.HospitalID
      LEFT JOIN departments d ON d.DepartmentID = x.DepartmentID
      WHERE x.rn = 1
    `);

    const [latest] = await pool.query(`
      SELECT *
      FROM (
        SELECT
          c.ComplaintID,
          COALESCE(NULLIF(c.TicketNumber,''), CONCAT('C-', c.ComplaintID)) AS TicketNo,
          c.HospitalID, h.NameAr AS HospitalName,
          d.NameAr AS DepartmentName,
          c.StatusCode, c.PriorityCode, c.CreatedAt,
          ${CATEGORY_SQL} AS Category,
          ROW_NUMBER() OVER (PARTITION BY c.HospitalID ORDER BY c.CreatedAt DESC) AS rn
        FROM complaints c
        LEFT JOIN hospitals h ON h.HospitalID = c.HospitalID
        LEFT JOIN departments d ON d.DepartmentID = c.DepartmentID
        LEFT JOIN complaint_types ct ON ct.ComplaintTypeID = c.ComplaintTypeID
      ) t
      WHERE t.rn <= 6
      ORDER BY t.HospitalID, t.CreatedAt DESC
    `);

    // دمج النتائج في هيكل واحد سهل للواجهة
    const indexTop = new Map(topDept.map(x => [x.HospitalID, x]));
    const indexLatest = latest.reduce((acc, r) => {
      (acc[r.HospitalID] ||= []).push(r);
      return acc;
    }, {});
    
    // إنشاء خريطة للإحصائيات
    const countsMap = new Map(counts.map(c => [c.HospitalID, c]));

    // دمج جميع المستشفيات مع إحصائياتها
    const result = allHospitals.map(hospital => {
      const c = counts.find(x => x.HospitalID === hospital.HospitalID) || {};
      
      return {
        HospitalID: hospital.HospitalID,
        HospitalName: hospital.HospitalName,
        counts: {
          // مجاميع حسب الأولوية (قد يكون بعضها صفر/NULL)
          complaint:  Number(c.complaint_count  || 0),
          suggestion: Number(c.suggestion_count || 0),
          critical:   Number(c.critical_count   || 0),
          // 🔥 أرجع الأرقام الحقيقية أيضًا
          total:      Number(c.total_reports    || 0),
          open:       Number(c.open_reports     || 0),
          closed:     Number(c.closed_reports   || 0),
        },
        top: {
          DepartmentID:  indexTop.get(hospital.HospitalID)?.DepartmentID || null,
          DepartmentName:indexTop.get(hospital.HospitalID)?.DepartmentName || null,
          count:         indexTop.get(hospital.HospitalID)?.cnt || 0,
        },
        latest: (indexLatest[hospital.HospitalID] || []).map(r => ({
          id: r.ComplaintID,
          ticket: r.TicketNo,
          dept: r.DepartmentName,
          category: r.Category,
          status: r.StatusCode,
          createdAt: r.CreatedAt
        }))
      };
    });

    res.json(result);
  } catch (e) {
    console.error('GET /dashboard/total/by-hospital', e);
    res.status(500).json({ error: 'Database error' });
  }
});

// ========== GET /api/dashboard/total/hospital/:id ==========
router.get('/hospital/:id', async (req, res) => {
  try {
    const hospitalId = parseInt(req.params.id);
    
    if (!hospitalId || isNaN(hospitalId)) {
      return res.status(400).json({ error: 'Invalid hospital ID' });
    }

    // جلب معلومات المستشفى من القاعدة المركزية
    const [hospitalInfo] = await pool.query(`
      SELECT HospitalID, NameAr, NameEn, Code, CityAr, RegionAr, IsActive
      FROM hospitals 
      WHERE HospitalID = ? AND IsActive = 1
    `, [hospitalId]);

    if (hospitalInfo.length === 0) {
      return res.status(404).json({ error: 'Hospital not found' });
    }

    const hospital = hospitalInfo[0];

    // جلب إحصائيات البلاغات من قاعدة بيانات المستشفى
    const { getHospitalPool } = await import('../config/db.js');
    const hospitalPool = await getHospitalPool(hospitalId);
    
    const [stats] = await hospitalPool.query(`
      SELECT
        COUNT(*) as total_reports,
        SUM(CASE WHEN LOWER(c.StatusCode) NOT IN ('closed', 'مغلق', 'محلول', 'مكتمل') THEN 1 ELSE 0 END) as open_reports,
        SUM(CASE WHEN c.StatusCode IN ('closed','CLOSED', 'مغلقة', 'محلولة','مكتمل') THEN 1 ELSE 0 END) as closed_reports,
        SUM(CASE WHEN UPPER(c.PriorityCode) IN ('CRITICAL','URGENT','HIGH')
                  OR c.PriorityCode IN ('حرجة','حرج','عاجلة','عاجل','عالية')
             THEN 1 ELSE 0 END) AS critical_count,
        SUM(CASE WHEN c.PriorityCode IN ('MEDIUM', 'متوسطة') THEN 1 ELSE 0 END) AS complaint_count,
        SUM(CASE WHEN c.PriorityCode IN ('LOW', 'منخفضة') THEN 1 ELSE 0 END) AS suggestion_count
      FROM complaints c
      WHERE c.HospitalID = ? AND (c.IsDeleted = 0 OR c.IsDeleted IS NULL)
    `, [hospitalId]);

    const stat = stats[0] || {};
    const totalReports = parseInt(stat.total_reports || 0);
    const openReports = parseInt(stat.open_reports || 0);
    const closedReports = parseInt(stat.closed_reports || 0);
    const resolutionRate = totalReports > 0 ? Math.round((closedReports / totalReports) * 100) : 0;

    // جلب أحدث البلاغات من قاعدة بيانات المستشفى
    const [recentReports] = await hospitalPool.query(`
      SELECT
        c.ComplaintID,
        COALESCE(NULLIF(c.TicketNumber,''), CONCAT('C-', c.ComplaintID)) AS TicketNo,
        c.PriorityCode,
        c.StatusCode,
        c.CreatedAt,
        c.PatientFullName as TypeName,
        d.NameAr as DepartmentName,
        CASE
          WHEN UPPER(c.PriorityCode) IN ('CRITICAL','URGENT','HIGH')
               OR c.PriorityCode IN ('حرجة','حرج','عاجلة','عاجل','عالية')
          THEN 'red'
          WHEN c.PriorityCode IN ('LOW', 'منخفضة') THEN 'yellow'
          ELSE 'orange'
        END as priority
      FROM complaints c
      LEFT JOIN departments d ON d.DepartmentID = c.DepartmentID
      WHERE c.HospitalID = ?
      ORDER BY c.CreatedAt DESC
      LIMIT 10
    `, [hospitalId]);

    // جلب البلاغات الشهرية من قاعدة بيانات المستشفى (آخر 6 أشهر)
    const [monthlyStats] = await hospitalPool.query(`
      SELECT
        DATE_FORMAT(CreatedAt, '%Y-%m') as month,
        COUNT(*) as count
      FROM complaints
      WHERE HospitalID = ? 
        AND CreatedAt >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
      GROUP BY DATE_FORMAT(CreatedAt, '%Y-%m')
      ORDER BY month DESC
      LIMIT 6
    `, [hospitalId]);

    // تحويل البيانات الشهرية إلى مصفوفة
    const monthlyData = [0, 0, 0, 0, 0, 0];
    const monthNames = ['يناير', 'ديسمبر', 'نوفمبر', 'أكتوبر', 'سبتمبر', 'أغسطس'];
    monthlyStats.forEach((stat, index) => {
      if (index < 6) {
        monthlyData[5 - index] = parseInt(stat.count);
      }
    });

    const result = {
      HospitalID: hospital.HospitalID,
      HospitalName: hospital.NameAr,
      HospitalNameEn: hospital.NameEn,
      Code: hospital.Code,
      City: hospital.CityAr,
      Region: hospital.RegionAr,
      type: 'عام', // يمكن إضافة حقل نوع المستشفى في قاعدة البيانات لاحقاً
      beds: 0, // يمكن إضافة حقل عدد الأسرة في قاعدة البيانات لاحقاً
      totalReports: totalReports,
      openReports: openReports,
      closedReports: closedReports,
      resolutionRate: resolutionRate,
      priorityCounts: {
        red: parseInt(stat.critical_count || 0),
        orange: parseInt(stat.complaint_count || 0),
        yellow: parseInt(stat.suggestion_count || 0)
      },
      monthly: monthlyData,
      recent: recentReports.map(report => ({
        id: report.ComplaintID,
        ticket: report.TicketNo,
        type: report.TypeName || 'غير محدد',
        priority: report.priority,
        status: report.StatusCode,
        department: report.DepartmentName || 'غير محدد',
        date: new Date(report.CreatedAt).toLocaleString('ar-SA', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        }).replace(',', '')
      }))
    };

    res.json(result);
  } catch (e) {
    console.error('GET /dashboard/total/hospital/:id', e);
    res.status(500).json({ error: 'Database error' });
  }
});

// ========== GET /api/dashboard/total/departments ==========
router.get('/departments',
  requireAuth,
  requirePermission('DASH_CHART_TOP_CLINICS'),
  async (req, res) => {
  try {
    // جلب المستشفيات حسب المعامل
    const hospitalId = req.query.hospitalId;
    let hospitalsQuery = `
      SELECT HospitalID, NameAr AS HospitalName, SortOrder
      FROM hospitals 
      WHERE IsActive = 1
    `;
    
    if (hospitalId) {
      hospitalsQuery += ` AND HospitalID = ?`;
    }
    
    hospitalsQuery += ` ORDER BY SortOrder IS NULL, SortOrder ASC, NameAr ASC`;
    
    const queryParams = hospitalId ? [hospitalId] : [];
    const [allHospitals] = await pool.query(hospitalsQuery, queryParams);

    console.log(`🔍 جلب الأقسام مع العدادات من ${allHospitals.length} مستشفى${hospitalId ? ` (مفلتر بـ ${hospitalId})` : ''}`);

    const { getHospitalPool } = await import('../config/db.js');
    const rows = [];

    for (const h of allHospitals) {
      try {
        const hospPool = await getHospitalPool(h.HospitalID);
        // نجلب الأقسام مع العدادات من قاعدة مستشفى h
        const [deptStats] = await hospPool.query(`
          SELECT 
            d.DepartmentID,
            d.NameAr AS DepartmentName,
            COUNT(c.ComplaintID) AS TotalCount,
            SUM(CASE WHEN c.StatusCode NOT IN ('CLOSED','مغلق','محلول','مكتمل') THEN 1 ELSE 0 END) AS OpenCount,
            SUM(CASE WHEN c.StatusCode     IN ('CLOSED','مغلق','محلول','مكتمل') THEN 1 ELSE 0 END) AS ClosedCount,
            SUM(CASE WHEN UPPER(c.PriorityCode) IN ('CRITICAL','URGENT','HIGH')
                      OR c.PriorityCode IN ('حرجة','حرج','عاجلة','عاجل','عالية')
                 THEN 1 ELSE 0 END) AS UrgentCount,
            SUM(CASE WHEN c.PriorityCode IN ('MEDIUM','متوسطة') THEN 1 ELSE 0 END) AS MediumCount
          FROM departments d
          LEFT JOIN complaints c 
            ON c.DepartmentID = d.DepartmentID
           AND (c.IsDeleted = 0 OR c.IsDeleted IS NULL)
          WHERE IFNULL(d.IsActive,1) = 1
          GROUP BY d.DepartmentID, d.NameAr
          HAVING TotalCount > 0
          ORDER BY TotalCount DESC
        `);

        for (const r of deptStats) {
          rows.push({
            HospitalID:   h.HospitalID,
            HospitalName: h.HospitalName,
            DepartmentID: r.DepartmentID,
            DepartmentName: r.DepartmentName,
            TotalCount:   Number(r.TotalCount),
            OpenCount:    Number(r.OpenCount || 0),
            ClosedCount:  Number(r.ClosedCount || 0),
            UrgentCount:  Number(r.UrgentCount || 0),
            MediumCount:  Number(r.MediumCount || 0)
          });
        }
      } catch (e) {
        console.warn(`skip hospital ${h.HospitalID}:`, e.message);
      }
    }

    console.log(`✅ تم جلب ${rows.length} قسم مع العدادات من ${allHospitals.length} مستشفى`);

    return res.json({ 
      success: true, 
      data: rows, 
      total: rows.length, 
      hospitals: allHospitals.length,
      hospitalId: hospitalId || 'all'
    });

  } catch (error) {
    console.error('GET /dashboard/total/departments', error);
    res.status(500).json({ 
      success: false,
      error: 'Database error',
      message: error.message 
    });
  }
});

// ========== GET /api/dashboard/total/complaint-types ==========
router.get('/complaint-types', async (req, res) => {
  try {
    const hospitalId = req.query?.hospitalId ? Number(req.query.hospitalId) : null;

    // جلب جميع المستشفيات النشطة أولاً
    const hospitalWhereClause = hospitalId
      ? 'WHERE IsActive = 1 AND HospitalID = ?'
      : 'WHERE IsActive = 1';
    const hospitalParams = hospitalId ? [hospitalId] : [];

    const [allHospitals] = await pool.query(`
      SELECT HospitalID, NameAr AS HospitalName, SortOrder
      FROM hospitals
      ${hospitalWhereClause}
      ORDER BY SortOrder IS NULL, SortOrder ASC, NameAr ASC
    `, hospitalParams);

    if (!allHospitals.length) {
      return res.json({
        success: true,
        data: [],
        total: 0,
        hospitals: 0
      });
    }

    // جلب أنواع البلاغات من قواعد بيانات المستشفيات المنفصلة
    const { getHospitalPool } = await import('../config/db.js');
    const complaintTypesData = [];
    
    for (const hospital of allHospitals) {
      try {
        const hospitalPool = await getHospitalPool(hospital.HospitalID);
        
        // جلب أنواع البلاغات من قاعدة بيانات المستشفى
        const [complaintTypes] = await hospitalPool.query(`
          SELECT
            ct.ComplaintTypeID,
            ct.TypeName,
            ct.TypeCode,
            ct.TypeNameEn,
            COUNT(c.ComplaintID) AS TotalCount
          FROM complaint_types ct
          LEFT JOIN complaints c
            ON c.ComplaintTypeID = ct.ComplaintTypeID
           AND c.IsDeleted = 0
          GROUP BY ct.ComplaintTypeID
          HAVING TotalCount > 0
          ORDER BY TotalCount DESC, ct.TypeName ASC
        `);

        // إضافة معلومات المستشفى لكل نوع بلاغ
        complaintTypes.forEach(type => {
          complaintTypesData.push({
            HospitalID: hospital.HospitalID,
            HospitalName: hospital.HospitalName,
            ComplaintTypeID: type.ComplaintTypeID,
            TypeName: type.TypeName,
            TypeCode: type.TypeCode,
            TypeNameEn: type.TypeNameEn,
            TotalCount: Number(type.TotalCount) || 0
          });
        });

      } catch (error) {
        console.error(`خطأ في جلب أنواع البلاغات من المستشفى ${hospital.HospitalID}:`, error.message);
      }
    }

    // ترتيب أنواع البلاغات حسب اسم المستشفى ثم اسم النوع
    complaintTypesData.sort((a, b) => {
      if (a.HospitalName !== b.HospitalName) {
        return a.HospitalName.localeCompare(b.HospitalName, 'ar');
      }
      return a.TypeName.localeCompare(b.TypeName, 'ar');
    });

    res.json({
      success: true,
      data: complaintTypesData,
      total: complaintTypesData.length,
      hospitals: allHospitals.length
    });

  } catch (error) {
    console.error('GET /dashboard/total/complaint-types', error);
    res.status(500).json({ 
      success: false,
      error: 'Database error',
      message: error.message 
    });
  }
});

// ========== GET /api/dashboard/total/complaint-types/by-hospital ==========
router.get('/complaint-types/by-hospital', async (req, res) => {
  try {
    const typeParam = (req.query?.type || '').trim();
    if (!typeParam) {
      return res.status(400).json({
        success: false,
        message: 'type parameter is required'
      });
    }

    const hospitalId = req.query?.hospitalId ? Number(req.query.hospitalId) : null;
    const hospitalWhereClause = hospitalId
      ? 'WHERE IsActive = 1 AND HospitalID = ?'
      : 'WHERE IsActive = 1';
    const hospitalParams = hospitalId ? [hospitalId] : [];

    const [allHospitals] = await pool.query(`
      SELECT HospitalID, NameAr AS HospitalName, SortOrder
      FROM hospitals
      ${hospitalWhereClause}
      ORDER BY SortOrder IS NULL, SortOrder ASC, NameAr ASC
    `, hospitalParams);

    if (!allHospitals.length) {
      return res.json({
        success: true,
        type: typeParam,
        data: [],
        hospitals: 0
      });
    }

    const { getHospitalPool } = await import('../config/db.js');
    const results = [];

    for (const hospital of allHospitals) {
      try {
        const hospitalPool = await getHospitalPool(hospital.HospitalID);
        const [rows] = await hospitalPool.query(`
          SELECT COUNT(*) AS TotalCount
          FROM complaints c
          JOIN complaint_types ct ON ct.ComplaintTypeID = c.ComplaintTypeID
          WHERE c.IsDeleted = 0
            AND (ct.TypeCode = ? OR ct.TypeName = ?)
        `, [typeParam, typeParam]);

        const total = Number(rows?.[0]?.TotalCount ?? 0);
        results.push({
          HospitalID: hospital.HospitalID,
          HospitalName: hospital.HospitalName,
          TotalCount: total
        });
      } catch (error) {
        console.error(`خطأ في جلب البلاغات للتصنيف ${typeParam} من المستشفى ${hospital.HospitalID}:`, error.message);
        results.push({
          HospitalID: hospital.HospitalID,
          HospitalName: hospital.HospitalName,
          TotalCount: 0,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      type: typeParam,
      hospitals: results.length,
      data: results
    });
  } catch (error) {
    console.error('GET /dashboard/total/complaint-types/by-hospital', error);
    res.status(500).json({
      success: false,
      error: 'Database error',
      message: error.message
    });
  }
});

// ========== GET /api/dashboard/total/daily-complaints ==========
// 📊 إحصائية البلاغات اليومية (Daily Complaints)
router.get('/daily-complaints',
  requireAuth,
  requirePermission('DASH_CHART_DAILY_TREND'),
  async (req, res) => {
  try {
    const { hospitalId } = req.query;
    const user = req.user || {};
    const isClusterManager = !user.HospitalID || user.RoleID === 1;
    const sinceDays = 30;

    const { getHospitalPool } = await import('../config/db.js');
    const centralPool = pool;

    // تجهيز قائمة الأيام (لضمان أن الرسم يظهر حتى لو يوم صفر)
    const today = new Date();
    const dailyMap = new Map();
    for (let i = sinceDays - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      dailyMap.set(d.toISOString().slice(0, 10), 0);
    }

    let hospitalsList = [];

    // إذا المستخدم مدير التجمع → يجيب كل المستشفيات
    if (isClusterManager && !hospitalId) {
      const [rows] = await centralPool.query(
        `SELECT HospitalID, NameAr, DbName FROM hospitals WHERE IsActive = 1 ORDER BY SortOrder`
      );
      hospitalsList = rows;
    } else {
      // موظف مستشفى أو فلتر محدد
      const hId = Number(hospitalId || user.HospitalID);
      if (!hId) throw new Error('HospitalID غير محدد');
      const [rows] = await centralPool.query(
        `SELECT HospitalID, NameAr, DbName FROM hospitals WHERE HospitalID = ?`, [hId]
      );
      hospitalsList = rows;
    }

    let total = 0;

    // نلف على كل المستشفيات ونحسب البلاغات اليومية
    for (const h of hospitalsList) {
      try {
        const pool = await getHospitalPool(h.HospitalID);
        const [rows] = await pool.query(`
          SELECT DATE(CreatedAt) AS date, COUNT(*) AS count
          FROM complaints
          WHERE (IsDeleted = 0 OR IsDeleted IS NULL)
            AND CreatedAt >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
          GROUP BY DATE(CreatedAt)
          ORDER BY DATE(CreatedAt)
        `, [sinceDays]);

        // ندمج القيم مع المصفوفة العامة
        for (const r of rows) {
          const key = r.date.toISOString().slice(0, 10);
          dailyMap.set(key, (dailyMap.get(key) || 0) + Number(r.count));
          total += Number(r.count);
        }

        console.log(`📊 ${h.NameAr} (${h.HospitalID}): ${rows.length} يوم به بلاغات`);
      } catch (err) {
        console.warn(`⚠️ خطأ في مستشفى ${h.NameAr}:`, err.message);
      }
    }

    // نحول الماب إلى مصفوفة للإرسال
    const data = Array.from(dailyMap, ([date, count]) => ({
      date,
      day: new Date(date).getDate(),
      count
    }));

    res.json({
      success: true,
      data,
      total,
      hospitals: hospitalsList.length,
      period: `${sinceDays} days`
    });
  } catch (error) {
    console.error('❌ [daily-complaints] خطأ:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});


// ========== GET /api/dashboard/total/open-reports ==========
router.get('/open-reports', async (req, res) => {
  
  try {
    // جلب جميع المستشفيات النشطة أولاً
    const [allHospitals] = await pool.query(`
      SELECT HospitalID, NameAr AS HospitalName, SortOrder
      FROM hospitals 
      WHERE IsActive = 1
      ORDER BY SortOrder IS NULL, SortOrder ASC, NameAr ASC
    `);

    // جلب البلاغات المفتوحة من قواعد بيانات المستشفيات المنفصلة
    const { getHospitalPool } = await import('../config/db.js');
    const openReports = [];
    let totalOpen = 0;
    let affectedHospitals = 0;
    const typeCounts = {};
    
    for (const hospital of allHospitals) {
      try {
        const hospitalPool = await getHospitalPool(hospital.HospitalID);
        
        // جلب البلاغات المفتوحة (غير مغلقة)
        const [reports] = await hospitalPool.query(`
          SELECT 
            c.ComplaintID,
            c.TicketNumber,
            c.HospitalID,
            c.PriorityCode,
            c.StatusCode,
            c.CreatedAt,
            c.UpdatedAt,
            ct.TypeName,
            ct.TypeCode,
            d.NameAr AS DepartmentName
          FROM complaints c
          LEFT JOIN complaint_types ct ON ct.ComplaintTypeID = c.ComplaintTypeID
          LEFT JOIN departments d ON d.DepartmentID = c.DepartmentID
          WHERE LOWER(c.StatusCode) NOT IN ('closed', 'مغلق', 'محلول', 'مكتمل')
            AND (c.IsDeleted = 0 OR c.IsDeleted IS NULL)
          ORDER BY c.CreatedAt DESC
        `);

        if (reports.length > 0) {
          affectedHospitals++;
          totalOpen += reports.length;
          
          reports.forEach(report => {
            openReports.push({
              ...report,
              HospitalName: hospital.HospitalName
            });
            
            // عد أنواع البلاغات
            const typeName = report.TypeName || 'غير محدد';
            typeCounts[typeName] = (typeCounts[typeName] || 0) + 1;
          });
        }

      } catch (error) {
        console.error(`خطأ في جلب البلاغات المفتوحة من المستشفى ${hospital.HospitalID}:`, error.message);
      }
    }

    // العثور على أكثر نوع تكراراً
    const mostFrequentType = Object.entries(typeCounts)
      .sort(([,a], [,b]) => b - a)[0];

    res.json({
      success: true,
      data: {
        reports: openReports,
        summary: {
          totalOpen,
          affectedHospitals,
          mostFrequentType: mostFrequentType ? mostFrequentType[0] : 'لا توجد بيانات',
          mostFrequentCount: mostFrequentType ? mostFrequentType[1] : 0
        }
      }
    });

  } catch (error) {
    console.error('GET /dashboard/total/open-reports', error);
    res.status(500).json({ 
      success: false,
      error: 'Database error',
      message: error.message 
    });
  }
});

// ========== GET /api/dashboard/total/closed-reports ==========
router.get('/closed-reports', async (req, res) => {
  try {
    // جلب جميع المستشفيات النشطة أولاً
    const [allHospitals] = await pool.query(`
      SELECT HospitalID, NameAr AS HospitalName, SortOrder
      FROM hospitals 
      WHERE IsActive = 1
      ORDER BY SortOrder IS NULL, SortOrder ASC, NameAr ASC
    `);

    // جلب البلاغات المغلقة من قواعد بيانات المستشفيات المنفصلة
    const { getHospitalPool } = await import('../config/db.js');
    const closedReports = [];
    let totalClosed = 0;
    let affectedHospitals = 0;
    const typeCounts = {};
    
    for (const hospital of allHospitals) {
      try {
        const hospitalPool = await getHospitalPool(hospital.HospitalID);
        
        // جلب البلاغات المغلقة
        const [reports] = await hospitalPool.query(`
          SELECT 
            c.ComplaintID,
            c.TicketNumber,
            c.HospitalID,
            c.PriorityCode,
            c.StatusCode,
            c.CreatedAt,
            c.UpdatedAt,
            COALESCE(c.UpdatedAt, c.CreatedAt) AS ClosedAt,
            ct.TypeName,
            ct.TypeCode,
            d.NameAr AS DepartmentName
          FROM complaints c
          LEFT JOIN complaint_types ct ON ct.ComplaintTypeID = c.ComplaintTypeID
          LEFT JOIN departments d ON d.DepartmentID = c.DepartmentID
          WHERE c.StatusCode IN ('closed','CLOSED','مغلق','محلول','مكتمل')
            AND (c.IsDeleted = 0 OR c.IsDeleted IS NULL)
          ORDER BY COALESCE(c.UpdatedAt, c.CreatedAt) DESC
        `);

        if (reports.length > 0) {
          affectedHospitals++;
          totalClosed += reports.length;
          
          reports.forEach(report => {
            closedReports.push({
              ...report,
              HospitalName: hospital.HospitalName
            });
            
            // عد أنواع البلاغات
            const typeName = report.TypeName || 'غير محدد';
            typeCounts[typeName] = (typeCounts[typeName] || 0) + 1;
          });
        }

      } catch (error) {
        console.error(`خطأ في جلب البلاغات المغلقة من المستشفى ${hospital.HospitalID}:`, error.message);
      }
    }

    // العثور على أكثر نوع تكراراً
    const mostFrequentType = Object.entries(typeCounts)
      .sort(([,a], [,b]) => b - a)[0];

    res.json({
      success: true,
      data: {
        reports: closedReports,
        summary: {
          totalClosed,
          affectedHospitals,
          mostFrequentType: mostFrequentType ? mostFrequentType[0] : 'لا توجد بيانات',
          mostFrequentCount: mostFrequentType ? mostFrequentType[1] : 0
        }
      }
    });

  } catch (error) {
    console.error('GET /dashboard/total/closed-reports', error);
    res.status(500).json({ 
      success: false,
      error: 'Database error',
      message: error.message 
    });
  }
});

// ========== GET /api/dashboard/total/all-reports ==========
router.get('/all-reports', async (req, res) => {
  try {
    // جلب جميع المستشفيات النشطة أولاً
    const [allHospitals] = await pool.query(`
      SELECT HospitalID, NameAr AS HospitalName, SortOrder
      FROM hospitals 
      WHERE IsActive = 1
      ORDER BY SortOrder IS NULL, SortOrder ASC, NameAr ASC
    `);

    // جلب جميع البلاغات من قواعد بيانات المستشفيات المنفصلة
    const { getHospitalPool } = await import('../config/db.js');
    const allReports = [];
    let totalReports = 0;
    let affectedHospitals = 0;
    const typeCounts = {};
    
    for (const hospital of allHospitals) {
      try {
        const hospitalPool = await getHospitalPool(hospital.HospitalID);
        
        // جلب جميع البلاغات
        const [reports] = await hospitalPool.query(`
          SELECT 
            c.ComplaintID,
            c.TicketNumber,
            c.HospitalID,
            c.PriorityCode,
            c.StatusCode,
            c.CreatedAt,
            c.UpdatedAt,
            ct.TypeName,
            ct.TypeCode,
            d.NameAr AS DepartmentName
          FROM complaints c
          LEFT JOIN complaint_types ct ON ct.ComplaintTypeID = c.ComplaintTypeID
          LEFT JOIN departments d ON d.DepartmentID = c.DepartmentID
          WHERE (c.IsDeleted = 0 OR c.IsDeleted IS NULL)
          ORDER BY c.CreatedAt DESC
        `);

        if (reports.length > 0) {
          affectedHospitals++;
          totalReports += reports.length;
          
          reports.forEach(report => {
            allReports.push({
              ...report,
              HospitalName: hospital.HospitalName
            });
            
            // عد أنواع البلاغات
            const typeName = report.TypeName || 'غير محدد';
            typeCounts[typeName] = (typeCounts[typeName] || 0) + 1;
          });
        }

      } catch (error) {
        console.error(`خطأ في جلب البلاغات من المستشفى ${hospital.HospitalID}:`, error.message);
      }
    }

    // العثور على أكثر نوع تكراراً
    const mostFrequentType = Object.entries(typeCounts)
      .sort(([,a], [,b]) => b - a)[0];

    res.json({
      success: true,
      data: {
        reports: allReports,
        summary: {
          totalReports,
          affectedHospitals,
          mostFrequentType: mostFrequentType ? mostFrequentType[0] : 'لا توجد بيانات',
          mostFrequentCount: mostFrequentType ? mostFrequentType[1] : 0
        }
      }
    });

  } catch (error) {
    console.error('GET /dashboard/total/all-reports', error);
    res.status(500).json({ 
      success: false,
      error: 'Database error',
      message: error.message 
    });
  }
});

// ========== GET /api/dashboard/total/complaint-statuses ==========
router.get('/complaint-statuses',
  requireAuth,
  requirePermission('REPORTS_CHART_STATUS_DISTRIBUTION'),
  async (req, res) => {
  try {
    // التحقق من صلاحيات المستخدم
    const userRoleId = Number(req.user?.RoleID || req.user?.roleId || 0);
    const userHospitalId = Number(req.user?.HospitalID || req.user?.hospitalId || 0);
    const isCluster = userRoleId === 1 || userRoleId === 4; // مدير تجمع أو مركزي
    
    // فلترة حسب hospitalId من query parameter أو من بيانات المستخدم
    const requestedHospitalId = req.query.hospitalId ? Number(req.query.hospitalId) : null;
    let targetHospitalId = null;
    
    if (isCluster) {
      // مدير التجمع: يمكنه رؤية جميع المستشفيات أو مستشفى محدد
      targetHospitalId = requestedHospitalId;
    } else {
      // موظف أو مدير نظام: فقط مستشفاه
      targetHospitalId = userHospitalId || requestedHospitalId;
    }
    
    // بناء SQL query مع فلترة
    let hospitalQuery = `
      SELECT HospitalID, NameAr AS HospitalName, SortOrder
      FROM hospitals 
      WHERE IsActive = 1
    `;
    const queryParams = [];
    
    if (targetHospitalId) {
      hospitalQuery += ` AND HospitalID = ?`;
      queryParams.push(targetHospitalId);
    }
    
    hospitalQuery += ` ORDER BY SortOrder IS NULL, SortOrder ASC, NameAr ASC`;
    
    // جلب المستشفيات المفلترة
    const [allHospitals] = await pool.query(hospitalQuery, queryParams);
    
    console.log('🔍 فلترة المستشفيات في complaint-statuses:', {
      userRoleId,
      userHospitalId,
      isCluster,
      requestedHospitalId,
      targetHospitalId,
      hospitalsCount: allHospitals.length
    });

    // جلب بيانات حالات البلاغات من قواعد بيانات المستشفيات المنفصلة
    const { getHospitalPool } = await import('../config/db.js');
    const statusCounts = {};
    
    for (const hospital of allHospitals) {
      try {
        const hospitalPool = await getHospitalPool(hospital.HospitalID);
        
        // جلب عدد البلاغات لكل حالة من جدول complaints
        const [statusStats] = await hospitalPool.query(`
          SELECT 
            c.StatusCode,
            COUNT(*) as count
          FROM complaints c
          WHERE c.IsDeleted = 0 OR c.IsDeleted IS NULL
          GROUP BY c.StatusCode
        `);

        // تجميع الإحصائيات
        statusStats.forEach(stat => {
          if (!statusCounts[stat.StatusCode]) {
            statusCounts[stat.StatusCode] = 0;
          }
          statusCounts[stat.StatusCode] += stat.count;
        });

      } catch (error) {
        console.error(`خطأ في جلب إحصائيات حالات البلاغات من المستشفى ${hospital.HospitalID}:`, error.message);
      }
    }

    // جلب أسماء الحالات من جدول complaint_statuses
    const [statusLabels] = await pool.query(`
      SELECT 
        StatusCode,
        LabelAr,
        LabelEn,
        SortOrder
      FROM complaint_statuses 
      ORDER BY SortOrder ASC, LabelAr ASC
    `);

    // دمج البيانات
    const result = statusLabels.map(status => ({
      StatusCode: status.StatusCode,
      LabelAr: status.LabelAr,
      LabelEn: status.LabelEn,
      count: statusCounts[status.StatusCode] || 0
    })).filter(item => item.count > 0); // إظهار الحالات التي لها بلاغات فقط

    res.json({
      success: true,
      data: result,
      total: result.reduce((sum, item) => sum + item.count, 0),
      hospitals: allHospitals.length
    });

  } catch (error) {
    console.error('GET /dashboard/total/complaint-statuses', error);
    res.status(500).json({ 
      success: false,
      error: 'Database error',
      message: error.message 
    });
  }
});

// ========== GET /api/dashboard/total/monthly-trends ==========
router.get('/monthly-trends',
  requireAuth,
  requirePermission('REPORTS_CHART_TREND_6M'),
  async (req, res) => {
  try {
    // التحقق من صلاحيات المستخدم
    const userRoleId = Number(req.user?.RoleID || req.user?.roleId || 0);
    const userHospitalId = Number(req.user?.HospitalID || req.user?.hospitalId || 0);
    const isCluster = userRoleId === 1 || userRoleId === 4; // مدير تجمع أو مركزي
    
    // فلترة حسب hospitalId من query parameter أو من بيانات المستخدم
    const requestedHospitalId = req.query.hospitalId ? Number(req.query.hospitalId) : null;
    let targetHospitalId = null;
    
    if (isCluster) {
      // مدير التجمع: يمكنه رؤية جميع المستشفيات أو مستشفى محدد
      targetHospitalId = requestedHospitalId;
    } else {
      // موظف أو مدير نظام: فقط مستشفاه
      targetHospitalId = userHospitalId || requestedHospitalId;
    }
    
    // بناء SQL query مع فلترة
    let hospitalQuery = `
      SELECT HospitalID, NameAr AS HospitalName, SortOrder
      FROM hospitals 
      WHERE IsActive = 1
    `;
    const queryParams = [];
    
    if (targetHospitalId) {
      hospitalQuery += ` AND HospitalID = ?`;
      queryParams.push(targetHospitalId);
    }
    
    hospitalQuery += ` ORDER BY SortOrder IS NULL, SortOrder ASC, NameAr ASC`;
    
    // جلب المستشفيات المفلترة
    const [allHospitals] = await pool.query(hospitalQuery, queryParams);
    
    console.log('🔍 فلترة المستشفيات في monthly-trends:', {
      userRoleId,
      userHospitalId,
      isCluster,
      requestedHospitalId,
      targetHospitalId,
      hospitalsCount: allHospitals.length
    });

    // جلب البيانات الشهرية من قواعد بيانات المستشفيات المنفصلة
    const { getHospitalPool } = await import('../config/db.js');
    const monthlyData = {};
    
    // إنشاء مصفوفة للأشهر الـ 6 الماضية
    const last6Months = [];
    const monthNames = ['يناير', 'ديسمبر', 'نوفمبر', 'أكتوبر', 'سبتمبر', 'أغسطس'];
    
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const monthKey = `${year}-${month.toString().padStart(2, '0')}`;
      const monthName = monthNames[5 - i];
      
      last6Months.push({
        monthKey,
        monthName,
        year,
        month
      });
      
      monthlyData[monthKey] = {
        monthName,
        newReports: 0,
        closedReports: 0
      };
    }
    
    for (const hospital of allHospitals) {
      try {
        const hospitalPool = await getHospitalPool(hospital.HospitalID);
        
        // جلب البلاغات الجديدة لكل شهر
        const [newReports] = await hospitalPool.query(`
          SELECT 
            DATE_FORMAT(CreatedAt, '%Y-%m') as month_key,
            COUNT(*) as count
          FROM complaints 
          WHERE CreatedAt >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
            AND (IsDeleted = 0 OR IsDeleted IS NULL)
          GROUP BY DATE_FORMAT(CreatedAt, '%Y-%m')
          ORDER BY month_key ASC
        `);

        // جلب البلاغات المغلقة لكل شهر
        const [closedReports] = await hospitalPool.query(`
          SELECT 
            DATE_FORMAT(UpdatedAt, '%Y-%m') as month_key,
            COUNT(*) as count
          FROM complaints 
          WHERE UpdatedAt >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
            AND StatusCode IN ('CLOSED', 'مغلق', 'محلول', 'مكتمل')
            AND (IsDeleted = 0 OR IsDeleted IS NULL)
          GROUP BY DATE_FORMAT(UpdatedAt, '%Y-%m')
          ORDER BY month_key ASC
        `);

        // إضافة البيانات إلى المجموع العام
        newReports.forEach(month => {
          if (monthlyData[month.month_key]) {
            monthlyData[month.month_key].newReports += month.count;
          }
        });

        closedReports.forEach(month => {
          if (monthlyData[month.month_key]) {
            monthlyData[month.month_key].closedReports += month.count;
          }
        });

      } catch (error) {
        console.error(`خطأ في جلب البيانات الشهرية من المستشفى ${hospital.HospitalID}:`, error.message);
      }
    }

    // تحويل البيانات إلى الصيغة المطلوبة للرسم البياني
    const result = last6Months.map(month => ({
      monthKey: month.monthKey,
      monthName: month.monthName,
      newReports: monthlyData[month.monthKey]?.newReports || 0,
      closedReports: monthlyData[month.monthKey]?.closedReports || 0
    }));

    res.json({
      success: true,
      data: result,
      total: {
        newReports: result.reduce((sum, month) => sum + month.newReports, 0),
        closedReports: result.reduce((sum, month) => sum + month.closedReports, 0)
      },
      hospitals: allHospitals.length,
      period: '6 months'
    });

  } catch (error) {
    console.error('GET /dashboard/total/monthly-trends', error);
    res.status(500).json({ 
      success: false,
      error: 'Database error',
      message: error.message 
    });
  }
});

// ========== GET /api/dashboard/total/critical-ratio-by-hospital ==========
router.get('/critical-ratio-by-hospital',
  requireAuth,
  requirePermission('REPORTS_CHART_URGENT_PERCENT'),
  async (req, res) => {
  try {
    // جلب جميع المستشفيات النشطة أولاً
    const [allHospitals] = await pool.query(`
      SELECT HospitalID, NameAr AS HospitalName, SortOrder
      FROM hospitals 
      WHERE IsActive = 1
      ORDER BY SortOrder IS NULL, SortOrder ASC, NameAr ASC
    `);

    // جلب بيانات نسبة البلاغات الحرجة من قواعد بيانات المستشفيات المنفصلة
    const { getHospitalPool } = await import('../config/db.js');
    const criticalRatioData = [];
    
    for (const hospital of allHospitals) {
      try {
        const hospitalPool = await getHospitalPool(hospital.HospitalID);
        
        // جلب إجمالي البلاغات والبلاغات الحرجة
        const [stats] = await hospitalPool.query(`
          SELECT 
            COUNT(*) as totalComplaints,
            SUM(CASE WHEN PriorityCode IN ('HIGH', 'CRITICAL', 'حرجة','عاجلة','عالية','حرج') THEN 1 ELSE 0 END) as criticalComplaints
          FROM complaints 
          WHERE (IsDeleted = 0 OR IsDeleted IS NULL)
        `);

        const stat = stats[0] || {};
        const totalComplaints = parseInt(stat.totalComplaints || 0);
        const criticalComplaints = parseInt(stat.criticalComplaints || 0);
        
        // حساب النسبة المئوية
        const criticalPercentage = totalComplaints > 0 
          ? Math.round((criticalComplaints / totalComplaints) * 100) 
          : 0;

        criticalRatioData.push({
          HospitalID: hospital.HospitalID,
          HospitalName: hospital.HospitalName,
          totalComplaints: totalComplaints,
          criticalComplaints: criticalComplaints,
          criticalPercentage: criticalPercentage
        });

      } catch (error) {
        console.error(`خطأ في جلب نسبة البلاغات الحرجة من المستشفى ${hospital.HospitalID}:`, error.message);
        
        // إضافة بيانات افتراضية في حالة الخطأ
        criticalRatioData.push({
          HospitalID: hospital.HospitalID,
          HospitalName: hospital.HospitalName,
          totalComplaints: 0,
          criticalComplaints: 0,
          criticalPercentage: 0
        });
      }
    }

    // ترتيب المستشفيات حسب النسبة المئوية للبلاغات الحرجة (تنازلي)
    criticalRatioData.sort((a, b) => b.criticalPercentage - a.criticalPercentage);

    // إظهار المستشفيات التي لها بلاغات فقط
    const filteredData = criticalRatioData.filter(hospital => hospital.totalComplaints > 0);

    res.json({
      success: true,
      data: filteredData,
      total: {
        hospitals: filteredData.length,
        totalComplaints: filteredData.reduce((sum, h) => sum + h.totalComplaints, 0),
        totalCritical: filteredData.reduce((sum, h) => sum + h.criticalComplaints, 0)
      }
    });

  } catch (error) {
    console.error('GET /dashboard/total/critical-ratio-by-hospital', error);
    res.status(500).json({ 
      success: false,
      error: 'Database error',
      message: error.message 
    });
  }
});

// ========== GET /api/dashboard/total/funnel-by-hospital ==========
router.get('/funnel-by-hospital',
  requireAuth,
  requirePermission('REPORTS_PAGE'),
  async (req, res) => {
  try {
    // جلب جميع المستشفيات النشطة أولاً
    const [allHospitals] = await pool.query(`
      SELECT HospitalID, NameAr AS HospitalName, SortOrder
      FROM hospitals 
      WHERE IsActive = 1
      ORDER BY SortOrder IS NULL, SortOrder ASC, NameAr ASC
    `);

    // جلب بيانات قمع رحلة البلاغ من قواعد بيانات المستشفيات المنفصلة
    const { getHospitalPool } = await import('../config/db.js');
    const funnelData = {
      submitted: 0,
      assigned: 0,
      inProgress: 0,
      awaitingResponse: 0,
      closed: 0
    };
    
    for (const hospital of allHospitals) {
      try {
        const hospitalPool = await getHospitalPool(hospital.HospitalID);
        
        // جلب عدد البلاغات في كل مرحلة
        const [stats] = await hospitalPool.query(`
          SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN AssignedToUserID IS NULL THEN 1 ELSE 0 END) as submitted,
            SUM(CASE WHEN AssignedToUserID IS NOT NULL AND StatusCode NOT IN ('CLOSED', 'مغلق', 'محلول', 'مكتمل') THEN 1 ELSE 0 END) as assigned,
            SUM(CASE WHEN StatusCode IN ('IN_PROGRESS', 'قيد المعالجة', 'قيد المراجعة') THEN 1 ELSE 0 END) as inProgress,
            SUM(CASE WHEN StatusCode IN ('AWAITING_RESPONSE', 'بانتظار رد', 'في انتظار الرد') THEN 1 ELSE 0 END) as awaitingResponse,
            SUM(CASE WHEN StatusCode IN ('CLOSED', 'مغلق', 'محلول', 'مكتمل') THEN 1 ELSE 0 END) as closed
          FROM complaints 
          WHERE (IsDeleted = 0 OR IsDeleted IS NULL)
        `);

        const stat = stats[0] || {};
        
        // إضافة البيانات إلى المجموع العام
        funnelData.submitted += parseInt(stat.submitted || 0);
        funnelData.assigned += parseInt(stat.assigned || 0);
        funnelData.inProgress += parseInt(stat.inProgress || 0);
        funnelData.awaitingResponse += parseInt(stat.awaitingResponse || 0);
        funnelData.closed += parseInt(stat.closed || 0);

      } catch (error) {
        console.error(`خطأ في جلب بيانات قمع رحلة البلاغ من المستشفى ${hospital.HospitalID}:`, error.message);
      }
    }

    res.json({
      success: true,
      data: funnelData,
      total: {
        hospitals: allHospitals.length,
        totalComplaints: funnelData.submitted + funnelData.assigned + funnelData.inProgress + funnelData.awaitingResponse + funnelData.closed
      }
    });

  } catch (error) {
    console.error('GET /dashboard/total/funnel-by-hospital', error);
    res.status(500).json({ 
      success: false,
      error: 'Database error',
      message: error.message 
    });
  }
});

// ========== GET /api/dashboard/total/hospitals ==========
router.get('/hospitals', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT HospitalID, NameAr AS HospitalName
      FROM hospitals
      WHERE IsActive = 1
      ORDER BY SortOrder IS NULL, SortOrder ASC, NameAr ASC
    `);
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Database error', message: e.message });
  }
});

// ========== GET /api/dashboard/total/funnel/:id ==========
router.get('/funnel/:id', async (req, res) => {
  try {
    const hospitalId = Number(req.params.id);
    if (!hospitalId) return res.status(400).json({ success: false, message: 'HospitalID مطلوب' });

    const { getHospitalPool } = await import('../config/db.js');
    const hospitalPool = await getHospitalPool(hospitalId);

    const [stats] = await hospitalPool.query(`
      SELECT
        COUNT(*) AS submitted,
        SUM(CASE WHEN AssignedToUserID IS NOT NULL 
                 AND StatusCode NOT IN ('CLOSED','مغلق','محلول','مكتمل') 
            THEN 1 ELSE 0 END) AS assigned,
        SUM(CASE WHEN StatusCode IN ('IN_PROGRESS','قيد المعالجة','قيد المراجعة') 
            THEN 1 ELSE 0 END) AS inProgress,
        SUM(CASE WHEN StatusCode IN ('AWAITING_RESPONSE','بانتظار رد','في انتظار الرد') 
            THEN 1 ELSE 0 END) AS awaitingResponse,
        SUM(CASE WHEN StatusCode IN ('CLOSED','مغلق','محلول','مكتمل') 
            THEN 1 ELSE 0 END) AS closed
      FROM complaints
      WHERE (IsDeleted = 0 OR IsDeleted IS NULL)
    `);

    res.json({ success: true, data: stats && stats[0] ? stats[0] : (stats || {}) });
  } catch (e) {
    console.error('GET /dashboard/total/funnel/:id', e);
    res.status(500).json({ success: false, error: 'Database error', message: e.message });
  }
});

// ========== GET /api/dashboard/total/response-times/:id ==========
router.get('/response-times/:id', async (req, res) => {
  try {
    const hospitalId = Number(req.params.id);
    if (!hospitalId) return res.status(400).json({ success: false, message: 'HospitalID مطلوب' });

    const { getHospitalPool } = await import('../config/db.js');
    const hospitalPool = await getHospitalPool(hospitalId);

    // جلب بيانات زمن الاستجابة لكل قسم
    const [responseData] = await hospitalPool.query(`
      SELECT 
        d.NameAr AS departmentName,
        d.DepartmentID,
        COUNT(*) AS totalComplaints,
        MIN(TIMESTAMPDIFF(HOUR, c.CreatedAt, COALESCE(c.UpdatedAt, NOW()))) AS minResponseTime,
        AVG(TIMESTAMPDIFF(HOUR, c.CreatedAt, COALESCE(c.UpdatedAt, NOW()))) AS avgResponseTime,
        MAX(TIMESTAMPDIFF(HOUR, c.CreatedAt, COALESCE(c.UpdatedAt, NOW()))) AS maxResponseTime
      FROM complaints c
      LEFT JOIN departments d ON d.DepartmentID = c.DepartmentID
      WHERE (c.IsDeleted = 0 OR c.IsDeleted IS NULL)
        AND c.CreatedAt IS NOT NULL
        AND c.DepartmentID IS NOT NULL
      GROUP BY c.DepartmentID, d.NameAr, d.DepartmentID
      HAVING COUNT(*) >= 3
      ORDER BY totalComplaints DESC
      LIMIT 10
    `);

    // معالجة البيانات للعرض
    const processedData = responseData.map(item => ({
      departmentName: item.departmentName || 'غير محدد',
      departmentId: item.DepartmentID,
      totalComplaints: Number(item.totalComplaints),
      minResponseTime: Math.round(Number(item.minResponseTime) || 0),
      avgResponseTime: Math.round(Number(item.avgResponseTime) || 0),
      maxResponseTime: Math.round(Number(item.maxResponseTime) || 0),
      median: Math.round(Number(item.avgResponseTime) || 0) // استخدام المتوسط كوسيط
    }));

    res.json({ success: true, data: processedData });
  } catch (e) {
    console.error('GET /dashboard/total/response-times/:id', e);
    res.status(500).json({ success: false, error: 'Database error', message: e.message });
  }
});

// ========== GET /api/dashboard/total/dept-count/:id ==========
router.get('/dept-count/:id', async (req, res) => {
  try {
    const hospitalId = Number(req.params.id);
    if (!hospitalId) return res.status(400).json({ success: false, message: 'HospitalID مطلوب' });

    const { getHospitalPool } = await import('../config/db.js');
    const hospitalPool = await getHospitalPool(hospitalId);

    // جلب عدد البلاغات لكل قسم
    const [deptData] = await hospitalPool.query(`
      SELECT 
        d.NameAr AS departmentName,
        d.DepartmentID,
        COUNT(c.ComplaintID) AS complaintCount,
        SUM(CASE WHEN c.StatusCode IN ('CLOSED','مغلق','محلول','مكتمل') THEN 1 ELSE 0 END) AS closedCount,
        SUM(CASE WHEN c.StatusCode NOT IN ('CLOSED','مغلق','محلول','مكتمل') THEN 1 ELSE 0 END) AS openCount
      FROM departments d
      LEFT JOIN complaints c ON d.DepartmentID = c.DepartmentID 
        AND (c.IsDeleted = 0 OR c.IsDeleted IS NULL)
      WHERE d.IsActive = 1 OR d.IsActive IS NULL
      GROUP BY d.DepartmentID, d.NameAr
      HAVING COUNT(c.ComplaintID) > 0
      ORDER BY complaintCount DESC
      LIMIT 15
    `);

    // معالجة البيانات للعرض
    const processedData = deptData.map(item => ({
      departmentName: item.departmentName || 'غير محدد',
      departmentId: item.DepartmentID,
      complaintCount: Number(item.complaintCount),
      closedCount: Number(item.closedCount),
      openCount: Number(item.openCount)
    }));

    res.json({ success: true, data: processedData });
  } catch (e) {
    console.error('GET /dashboard/total/dept-count/:id', e);
    res.status(500).json({ success: false, error: 'Database error', message: e.message });
  }
});

// ========== GET /api/dashboard/total/top-employees/:id ==========
router.get('/top-employees/:id',
  requireAuth,
  requirePermission('REPORTS_CHART_TOP_EMPLOYEES'),
  async (req, res) => {
  try {
    const hospitalId = Number(req.params.id);
    const topN = Number(req.query.top) || 8; // عدد الموظفين المطلوب عرضهم
    
    if (!hospitalId) return res.status(400).json({ success: false, message: 'HospitalID مطلوب' });

    const { getHospitalPool } = await import('../config/db.js');
    const hospitalPool = await getHospitalPool(hospitalId);

    // جلب الموظفين الأكثر تكررًا في البلاغات
    const [employeeData] = await hospitalPool.query(`
      SELECT 
        ct.TargetEmployeeID,
        ct.TargetEmployeeName,
        ct.TargetDepartmentID,
        ct.TargetDepartmentName,
        COUNT(*) AS complaintCount,
        MIN(ct.CreatedAt) AS firstComplaint,
        MAX(ct.CreatedAt) AS lastComplaint
      FROM complaint_targets ct
      WHERE ct.TargetEmployeeID IS NOT NULL 
        AND ct.TargetEmployeeName IS NOT NULL
        AND ct.TargetEmployeeName != ''
      GROUP BY ct.TargetEmployeeID, ct.TargetEmployeeName, ct.TargetDepartmentID, ct.TargetDepartmentName
      HAVING COUNT(*) >= 1
      ORDER BY complaintCount DESC
      LIMIT ?
    `, [topN]);

    // معالجة البيانات للعرض
    const processedData = employeeData.map(item => ({
      employeeId: item.TargetEmployeeID,
      employeeName: item.TargetEmployeeName,
      departmentId: item.TargetDepartmentID,
      departmentName: item.TargetDepartmentName,
      complaintCount: Number(item.complaintCount),
      firstComplaint: item.firstComplaint,
      lastComplaint: item.lastComplaint,
      displayName: `${item.TargetEmployeeName} - ${item.TargetDepartmentName}`
    }));

    res.json({ success: true, data: processedData });
  } catch (e) {
    console.error('GET /dashboard/total/top-employees/:id', e);
    res.status(500).json({ success: false, error: 'Database error', message: e.message });
  }
});

// ========== GET /api/dashboard/total/reports-by-type ==========
router.get('/reports-by-type',
  requireAuth,
  requirePermission('REPORTS_CHART_BY_HOSPITAL_TYPE'),
  async (req, res) => {
  try {
    // جلب بيانات المستخدم من التوكن
    const user = req.user;
    const userRoleId = Number(user?.RoleID || user?.roleId || 0);
    const userHospitalId = Number(user?.HospitalID || user?.hospitalId || 0);
    
    console.log('🔐 فحص صلاحيات المستخدم في API:', { userRoleId, userHospitalId });
    
    let hospitalsToProcess = [];
    
    // إذا كان مدير تجمع، اجلب جميع المستشفيات
    if (userRoleId === 1) {
      console.log('✅ مدير تجمع - جلب بيانات جميع المستشفيات');
      const [allHospitals] = await pool.query(`
        SELECT HospitalID, NameAr AS HospitalName
        FROM hospitals
        WHERE IsActive = 1
        ORDER BY SortOrder IS NULL, SortOrder ASC, NameAr ASC
      `);
      hospitalsToProcess = allHospitals;
    } 
    // إذا كان موظف عادي، اجلب فقط مستشفاه
    else if (userHospitalId > 0) {
      console.log('👤 موظف عادي - جلب بيانات مستشفى واحد فقط:', userHospitalId);
      const [userHospital] = await pool.query(`
        SELECT HospitalID, NameAr AS HospitalName
        FROM hospitals
        WHERE HospitalID = ? AND IsActive = 1
      `, [userHospitalId]);
      hospitalsToProcess = userHospital;
    }
    // إذا لم توجد بيانات مستخدم صحيحة
    else {
      console.warn('⚠️ بيانات مستخدم غير صحيحة');
      return res.status(400).json({ success: false, message: 'بيانات مستخدم غير صحيحة' });
    }
    
    const results = [];
    
    // معالجة كل مستشفى
    for (const hospital of hospitalsToProcess) {
      try {
        const { getHospitalPool } = await import('../config/db.js');
        const hospitalPool = await getHospitalPool(hospital.HospitalID);
        
        // جلب إحصائيات البلاغات حسب النوع
        const [stats] = await hospitalPool.query(`
          SELECT 
            COUNT(*) AS totalReports,
            SUM(CASE WHEN StatusCode IN ('CLOSED','مغلق','محلول','مكتمل') THEN 1 ELSE 0 END) AS closedReports,
            SUM(CASE WHEN StatusCode NOT IN ('CLOSED','مغلق','محلول','مكتمل') THEN 1 ELSE 0 END) AS openReports,
            SUM(CASE WHEN UPPER(PriorityCode) IN ('CRITICAL','URGENT')
                      OR PriorityCode IN ('حرجة','حرج','عاجلة','عاجل')
                 THEN 1 ELSE 0 END) AS criticalReports
          FROM complaints
          WHERE (IsDeleted = 0 OR IsDeleted IS NULL)
        `);
        
        const hospitalStats = stats && stats[0] ? stats[0] : {
          totalReports: 0,
          closedReports: 0,
          openReports: 0,
          criticalReports: 0
        };
        
        results.push({
          hospitalId: hospital.HospitalID,
          hospitalName: hospital.HospitalName,
          totalReports: Number(hospitalStats.totalReports),
          closedReports: Number(hospitalStats.closedReports),
          openReports: Number(hospitalStats.openReports),
          criticalReports: Number(hospitalStats.criticalReports)
        });
        
        console.log(`📊 مستشفى ${hospital.HospitalName}: ${hospitalStats.totalReports} إجمالي، ${hospitalStats.openReports} مفتوح، ${hospitalStats.closedReports} مغلق، ${hospitalStats.criticalReports} حرج`);
        
      } catch (error) {
        console.error(`❌ خطأ في جلب بيانات مستشفى ${hospital.HospitalName}:`, error.message);
        // إضافة بيانات فارغة في حالة الخطأ
        results.push({
          hospitalId: hospital.HospitalID,
          hospitalName: hospital.HospitalName,
          totalReports: 0,
          closedReports: 0,
          openReports: 0,
          criticalReports: 0
        });
      }
    }
    
    res.json({ success: true, data: results });
  } catch (e) {
    console.error('GET /dashboard/total/reports-by-type', e);
    res.status(500).json({ success: false, error: 'Database error', message: e.message });
  }
});

// ========== GET /api/dashboard/total/critical-ratio ==========
router.get('/critical-ratio',
  requireAuth,
  requirePermission('REPORTS_CHART_URGENT_PERCENT'),
  async (req, res) => {
  try {
    // جلب بيانات المستخدم من التوكن
    const user = req.user;
    const userRoleId = Number(user?.RoleID || user?.roleId || 0);
    const userHospitalId = Number(user?.HospitalID || user?.hospitalId || 0);
    
    console.log('🔐 فحص صلاحيات المستخدم في API نسبة البلاغات الحرجة:', { userRoleId, userHospitalId });
    
    let hospitalsToProcess = [];
    
    // إذا كان مدير تجمع، اجلب جميع المستشفيات
    if (userRoleId === 1) {
      console.log('✅ مدير تجمع - جلب بيانات جميع المستشفيات');
      const [allHospitals] = await pool.query(`
        SELECT HospitalID, NameAr AS HospitalName
        FROM hospitals
        WHERE IsActive = 1
        ORDER BY SortOrder IS NULL, SortOrder ASC, NameAr ASC
      `);
      hospitalsToProcess = allHospitals;
    } 
    // إذا كان موظف عادي، اجلب فقط مستشفاه
    else if (userHospitalId > 0) {
      console.log('👤 موظف عادي - جلب بيانات مستشفى واحد فقط:', userHospitalId);
      const [userHospital] = await pool.query(`
        SELECT HospitalID, NameAr AS HospitalName
        FROM hospitals
        WHERE HospitalID = ? AND IsActive = 1
      `, [userHospitalId]);
      hospitalsToProcess = userHospital;
    }
    // إذا لم توجد بيانات مستخدم صحيحة
    else {
      console.warn('⚠️ بيانات مستخدم غير صحيحة');
      return res.status(400).json({ success: false, message: 'بيانات مستخدم غير صحيحة' });
    }
    
    const results = [];
    
    // معالجة كل مستشفى
    for (const hospital of hospitalsToProcess) {
      try {
        const { getHospitalPool } = await import('../config/db.js');
        const hospitalPool = await getHospitalPool(hospital.HospitalID);
        
        // جلب إحصائيات البلاغات الحرجة
        const [stats] = await hospitalPool.query(`
          SELECT 
            COUNT(*) AS totalReports,
            SUM(CASE WHEN UPPER(PriorityCode) IN ('CRITICAL','URGENT')
                      OR PriorityCode IN ('حرجة','حرج','عاجلة','عاجل')
                 THEN 1 ELSE 0 END) AS criticalReports
          FROM complaints
          WHERE (IsDeleted = 0 OR IsDeleted IS NULL)
        `);
        
        const hospitalStats = stats && stats[0] ? stats[0] : {
          totalReports: 0,
          criticalReports: 0
        };
        
        // حساب النسبة المئوية
        const totalReports = Number(hospitalStats.totalReports);
        const criticalReports = Number(hospitalStats.criticalReports);
        const criticalRatio = totalReports > 0 ? Math.round((criticalReports / totalReports) * 100) : 0;
        
        results.push({
          hospitalId: hospital.HospitalID,
          hospitalName: hospital.HospitalName,
          totalReports: totalReports,
          criticalReports: criticalReports,
          criticalRatio: criticalRatio
        });
        
        console.log(`📊 مستشفى ${hospital.HospitalName}: ${totalReports} إجمالي، ${criticalReports} حرج، ${criticalRatio}% نسبة حرجة`);
        
      } catch (error) {
        console.error(`❌ خطأ في جلب بيانات مستشفى ${hospital.HospitalName}:`, error.message);
        // إضافة بيانات فارغة في حالة الخطأ
        results.push({
          hospitalId: hospital.HospitalID,
          hospitalName: hospital.HospitalName,
          totalReports: 0,
          criticalReports: 0,
          criticalRatio: 0
        });
      }
    }
    
    // ترتيب النتائج حسب النسبة المئوية (تنازلي)
    results.sort((a, b) => b.criticalRatio - a.criticalRatio);
    
    res.json({ success: true, data: results });
  } catch (e) {
    console.error('GET /dashboard/total/critical-ratio', e);
    res.status(500).json({ success: false, error: 'Database error', message: e.message });
  }
});

/**
 * GET /api/dashboard/total/critical-reports
 * جلب البلاغات الحرجة/العاجلة
 */
router.get('/critical-reports',
  requireAuth,
  requirePermission('DASH_URGENT_LIST'),
  async (req, res) => {
  try {
    const isCluster = Boolean(
      req.user?.isClusterManager === true ||
      req.user?.is_cluster_manager === true ||
      req.user?.role === 'cluster_admin' ||
      req.user?.RoleID === 1 || req.user?.roleId === 1 || req.user?.role_id === 1
    );

    const qHosp      = req.query.hospitalId ? Number(req.query.hospitalId) : null;
    const userHospId = (req.user?.HospitalID ?? req.user?.hospitalId ?? null);

    // إذا كان مدير: استخدم باراميتر الاستعلام إن وُجد، وإلا = null (يعني كل المستشفيات)
    // إذا كان موظف: استخدم HospitalID من المستخدم، أو من الاستعلام إن وُجد
    const hospitalId = isCluster ? (qHosp || null) : (userHospId || qHosp || null);

    // موظف بدون مستشفى معروف → فقط هنا نرجّع 400
    if (!isCluster && !hospitalId) {
      return res.status(400).json({ success:false, message:'hospitalId مطلوب' });
    }

    // SQL الشرط الأساسي
    const CRIT = `
      (
        LOWER(c.PriorityCode) IN ('urgent','critical','high')
        OR c.PriorityCode IN ('حرجة','حرج','عاجلة','عاجل','عالية')
      )
    `;
    const NOT_DELETED = `(c.IsDeleted = 0 OR c.IsDeleted IS NULL)`;

    // دالة تساعدنا نقرأ من مستشفى واحد
    async function fetchOneHospital(hId, hospitalName=null) {
      const { getHospitalPool } = await import('../config/db.js');
      const pool = await getHospitalPool(hId);           // ← هنا دائمًا hId رقم صحيح
      // ما نسوي JOIN على hospitals لو القاعدة قاعدة مستشفى
      const [[{ db }]] = await pool.query('SELECT DATABASE() AS db');
      const selectHospitalName = db?.startsWith('hosp_')
        ? 'NULL AS HospitalName'
        : 'h.NameAr AS HospitalName';
      const joinHospital = db?.startsWith('hosp_')
        ? ''
        : 'LEFT JOIN hospitals h ON h.HospitalID = c.HospitalID';

      const sql = `
        SELECT
          c.ComplaintID,
          c.TicketNumber,
          c.HospitalID,
          ${selectHospitalName},
          d.NameAr AS DepartmentName,
          t.TypeName,
          c.PriorityCode,
          c.StatusCode,
          c.CreatedAt
        FROM complaints c
        ${joinHospital}
        LEFT JOIN departments     d ON d.DepartmentID     = c.DepartmentID
        LEFT JOIN complaint_types t ON t.ComplaintTypeID  = c.ComplaintTypeID
        WHERE ${CRIT} AND ${NOT_DELETED}
        ORDER BY c.CreatedAt DESC
        LIMIT 500
      `;
      const [rows] = await pool.query(sql);

      // إن كنا على قاعدة مستشفى والاسم مفقود، نحط الاسم الممرّر (إن وُجد)
      if (hospitalName) rows.forEach(r => r.HospitalName = hospitalName);
      return rows;
    }

    // مدير التجمع ولم يحدد مستشفى → كل المستشفيات
    if (isCluster && !hospitalId) {
      const { centralDb } = await import('../config/db.js');
      const [hospitals] = await centralDb.query(
        `SELECT HospitalID, NameAr FROM hospitals WHERE IsActive = 1`
      );

      const all = [];
      for (const h of hospitals) {
        try {
          const rows = await fetchOneHospital(h.HospitalID, h.NameAr);
          rows.forEach(r => {
            r.HospitalID = h.HospitalID;
            r.HospitalName = r.HospitalName || h.NameAr;
            all.push(r);
          });
        } catch (e) {
          console.warn('skip hospital', h.HospitalID, e.message);
        }
      }

      // ملخّص
      const affectedHospitals = new Set(all.map(r => r.HospitalID)).size;
      const typeCounts = all.reduce((acc, r) => {
        const k = r.TypeName || 'غير محدد';
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      }, {});
      const mostFrequentType = Object.keys(typeCounts).length
        ? Object.entries(typeCounts).sort((a,b)=>b[1]-a[1])[0][0]
        : 'غير محدد';

      return res.json({
        success: true,
        data: {
          summary: { totalCritical: all.length, affectedHospitals, mostFrequentType },
          reports: all
        }
      });
    }

    // موظف (أو مدير حدّد hospitalId) → مستشفى واحد
    if (!hospitalId) {
      // حماية من NaN: لا نكمل بدون hospitalId
      return res.status(400).json({ success:false, message:'hospitalId مطلوب' });
    }

    const rows = await fetchOneHospital(Number(hospitalId));

    const affectedHospitals = new Set(rows.map(r => r.HospitalID)).size;
    const typeCounts = rows.reduce((acc, r) => {
      const k = r.TypeName || 'غير محدد';
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});
    const mostFrequentType = Object.keys(typeCounts).length
      ? Object.entries(typeCounts).sort((a,b)=>b[1]-a[1])[0][0]
      : 'غير محدد';

    return res.json({
      success: true,
      data: {
        summary: { totalCritical: rows.length, affectedHospitals, mostFrequentType },
        reports: rows
      }
    });
  } catch (err) {
    console.error('critical-reports error:', err);
    res.status(500).json({ success:false, message:'خطأ في جلب البلاغات الحرجة' });
  }
});

// ========== GET /api/dashboard/total/home-stats ==========
// 📊 إحصائيات الصفحة الرئيسية (index.html)
router.get('/home-stats', async (req, res) => {
  try {
    // جلب جميع المستشفيات النشطة
    const [hospitals] = await pool.query(`
      SELECT HospitalID, NameAr 
      FROM hospitals 
      WHERE IsActive = 1
    `);

    const { getHospitalPool } = await import('../config/db.js');
    
    let totalComplaints = 0;
    let totalUsers = 0;
    
    // جلب البلاغات من كل مستشفى
    for (const hospital of hospitals) {
      try {
        const hospitalPool = await getHospitalPool(hospital.HospitalID);
        
        // عدد البلاغات المُعالجة
        const [[complaintStats]] = await hospitalPool.query(`
          SELECT COUNT(*) as total
          FROM complaints 
          WHERE (IsDeleted = 0 OR IsDeleted IS NULL)
        `);
        
        totalComplaints += Number(complaintStats?.total || 0);
        
        // عدد المستخدمين النشطين
        const [[userStats]] = await hospitalPool.query(`
          SELECT COUNT(DISTINCT UserID) as total
          FROM users 
          WHERE (IsActive = 1 OR IsActive IS NULL)
        `);
        
        totalUsers += Number(userStats?.total || 0);
        
      } catch (err) {
        console.warn(`⚠️ خطأ في جلب بيانات مستشفى ${hospital.NameAr}:`, err.message);
      }
    }
    
    res.json({
      success: true,
      data: {
        complaintsProcessed: totalComplaints,
        activeBeneficiaries: totalUsers,
        hospitalCoverage: hospitals.length,
        activeHospitals: hospitals.length
      }
    });
    
  } catch (error) {
    console.error('GET /dashboard/total/home-stats', error);
    res.status(500).json({ 
      success: false,
      error: 'Database error',
      message: error.message 
    });
  }
});

export default router;
