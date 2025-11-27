import express from 'express';
import { pool } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

const urgentCondition = (alias = 'c') => `(
  UPPER(${alias}.PriorityCode) IN ('CRITICAL','URGENT','HIGH')
  OR ${alias}.PriorityCode IN ('حرجة','عاجلة','عالية','حرج')
)`;

router.get('/all', requireAuth, async (req, res) => {
  try {
    // 1. جلب جميع المستشفيات النشطة
    const [allHospitals] = await pool.query(`
      SELECT HospitalID, NameAr AS HospitalName, SortOrder
      FROM hospitals 
      WHERE IsActive = 1
      ORDER BY SortOrder IS NULL, SortOrder ASC, NameAr ASC
    `);
    
    const { getHospitalPool } = await import('../config/db.js');

    let totalUrgent = 0;
    let closedUrgentLegacy = 0;
    let openUrgentLegacy = 0;
    let closedUrgentSla = 0;
    let openUrgentSla = 0;
    let totalDuration = 0;
    let closedWithDuration = 0;
    let mistreatment = 0;
    let medicine = 0;

    const byHospital = [];
    const employeeMap = new Map();
    const weeklyMap = new Map();
    const deptMap = new Map();
    const subPerHospital = [];
    const employeesMistreatmentOverall = new Map();
    const employeesMistreatmentByHospital = new Map();
    const mistreatmentClosingTime = [];
    const mistreatmentSlaList = [];
    const labSlaList = [];
    const harassmentList = [];

    // 2. التكرار على كل مستشفى وجمع البيانات
    for (const hospital of allHospitals) {
      try {
        const hospitalPool = await getHospitalPool(hospital.HospitalID);
        
        // سوء تعامل + أدوية لكل مستشفى
        const [[subCounts]] = await hospitalPool.query(`
          SELECT
            SUM(CASE WHEN (ComplaintTypeID IN (17) OR SubTypeID IN (15, 29, 8)) THEN 1 ELSE 0 END) AS mistreatment,
            SUM(CASE WHEN ComplaintTypeID = 6 THEN 1 ELSE 0 END) AS medicine
          FROM complaints c
          WHERE ${urgentCondition('c')}
            AND (IsDeleted = 0 OR IsDeleted IS NULL)
        `);

        subPerHospital.push({
          id: hospital.HospitalID,
          name: hospital.HospitalName,
          mistreatment: Number(subCounts.mistreatment || 0),
          medicine: Number(subCounts.medicine || 0)
        });

        // --- تشخيص: طباعة عينة من حالات بلاغات سوء التعامل ---
        const [sampleComplaints] = await hospitalPool.query(`
          SELECT ComplaintID, StatusCode, ActualClosingHours, CreatedAt, UpdatedAt 
          FROM complaints c 
          WHERE (c.ComplaintTypeID IN (17) OR c.SubTypeID IN (15, 29, 8))
            AND UPPER(c.PriorityCode) IN ('URGENT','CRITICAL','HIGH')
            AND (c.IsDeleted = 0 OR c.IsDeleted IS NULL)
          LIMIT 5
        `);
        if (sampleComplaints.length > 0) {
          console.log(`🔍 [${hospital.HospitalName}] عينة بلاغات سوء التعامل:`, sampleComplaints.map(c => ({
            id: c.ComplaintID,
            status: c.StatusCode,
            hours: c.ActualClosingHours,
            created: c.CreatedAt
          })));
        }
        // -------------------------------------------------------

        // سوء التعامل + متوسط زمن الإغلاق (مع إجمالي ومغلق)
        // ملاحظة: هذا الاستعلام يشمل فقط بلاغات سوء التعامل الحرجة
        const [[mistreatmentTimeRow]] = await hospitalPool.query(`
          SELECT
            COUNT(*) AS totalMistreatment,
            SUM(
              CASE 
                WHEN UPPER(c.StatusCode) IN ('CLOSED','RESOLVED','CANCELLED')
                     OR c.StatusCode LIKE '%مغلق%' OR c.StatusCode LIKE '%مغلقة%'
                     OR c.StatusCode LIKE '%محلول%' OR c.StatusCode LIKE '%مكتمل%'
                     OR c.StatusCode LIKE '%منتهي%'
                THEN 1 ELSE 0
              END
            ) AS closedMistreatment,
            AVG(
              CASE
                WHEN UPPER(c.StatusCode) IN ('CLOSED','RESOLVED','CANCELLED')
                     OR c.StatusCode LIKE '%مغلق%' OR c.StatusCode LIKE '%مغلقة%'
                     OR c.StatusCode LIKE '%محلول%' OR c.StatusCode LIKE '%مكتمل%'
                     OR c.StatusCode LIKE '%منتهي%'
                THEN COALESCE(
                  c.ActualClosingHours,
                  TIMESTAMPDIFF(
                    HOUR,
                    c.CreatedAt,
                    COALESCE(
                      h_close.ChangedAt,
                      c.UpdatedAt,
                      CASE 
                        WHEN c.ActualClosingHours IS NOT NULL AND c.ActualClosingHours > 0
                        THEN DATE_ADD(c.CreatedAt, INTERVAL c.ActualClosingHours HOUR)
                        ELSE NOW()
                      END
                    )
                  )
                )
                ELSE NULL
              END
            ) AS avgHours
          FROM complaints c
          LEFT JOIN (
            SELECT 
              h.ComplaintID,
              MAX(h.ChangedAt) AS ChangedAt
            FROM complaint_status_history h
            WHERE UPPER(h.NewStatusCode) IN ('CLOSED','RESOLVED','CANCELLED')
               OR h.NewStatusCode LIKE '%مغلق%' OR h.NewStatusCode LIKE '%مغلقة%'
               OR h.NewStatusCode LIKE '%محلول%' OR h.NewStatusCode LIKE '%مكتمل%'
            GROUP BY h.ComplaintID
          ) h_close ON h_close.ComplaintID = c.ComplaintID
          WHERE (c.ComplaintTypeID IN (17) OR c.SubTypeID IN (15, 29, 8))
            AND UPPER(c.PriorityCode) IN ('URGENT','CRITICAL','HIGH')
            AND (c.IsDeleted = 0 OR c.IsDeleted IS NULL)
        `);

        const avgHoursValue = mistreatmentTimeRow?.avgHours !== null && mistreatmentTimeRow?.avgHours !== undefined
          ? Number(mistreatmentTimeRow.avgHours)
          : 0;

        // تسجيل للتشخيص (يمكن إزالته لاحقاً)
        if (mistreatmentTimeRow?.closedMistreatment > 0 && avgHoursValue === 0) {
          console.log(`⚠️ [${hospital.HospitalName}] بلاغات مغلقة: ${mistreatmentTimeRow.closedMistreatment}, لكن avgHours = ${mistreatmentTimeRow.avgHours}`);
        }

        mistreatmentClosingTime.push({
          id: hospital.HospitalID,
          name: hospital.HospitalName,
          count: Number(mistreatmentTimeRow?.totalMistreatment || 0),
          closedCount: Number(mistreatmentTimeRow?.closedMistreatment || 0),
          avgHours: avgHoursValue
        });

        // حساب سوء التعامل خلال 24 ساعة والمتجاوز
        // الحل النهائي: استخدام ActualClosingHours + فلترة البلاغات الحرجة + تعريف دقيق لسوء التعامل
        const [[mistreatmentSLA]] = await hospitalPool.query(`
          SELECT
            SUM(
              CASE 
                WHEN 
                  (
                    c.ComplaintTypeID IN (17)
                    OR c.SubTypeID IN (15, 29, 8)
                  )
                  AND UPPER(c.PriorityCode) IN ('URGENT','CRITICAL','HIGH')
                  AND UPPER(c.StatusCode) IN ('CLOSED','RESOLVED','CANCELLED')
                  AND TIMESTAMPDIFF(
                    HOUR,
                    c.CreatedAt,
                    COALESCE(
                      h_close.ChangedAt,
                      c.UpdatedAt,
                      CASE 
                        WHEN c.ActualClosingHours IS NOT NULL AND c.ActualClosingHours > 0
                        THEN DATE_ADD(c.CreatedAt, INTERVAL c.ActualClosingHours HOUR)
                        ELSE NOW()
                      END
                    )
                  ) <= 24
                THEN 1 ELSE 0 
              END
            ) AS within24,
            
            SUM(
              CASE 
                WHEN 
                  (
                    c.ComplaintTypeID IN (17)
                    OR c.SubTypeID IN (15, 29, 8)
                  )
                  AND UPPER(c.PriorityCode) IN ('URGENT','CRITICAL','HIGH')
                  AND (
                    UPPER(c.StatusCode) NOT IN ('CLOSED','RESOLVED','CANCELLED')
                    OR TIMESTAMPDIFF(
                      HOUR,
                      c.CreatedAt,
                      COALESCE(
                        h_close.ChangedAt,
                        c.UpdatedAt,
                        CASE 
                          WHEN c.ActualClosingHours IS NOT NULL AND c.ActualClosingHours > 0
                          THEN DATE_ADD(c.CreatedAt, INTERVAL c.ActualClosingHours HOUR)
                          ELSE NOW()
                        END
                      )
                    ) > 24
                  )
                THEN 1 ELSE 0 
              END
            ) AS over24
          FROM complaints c
          LEFT JOIN (
            SELECT 
              h.ComplaintID,
              MAX(h.ChangedAt) AS ChangedAt
            FROM complaint_status_history h
            WHERE UPPER(h.NewStatusCode) IN ('CLOSED','RESOLVED','CANCELLED')
               OR h.NewStatusCode LIKE '%مغلق%' OR h.NewStatusCode LIKE '%مغلقة%'
               OR h.NewStatusCode LIKE '%محلول%' OR h.NewStatusCode LIKE '%مكتمل%'
            GROUP BY h.ComplaintID
          ) h_close ON h_close.ComplaintID = c.ComplaintID
          WHERE (c.IsDeleted = 0 OR c.IsDeleted IS NULL)
        `);

        mistreatmentSlaList.push({
          id: hospital.HospitalID,
          name: hospital.HospitalName,
          within24: Number(mistreatmentSLA?.within24 || 0),
          over24: Number(mistreatmentSLA?.over24 || 0)
        });

        // 🔬 حساب SLA المختبرات (بدون شرط الأولوية الحرجة - لأن بلاغات المختبر غالباً ليست حرجة)
        const [[labSLA]] = await hospitalPool.query(`
          SELECT
            SUM(
              CASE 
                WHEN 
                  (
                    (st.SubTypeName LIKE '%تحاليل%' 
                     OR st.SubTypeName LIKE '%الفحوصات%'
                     OR st.SubTypeName LIKE '%مخبري%'
                     OR st.SubTypeName LIKE '%مختبر%')
                    OR c.ComplaintTypeID = 16
                  )
                  AND UPPER(c.StatusCode) IN ('CLOSED','RESOLVED','CANCELLED')
                  AND TIMESTAMPDIFF(
                    HOUR, 
                    c.CreatedAt, 
                    COALESCE(
                      h_close.ChangedAt,
                      c.UpdatedAt,
                      CASE 
                        WHEN c.ActualClosingHours IS NOT NULL AND c.ActualClosingHours > 0
                        THEN DATE_ADD(c.CreatedAt, INTERVAL c.ActualClosingHours HOUR)
                        ELSE NOW()
                      END
                    )
                  ) <= 24
                THEN 1 ELSE 0 
              END
            ) AS within24,
            
            SUM(
              CASE 
                WHEN 
                  (
                    (st.SubTypeName LIKE '%تحاليل%' 
                     OR st.SubTypeName LIKE '%الفحوصات%'
                     OR st.SubTypeName LIKE '%مخبري%'
                     OR st.SubTypeName LIKE '%مختبر%')
                    OR c.ComplaintTypeID = 16
                  )
                  AND (
                    UPPER(c.StatusCode) NOT IN ('CLOSED','RESOLVED','CANCELLED')
                    OR TIMESTAMPDIFF(
                      HOUR, 
                      c.CreatedAt, 
                      COALESCE(
                        h_close.ChangedAt,
                        c.UpdatedAt,
                        CASE 
                          WHEN c.ActualClosingHours IS NOT NULL AND c.ActualClosingHours > 0
                          THEN DATE_ADD(c.CreatedAt, INTERVAL c.ActualClosingHours HOUR)
                          ELSE NOW()
                        END
                      )
                    ) > 24
                  )
                THEN 1 ELSE 0
              END
            ) AS over24
          FROM complaints c
          LEFT JOIN complaint_subtypes st ON st.SubTypeID = c.SubTypeID
          LEFT JOIN (
            SELECT 
              h.ComplaintID,
              MAX(h.ChangedAt) AS ChangedAt
            FROM complaint_status_history h
            WHERE UPPER(h.NewStatusCode) IN ('CLOSED','RESOLVED','CANCELLED')
               OR h.NewStatusCode LIKE '%مغلق%' OR h.NewStatusCode LIKE '%مغلقة%'
               OR h.NewStatusCode LIKE '%محلول%' OR h.NewStatusCode LIKE '%مكتمل%'
            GROUP BY h.ComplaintID
          ) h_close ON h_close.ComplaintID = c.ComplaintID
          WHERE 
            (
              (st.SubTypeName LIKE '%تحاليل%' 
               OR st.SubTypeName LIKE '%الفحوصات%'
               OR st.SubTypeName LIKE '%مخبري%'
               OR st.SubTypeName LIKE '%مختبر%')
              OR c.ComplaintTypeID = 16
            )
            AND (c.IsDeleted = 0 OR c.IsDeleted IS NULL)
        `);

        labSlaList.push({
          id: hospital.HospitalID,
          name: hospital.HospitalName,
          within24: Number(labSLA?.within24 || 0),
          over24: Number(labSLA?.over24 || 0)
        });

        // 🔍 بلاغات التحرش حسب الوصف
        const [[harassmentSLA]] = await hospitalPool.query(`
          SELECT
            SUM(
              CASE 
                WHEN 
                  c.Description LIKE '%تحرش%'
                  AND UPPER(c.StatusCode) IN ('CLOSED','RESOLVED','CANCELLED')
                  AND TIMESTAMPDIFF(
                    HOUR,
                    c.CreatedAt,
                    COALESCE(
                      h_close.ChangedAt,
                      c.UpdatedAt,
                      CASE 
                        WHEN c.ActualClosingHours IS NOT NULL AND c.ActualClosingHours > 0
                        THEN DATE_ADD(c.CreatedAt, INTERVAL c.ActualClosingHours HOUR)
                        ELSE NOW()
                      END
                    )
                  ) <= 24
                THEN 1 ELSE 0 
              END
            ) AS within24,
            
            SUM(
              CASE 
                WHEN 
                  c.Description LIKE '%تحرش%'
                  AND (
                    UPPER(c.StatusCode) NOT IN ('CLOSED','RESOLVED','CANCELLED')
                    OR TIMESTAMPDIFF(
                      HOUR,
                      c.CreatedAt,
                      COALESCE(
                        h_close.ChangedAt,
                        c.UpdatedAt,
                        CASE 
                          WHEN c.ActualClosingHours IS NOT NULL AND c.ActualClosingHours > 0
                          THEN DATE_ADD(c.CreatedAt, INTERVAL c.ActualClosingHours HOUR)
                          ELSE NOW()
                        END
                      )
                    ) > 24
                  )
                THEN 1 ELSE 0 
              END
            ) AS over24
          FROM complaints c
          LEFT JOIN (
            SELECT 
              h.ComplaintID,
              MAX(h.ChangedAt) AS ChangedAt
            FROM complaint_status_history h
            WHERE UPPER(h.NewStatusCode) IN ('CLOSED','RESOLVED','CANCELLED')
               OR h.NewStatusCode LIKE '%مغلق%' OR h.NewStatusCode LIKE '%مغلقة%'
               OR h.NewStatusCode LIKE '%محلول%' OR h.NewStatusCode LIKE '%مكتمل%'
            GROUP BY h.ComplaintID
          ) h_close ON h_close.ComplaintID = c.ComplaintID
          WHERE 
            c.Description LIKE '%تحرش%'
            AND (c.IsDeleted = 0 OR c.IsDeleted IS NULL)
        `);

        harassmentList.push({
          id: hospital.HospitalID,
          name: hospital.HospitalName,
          within24: Number(harassmentSLA?.within24 || 0),
          over24: Number(harassmentSLA?.over24 || 0)
        });

        // أ) إحصائيات عامة للمستشفى
        const [[stats]] = await hospitalPool.query(`
          SELECT 
            COUNT(*) AS total,
            SUM(CASE WHEN UPPER(StatusCode) IN ('CLOSED','RESOLVED','CANCELLED') THEN 1 ELSE 0 END) AS closed,
            SUM(CASE WHEN UPPER(StatusCode) NOT IN ('CLOSED','RESOLVED','CANCELLED') THEN 1 ELSE 0 END) AS open,
            SUM(CASE WHEN UPPER(StatusCode) IN ('CLOSED','RESOLVED','CANCELLED') AND ProcessingDurationHours IS NOT NULL THEN ProcessingDurationHours ELSE 0 END) AS durationSum,
            SUM(CASE WHEN UPPER(StatusCode) IN ('CLOSED','RESOLVED','CANCELLED') AND ProcessingDurationHours IS NOT NULL THEN 1 ELSE 0 END) AS durationCount,
            SUM(CASE WHEN (ComplaintTypeID IN (17) OR SubTypeID IN (15, 29, 8)) THEN 1 ELSE 0 END) AS mistreatment,
            SUM(CASE WHEN ComplaintTypeID = 6 THEN 1 ELSE 0 END) AS medicine
          FROM complaints c
          WHERE ${urgentCondition('c')}
            AND (IsDeleted = 0 OR IsDeleted IS NULL)
        `);

        if (stats) {
          const hCount = Number(stats.total || 0);
          totalUrgent += hCount;
          closedUrgentLegacy += Number(stats.closed || 0);
          openUrgentLegacy += Number(stats.open || 0);
          totalDuration += Number(stats.durationSum || 0);
          closedWithDuration += Number(stats.durationCount || 0);
          mistreatment += Number(stats.mistreatment || 0);
          medicine += Number(stats.medicine || 0);

          if (hCount > 0) {
            byHospital.push({
              id: hospital.HospitalID,
              name: hospital.HospitalName,
              count: hCount
            });
          }
        }

        // ب) البلاغات الحرجة المفتوحة والمغلقة حسب SLA
        const [[urgentStatus]] = await hospitalPool.query(`
          SELECT
            SUM(
              CASE 
                WHEN UPPER(StatusCode) IN ('CLOSED','RESOLVED','CANCELLED')
                     AND (
                        (ComplaintTypeID = 3 AND TIMESTAMPDIFF(HOUR, CreatedAt, NOW()) > 24)
                        OR
                        (ComplaintTypeID <> 3 AND TIMESTAMPDIFF(HOUR, CreatedAt, NOW()) > 48)
                     )
                THEN 1 ELSE 0
              END
            ) AS closedUrgent,
            SUM(
              CASE 
                WHEN UPPER(StatusCode) NOT IN ('CLOSED','RESOLVED','CANCELLED')
                     AND (
                        (ComplaintTypeID = 3 AND TIMESTAMPDIFF(HOUR, CreatedAt, NOW()) > 24)
                        OR
                        (ComplaintTypeID <> 3 AND TIMESTAMPDIFF(HOUR, CreatedAt, NOW()) > 48)
                     )
                THEN 1 ELSE 0
              END
            ) AS openUrgent
          FROM complaints c
          WHERE ${urgentCondition('c')}
            AND (c.IsDeleted = 0 OR c.IsDeleted IS NULL)
        `);

        closedUrgentSla += Number(urgentStatus?.closedUrgent || 0);
        openUrgentSla += Number(urgentStatus?.openUrgent || 0);

        // ج) الموظفين (Top Employees)
        const [emps] = await hospitalPool.query(`
          SELECT 
            ct.TargetEmployeeName AS name,
            COUNT(*) AS count
          FROM complaint_targets ct
          JOIN complaints c ON c.ComplaintID = ct.ComplaintID
          WHERE ${urgentCondition('c')}
            AND (c.IsDeleted = 0 OR c.IsDeleted IS NULL)
            AND ct.TargetEmployeeName IS NOT NULL
            AND ct.TargetEmployeeName <> ''
          GROUP BY ct.TargetEmployeeName
        `);

        for (const e of emps) {
          const current = employeeMap.get(e.name) || 0;
          employeeMap.set(e.name, current + Number(e.count));
        }

        // د) الأسبوعي (Weekly)
        const [weeks] = await hospitalPool.query(`
          SELECT 
            DATE_FORMAT(CreatedAt, '%W') AS day,
            DAYOFWEEK(CreatedAt) as dayIdx,
            COUNT(*) AS count
          FROM complaints c
          WHERE ${urgentCondition('c')}
            AND (c.IsDeleted = 0 OR c.IsDeleted IS NULL)
            AND CreatedAt >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
          GROUP BY DATE_FORMAT(CreatedAt, '%W'), DAYOFWEEK(CreatedAt)
        `);

        for (const w of weeks) {
          const key = w.day; // e.g. Sunday
          if (!weeklyMap.has(key)) {
            weeklyMap.set(key, { day: w.day, idx: w.dayIdx, count: 0 });
          }
          weeklyMap.get(key).count += Number(w.count);
        }

        // هـ) أكثر الموظفين المبلغ عليهم (سوء تعامل)
        const [empMistreatment] = await hospitalPool.query(`
          SELECT 
              ct.TargetEmployeeName AS name,
              COALESCE(ct.TargetDepartmentName, '') AS department,
              COUNT(*) AS count
          FROM complaint_targets ct
          JOIN complaints c ON c.ComplaintID = ct.ComplaintID
          WHERE 
              (c.ComplaintTypeID IN (17) OR c.SubTypeID IN (15, 29, 8))
              AND UPPER(c.PriorityCode) IN ('URGENT','CRITICAL','HIGH')
              AND ct.TargetEmployeeName IS NOT NULL
              AND ct.TargetEmployeeName <> ''
              AND (c.IsDeleted = 0 OR c.IsDeleted IS NULL)
          GROUP BY ct.TargetEmployeeName, ct.TargetDepartmentName
        `);

        const hospitalMistreatmentMap =
          employeesMistreatmentByHospital.get(hospital.HospitalID) || new Map();

        for (const e of empMistreatment) {
          const label = e.department
            ? `${e.name} - ${e.department}`
            : (e.name || 'غير معروف');
          const count = Number(e.count || 0);
          if (!label.trim() || count <= 0) continue;

          hospitalMistreatmentMap.set(label, (hospitalMistreatmentMap.get(label) || 0) + count);
          employeesMistreatmentOverall.set(label, (employeesMistreatmentOverall.get(label) || 0) + count);
        }

        employeesMistreatmentByHospital.set(hospital.HospitalID, hospitalMistreatmentMap);

        // و) الأقسام (Departments)
        const [depts] = await hospitalPool.query(`
          SELECT 
            COALESCE(d.NameAr, d.NameEn, 'غير محدد') AS name,
            COUNT(*) AS count
          FROM complaints c
          LEFT JOIN departments d ON d.DepartmentID = c.DepartmentID
          WHERE ${urgentCondition('c')}
            AND (c.IsDeleted = 0 OR c.IsDeleted IS NULL)
          GROUP BY c.DepartmentID, d.NameAr, d.NameEn
        `);

        for (const d of depts) {
          const name = d.name;
          const current = deptMap.get(name) || 0;
          deptMap.set(name, current + Number(d.count));
        }

      } catch (err) {
        console.error(`Error processing urgent stats for hospital ${hospital.HospitalID}:`, err.message);
        // Continue to next hospital
      }
    }

    // 3. تجميع النتائج النهائية
    const closureRate = (closedUrgentLegacy + openUrgentLegacy) > 0
      ? Math.round((closedUrgentLegacy / (closedUrgentLegacy + openUrgentLegacy)) * 100)
      : 0;
    
    const avgClosureHours = closedWithDuration > 0 
      ? Math.round(totalDuration / closedWithDuration) 
      : 0;

    // ترتيب الموظفين والأقسام
    const topEmployees = Array.from(employeeMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const topDepartments = Array.from(deptMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    // ترتيب الأيام حسب تسلسل الأسبوع (تقريبي)
    // يمكن تحسينه ليكون مرتباً زمنياً بدقة
    const weekly = Array.from(weeklyMap.values())
      .sort((a, b) => a.idx - b.idx);

    // ترتيب المستشفيات
    byHospital.sort((a, b) => b.count - a.count);

    const employeesMistreatment = Array.from(employeesMistreatmentOverall.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    const employeesMistreatmentByHospitalList = Array.from(employeesMistreatmentByHospital.entries())
      .map(([hospitalId, map]) => {
        const hospital = allHospitals.find(h => Number(h.HospitalID) === Number(hospitalId));
        const employees = Array.from(map.entries())
          .map(([label, count]) => ({ label, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 15);
        return {
          hospitalId: Number(hospitalId),
          hospitalName: hospital?.HospitalName || 'غير معروف',
          employees
        };
      });

    res.json({
      success: true,
      totalUrgent,
      closureRate,
      avgClosureHours,
      hospitals: byHospital,
      mistreatment,
      medicine,
      employees: topEmployees,
      employeesMistreatmentAll: employeesMistreatment.length
        ? employeesMistreatment
        : topEmployees,
      employeesMistreatmentByHospital: employeesMistreatmentByHospitalList,
      weekly,
      departments: topDepartments,
      closedUrgent: closedUrgentSla,
      openUrgent: openUrgentSla,
      subTypesByHospital: subPerHospital,
      mistreatmentClosingTime,
      mistreatmentSla: mistreatmentSlaList,
      labSla: labSlaList,
      harassment: harassmentList
    });

  } catch (error) {
    console.error('GET /api/dashboard/urgent/all failed:', error);
    res.status(500).json({
      success: false,
      message: 'internal error'
    });
  }
});

// ========== GET /api/dashboard/urgent/harassment/details/:hospitalId ==========
router.get('/harassment/details/:hospitalId', requireAuth, async (req, res) => {
  try {
    const hospitalId = req.params.hospitalId;
    const { getHospitalPool } = await import('../config/db.js');
    const hospitalPool = await getHospitalPool(hospitalId);

    const [rows] = await hospitalPool.query(`
      SELECT 
        ComplaintID,
        TicketNumber,
        PatientFullName,
        ComplaintTypeID,
        SubTypeID,
        PriorityCode,
        StatusCode,
        ActualClosingHours,
        CreatedAt,
        Description
      FROM complaints
      WHERE 
        Description LIKE '%تحرش%'
        AND (IsDeleted = 0 OR IsDeleted IS NULL)
      ORDER BY CreatedAt DESC
    `);

    res.json({
      success: true,
      items: rows
    });
  } catch (err) {
    console.error('GET /api/dashboard/urgent/harassment/details/:hospitalId', err);
    res.json({
      success: false,
      message: err.message
    });
  }
});

// ========== GET /api/dashboard/urgent/937-sla ==========
router.get('/937-sla', requireAuth, async (req, res) => {
  try {
    const { getHospitalPool } = await import('../config/db.js');
    
    // استلام الفلاتر
    const hospitalIdFilter = req.query.hospitalId ? Number(req.query.hospitalId) : null;
    const startDate = req.query.startDate; // Format: YYYY-MM-DD
    const endDate = req.query.endDate;     // Format: YYYY-MM-DD

    // تجهيز شرط التاريخ
    let dateCondition = "";
    const queryParams = [];
    
    if (startDate && endDate) {
      dateCondition = " AND CreatedAt >= ? AND CreatedAt <= ? ";
      queryParams.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
    } else if (startDate) {
      dateCondition = " AND CreatedAt >= ? ";
      queryParams.push(`${startDate} 00:00:00`);
    } else if (endDate) {
      dateCondition = " AND CreatedAt <= ? ";
      queryParams.push(`${endDate} 23:59:59`);
    }

    // تحديد المستشفيات المستهدفة
    let targetHospitals = [];
    if (hospitalIdFilter) {
      // إذا تم تحديد مستشفى معين
      const [hosp] = await pool.query(`SELECT HospitalID, NameAr AS HospitalName FROM hospitals WHERE HospitalID = ? AND IsActive = 1`, [hospitalIdFilter]);
      if (hosp.length > 0) targetHospitals.push(hosp[0]);
    } else {
      // جميع المستشفيات
      const [all] = await pool.query(`SELECT HospitalID, NameAr AS HospitalName FROM hospitals WHERE IsActive = 1`);
      targetHospitals = all;
    }

    let lt24 = 0;
    let btw24_48 = 0;
    let btw48_72 = 0;
    let gt72 = 0;

    // جمع البيانات
    for (const hospital of targetHospitals) {
      try {
        const hospitalPool = await getHospitalPool(hospital.HospitalID);
        
        const query = `
          SELECT 
            SUM(CASE 
              WHEN ActualClosingHours IS NOT NULL AND ActualClosingHours <= 24 THEN 1
              ELSE 0 END
            ) AS lt24,
            SUM(CASE 
              WHEN ActualClosingHours IS NOT NULL AND ActualClosingHours > 24 AND ActualClosingHours <= 48 THEN 1
              ELSE 0 END
            ) AS btw24_48,
            SUM(CASE 
              WHEN ActualClosingHours IS NOT NULL AND ActualClosingHours > 48 AND ActualClosingHours <= 72 THEN 1
              ELSE 0 END
            ) AS btw48_72,
            SUM(CASE 
              WHEN ActualClosingHours IS NOT NULL AND ActualClosingHours > 72 THEN 1
              ELSE 0 END
            ) AS gt72
          FROM complaints
          WHERE SubmissionType = '937'
            AND (IsDeleted = 0 OR IsDeleted IS NULL)
            AND ActualClosingHours IS NOT NULL
            ${dateCondition}
        `;

        const [[stats]] = await hospitalPool.query(query, queryParams);

        lt24 += Number(stats?.lt24 || 0);
        btw24_48 += Number(stats?.btw24_48 || 0);
        btw48_72 += Number(stats?.btw48_72 || 0);
        gt72 += Number(stats?.gt72 || 0);
      } catch (err) {
        console.error(`Error processing 937 SLA for hospital ${hospital.HospitalID}:`, err.message);
      }
    }

    res.json({
      success: true,
      lt24,
      btw24_48,
      btw48_72,
      gt72
    });
  } catch (error) {
    console.error('GET /api/dashboard/urgent/937-sla failed:', error);
    res.status(500).json({
      success: false,
      message: 'internal error'
    });
  }
});

export default router;
