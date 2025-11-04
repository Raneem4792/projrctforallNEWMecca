// controllers/reportsController.js
import { getTenantPoolByHospitalId } from '../db/tenantManager.js';
import { getCentralPool } from '../db/centralPool.js';
import { getHospitalPool } from '../config/db.js';
import PDFDocument from 'pdfkit';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// مسارات الخطوط العربية
const AR_FONT_REGULAR = path.join(__dirname, '..', 'fonts', 'Tajawal-Regular.ttf');
const AR_FONT_BOLD = path.join(__dirname, '..', 'fonts', 'Tajawal-Bold.ttf');

// ========================================
// جلب بيانات أداء الأقسام
// ========================================
export async function getDepartmentsPerformanceData(req, res) {
  try {
    // إضافة CORS headers
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    const { hospitalId } = req.query || {};
    const centralPool = await getCentralPool();
    
    // جلب قائمة المستشفيات
    let hospitalsQuery = `
      SELECT HospitalID, NameAr AS HospitalName, SortOrder
      FROM hospitals 
      WHERE IsActive = 1
    `;
    
    const hospitalsParams = [];
    if (hospitalId && hospitalId !== 'all') {
      hospitalsQuery += ` AND HospitalID = ?`;
      hospitalsParams.push(Number(hospitalId));
    }
    
    hospitalsQuery += ` ORDER BY SortOrder IS NULL, SortOrder ASC, NameAr ASC`;
    
    const [allHospitals] = await centralPool.query(hospitalsQuery, hospitalsParams);

    const allRows = [];

    // جلب البيانات من كل مستشفى
    for (const h of allHospitals) {
      try {
        const hospPool = await getHospitalPool(h.HospitalID);
        
        // جلب الأقسام مع العدادات من قاعدة مستشفى h
        const [deptStats] = await hospPool.query(`
          SELECT 
            d.DepartmentID,
            d.NameAr AS departmentName,
            COUNT(c.ComplaintID) AS totalComplaints,
            SUM(CASE WHEN c.StatusCode IN ('CLOSED','مغلق','محلول','مكتمل') THEN 1 ELSE 0 END) AS closedComplaints,
            SUM(CASE WHEN UPPER(c.PriorityCode) IN ('CRITICAL','URGENT','HIGH')
                      OR c.PriorityCode IN ('حرجة','حرج','عاجلة','عاجل','عالية')
                 THEN 1 ELSE 0 END) AS criticalComplaints,
            AVG(CASE 
              WHEN c.StatusCode IN ('CLOSED','مغلق','محلول','مكتمل') 
                AND c.CreatedAt IS NOT NULL 
                AND c.UpdatedAt IS NOT NULL 
              THEN DATEDIFF(c.UpdatedAt, c.CreatedAt)
              ELSE NULL
            END) AS avgCloseTime
          FROM departments d
          LEFT JOIN complaints c 
            ON c.DepartmentID = d.DepartmentID
           AND (c.IsDeleted = 0 OR c.IsDeleted IS NULL)
          WHERE IFNULL(d.IsActive, 1) = 1
          GROUP BY d.DepartmentID, d.NameAr
          HAVING totalComplaints > 0
          ORDER BY totalComplaints DESC
        `);

        for (const r of deptStats) {
          allRows.push({
            departmentName: r.departmentName || 'غير محدد',
            totalComplaints: Number(r.totalComplaints) || 0,
            closedComplaints: Number(r.closedComplaints) || 0,
            criticalComplaints: Number(r.criticalComplaints) || 0,
            avgCloseTime: r.avgCloseTime ? parseFloat(r.avgCloseTime).toFixed(1) : null
          });
        }
      } catch (e) {
        console.warn(`⚠️ تخطي مستشفى ${h.HospitalID}:`, e.message);
      }
    }

    // تجميع البيانات حسب اسم القسم (إذا كان هناك أقسام متشابهة في مستشفيات مختلفة)
    const grouped = {};
    allRows.forEach(row => {
      const key = row.departmentName;
      if (!grouped[key]) {
        grouped[key] = {
          departmentName: key,
          totalComplaints: 0,
          closedComplaints: 0,
          criticalComplaints: 0,
          avgCloseTimes: []
        };
      }
      grouped[key].totalComplaints += row.totalComplaints;
      grouped[key].closedComplaints += row.closedComplaints;
      grouped[key].criticalComplaints += row.criticalComplaints;
      if (row.avgCloseTime) {
        grouped[key].avgCloseTimes.push(parseFloat(row.avgCloseTime));
      }
    });

    // تحويل المجموعات إلى مصفوفة وحساب المتوسط
    const finalRows = Object.values(grouped).map(g => {
      const avgCloseTime = g.avgCloseTimes.length > 0
        ? (g.avgCloseTimes.reduce((a, b) => a + b, 0) / g.avgCloseTimes.length).toFixed(1)
        : null;
      
      return {
        departmentName: g.departmentName,
        totalComplaints: g.totalComplaints,
        closedComplaints: g.closedComplaints,
        criticalComplaints: g.criticalComplaints,
        avgCloseTime: avgCloseTime
      };
    });

    // ترتيب حسب إجمالي البلاغات
    finalRows.sort((a, b) => b.totalComplaints - a.totalComplaints);

    res.json({
      ok: true,
      data: finalRows
    });
  } catch (error) {
    console.error('❌ خطأ في getDepartmentsPerformanceData:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
}

// هل الخطوط موجودة؟
const hasArabicFont = fs.existsSync(AR_FONT_REGULAR) && fs.existsSync(AR_FONT_BOLD);

if (!hasArabicFont) {
  console.warn('⚠️ [PDF] لم يتم العثور على الخطوط العربية في مجلد fonts، سيتم استخدام الخط الافتراضي (قد تظهر الحروف العربية بشكل غير صحيح).');
}

export async function exportSummaryExcel(req, res) {
  try {
    // TODO: تنفيذ Excel export لاحقاً
    res.status(501).json({ ok: false, error: 'Excel export غير متاح حالياً' });
  } catch (error) {
    console.error('❌ خطأ في exportSummaryExcel:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
}

// ========================================
// تقرير أداء الأقسام
// ========================================

export async function exportDepartmentsExcel(req, res) {
  try {
    // TODO: تنفيذ Excel export لاحقاً
    res.status(501).json({ ok: false, error: 'تصدير Excel لتقرير أداء الأقسام غير مفعّل حالياً' });
  } catch (error) {
    console.error('❌ خطأ في exportDepartmentsExcel:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
}

export async function exportDepartmentsPdf(req, res) {
  console.log('📄 [exportDepartmentsPdf] بدأ إنشاء تقرير أداء الأقسام (صورة واحدة للرسم + الجدول)');

  try {
    // إضافة CORS headers
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    const body = req.body || {};
    const { departmentsImage, hospitalId } = body;

    console.log('📄 [exportDepartmentsPdf] استقبال البيانات:', {
      hasImage: !!departmentsImage,
      imageLength: departmentsImage?.length || 0,
      hospitalId
    });

    if (!departmentsImage) {
      return res.status(400).json({
        ok: false,
        error: 'لم يتم إرسال صورة التقرير departmentsImage'
      });
    }

    // التحقق من أن الصورة صحيحة (PNG أو JPEG)
    if (!departmentsImage.startsWith('data:image/')) {
      console.error('❌ [exportDepartmentsPdf] صيغة الصورة غير صحيحة:', departmentsImage.substring(0, 50));
      return res.status(400).json({
        ok: false,
        error: 'صيغة الصورة غير صحيحة. يجب أن تكون base64 image (PNG أو JPEG)'
      });
    }

    const doc = new PDFDocument({
      size: 'A4',
      margin: 20
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="departments-performance.pdf"'
    );

    doc.pipe(res);

    const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const contentHeight = doc.page.height - doc.page.margins.top - doc.page.margins.bottom;

    // تحويل base64 إلى Buffer
    let base64 = departmentsImage;
    
    // إزالة prefix إذا كان موجوداً
    if (base64.startsWith('data:image/')) {
      base64 = base64.replace(/^data:image\/\w+;base64,/, '');
    }
    
    console.log('📄 [exportDepartmentsPdf] طول base64 بعد التنظيف:', base64.length);
    
    if (!base64 || base64.length < 100) {
      throw new Error('الصورة المرسلة فارغة أو غير صحيحة');
    }

    let imgBuffer;
    try {
      imgBuffer = Buffer.from(base64, 'base64');
      console.log('📄 [exportDepartmentsPdf] تم تحويل base64 إلى Buffer، الحجم:', imgBuffer.length);
    } catch (err) {
      console.error('❌ [exportDepartmentsPdf] خطأ في تحويل base64:', err);
      throw new Error('فشل تحويل الصورة: ' + err.message);
    }

    // وضع الصورة من أعلى يسار منطقة المحتوى
    try {
      doc.image(imgBuffer, doc.page.margins.left, doc.page.margins.top, {
        fit: [contentWidth, contentHeight],
        align: 'center'
      });
      console.log('📄 [exportDepartmentsPdf] تم إضافة الصورة إلى PDF');
    } catch (err) {
      console.error('❌ [exportDepartmentsPdf] خطأ في إضافة الصورة:', err);
      throw new Error('فشل إضافة الصورة إلى PDF: ' + err.message);
    }

    doc.end();
  } catch (error) {
    console.error('❌ خطأ في exportDepartmentsPdf:', error);
    
    // إضافة CORS headers حتى في حالة الخطأ
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    res.status(500).json({ ok: false, error: error.message });
  }
}

export async function exportDetailsExcel(req, res) {
  try {
    // TODO: تنفيذ Excel export لاحقاً
    res.status(501).json({ ok: false, error: 'تصدير Excel لتقرير التفاصيل غير مفعّل حالياً' });
  } catch (error) {
    console.error('❌ خطأ في exportDetailsExcel:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
}

// ========================================
// تقرير أداء الموظفين
// ========================================

export async function getEmployeesPerformanceData(req, res) {
  try {
    // إضافة CORS headers
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    const { hospitalId } = req.query || {};
    const centralPool = await getCentralPool();
    
    // جلب قائمة المستشفيات
    let hospitalsQuery = `
      SELECT HospitalID, NameAr AS HospitalName, SortOrder
      FROM hospitals 
      WHERE IsActive = 1
    `;
    
    const hospitalsParams = [];
    if (hospitalId && hospitalId !== 'all') {
      hospitalsQuery += ` AND HospitalID = ?`;
      hospitalsParams.push(Number(hospitalId));
    }
    
    hospitalsQuery += ` ORDER BY SortOrder IS NULL, SortOrder ASC, NameAr ASC`;
    
    const [allHospitals] = await centralPool.query(hospitalsQuery, hospitalsParams);

    const allRows = [];

    // جلب البيانات من كل مستشفى
    for (const h of allHospitals) {
      try {
        const hospPool = await getHospitalPool(h.HospitalID);
        
        // جلب الموظفين الأكثر تكررًا في البلاغات
        const [employeeData] = await hospPool.query(`
          SELECT 
            ct.TargetEmployeeID,
            ct.TargetEmployeeName AS employeeName,
            ct.TargetDepartmentID,
            ct.TargetDepartmentName AS departmentName,
            COUNT(*) AS complaintCount,
            MIN(ct.CreatedAt) AS firstComplaint,
            MAX(ct.CreatedAt) AS lastComplaint
          FROM complaint_targets ct
          WHERE ct.TargetEmployeeID IS NOT NULL 
            AND ct.TargetEmployeeName IS NOT NULL
            AND ct.TargetEmployeeName != ''
          GROUP BY ct.TargetEmployeeID, ct.TargetEmployeeName, ct.TargetDepartmentID, ct.TargetDepartmentName
          HAVING complaintCount >= 1
          ORDER BY complaintCount DESC
        `);

        for (const r of employeeData) {
          allRows.push({
            employeeName: r.employeeName || 'غير محدد',
            departmentName: r.departmentName || '',
            complaintCount: Number(r.complaintCount) || 0,
            firstComplaint: r.firstComplaint,
            lastComplaint: r.lastComplaint
          });
        }
      } catch (e) {
        console.warn(`⚠️ تخطي مستشفى ${h.HospitalID}:`, e.message);
      }
    }

    // تجميع البيانات حسب اسم الموظف (إذا كان هناك موظفين متشابهين في مستشفيات مختلفة)
    const grouped = {};
    allRows.forEach(row => {
      const key = `${row.employeeName}_${row.departmentName || ''}`;
      if (!grouped[key]) {
        grouped[key] = {
          employeeName: row.employeeName,
          departmentName: row.departmentName,
          complaintCount: 0,
          firstComplaints: [],
          lastComplaints: []
        };
      }
      grouped[key].complaintCount += row.complaintCount;
      if (row.firstComplaint) {
        grouped[key].firstComplaints.push(new Date(row.firstComplaint));
      }
      if (row.lastComplaint) {
        grouped[key].lastComplaints.push(new Date(row.lastComplaint));
      }
    });

    // تحويل المجموعات إلى مصفوفة
    const finalRows = Object.values(grouped).map(g => {
      const firstComplaint = g.firstComplaints.length > 0
        ? new Date(Math.min(...g.firstComplaints))
        : null;
      const lastComplaint = g.lastComplaints.length > 0
        ? new Date(Math.max(...g.lastComplaints))
        : null;
      
      return {
        employeeName: g.employeeName,
        departmentName: g.departmentName,
        complaintCount: g.complaintCount,
        firstComplaint: firstComplaint,
        lastComplaint: lastComplaint
      };
    });

    // ترتيب حسب عدد البلاغات
    finalRows.sort((a, b) => b.complaintCount - a.complaintCount);

    res.json({
      ok: true,
      data: finalRows
    });
  } catch (error) {
    console.error('❌ خطأ في getEmployeesPerformanceData:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
}

export async function exportEmployeesExcel(req, res) {
  try {
    // TODO: تنفيذ Excel export لاحقاً
    res.status(501).json({ ok: false, error: 'تصدير Excel لتقرير أداء الموظفين غير مفعّل حالياً' });
  } catch (error) {
    console.error('❌ خطأ في exportEmployeesExcel:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
}

export async function exportEmployeesPdf(req, res) {
  console.log('📄 [exportEmployeesPdf] بدأ إنشاء تقرير أداء الموظفين (صورة واحدة للرسم + الجدول)');

  try {
    // إضافة CORS headers
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    const body = req.body || {};
    const { employeesImage, hospitalId } = body;

    console.log('📄 [exportEmployeesPdf] استقبال البيانات:', {
      hasImage: !!employeesImage,
      imageLength: employeesImage?.length || 0,
      hospitalId
    });

    if (!employeesImage) {
      return res.status(400).json({
        ok: false,
        error: 'لم يتم إرسال صورة التقرير employeesImage'
      });
    }

    // التحقق من أن الصورة صحيحة (PNG أو JPEG)
    if (!employeesImage.startsWith('data:image/')) {
      console.error('❌ [exportEmployeesPdf] صيغة الصورة غير صحيحة:', employeesImage.substring(0, 50));
      return res.status(400).json({
        ok: false,
        error: 'صيغة الصورة غير صحيحة. يجب أن تكون base64 image (PNG أو JPEG)'
      });
    }

    const doc = new PDFDocument({
      size: 'A4',
      margin: 20
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="employees-performance.pdf"'
    );

    doc.pipe(res);

    const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const contentHeight = doc.page.height - doc.page.margins.top - doc.page.margins.bottom;

    // تحويل base64 إلى Buffer
    let base64 = employeesImage;
    
    // إزالة prefix إذا كان موجوداً
    if (base64.startsWith('data:image/')) {
      base64 = base64.replace(/^data:image\/\w+;base64,/, '');
    }
    
    console.log('📄 [exportEmployeesPdf] طول base64 بعد التنظيف:', base64.length);
    
    if (!base64 || base64.length < 100) {
      throw new Error('الصورة المرسلة فارغة أو غير صحيحة');
    }

    let imgBuffer;
    try {
      imgBuffer = Buffer.from(base64, 'base64');
      console.log('📄 [exportEmployeesPdf] تم تحويل base64 إلى Buffer، الحجم:', imgBuffer.length);
    } catch (err) {
      console.error('❌ [exportEmployeesPdf] خطأ في تحويل base64:', err);
      throw new Error('فشل تحويل الصورة: ' + err.message);
    }

    // وضع الصورة من أعلى يسار منطقة المحتوى
    try {
      doc.image(imgBuffer, doc.page.margins.left, doc.page.margins.top, {
        fit: [contentWidth, contentHeight],
        align: 'center'
      });
      console.log('📄 [exportEmployeesPdf] تم إضافة الصورة إلى PDF');
    } catch (err) {
      console.error('❌ [exportEmployeesPdf] خطأ في إضافة الصورة:', err);
      throw new Error('فشل إضافة الصورة إلى PDF: ' + err.message);
    }

    doc.end();
  } catch (error) {
    console.error('❌ خطأ في exportEmployeesPdf:', error);
    
    // إضافة CORS headers حتى في حالة الخطأ
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    res.status(500).json({ ok: false, error: error.message });
  }
}

// ========================================
// تقرير البلاغات الحرجة
// ========================================

export async function getCriticalComplaintsData(req, res) {
  try {
    // إضافة CORS headers
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    const { hospitalId, fromDate, toDate } = req.query || {};
    const centralPool = await getCentralPool();
    
    // جلب قائمة المستشفيات
    let hospitalsQuery = `
      SELECT HospitalID, NameAr AS HospitalName, SortOrder
      FROM hospitals 
      WHERE IsActive = 1
    `;
    
    const hospitalsParams = [];
    if (hospitalId && hospitalId !== 'all') {
      hospitalsQuery += ` AND HospitalID = ?`;
      hospitalsParams.push(Number(hospitalId));
    }
    
    hospitalsQuery += ` ORDER BY SortOrder IS NULL, SortOrder ASC, NameAr ASC`;
    
    const [allHospitals] = await centralPool.query(hospitalsQuery, hospitalsParams);

    const allRows = [];

    // جلب البيانات من كل مستشفى
    for (const h of allHospitals) {
      try {
        const hospPool = await getHospitalPool(h.HospitalID);
        
        // بناء WHERE clause
        const whereClauses = [
          `(c.IsDeleted = 0 OR c.IsDeleted IS NULL)`,
          `(
            UPPER(c.PriorityCode) IN ('CRITICAL','URGENT','HIGH')
            OR c.PriorityCode IN ('حرجة','حرج','عاجلة','عاجل','عالية')
          )`
        ];

        const queryParams = [];

        if (fromDate) {
          whereClauses.push(`c.CreatedAt >= ?`);
          queryParams.push(fromDate);
        }
        if (toDate) {
          whereClauses.push(`c.CreatedAt <= ?`);
          queryParams.push(`${toDate} 23:59:59`);
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        // جلب البلاغات الحرجة
        const [criticalData] = await hospPool.query(`
          SELECT 
            c.ComplaintID,
            c.TicketNumber AS ticketNumber,
            c.HospitalID,
            ? AS hospitalName,
            d.NameAr AS departmentName,
            c.PriorityCode AS priorityCode,
            c.StatusCode AS statusCode,
            c.CreatedAt AS createdAt
          FROM complaints c
          LEFT JOIN departments d ON d.DepartmentID = c.DepartmentID
          ${whereSql}
          ORDER BY c.CreatedAt DESC
          LIMIT 500
        `, [h.HospitalName, ...queryParams]);

        for (const r of criticalData) {
          allRows.push({
            ticketNumber: r.ticketNumber || '—',
            hospitalName: r.hospitalName || h.HospitalName,
            departmentName: r.departmentName || '—',
            priorityCode: r.priorityCode || '—',
            statusCode: r.statusCode || '—',
            createdAt: r.createdAt
          });
        }
      } catch (e) {
        console.warn(`⚠️ تخطي مستشفى ${h.HospitalID}:`, e.message);
      }
    }

    // ترتيب حسب تاريخ البلاغ (تنازلي)
    allRows.sort((a, b) => {
      const dateA = new Date(a.createdAt || 0);
      const dateB = new Date(b.createdAt || 0);
      return dateB - dateA;
    });

    res.json({
      ok: true,
      data: allRows
    });
  } catch (error) {
    console.error('❌ خطأ في getCriticalComplaintsData:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
}

export async function exportCriticalExcel(req, res) {
  try {
    // TODO: تنفيذ Excel export لاحقاً
    res.status(501).json({ ok: false, error: 'تصدير Excel لتقرير البلاغات الحرجة غير مفعّل حالياً' });
  } catch (error) {
    console.error('❌ خطأ في exportCriticalExcel:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
}

export async function exportCriticalPdf(req, res) {
  console.log('📄 [exportCriticalPdf] بدأ إنشاء تقرير البلاغات الحرجة (صورة واحدة للجدول)');

  try {
    // إضافة CORS headers
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    const body = req.body || {};
    const { criticalImage, hospitalId, fromDate, toDate } = body;

    console.log('📄 [exportCriticalPdf] استقبال البيانات:', {
      hasImage: !!criticalImage,
      imageLength: criticalImage?.length || 0,
      hospitalId,
      fromDate,
      toDate
    });

    if (!criticalImage) {
      return res.status(400).json({
        ok: false,
        error: 'لم يتم إرسال صورة التقرير criticalImage'
      });
    }

    // التحقق من أن الصورة صحيحة (PNG أو JPEG)
    if (!criticalImage.startsWith('data:image/')) {
      console.error('❌ [exportCriticalPdf] صيغة الصورة غير صحيحة:', criticalImage.substring(0, 50));
      return res.status(400).json({
        ok: false,
        error: 'صيغة الصورة غير صحيحة. يجب أن تكون base64 image (PNG أو JPEG)'
      });
    }

    const doc = new PDFDocument({
      size: 'A4',
      margin: 20
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="critical-complaints.pdf"'
    );

    doc.pipe(res);

    const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const contentHeight = doc.page.height - doc.page.margins.top - doc.page.margins.bottom;

    // تحويل base64 إلى Buffer
    let base64 = criticalImage;
    
    // إزالة prefix إذا كان موجوداً
    if (base64.startsWith('data:image/')) {
      base64 = base64.replace(/^data:image\/\w+;base64,/, '');
    }
    
    console.log('📄 [exportCriticalPdf] طول base64 بعد التنظيف:', base64.length);
    
    if (!base64 || base64.length < 100) {
      throw new Error('الصورة المرسلة فارغة أو غير صحيحة');
    }

    let imgBuffer;
    try {
      imgBuffer = Buffer.from(base64, 'base64');
      console.log('📄 [exportCriticalPdf] تم تحويل base64 إلى Buffer، الحجم:', imgBuffer.length);
    } catch (err) {
      console.error('❌ [exportCriticalPdf] خطأ في تحويل base64:', err);
      throw new Error('فشل تحويل الصورة: ' + err.message);
    }

    // وضع الصورة من أعلى يسار منطقة المحتوى
    try {
      doc.image(imgBuffer, doc.page.margins.left, doc.page.margins.top, {
        fit: [contentWidth, contentHeight],
        align: 'center'
      });
      console.log('📄 [exportCriticalPdf] تم إضافة الصورة إلى PDF');
    } catch (err) {
      console.error('❌ [exportCriticalPdf] خطأ في إضافة الصورة:', err);
      throw new Error('فشل إضافة الصورة إلى PDF: ' + err.message);
    }

    doc.end();
  } catch (error) {
    console.error('❌ خطأ في exportCriticalPdf:', error);
    
    // إضافة CORS headers حتى في حالة الخطأ
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    res.status(500).json({ ok: false, error: error.message });
  }
}

export async function exportSummaryPdf(req, res) {
  console.log('📄 [exportSummaryPdf] بدأ إنشاء تقرير ملخص التجمع (صورة واحدة للرسم + الجدول)');

  try {
    const body = req.body || {};
    const { summaryImage, month } = body;

    if (!summaryImage) {
      return res.status(400).json({
        ok: false,
        error: 'لم يتم إرسال صورة التقرير summaryImage'
      });
    }

    const doc = new PDFDocument({
      size: 'A4',
      margin: 20
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="summary-report.pdf"'
    );

    doc.pipe(res);

    const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const contentHeight = doc.page.height - doc.page.margins.top - doc.page.margins.bottom;

    // تحويل base64 إلى Buffer
    const base64 = summaryImage.replace(/^data:image\/\w+;base64,/, '');
    const imgBuffer = Buffer.from(base64, 'base64');

    // وضع الصورة من أعلى يسار منطقة المحتوى، بدل ما نوسّطها عموديًا
    doc.image(imgBuffer, doc.page.margins.left, doc.page.margins.top, {
      fit: [contentWidth, contentHeight],
      align: 'center'   // أفقيًا في النص
      // ما نحط valign، لأننا حدّدنا y يدويًا (top)
    });

    doc.end();
  } catch (error) {
    console.error('❌ خطأ في exportSummaryPdf:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
}

export async function exportDetailsPdf(req, res) {
  console.log('📄 [exportDetailsPdf] بدأ إنشاء تقرير البلاغات التفصيلية (صورة واحدة للجدول)');

  try {
    const body = req.body || {};
    const { detailsImage, fromDate, toDate, hospitalId } = body;

    console.log('📄 [exportDetailsPdf] استقبال البيانات:', {
      hasImage: !!detailsImage,
      imageLength: detailsImage?.length || 0,
      fromDate,
      toDate,
      hospitalId
    });

    if (!detailsImage) {
      return res.status(400).json({
        ok: false,
        error: 'لم يتم إرسال صورة التقرير detailsImage'
      });
    }

    // التحقق من أن الصورة صحيحة (PNG أو JPEG)
    if (!detailsImage.startsWith('data:image/')) {
      console.error('❌ [exportDetailsPdf] صيغة الصورة غير صحيحة:', detailsImage.substring(0, 50));
      return res.status(400).json({
        ok: false,
        error: 'صيغة الصورة غير صحيحة. يجب أن تكون base64 image (PNG أو JPEG)'
      });
    }

    // إضافة CORS headers قبل إنشاء PDF
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    const doc = new PDFDocument({
      size: 'A4',
      margin: 20
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="detailed-complaints.pdf"'
    );

    doc.pipe(res);

    const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const contentHeight = doc.page.height - doc.page.margins.top - doc.page.margins.bottom;

    // تحويل base64 إلى Buffer
    let base64 = detailsImage;
    
    // إزالة prefix إذا كان موجوداً
    if (base64.startsWith('data:image/')) {
      base64 = base64.replace(/^data:image\/\w+;base64,/, '');
    }
    
    console.log('📄 [exportDetailsPdf] طول base64 بعد التنظيف:', base64.length);
    
    if (!base64 || base64.length < 100) {
      throw new Error('الصورة المرسلة فارغة أو غير صحيحة');
    }

    let imgBuffer;
    try {
      imgBuffer = Buffer.from(base64, 'base64');
      console.log('📄 [exportDetailsPdf] تم تحويل base64 إلى Buffer، الحجم:', imgBuffer.length);
    } catch (err) {
      console.error('❌ [exportDetailsPdf] خطأ في تحويل base64:', err);
      throw new Error('فشل تحويل الصورة: ' + err.message);
    }

    // وضع الصورة من أعلى يسار منطقة المحتوى
    try {
      doc.image(imgBuffer, doc.page.margins.left, doc.page.margins.top, {
        fit: [contentWidth, contentHeight],
        align: 'center'
      });
      console.log('📄 [exportDetailsPdf] تم إضافة الصورة إلى PDF');
    } catch (err) {
      console.error('❌ [exportDetailsPdf] خطأ في إضافة الصورة:', err);
      throw new Error('فشل إضافة الصورة إلى PDF: ' + err.message);
    }

    doc.end();
  } catch (error) {
    console.error('❌ خطأ في exportDetailsPdf:', error);
    
    // إضافة CORS headers حتى في حالة الخطأ
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    res.status(500).json({ ok: false, error: error.message });
  }
}

