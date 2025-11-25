import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getCentralPool } from '../db/centralPool.js';

const router = express.Router();

// GET /api/complaints/employee-targets - جلب البلاغات المسجلة ضد موظف محدد
router.get('/employee-targets', requireAuth, async (req, res) => {
  try {
    const { employeeName } = req.query;
    
    if (!employeeName) {
      return res.status(400).json({
        success: false,
        message: 'اسم الموظف مطلوب'
      });
    }

    const { getHospitalPool } = await import('../config/db.js');
    const pool = await getCentralPool();
    
    // جلب جميع المستشفيات النشطة
    const [allHospitals] = await pool.query(`
      SELECT HospitalID, NameAr AS HospitalName
      FROM hospitals 
      WHERE IsActive = 1
    `);

    let allTargets = [];

    // البحث في جميع المستشفيات
    for (const hospital of allHospitals) {
      try {
        const hospitalPool = await getHospitalPool(hospital.HospitalID);
        if (!hospitalPool) continue;

        // جلب البلاغات من جدول complaint_targets مع تفاصيل البلاغ
        const [targets] = await hospitalPool.query(`
          SELECT 
            ct.TargetID,
            ct.ComplaintID,
            ct.TargetEmployeeID,
            ct.TargetEmployeeName,
            ct.TargetDepartmentID,
            ct.TargetDepartmentName,
            ct.CreatedAt as TargetCreatedAt,
            c.TicketNumber,
            c.Description,
            c.StatusCode,
            c.PriorityCode,
            c.CreatedAt,
            c.ComplaintTypeID,
            c.SubTypeID
          FROM complaint_targets ct
          JOIN complaints c ON c.ComplaintID = ct.ComplaintID
          WHERE ct.TargetEmployeeName LIKE ?
            AND (c.IsDeleted = 0 OR c.IsDeleted IS NULL)
          ORDER BY c.CreatedAt DESC
        `, [`%${employeeName}%`]);

        // إضافة اسم المستشفى لكل بلاغ
        const targetsWithHospital = targets.map(target => ({
          ...target,
          HospitalName: hospital.HospitalName,
          HospitalID: hospital.HospitalID
        }));

        allTargets = allTargets.concat(targetsWithHospital);

      } catch (hospitalError) {
        console.error(`خطأ في المستشفى ${hospital.HospitalID}:`, hospitalError);
        // تجاهل أخطاء المستشفيات الفردية والمتابعة
        continue;
      }
    }

    // ترتيب النتائج حسب التاريخ (الأحدث أولاً)
    allTargets.sort((a, b) => new Date(b.CreatedAt) - new Date(a.CreatedAt));

    console.log(`📊 تم العثور على ${allTargets.length} بلاغ للموظف: ${employeeName}`);

    res.json({
      success: true,
      employeeName,
      totalCount: allTargets.length,
      targets: allTargets
    });

  } catch (error) {
    console.error('GET /api/complaints/employee-targets failed:', error);
    res.status(500).json({
      success: false,
      message: 'خطأ في الخادم'
    });
  }
});

export default router;
