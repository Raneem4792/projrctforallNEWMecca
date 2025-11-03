// routes/departments-new.js
import express from 'express';
import mysql from 'mysql2/promise';
import { getCentralPool } from '../db/centralPool.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// دالة إنشاء اتصال بقاعدة المستشفى
function makeHospitalPool(h) {
  return mysql.createPool({
    host: h.DbHost,
    user: h.DbUser,
    password: h.DbPass,
    database: h.DbName,
    waitForConnections: true,
    connectionLimit: 5
  });
}

// دالة جلب الأقسام من مستشفى واحد
async function fetchDepartments(h) {
  const pool = makeHospitalPool(h);
  try {
    // نجيب اسم قاعدة المستشفى
    const [[{ db }]] = await pool.query('SELECT DATABASE() AS db');

    // نعرف إن كانت الأعمدة القديمة موجودة أم لا
    const [cols] = await pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA=? AND TABLE_NAME='departments'`,
      [db]
    );
    const names = cols.map(c => c.COLUMN_NAME);
    const hasLegacyCols =
      names.includes('DefaultEmail') &&
      names.includes('HeadName') &&
      names.includes('HeadEmail');

    // نبني الـ SELECT متوافقًا
    const select =
      `SELECT 
         DepartmentID, 
         HospitalID,
         ParentDepartmentID, 
         Code,
         NameAr, 
         NameEn, 
         ${hasLegacyCols
            ? 'DefaultEmail, HeadName, HeadEmail'
            : 'NULL AS DefaultEmail, NULL AS HeadName, NULL AS HeadEmail'},
         IsActive, 
         SortOrder, 
         CreatedAt, 
         UpdatedAt
       FROM departments
       ORDER BY COALESCE(SortOrder,9999), DepartmentID`;

    const [rows] = await pool.query(select);
    return rows.map(d => ({
      ...d,
      HospitalID: h.HospitalID,
      HospitalNameAr: h.NameAr,
      HospitalNameEn: h.NameEn
    }));
  } catch (err) {
    console.error(`❌ Error fetching departments from ${h.DbName}:`, err.message);
    return [];
  } finally {
    pool.end();
  }
}

// دالة تحديد مدير التجمّع
function isClusterManager(user) {
  const roleId = user?.RoleID ?? user?.roleId ?? user?.roleID;
  return !!user && [1, 4].includes(roleId);
}

// دالة جلب المستشفيات النشطة
async function getHospitalsActive() {
  const centralPool = await getCentralPool();
  const [rows] = await centralPool.query(`
    SELECT HospitalID, NameAr, NameEn, DbHost, DbUser, DbPass, DbName,
           IFNULL(IsActive,Active) AS IsActive
    FROM hospitals
    WHERE IFNULL(IsActive,Active)=1
  `);
  return rows || [];
}

// Route عام للأقسام (بدون توكن) - للاستخدام في صفحة التسجيل
router.get('/public', async (req, res) => {
  res.set('Cache-Control','no-store');

  try {
    const hospitalId = Number(req.query.hospitalId);
    if (!hospitalId) {
      return res.status(400).json({ 
        success: false,
        message: 'hospitalId مطلوب' 
      });
    }

    console.log('🔍 Public Departments Request:', { hospitalId });

    // جلب معلومات المستشفى من القاعدة المركزية
    const centralPool = await getCentralPool();
    const [hospitals] = await centralPool.query(
      'SELECT HospitalID, NameAr, NameEn, DbHost, DbUser, DbPass, DbName FROM hospitals WHERE HospitalID = ?',
      [hospitalId]
    );

    if (hospitals.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'المستشفى غير موجود' 
      });
    }

    const hospital = hospitals[0];
    const departments = await fetchDepartments(hospital);

    res.json({
      success: true,
      data: departments,
      total: departments.length
    });

  } catch (error) {
    console.error('❌ خطأ في جلب الأقسام العامة:', error);
    res.status(500).json({ 
      success: false,
      message: 'حدث خطأ في جلب الأقسام',
      error: error.message 
    });
  }
});

// Route الرئيسي (محمي بالتوكن)
router.get('/', requireAuth, async (req, res) => {
  res.set('Cache-Control','no-store');

  try {
    const user = req.user;
    const cluster = isClusterManager(user);
    
    console.log('🔍 Departments Debug:', {
      user: user?.Username,
      cluster,
      hospitalId: user?.HospitalID,
      queryHospitalId: req.query.hospitalId
    });

    // 1) حددي الهدف
    let hospitalId = parseInt(req.query.hospitalId || 0, 10);
    if (!cluster && !hospitalId) {
      // موظف مستشفى → خذي من التوكن
      hospitalId = user?.HospitalID || user?.hospitalId || user?.hospitalID || 0;
    }

    // للمديرين المركزيين (بدون HospitalID) - اسمح لهم برؤية كل المستشفيات
    if (!hospitalId && cluster) {
      // مدير التجمّع بدون hospitalId → رجّع الكل
      const hospitals = await getHospitalsActive();
      let all = [];
      for (const h of hospitals) {
        try { 
          const departments = await fetchDepartments(h);
          all = all.concat(departments);
        } catch (e) { 
          console.error('dept err', h.DbName, e.code); 
        }
      }
      return res.json({ ok:true, scope:'all', items: all });
    }

    if (!hospitalId) {
      return res.status(400).json({ ok:false, message:'HospitalID مطلوب' });
    }

    // 2) مدير التجمّع بدون hospitalId → رجّع الكل
    if (cluster && !hospitalId) {
      const hospitals = await getHospitalsActive();
      let all = [];
      for (const h of hospitals) {
        try { 
          const departments = await fetchDepartments(h);
          all = all.concat(departments);
        } catch (e) { 
          console.error('dept err', h.DbName, e.code); 
        }
      }
      return res.json({ ok:true, scope:'all', items: all });
    }

    // 3) مستشفى واحد
    const centralPool = await getCentralPool();
    const [rows] = await centralPool.query(
      `SELECT * FROM hospitals WHERE HospitalID=? AND IFNULL(IsActive,Active)=1 LIMIT 1`,
      [hospitalId]
    );
    if (!rows?.length) return res.status(404).json({ ok:false, message:'المستشفى غير موجود أو غير مفعل' });

    console.log('🔍 Fetching departments for hospital:', rows[0].NameAr);
    const items = await fetchDepartments(rows[0]);
    console.log('✅ Fetched departments:', items.length);
    
    return res.json({ ok:true, scope:'single', items });

  } catch (err) {
    console.error('❌ GET /api/departments error:', {
      code: err.code,
      message: err.message,
      stack: err.stack
    });
    return res.status(500).json({ ok:false, message:'خطأ داخلي: ' + err.message });
  }
});

export default router;
