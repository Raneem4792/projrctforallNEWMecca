// routes/hospitals.js
import express from 'express';
import { getCentralPool } from '../db/centralPool.js';

const router = express.Router();

// GET: جلب قائمة المستشفيات
router.get('/', async (req, res) => {
  try {
    const { active } = req.query;
    const pool = await getCentralPool();
    
    let query = `
      SELECT 
        HospitalID, 
        NameAr, 
        NameEn, 
        Code,
        CityAr, 
        CityEn,
        RegionAr, 
        RegionEn,
        IFNULL(IsActive, Active) AS IsActive, 
        SortOrder,
        CreatedAt
      FROM hospitals
    `;
    
    const params = [];
    
    // فلترة المستشفيات المفعّلة فقط
    if (active === '1') {
      query += ' WHERE IFNULL(IsActive, Active) = 1';
    }
    
    query += ' ORDER BY COALESCE(SortOrder, 9999), HospitalID';
    
    const [rows] = await pool.query(query, params);
    
    // منع الكاش وإرجاع Array صريحة
    res.set('Cache-Control', 'no-store');
    return res.status(200).json(rows || []);
  } catch (error) {
    console.error('خطأ في جلب المستشفيات:', error);
    res.set('Cache-Control', 'no-store');
    return res.status(500).json({ error: 'Failed to load hospitals' });
  }
});

// GET: جلب مستشفى واحد
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getCentralPool();
    const [rows] = await pool.query(`
      SELECT 
        HospitalID, 
        NameAr, 
        NameEn, 
        Code,
        CityAr, 
        CityEn,
        RegionAr, 
        RegionEn,
        IsActive, 
        SortOrder,
        CreatedAt
      FROM hospitals 
      WHERE HospitalID = ?
    `, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'المستشفى غير موجود' 
      });
    }
    
    res.json({
      success: true,
      data: rows[0]
    });
  } catch (error) {
    console.error('خطأ في جلب المستشفى:', error);
    res.status(500).json({ 
      error: 'حدث خطأ في جلب المستشفى',
      details: error.message 
    });
  }
});

// POST: إضافة مستشفى جديد
router.post('/', async (req, res) => {
  try {
    const { 
      NameAr, 
      NameEn, 
      Code, 
      CityAr, 
      CityEn, 
      RegionAr, 
      RegionEn, 
      IsActive = 1, 
      SortOrder = 100 
    } = req.body;
    
    // التحقق من البيانات المطلوبة
    if (!NameAr || !NameEn || !Code) {
      return res.status(400).json({ 
        success: false,
        message: 'البيانات المطلوبة: الاسم بالعربية، الاسم بالإنجليزية، والكود' 
      });
    }
    
    const pool = await getCentralPool();
    
    // التحقق من عدم تكرار الكود
    const [existing] = await pool.query(
      'SELECT HospitalID FROM hospitals WHERE Code = ?', 
      [Code]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({ 
        success: false,
        message: 'كود المستشفى موجود مسبقاً' 
      });
    }
    
    const [result] = await pool.query(`
      INSERT INTO hospitals 
      (NameAr, NameEn, Code, CityAr, CityEn, RegionAr, RegionEn, IsActive, SortOrder)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [NameAr, NameEn, Code, CityAr, CityEn, RegionAr, RegionEn, IsActive, SortOrder]);
    
    res.status(201).json({ 
      success: true,
      data: { HospitalID: result.insertId },
      message: 'تم إضافة المستشفى بنجاح'
    });
  } catch (error) {
    console.error('خطأ في إضافة المستشفى:', error);
    res.status(500).json({ 
      success: false,
      message: 'حدث خطأ في إضافة المستشفى',
      details: error.message 
    });
  }
});

// PUT: تحديث مستشفى موجود
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      NameAr, 
      NameEn, 
      Code, 
      CityAr, 
      CityEn, 
      RegionAr, 
      RegionEn, 
      IsActive, 
      SortOrder 
    } = req.body;
    
    const pool = await getCentralPool();
    
    // التحقق من وجود المستشفى
    const [existing] = await pool.query(
      'SELECT HospitalID FROM hospitals WHERE HospitalID = ?', 
      [id]
    );
    
    if (existing.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'المستشفى غير موجود' 
      });
    }
    
    // التحقق من عدم تكرار الكود (إذا تم تغييره)
    if (Code) {
      const [duplicate] = await pool.query(
        'SELECT HospitalID FROM hospitals WHERE Code = ? AND HospitalID != ?', 
        [Code, id]
      );
      
      if (duplicate.length > 0) {
        return res.status(400).json({ 
          success: false,
          message: 'كود المستشفى موجود مسبقاً' 
        });
      }
    }
    
    await pool.query(`
      UPDATE hospitals 
      SET NameAr = ?, NameEn = ?, Code = ?, CityAr = ?, CityEn = ?, 
          RegionAr = ?, RegionEn = ?, IsActive = ?, SortOrder = ?
      WHERE HospitalID = ?
    `, [NameAr, NameEn, Code, CityAr, CityEn, RegionAr, RegionEn, IsActive, SortOrder, id]);
    
    res.json({ 
      success: true,
      message: 'تم تحديث المستشفى بنجاح'
    });
  } catch (error) {
    console.error('خطأ في تحديث المستشفى:', error);
    res.status(500).json({ 
      success: false,
      message: 'حدث خطأ في تحديث المستشفى',
      details: error.message 
    });
  }
});

// DELETE: حذف مستشفى
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getCentralPool();
    
    // التحقق من وجود المستشفى
    const [existing] = await pool.query(
      'SELECT HospitalID FROM hospitals WHERE HospitalID = ?', 
      [id]
    );
    
    if (existing.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'المستشفى غير موجود' 
      });
    }
    
    // التحقق من عدم وجود شكاوى مرتبطة بالمستشفى
    const [complaints] = await pool.query(
      'SELECT COUNT(*) as count FROM complaints WHERE HospitalID = ?', 
      [id]
    );
    
    if (complaints[0].count > 0) {
      return res.status(400).json({ 
        success: false,
        message: 'لا يمكن حذف المستشفى لوجود شكاوى مرتبطة به' 
      });
    }
    
    await pool.query('DELETE FROM hospitals WHERE HospitalID = ?', [id]);
    
    res.json({ 
      success: true,
      message: 'تم حذف المستشفى بنجاح'
    });
  } catch (error) {
    console.error('خطأ في حذف المستشفى:', error);
    res.status(500).json({ 
      success: false,
      message: 'حدث خطأ في حذف المستشفى',
      details: error.message 
    });
  }
});

export default router;
