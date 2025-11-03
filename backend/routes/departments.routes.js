// backend/routes/departments.routes.js
import express from 'express';
import { getTenantPoolByHospitalId } from '../db/tenantManager.js';
import jwt from 'jsonwebtoken';
import config from '../config/multi-tenant.js';

const router = express.Router();

// Middleware للمصادقة (نسخة محلية للاستخدام في هذا الراوتر)
function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  
  if (!token) {
    return res.status(401).json({ 
      success: false, 
      message: 'مطلوب تسجيل الدخول' 
    });
  }

  try {
    const payload = jwt.verify(token, config.jwt.secret);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ 
      success: false, 
      message: 'انتهت الجلسة، سجّل دخولك' 
    });
  }
}

/**
 * GET /api/departments/me
 * ✅ أقسام مستشفى المستخدم الحالي (من التوكن فقط)
 * لا يقبل أي hospitalId من query/header - يعتمد حصرياً على JWT
 */
router.get('/me', requireAuth, async (req, res) => {
  try {
    // ✅ فقط من التوكن - تجاهل أي قيمة من query أو header
    const hospitalId = Number(req.user?.HospitalID || req.user?.hospitalId || req.user?.hosp || 0);
    
    console.log('🔍 /departments/me - HospitalID من التوكن:', hospitalId);
    console.log('🔍 التوكن الكامل:', req.user);
    
    if (!hospitalId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Hospital ID مفقود في التوكن. إذا كنت مدير مركزي، استخدم /switch-hospital أولاً',
        user: req.user
      });
    }

    const pool = await getTenantPoolByHospitalId(hospitalId);

    // ✅ تشخيص: تأكيد القاعدة المُستخدمة
    const [[{ db }]] = await pool.query('SELECT DATABASE() AS db');
    console.log(`🔹 /api/departments/me using DB: ${db} (Hospital ID: ${hospitalId})`);

    const [rows] = await pool.query(`
      SELECT 
        DepartmentID         AS id,
        NameAr               AS nameAr,
        NameEn               AS nameEn,
        ParentDepartmentID   AS parentId
      FROM departments
      WHERE IFNULL(IsActive, 1) = 1
      ORDER BY IFNULL(SortOrder, 999), NameAr
    `);

    console.log(`✅ تم تحميل ${rows.length} قسم من ${db}`);

    res.json({ 
      success: true, 
      data: rows 
    });

  } catch (e) {
    console.error('❌ /api/departments/me error:', e);
    res.status(500).json({ 
      success: false, 
      message: 'Server error loading departments',
      error: e.message
    });
  }
});

/**
 * GET /api/departments?hospitalId=6&parentId= (اختياري)
 * - يرجع الأقسام لقاعدة المستشفى المحددة
 * - إن أرسلت parentId يرجّع الأقسام الفرعية فقط
 * - IsActive=1 فقط
 * - ملاحظة: لا نفلتر على HospitalID داخل التينانت لأن الاتصال نفسه خاص بالمستشفى
 */
router.get('/', async (req, res) => {
  try {
    const hospitalId = Number(req.query.hospitalId);
    
    // ✅ حماية صارمة - لا نسمح بالافتراض للمركزي
    if (!hospitalId || hospitalId <= 0) {
      console.log('❌ GET /api/departments - hospitalId مطلوب:', req.query);
      return res.status(400).json({ 
        success: false,
        message: 'hospitalId مطلوب - لا يمكن الافتراض للمركزي',
        received: req.query.hospitalId
      });
    }

    const parentId = req.query.parentId ? Number(req.query.parentId) : null;
    const pool = await getTenantPoolByHospitalId(hospitalId);

    // ✅ لا نفلتر على HospitalID لأن الـ pool نفسه خاص بقاعدة المستشفى
    let sql = `
      SELECT DepartmentID, ParentDepartmentID, NameAr, NameEn
      FROM departments
      WHERE IFNULL(IsActive, 1) = 1
    `;
    const params = [];

    if (parentId === 0) {
      // الأقسام العليا فقط (التي ليس لها أب)
      sql += ` AND (ParentDepartmentID IS NULL OR ParentDepartmentID = 0)`;
    } else if (parentId) {
      // أبناء قسم محدد
      sql += ` AND ParentDepartmentID = ?`;
      params.push(parentId);
    }
    sql += ` ORDER BY IFNULL(SortOrder, 999), NameAr`;

    const [rows] = await pool.query(sql, params);
    res.json({
      success: true,
      data: rows
    });
  } catch (e) {
    console.error('GET /api/departments error:', e);
    res.status(500).json({ 
      success: false,
      message: 'Server error loading departments' 
    });
  }
});

/**
 * GET /api/departments/tree?hospitalId=6
 * - يرجّع شجرة (أبناء ضمن children[]) للاستخدام الجاهز إن تبي Dropdown هرمي
 */
router.get('/tree', async (req, res) => {
  try {
    const hospitalId = Number(req.query.hospitalId);
    if (!hospitalId) return res.status(400).json({ 
      success: false,
      message: 'hospitalId مطلوب' 
    });

    const pool = await getTenantPoolByHospitalId(hospitalId);
    
    // ✅ لا نفلتر على HospitalID لأن الـ pool نفسه خاص بقاعدة المستشفى
    const [rows] = await pool.query(
      `SELECT DepartmentID, ParentDepartmentID, NameAr, NameEn
       FROM departments
       WHERE IFNULL(IsActive, 1) = 1
       ORDER BY IFNULL(SortOrder, 999), NameAr`
    );

    const byId = new Map();
    rows.forEach(r => byId.set(r.DepartmentID, { ...r, children: [] }));
    const roots = [];
    rows.forEach(r => {
      if (!r.ParentDepartmentID) roots.push(byId.get(r.DepartmentID));
      else if (byId.has(r.ParentDepartmentID)) byId.get(r.ParentDepartmentID).children.push(byId.get(r.DepartmentID));
      else roots.push(byId.get(r.DepartmentID)); // لو الأب مفقود
    });

    res.json({
      success: true,
      data: roots
    });
  } catch (e) {
    console.error('GET /api/departments/tree error:', e);
    res.status(500).json({ 
      success: false,
      message: 'Server error building tree' 
    });
  }
});

export default router;
