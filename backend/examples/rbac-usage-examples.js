// backend/examples/rbac-usage-examples.js
// أمثلة استخدام نظام الصلاحيات (RBAC) في المسارات

import express from 'express';
import { 
  requireAuth, 
  restrictToHospital, 
  requireClusterAdmin,
  requireHospitalAdmin,
  attachPermissions
} from '../middleware/authGuards.js';
import { attachHospitalPool, getCentralPool } from '../middleware/hospitalPool.js';

const router = express.Router();

// ========================================
// مثال 1: لوحة تحكم مستشفى واحد
// ========================================
// - يجب تسجيل الدخول
// - يجب أن يكون له صلاحية على المستشفى
// - يتم إرفاق pool المستشفى

router.get('/api/h/:hospitalId/dashboard/summary',
  requireAuth,                    // تحقق من تسجيل الدخول
  restrictToHospital,             // تحقق من صلاحية الوصول للمستشفى
  attachHospitalPool,             // إضافة pool المستشفى
  async (req, res) => {
    try {
      // الآن req.hospitalPool جاهز للاستخدام
      const [stats] = await req.hospitalPool.query(`
        SELECT 
          StatusCode,
          COUNT(*) as count
        FROM complaints
        GROUP BY StatusCode
      `);

      res.json({
        ok: true,
        hospitalId: req.hospitalId,
        stats
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// ========================================
// مثال 2: قائمة جميع المستشفيات (مدير التجمع فقط)
// ========================================

router.get('/api/central/hospitals',
  requireAuth,              // تحقق من تسجيل الدخول
  requireClusterAdmin,      // فقط RoleID=1
  async (req, res) => {
    try {
      const central = await getCentralPool();
      const [hospitals] = await central.query(`
        SELECT HospitalID, NameAr, NameEn, Code, IsActive, CreatedAt
        FROM hospitals
        ORDER BY NameAr
      `);

      res.json({
        ok: true,
        hospitals
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// ========================================
// مثال 3: تقرير مركزي لكل المستشفيات
// ========================================

router.get('/api/central/reports/overview',
  requireAuth,
  requireClusterAdmin,
  async (req, res) => {
    try {
      const central = await getCentralPool();
      
      // جلب قائمة المستشفيات النشطة
      const [hospitals] = await central.query(`
        SELECT HospitalID, NameAr, Code, DbName, DbHost, DbUser, DbPass
        FROM hospitals
        WHERE IsActive = 1
      `);

      // جمع إحصائيات من كل مستشفى
      const overview = [];
      
      for (const hosp of hospitals) {
        try {
          const pool = await getHospitalPool(hosp.HospitalID);
          
          const [stats] = await pool.query(`
            SELECT 
              COUNT(*) as totalComplaints,
              SUM(CASE WHEN StatusCode = 'OPEN' THEN 1 ELSE 0 END) as openCount,
              SUM(CASE WHEN StatusCode = 'CLOSED' THEN 1 ELSE 0 END) as closedCount
            FROM complaints
          `);

          overview.push({
            hospitalId: hosp.HospitalID,
            nameAr: hosp.NameAr,
            code: hosp.Code,
            stats: stats[0]
          });
        } catch (err) {
          console.error(`خطأ في جلب بيانات المستشفى ${hosp.Code}:`, err);
          overview.push({
            hospitalId: hosp.HospitalID,
            nameAr: hosp.NameAr,
            code: hosp.Code,
            error: 'فشل جلب البيانات'
          });
        }
      }

      res.json({
        ok: true,
        totalHospitals: hospitals.length,
        overview
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// ========================================
// مثال 4: إدارة الأقسام (مدير المستشفى أو أعلى)
// ========================================

router.get('/api/h/:hospitalId/departments',
  requireAuth,
  restrictToHospital,
  requireHospitalAdmin,        // RoleID=1 أو 2 فقط
  attachHospitalPool,
  async (req, res) => {
    try {
      const [departments] = await req.hospitalPool.query(`
        SELECT DepartmentID, NameAr, NameEn, Code, HeadName, IsActive
        FROM departments
        WHERE HospitalID = 1
        ORDER BY SortOrder, NameAr
      `);

      res.json({
        ok: true,
        hospitalId: req.hospitalId,
        departments
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// ========================================
// مثال 5: إضافة قسم جديد
// ========================================

router.post('/api/h/:hospitalId/departments',
  requireAuth,
  restrictToHospital,
  requireHospitalAdmin,
  attachHospitalPool,
  async (req, res) => {
    try {
      const { nameAr, nameEn, code, headName, headEmail } = req.body;

      if (!nameAr) {
        return res.status(400).json({ error: 'اسم القسم مطلوب' });
      }

      const [result] = await req.hospitalPool.query(`
        INSERT INTO departments (HospitalID, NameAr, NameEn, Code, HeadName, HeadEmail, IsActive, CreatedAt)
        VALUES (1, ?, ?, ?, ?, ?, 1, NOW())
      `, [nameAr, nameEn || nameAr, code || null, headName || null, headEmail || null]);

      res.status(201).json({
        ok: true,
        departmentId: result.insertId,
        message: 'تم إضافة القسم بنجاح'
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// ========================================
// مثال 6: استخدام attachPermissions للتحكم الديناميكي
// ========================================

router.get('/api/user/permissions',
  requireAuth,
  attachPermissions,
  async (req, res) => {
    res.json({
      ok: true,
      user: {
        userId: req.user.UserID,
        username: req.user.Username,
        roleId: req.user.RoleID,
        hospitalId: req.user.HospitalID
      },
      permissions: req.permissions
    });
  }
);

// ========================================
// مثال 7: قائمة الشكاوى حسب الصلاحية
// ========================================

router.get('/api/h/:hospitalId/complaints',
  requireAuth,
  restrictToHospital,
  attachHospitalPool,
  async (req, res) => {
    try {
      let query = 'SELECT * FROM complaints WHERE 1=1';
      const params = [];

      // حسب الدور، قيّد النتائج
      if (req.user.RoleID === 3) {
        // مشرف قسم: فقط شكاوى قسمه
        query += ' AND TargetDepartmentID = ?';
        params.push(req.user.DepartmentID);
      } else if (req.user.RoleID === 4) {
        // موظف: فقط الشكاوى الموكلة له
        query += ' AND AssignedToUserID = ?';
        params.push(req.user.UserID);
      }
      // RoleID=1,2: يرى كل الشكاوى

      query += ' ORDER BY CreatedAt DESC LIMIT 100';

      const [complaints] = await req.hospitalPool.query(query, params);

      res.json({
        ok: true,
        count: complaints.length,
        complaints
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// ========================================
// مثال 8: حماية المسارات الحساسة
// ========================================

router.delete('/api/h/:hospitalId/complaints/:id',
  requireAuth,
  restrictToHospital,
  requireHospitalAdmin,     // فقط المديرين يستطيعون الحذف
  attachHospitalPool,
  async (req, res) => {
    try {
      const complaintId = req.params.id;

      const [result] = await req.hospitalPool.query(`
        DELETE FROM complaints WHERE ComplaintID = ?
      `, [complaintId]);

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'الشكوى غير موجودة' });
      }

      res.json({
        ok: true,
        message: 'تم حذف الشكوى'
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

export default router;

