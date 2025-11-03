// routes/complaints-list.js
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

// دالة جلب البلاغات من مستشفى واحد
async function fetchComplaints(h) {
  const pool = makeHospitalPool(h);
  try {
    const [rows] = await pool.query(`
      SELECT 
        c.ComplaintID,
        c.HospitalID,
        c.DepartmentID,
        c.TicketNumber,
        c.ComplaintType,
        c.Priority,
        c.Status,
        c.Subject,
        c.Description,
        c.ReporterName,
        c.ReporterEmail,
        c.ReporterPhone,
        c.IsAnonymous,
        c.IsActive,
        c.CreatedAt,
        c.UpdatedAt,
        d.NameAr as DepartmentNameAr,
        d.NameEn as DepartmentNameEn
      FROM complaints c
      LEFT JOIN departments d ON d.DepartmentID = c.DepartmentID
      WHERE c.IsActive = 1
      ORDER BY c.CreatedAt DESC
    `);
    return rows.map(c => ({
      ...c,
      HospitalID: h.HospitalID,
      HospitalNameAr: h.NameAr,
      HospitalNameEn: h.NameEn
    }));
  } catch (err) {
    console.error(`❌ Error fetching complaints from ${h.DbName}:`, err.message);
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

// Route الرئيسي
router.get('/', requireAuth, async (req, res) => {
  res.set('Cache-Control','no-store');

  try {
    const user = req.user;
    const cluster = isClusterManager(user);
    
    console.log('🔍 Complaints Debug:', {
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
          const complaints = await fetchComplaints(h);
          all = all.concat(complaints);
        } catch (e) { 
          console.error('complaints err', h.DbName, e.code); 
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
          const complaints = await fetchComplaints(h);
          all = all.concat(complaints);
        } catch (e) { 
          console.error('complaints err', h.DbName, e.code); 
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

    console.log('🔍 Fetching complaints for hospital:', rows[0].NameAr);
    const items = await fetchComplaints(rows[0]);
    console.log('✅ Fetched complaints:', items.length);
    
    return res.json({ ok:true, scope:'single', items });

  } catch (err) {
    console.error('❌ GET /api/complaints-list error:', {
      code: err.code,
      message: err.message,
      stack: err.stack
    });
    return res.status(500).json({ ok:false, message:'خطأ داخلي: ' + err.message });
  }
});

export default router;
