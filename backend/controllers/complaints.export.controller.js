// controllers/complaints.export.controller.js
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { getHospitalPool } from '../middleware/hospitalPool.js';

/**
 * تصدير البلاغات إلى Excel مع الفلاتر
 * GET /api/complaints/export-excel?from=...&to=...&all=1&...
 */
export const exportComplaintsExcel = async (req, res) => {
  try {
    const { from, to, all, name, mobile, file, ticket, status, priority, assigned, type, tickets } = req.query;

    // تحديد hospitalId
    const hospitalId = req.user?.HospitalID || req.query.hospitalId;
    
    if (!hospitalId) {
      return res.status(400).json({ 
        ok: false, 
        message: 'يجب تحديد hospitalId' 
      });
    }

    // استخدام pool من hospitalId
    const pool = await getHospitalPool(Number(hospitalId));

    // بناء شروط WHERE
    let where = 'WHERE (c.IsDeleted=0 OR c.IsDeleted IS NULL)';
    const params = [];
    
    // ✅ فلترة بالتاريخ: إذا كان all=1، لا نضيف فلتر التاريخ
    if (!all && from && to) {
      where += ' AND c.CreatedAt BETWEEN ? AND ?';
      params.push(from, to);
    } else if (!all && from) {
      where += ' AND DATE(c.CreatedAt) >= ?';
      params.push(from);
    } else if (!all && to) {
      where += ' AND DATE(c.CreatedAt) <= ?';
      params.push(to);
    }
    
    // ✅ فلترة بأرقام البلاغات
    if (tickets) {
      const ticketList = tickets.split(',').map(t => t.trim()).filter(t => t);
      if (ticketList.length > 0) {
        where += ` AND c.TicketNumber IN (${ticketList.map(() => '?').join(',')})`;
        params.push(...ticketList);
      }
    }

    // إضافة الفلاتر الأخرى
    if (name) {
      where += ' AND c.PatientFullName LIKE ?';
      params.push(`%${name}%`);
    }
    if (mobile) {
      where += ' AND c.PatientMobile = ?';
      params.push(mobile);
    }
    if (file) {
      where += ' AND c.FileNumber = ?';
      params.push(file);
    }
    if (ticket) {
      where += ' AND c.TicketNumber = ?';
      params.push(ticket);
    }
    if (status && status !== 'ALL') {
      where += ' AND c.StatusCode = ?';
      params.push(status);
    }
    if (priority) {
      where += ' AND c.PriorityCode = ?';
      params.push(priority.toUpperCase());
    }
    
    // فلتر "المسنّدة لي"
    if (assigned === 'me') {
      const userId = Number(req.user?.uid || req.user?.UserID || req.user?.userId || 0);
      if (userId) {
        where += ` AND (c.AssignedToUserID = ? OR EXISTS(
          SELECT 1 FROM complaint_assignee_history h
          WHERE h.ComplaintID = c.ComplaintID AND h.ToUserID = ?
        ))`;
        params.push(userId, userId);
      }
    }

    // بناء SQL query
    const sql = `
      SELECT 
        c.ComplaintID,
        c.TicketNumber,
        c.PatientFullName,
        c.PatientMobile,
        c.FileNumber,
        c.Description,
        c.PriorityCode,
        c.StatusCode,
        c.CreatedAt,
        c.UpdatedAt,
        d.NameAr AS DepartmentName,
        COALESCE((SELECT r.Message 
         FROM complaint_responses r 
         WHERE r.ComplaintID = c.ComplaintID 
         ORDER BY r.CreatedAt DESC 
         LIMIT 1), '') AS ReplyMessage
      FROM complaints c
      LEFT JOIN departments d ON d.DepartmentID = c.DepartmentID
      ${where}
      ORDER BY c.CreatedAt DESC
    `;

    console.log('📊 [EXPORT] جلب البلاغات:', { sql: sql.substring(0, 200), paramsCount: params.length });

    const [rows] = await pool.query(sql, params);

    console.log(`✅ [EXPORT] تم جلب ${rows.length} بلاغ للتصدير`);

    // إنشاء ملف Excel
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('البلاغات');

    // تحديد الأعمدة
    sheet.columns = [
      { header: 'رقم البلاغ', key: 'TicketNumber', width: 20 },
      { header: 'اسم المراجع', key: 'PatientFullName', width: 25 },
      { header: 'رقم الجوال', key: 'PatientMobile', width: 15 },
      { header: 'رقم الملف', key: 'FileNumber', width: 15 },
      { header: 'القسم', key: 'DepartmentName', width: 20 },
      { header: 'الوصف', key: 'Description', width: 40 },
      { header: 'الأولوية', key: 'PriorityCode', width: 12 },
      { header: 'الحالة', key: 'StatusCode', width: 12 },
      { header: 'الرد', key: 'ReplyMessage', width: 40 },
      { header: 'تاريخ الإنشاء', key: 'CreatedAt', width: 20 },
      { header: 'آخر تحديث', key: 'UpdatedAt', width: 20 }
    ];

    // تنسيق رأس الجدول
    sheet.getRow(1).font = { bold: true, size: 12 };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    // إضافة البيانات
    rows.forEach(r => {
      sheet.addRow({
        TicketNumber: r.TicketNumber || '',
        PatientFullName: r.PatientFullName || '',
        PatientMobile: r.PatientMobile || '',
        FileNumber: r.FileNumber || '',
        DepartmentName: r.DepartmentName || '',
        Description: r.Description || '',
        PriorityCode: r.PriorityCode || '',
        StatusCode: r.StatusCode || '',
        ReplyMessage: r.ReplyMessage || '',
        CreatedAt: r.CreatedAt ? new Date(r.CreatedAt).toLocaleString('ar-SA') : '',
        UpdatedAt: r.UpdatedAt ? new Date(r.UpdatedAt).toLocaleString('ar-SA') : ''
      });
    });

    // إعداد headers الاستجابة
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="complaints_export.xlsx"'
    );

    // كتابة الملف
    await workbook.xlsx.write(res);
    res.end();

    console.log('✅ [EXPORT] تم تصدير Excel بنجاح');
  } catch (e) {
    console.error('❌ [EXPORT] خطأ في تصدير Excel:', e);
    res.status(500).json({ 
      ok: false, 
      message: e.message || 'خطأ في تصدير البيانات' 
    });
  }
};

/**
 * تصدير البلاغات إلى PDF مع الفلاتر
 * POST /api/complaints/export-pdf
 * يستقبل صورة من html2canvas ويحولها إلى PDF (نفس طريقة reports.html)
 */
export const exportComplaintsPDF = async (req, res) => {
  console.log('📄 [exportComplaintsPDF] بدأ إنشاء تقرير البلاغات (صورة من html2canvas)');

  try {
    // إضافة CORS headers
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    const body = req.body || {};
    const { complaintsImage, hospitalId, from, to, tickets } = body;

    console.log('📄 [exportComplaintsPDF] استقبال البيانات:', {
      hasImage: !!complaintsImage,
      imageLength: complaintsImage?.length || 0,
      hospitalId,
      from,
      to,
      tickets
    });

    if (!complaintsImage) {
      return res.status(400).json({
        ok: false,
        error: 'لم يتم إرسال صورة التقرير complaintsImage'
      });
    }

    // التحقق من أن الصورة صحيحة (PNG أو JPEG)
    if (!complaintsImage.startsWith('data:image/')) {
      console.error('❌ [exportComplaintsPDF] صيغة الصورة غير صحيحة:', complaintsImage.substring(0, 50));
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
      'attachment; filename="complaints_export.pdf"'
    );

    doc.pipe(res);

    const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const contentHeight = doc.page.height - doc.page.margins.top - doc.page.margins.bottom;

    // تحويل base64 إلى Buffer
    let base64 = complaintsImage;
    
    // إزالة prefix إذا كان موجوداً
    if (base64.startsWith('data:image/')) {
      base64 = base64.replace(/^data:image\/\w+;base64,/, '');
    }
    
    console.log('📄 [exportComplaintsPDF] طول base64 بعد التنظيف:', base64.length);
    
    if (!base64 || base64.length < 100) {
      throw new Error('الصورة المرسلة فارغة أو غير صحيحة');
    }

    let imgBuffer;
    try {
      imgBuffer = Buffer.from(base64, 'base64');
      console.log('📄 [exportComplaintsPDF] تم تحويل base64 إلى Buffer، الحجم:', imgBuffer.length);
    } catch (err) {
      console.error('❌ [exportComplaintsPDF] خطأ في تحويل base64:', err);
      throw new Error('فشل تحويل الصورة: ' + err.message);
    }

    // وضع الصورة من أعلى يسار منطقة المحتوى
    try {
      doc.image(imgBuffer, doc.page.margins.left, doc.page.margins.top, {
        fit: [contentWidth, contentHeight],
        align: 'center'
      });
      console.log('📄 [exportComplaintsPDF] تم إضافة الصورة إلى PDF');
    } catch (err) {
      console.error('❌ [exportComplaintsPDF] خطأ في إضافة الصورة:', err);
      throw new Error('فشل إضافة الصورة إلى PDF: ' + err.message);
    }

    doc.end();
  } catch (error) {
    console.error('❌ خطأ في exportComplaintsPDF:', error);
    
    // إضافة CORS headers حتى في حالة الخطأ
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    res.status(500).json({ ok: false, error: error.message });
  }
};

