// backend/routes/meta.js
import express from 'express';
import { pool } from '../config/db.js';
import { getHospitalPool } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// المستشفيات (+بحث اختياري ?q=)
router.get('/hospitals', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const sql = q
      ? `SELECT HospitalID AS id, NameAr AS name, Code
         FROM hospitals
         WHERE NameAr LIKE ? OR NameEn LIKE ? OR Code LIKE ?
         ORDER BY NameAr`
      : `SELECT HospitalID AS id, NameAr AS name, Code
         FROM hospitals ORDER BY NameAr`;
    const params = q ? [`%${q}%`, `%${q}%`, `%${q}%`] : [];
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (error) {
    console.error('خطأ في جلب المستشفيات:', error);
    res.status(500).json({ error: 'internal_error' });
  }
});

// الأقسام حسب المستشفى (هرمية)
router.get('/departments', async (req, res) => {
  try {
    const hid = Number(req.query.hospitalId || 0);
    if (!hid) return res.status(400).json({ error: 'hospitalId required' });
    const [rows] = await pool.query(
      `SELECT DepartmentID AS id, NameAr AS name, ParentDepartmentID AS parentId
       FROM departments
       WHERE HospitalID=?
       ORDER BY SortOrder ASC, NameAr ASC`, 
      [hid]
    );
    res.json(rows);
  } catch (error) {
    console.error('خطأ في جلب الأقسام:', error);
    res.status(500).json({ error: 'internal_error' });
  }
});

// الجنس
router.get('/genders', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT GenderCode AS code, LabelAr AS labelAr, LabelEn AS labelEn FROM genders`
    );
    res.json(rows);
  } catch (error) {
    console.error('خطأ في جلب الجنس:', error);
    res.status(500).json({ error: 'internal_error' });
  }
});

// التصنيفات الرئيسية (937)
router.get('/complaint-types', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ComplaintTypeID AS id, TypeName AS nameAr, TypeNameEn AS nameEn, TypeCode
       FROM complaint_types ORDER BY TypeName`
    );
    res.json(rows);
  } catch (error) {
    console.error('خطأ في جلب التصنيفات الرئيسية:', error);
    res.status(500).json({ error: 'internal_error' });
  }
});

// التصنيفات الفرعية حسب الرئيسي
router.get('/complaint-subtypes', async (req, res) => {
  try {
    const typeId = Number(req.query.typeId || 0);
    if (!typeId) return res.status(400).json({ error: 'typeId required' });
    
    // محاولة الحصول على hospitalId من مصادر متعددة
    let hospitalId = Number(
      req.headers['x-hospital-id'] || 
      req.query.hospitalId || 
      req.user?.HospitalID ||
      0
    );

    // إذا لم يكن موجوداً، نستخدم القاعدة المركزية (للتوافق مع الكود القديم)
    let queryPool = pool;
    if (hospitalId) {
      try {
        queryPool = await getHospitalPool(hospitalId);
      } catch (err) {
        console.warn('⚠️ لم يتم العثور على pool المستشفى، استخدام القاعدة المركزية:', err.message);
        queryPool = pool;
      }
    }

    const [rows] = await queryPool.query(
      `SELECT SubTypeID AS id, SubTypeName AS nameAr, SubTypeNameEn AS nameEn
       FROM complaint_subtypes WHERE ComplaintTypeID=?
       ORDER BY SubTypeName`, 
      [typeId]
    );
    res.json(rows);
  } catch (error) {
    console.error('خطأ في جلب التصنيفات الفرعية:', error);
    res.status(500).json({ error: 'internal_error' });
  }
});

// دالة بسيطة لتوليد TypeCode من الاسم
function makeTypeCode(nameAr, nameEn) {
  const base = (nameEn && nameEn.trim()) || nameAr.trim();
  let code = base
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w]+/g, '_')
    .toUpperCase()
    .slice(0, 50);
  if (!code) code = 'TYPE_' + Date.now();
  return code;
}

// POST /api/complaint-types/custom
router.post('/complaint-types/custom', requireAuth, async (req, res, next) => {
  try {
    const { nameAr, nameEn } = req.body || {};

    if (!nameAr) {
      return res.status(400).json({ success: false, message: 'الاسم العربي مطلوب' });
    }

    // ✅ نستخدم getHospitalPool حتى يختار DB المستشفى من X-Hospital-Id
    const hospitalId = Number(
      req.headers['x-hospital-id'] || 
      req.query.hospitalId || 
      req.body.hospitalId ||
      req.user?.HospitalID ||
      0
    );

    if (!hospitalId) {
      return res.status(400).json({ 
        success: false, 
        message: 'يجب تحديد hospitalId في header X-Hospital-Id' 
      });
    }

    const pool = await getHospitalPool(hospitalId);

    const typeCode = makeTypeCode(nameAr, nameEn);

    const [result] = await pool.query(
      `INSERT IGNORE INTO complaint_types (TypeName, TypeCode, TypeNameEn)
       VALUES (?,?,?)`,
      [nameAr, typeCode, nameEn || null]
    );

    let id = result.insertId;

    // لو كان موجود مسبقاً بنفس TypeCode نجيب الـ ID
    if (!id) {
      const [rows] = await pool.query(
        'SELECT ComplaintTypeID FROM complaint_types WHERE TypeCode = ? LIMIT 1',
        [typeCode]
      );
      id = rows[0]?.ComplaintTypeID;
    }

    if (!id) {
      return res.status(500).json({
        success: false,
        message: 'لم يتم إنشاء التصنيف'
      });
    }

    res.json({
      success: true,
      id,
      nameAr,
      nameEn,
      typeCode
    });
  } catch (err) {
    console.error('❌ خطأ في إنشاء التصنيف الجديد:', err);
    next(err);
  }
});

// POST /api/complaint-subtypes/custom
router.post('/complaint-subtypes/custom', requireAuth, async (req, res, next) => {
  try {
    const { typeId, nameAr, nameEn } = req.body || {};

    if (!typeId) {
      return res.status(400).json({ success: false, message: 'رقم التصنيف الرئيسي مطلوب' });
    }
    if (!nameAr) {
      return res.status(400).json({ success: false, message: 'الاسم العربي للتصنيف الفرعي مطلوب' });
    }

    // نجيب pool قاعدة بيانات المستشفى من X-Hospital-Id
    const hospitalId = Number(
      req.headers['x-hospital-id'] || 
      req.query.hospitalId || 
      req.body.hospitalId ||
      req.user?.HospitalID ||
      0
    );

    if (!hospitalId) {
      return res.status(400).json({ 
        success: false, 
        message: 'يجب تحديد hospitalId في header X-Hospital-Id' 
      });
    }

    const pool = await getHospitalPool(hospitalId);

    const [result] = await pool.query(
      `INSERT IGNORE INTO complaint_subtypes (ComplaintTypeID, SubTypeName, SubTypeNameEn)
       VALUES (?,?,?)`,
      [typeId, nameAr, nameEn || null]
    );

    let id = result.insertId;

    // لو موجود مسبقاً بنفس الاسم لنفس التصنيف، نجيب الـ ID
    if (!id) {
      const [rows] = await pool.query(
        `SELECT SubTypeID FROM complaint_subtypes
         WHERE ComplaintTypeID = ? AND SubTypeName = ? LIMIT 1`,
        [typeId, nameAr]
      );
      id = rows[0]?.SubTypeID;
    }

    if (!id) {
      return res.status(500).json({
        success: false,
        message: 'لم يتم إنشاء التصنيف الفرعي',
      });
    }

    res.json({
      success: true,
      id,
      typeId,
      nameAr,
      nameEn,
    });
  } catch (err) {
    console.error('❌ خطأ في إنشاء التصنيف الفرعي الجديد:', err);
    next(err);
  }
});

export default router;

