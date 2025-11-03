// backend/routes/meta.js
import express from 'express';
import { pool } from '../config/db.js';

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
    const [rows] = await pool.query(
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

export default router;

