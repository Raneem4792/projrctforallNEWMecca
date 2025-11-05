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

// ✅ قراءة التصنيفات من قاعدة بيانات المستشفى الحالي
router.get('/complaint-types', async (req, res) => {
  try {
    // محاولة الحصول على hospitalId من مصادر متعددة
    let hospitalId = Number(
      req.headers['x-hospital-id'] ||
      req.query.hospitalId ||
      req.body?.hospitalId ||
      req.user?.HospitalID ||
      0
    );

    // إذا لم يكن موجوداً، نستخدم القاعدة المركزية (للتوافق مع الكود القديم)
    let queryPool = pool;
    if (hospitalId) {
      try {
        queryPool = await getHospitalPool(hospitalId);
        console.log(`✅ جلب التصنيفات من قاعدة بيانات المستشفى: ${hospitalId}`);
      } catch (err) {
        console.warn('⚠️ لم يتم العثور على pool المستشفى، استخدام القاعدة المركزية:', err.message);
        queryPool = pool;
      }
    } else {
      console.log('⚠️ لا يوجد hospitalId، استخدام القاعدة المركزية');
    }

    const [rows] = await queryPool.query(
      `SELECT ComplaintTypeID AS id, TypeName AS nameAr, TypeNameEn AS nameEn, TypeCode
       FROM complaint_types ORDER BY TypeName`
    );

    console.log(`✅ تم جلب ${rows.length} تصنيف من قاعدة البيانات`);
    res.json(rows);
  } catch (error) {
    console.error('❌ خطأ في جلب التصنيفات الرئيسية:', error);
    res.status(500).json({ error: 'internal_error', message: error.message });
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

    // توليد كود بسيط من الاسم
    const typeCode = (nameEn || nameAr)
      .trim()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]+/g, '')
      .replace(/\s+/g, '_')
      .toUpperCase()
      .slice(0, 50) || 'TYPE_' + Date.now();

    // التحقق من وجود تصنيف بنفس الاسم أو الكود
    const [existingRows] = await pool.query(
      'SELECT ComplaintTypeID FROM complaint_types WHERE TypeName = ? OR TypeCode = ? LIMIT 1',
      [nameAr, typeCode]
    );

    let id;
    if (existingRows && existingRows.length > 0) {
      // موجود مسبقاً - نرجع الـ ID الموجود
      id = existingRows[0].ComplaintTypeID;
      console.log(`⚠️ التصنيف موجود مسبقاً:`, { ComplaintTypeID: id, TypeName: nameAr });
    } else {
      // نحاول نضيفه
      const [result] = await pool.query(
        `INSERT INTO complaint_types (TypeName, TypeCode, TypeNameEn)
         VALUES (?,?,?)`,
        [nameAr, typeCode, nameEn || null]
      );

      id = result.insertId;

      if (!id) {
        console.error('❌ فشل إدخال التصنيف: insertId = 0');
        return res.status(500).json({
          success: false,
          message: 'فشل إدخال التصنيف في قاعدة بيانات المستشفى'
        });
      }

      console.log(`✅ تم إدخال التصنيف الجديد في قاعدة البيانات:`, {
        ComplaintTypeID: id,
        TypeName: nameAr,
        TypeCode: typeCode,
        HospitalID: hospitalId
      });
    }

    // ✅ التحقق من أن البيانات تم حفظها في complaint_types
    const [verifyRows] = await pool.query(
      'SELECT ComplaintTypeID, TypeName, TypeCode, TypeNameEn FROM complaint_types WHERE ComplaintTypeID = ?',
      [id]
    );

    if (!verifyRows || verifyRows.length === 0) {
      console.error('❌ فشل التحقق: التصنيف لم يتم حفظه في complaint_types');
      return res.status(500).json({
        success: false,
        message: 'تم إنشاء التصنيف لكن فشل التحقق من الحفظ'
      });
    }

    const savedData = verifyRows[0];
    console.log(`✅ تم حفظ التصنيف الأساسي في complaint_types:`, {
      ComplaintTypeID: savedData.ComplaintTypeID,
      TypeName: savedData.TypeName,
      TypeCode: savedData.TypeCode,
      TypeNameEn: savedData.TypeNameEn,
      HospitalID: hospitalId,
      Database: pool.config?.database || 'unknown'
    });

    // ✅ إرسال الاستجابة النهائية
    return res.json({
      success: true,
      id: savedData.ComplaintTypeID,
      nameAr: savedData.TypeName,
      nameEn: savedData.TypeNameEn,
      typeCode: savedData.TypeCode
    });
  } catch (err) {
    console.error('❌ خطأ في إنشاء التصنيف الجديد:', err);
    console.error('تفاصيل الخطأ:', {
      message: err.message,
      code: err.code,
      sqlState: err.sqlState,
      sqlMessage: err.sqlMessage
    });
    return res.status(500).json({
      success: false,
      message: 'خطأ في قاعدة البيانات: ' + (err.message || 'خطأ غير معروف')
    });
  }
});

// PUT /api/complaint-types/:id - تعديل تصنيف أساسي
router.put('/complaint-types/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id || 0);
    const { nameAr, nameEn } = req.body || {};

    if (!id) {
      return res.status(400).json({ success: false, message: 'معرف التصنيف غير صحيح' });
    }
    if (!nameAr) {
      return res.status(400).json({ success: false, message: 'الاسم العربي مطلوب' });
    }

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
      `UPDATE complaint_types
       SET TypeName = ?, TypeNameEn = ?
       WHERE ComplaintTypeID = ?`,
      [nameAr, nameEn || null, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'لم يتم العثور على التصنيف' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('❌ خطأ في تعديل complaint_type:', err);
    next(err);
  }
});

// DELETE /api/complaint-types/:id - حذف تصنيف أساسي
router.delete('/complaint-types/:id', requireAuth, async (req, res, next) => {
  const id = Number(req.params.id || 0);
  if (!id) {
    return res.status(400).json({ success: false, message: 'معرف التصنيف غير صحيح' });
  }

  try {
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

    const hospPool = await getHospitalPool(hospitalId);

    // 1) نتأكد أولاً هل هذا النوع (أو أحد تصنيفاته الفرعية) مستخدم في بلاغات؟
    const [usageRows] = await hospPool.query(
      `SELECT COUNT(*) AS cnt
         FROM complaints
        WHERE ComplaintTypeID = ?
           OR SubTypeID IN (
                SELECT SubTypeID
                  FROM complaint_subtypes
                 WHERE ComplaintTypeID = ?
              )`,
      [id, id]
    );

    const usedCount = usageRows[0]?.cnt || 0;

    if (usedCount > 0) {
      // فيه بلاغات مربوطة بهذا التصنيف → ما نحذف
      return res.status(400).json({
        success: false,
        message: 'لا يمكن حذف التصنيف الأساسي لأنه مستخدم في بلاغات قائمة'
      });
    }

    // 2) لا توجد بلاغات → نحذف التصنيفات الفرعية التابعة له أولاً
    await hospPool.query(
      'DELETE FROM complaint_subtypes WHERE ComplaintTypeID = ?',
      [id]
    );

    // 3) ثم نحذف التصنيف الأساسي نفسه
    const [result] = await hospPool.query(
      'DELETE FROM complaint_types WHERE ComplaintTypeID = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'لم يتم العثور على التصنيف'
      });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('❌ خطأ في حذف complaint_type:', err);
    return next(err);
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

    // ✅ إضافة التصنيف الفرعي في جدول complaint_subtypes
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

    // ✅ التحقق من أن البيانات تم حفظها في complaint_subtypes
    const [verifyRows] = await pool.query(
      'SELECT SubTypeID, ComplaintTypeID, SubTypeName, SubTypeNameEn FROM complaint_subtypes WHERE SubTypeID = ?',
      [id]
    );

    if (!verifyRows || verifyRows.length === 0) {
      console.error('❌ فشل التحقق: التصنيف الفرعي لم يتم حفظه في complaint_subtypes');
      return res.status(500).json({
        success: false,
        message: 'تم إنشاء التصنيف الفرعي لكن فشل التحقق من الحفظ'
      });
    }

    console.log(`✅ تم حفظ التصنيف الفرعي في complaint_subtypes:`, {
      SubTypeID: id,
      ComplaintTypeID: typeId,
      SubTypeName: verifyRows[0].SubTypeName,
      SubTypeNameEn: verifyRows[0].SubTypeNameEn,
      HospitalID: hospitalId
    });

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

// PUT /api/complaint-subtypes/:id - تعديل تصنيف فرعي
router.put('/complaint-subtypes/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id || 0);
    const { nameAr, nameEn } = req.body || {};

    if (!id) {
      return res.status(400).json({ success: false, message: 'معرف التصنيف الفرعي غير صحيح' });
    }
    if (!nameAr) {
      return res.status(400).json({ success: false, message: 'الاسم العربي مطلوب' });
    }

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
      `UPDATE complaint_subtypes
       SET SubTypeName = ?, SubTypeNameEn = ?
       WHERE SubTypeID = ?`,
      [nameAr, nameEn || null, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'لم يتم العثور على التصنيف الفرعي' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('❌ خطأ في تعديل complaint_subtype:', err);
    next(err);
  }
});

// DELETE /api/complaint-subtypes/:id - حذف تصنيف فرعي
router.delete('/complaint-subtypes/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id || 0);
    if (!id) {
      return res.status(400).json({ success: false, message: 'معرف التصنيف الفرعي غير صحيح' });
    }

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

    try {
      const [result] = await pool.query(
        `DELETE FROM complaint_subtypes WHERE SubTypeID = ?`,
        [id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: 'لم يتم العثور على التصنيف الفرعي' });
      }

      res.json({ success: true });
    } catch (dbErr) {
      console.error('DB error deleting subtype:', dbErr);
      return res.status(400).json({
        success: false,
        message: 'لا يمكن حذف التصنيف الفرعي لأنه مستخدم في بلاغات'
      });
    }
  } catch (err) {
    console.error('❌ خطأ في حذف complaint_subtype:', err);
    next(err);
  }
});

export default router;

