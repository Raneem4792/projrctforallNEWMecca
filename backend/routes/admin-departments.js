// routes/admin-departments.js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { resolveHospitalId } from '../middleware/resolveHospitalId.js';
import { attachHospitalPool } from '../middleware/hospitalPool.js';
import { body, validationResult } from 'express-validator';
const router = Router();

// جلب قائمة الأقسام
router.get(
  '/',
  requireAuth, resolveHospitalId, attachHospitalPool,
  async (req, res, next) => {
  try {
    const hospitalId = req.hospitalId;
    const pool = req.hospitalPool;

    console.log('🔍 Loading departments for hospital:', hospitalId);

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

    console.log(`📊 Database: ${db}, Has legacy columns: ${hasLegacyCols}`);

    // نبني الـ SELECT متوافقًا
    const select =
      `SELECT
         DepartmentID, HospitalID, ParentDepartmentID, Code,
         NameAr, NameEn, IsActive, SortOrder, CreatedAt, UpdatedAt
         ${hasLegacyCols
            ? ', DefaultEmail, HeadName, HeadEmail'
            : ', NULL AS DefaultEmail, NULL AS HeadName, NULL AS HeadEmail'}
       FROM departments
       WHERE HospitalID = ?
       ORDER BY SortOrder ASC, DepartmentID ASC`;

    const [rows] = await pool.query(select, [hospitalId]);

    console.log(`✅ Found ${rows.length} departments for hospital ${hospitalId}`);

    res.json({ 
      ok: true, 
      items: rows,
      count: rows.length,
      hospitalId: hospitalId
    });
  } catch (err) {
    console.error('Error loading departments:', err);
    res.status(500).json({ 
      ok: false, 
      error: 'تعذّر تحميل الأقسام',
      details: err.message
    });
  }
});

// التحقق من صحة البيانات
const departmentValidation = [
  body('HospitalID')
    .notEmpty().withMessage('معرف المستشفى مطلوب')
    .isInt({ min: 1 }).withMessage('معرف المستشفى غير صالح'),

  body('NameAr')
    .trim().notEmpty().withMessage('اسم القسم بالعربية مطلوب')
    .isLength({ min: 2, max: 100 }).withMessage('اسم القسم يجب أن يكون بين 2-100 حرف'),

  body('NameEn')
    .optional({ checkFalsy: true })
    .trim().isLength({ min: 2, max: 100 }).withMessage('اسم القسم بالإنجليزية يجب أن يكون بين 2-100 حرف'),

  body('ParentDepartmentID')
    .optional({ checkFalsy: true })
    .isInt({ min: 1 }).withMessage('معرف القسم الأب غير صالح'),

  body('SortOrder')
    .optional({ checkFalsy: true })
    .isInt({ min: 1 }).withMessage('ترتيب العرض يجب أن يكون رقم موجب')
];

// إضافة قسم جديد
router.post(
  '/',
  requireAuth, resolveHospitalId, attachHospitalPool,
  departmentValidation,
  async (req, res, next) => {
  try {
    // التحقق من صحة البيانات
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg,
        errors: errors.array()
      });
    }

    const { NameAr, NameEn, ParentDepartmentID } = req.body;
    
    // فحص الصلاحيات
    const isCluster = [1, 4].includes(req.user.RoleID);
    if (!isCluster && Number(req.hospitalId) !== Number(req.user.HospitalID)) {
      return res.status(403).json({ 
        success: false, 
        message: 'غير مصرح لك بالكتابة في هذا المستشفى' 
      });
    }

    if (!NameAr || !NameAr.trim()) {
      return res.status(400).json({ 
        success: false, 
        message: 'اسم القسم مطلوب' 
      });
    }

    // تطبيع الإدخال
    const nameAr = (NameAr || '').trim();
    const nameEn = (NameEn || '').trim() || nameAr || 'Unnamed';
    const code = (req.body.Code || '').trim() || slugFromArabic(nameAr).slice(0, 30) || 'dept';

    // دالة بسيطة لتوليد كود/إنجليزي بدون مكتبات
    function slugFromArabic(s='') {
      return s
        .normalize('NFKD')
        .replace(/[\u064B-\u065F]/g, '')        // تشكيل
        .replace(/[^\p{L}\p{N}]+/gu, ' ')       // مسافات
        .trim()
        .replace(/\s+/g, '-')
        .toLowerCase();
    }

    // «بدون أب» = NULL
    const parentId = Number(ParentDepartmentID) > 0 ? Number(ParentDepartmentID) : null;

    // منع اسم مكرر داخل نفس المستشفى
    const [[dup]] = await req.hospitalPool.query(
      `SELECT DepartmentID FROM departments
       WHERE HospitalID=? AND NameAr=? AND COALESCE(IsActive,1)=1 LIMIT 1`,
      [req.hospitalId, nameAr]
    );
    if (dup) {
      return res.status(409).json({ 
        success: false, 
        message: 'يوجد قسم بنفس الاسم في هذا المستشفى' 
      });
    }

    // احسب ترتيب العرض التالي
    const [[mx]] = await req.hospitalPool.query(
      `SELECT COALESCE(MAX(SortOrder),0)+1 AS nextSort
       FROM departments WHERE HospitalID=?`,
      [req.hospitalId]
    );
    const nextSort = mx.nextSort || 1;

    // الإدراج — مطابق للقالب الجديد
    const [result] = await req.hospitalPool.query(
      `INSERT INTO departments
       (HospitalID, ParentDepartmentID, Code, NameAr, NameEn, IsActive, SortOrder, CreatedAt, UpdatedAt)
       VALUES (?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        req.hospitalId,
        parentId,
        code,
        nameAr,
        nameEn,
        nextSort
      ]
    );

    res.status(201).json({
      success: true,
      message: 'تم إنشاء القسم بنجاح',
      data: {
        DepartmentID: result.insertId,
        HospitalID: req.hospitalId,
        NameAr: nameAr,
        NameEn: nameEn,
        Code: code,
        ParentDepartmentID: parentId,
        SortOrder: nextSort
      }
    });
  } catch (err) {
    next(err);
  }
});

// تحديث قسم موجود
router.put(
  '/:id',
  requireAuth, resolveHospitalId, attachHospitalPool,
  departmentValidation,
  async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // التحقق من صحة البيانات
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg,
        errors: errors.array()
      });
    }

    const { NameAr, NameEn, ParentDepartmentID, IsActive } = req.body;

    // فحص الصلاحيات
    const isCluster = [1, 4].includes(req.user.RoleID);
    if (!isCluster && Number(req.hospitalId) !== Number(req.user.HospitalID)) {
      return res.status(403).json({ 
        success: false, 
        message: 'غير مصرح لك بالكتابة في هذا المستشفى' 
      });
    }

    const parentId = Number(ParentDepartmentID) > 0 ? Number(ParentDepartmentID) : null;

    // تطبيع الإدخال للتعديل
    const nameAr = (NameAr || '').trim();
    const nameEn = (NameEn || '').trim() || nameAr || 'Unnamed';
    const code = (req.body.Code || '').trim() || slugFromArabic(nameAr).slice(0, 30) || 'dept';

    // دالة بسيطة لتوليد كود/إنجليزي بدون مكتبات
    function slugFromArabic(s='') {
      return s
        .normalize('NFKD')
        .replace(/[\u064B-\u065F]/g, '')        // تشكيل
        .replace(/[^\p{L}\p{N}]+/gu, ' ')       // مسافات
        .trim()
        .replace(/\s+/g, '-')
        .toLowerCase();
    }

    // اختياري: منع تكرار الاسم مع قسم آخر
    if (nameAr) {
      const [[dup]] = await req.hospitalPool.query(
        `SELECT DepartmentID FROM departments
         WHERE HospitalID=? AND NameAr=? AND DepartmentID <> ? AND COALESCE(IsActive,1)=1 LIMIT 1`,
        [req.hospitalId, nameAr, id]
      );
      if (dup) {
        return res.status(409).json({ 
          success: false, 
          message: 'يوجد قسم آخر بنفس الاسم' 
        });
      }
    }

    // تحديث القسم — مطابق للقالب الجديد
    const [result] = await req.hospitalPool.query(
      `UPDATE departments
       SET ParentDepartmentID = ?,
           Code = ?,
           NameAr = ?,
           NameEn = ?,
           IsActive = ?,
           UpdatedAt = CURRENT_TIMESTAMP
       WHERE DepartmentID = ? AND HospitalID = ?`,
      [
        parentId,
        code,
        nameAr,
        nameEn,
        IsActive ? 1 : 0,
        id,
        req.hospitalId
      ]
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: 'القسم غير موجود'
      });
    }

    res.json({
      success: true,
      message: 'تم تحديث القسم بنجاح'
    });
  } catch (err) {
    next(err);
  }
});

// حذف قسم (تعطيل)
router.delete(
  '/:id',
  requireAuth, resolveHospitalId, attachHospitalPool,
  async (req, res, next) => {
  try {
    const { id } = req.params;

    // فحص الصلاحيات
    const isCluster = [1, 4].includes(req.user.RoleID);
    if (!isCluster && Number(req.hospitalId) !== Number(req.user.HospitalID)) {
      return res.status(403).json({ 
        success: false, 
        message: 'غير مصرح لك بالكتابة في هذا المستشفى' 
      });
    }

    // التحقق من وجود القسم
    const [[existing]] = await req.hospitalPool.query(
      'SELECT DepartmentID FROM departments WHERE DepartmentID = ? AND IsActive = 1',
      [id]
    );
    
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'القسم غير موجود'
      });
    }

    // التحقق من عدم وجود أقسام فرعية
    const [children] = await req.hospitalPool.query(
      'SELECT COUNT(*) as count FROM departments WHERE ParentDepartmentID = ? AND COALESCE(IsActive,1) = 1',
      [id]
    );
    
    if (children[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: 'لا يمكن حذف قسم يحتوي على أقسام فرعية'
      });
    }

    // التحقق من عدم وجود مستخدمين مرتبطين
    const [users] = await req.hospitalPool.query(
      'SELECT COUNT(*) as count FROM users WHERE DepartmentID = ? AND IsActive = 1',
      [id]
    );
    
    if (users[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: 'لا يمكن حذف قسم مرتبط بمستخدمين'
      });
    }

    // تعطيل القسم
    await req.hospitalPool.query(
      'UPDATE departments SET IsActive = 0 WHERE DepartmentID = ?',
      [id]
    );

    res.json({
      success: true,
      message: 'تم حذف القسم بنجاح'
    });
  } catch (err) {
    next(err);
  }
});

// الحصول على تفاصيل قسم
router.get(
  '/:id',
  requireAuth, resolveHospitalId, attachHospitalPool,
  async (req, res, next) => {
  try {
    const { id } = req.params;
    const hospitalId = req.hospitalId;
    const pool = req.hospitalPool;

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
         d.DepartmentID, d.HospitalID, d.ParentDepartmentID, d.Code,
         d.NameAr, d.NameEn, d.IsActive, d.SortOrder, d.CreatedAt, d.UpdatedAt,
         ${hasLegacyCols
            ? 'd.DefaultEmail, d.HeadName, d.HeadEmail'
            : 'NULL AS DefaultEmail, NULL AS HeadName, NULL AS HeadEmail'},
         p.NameAr as ParentName
       FROM departments d
       LEFT JOIN departments p ON p.DepartmentID = d.ParentDepartmentID
       WHERE d.DepartmentID = ? AND COALESCE(d.IsActive,1) = 1`;

    const [[department]] = await pool.query(select, [id]);

    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'القسم غير موجود'
      });
    }

    res.json({
      success: true,
      data: department
    });
  } catch (err) {
    next(err);
  }
});

export default router;
