// routes/central.routes.js
import express from 'express';
import { getCentralPool } from '../db/centralPool.js';

const router = express.Router();

/**
 * GET /api/central/hospitals
 * الحصول على قائمة المستشفيات من القاعدة المركزية
 * Query: active=1 (اختياري) - للمستشفيات النشطة فقط
 */
router.get('/central/hospitals', async (req, res) => {
  try {
    const pool = await getCentralPool();
    if (!pool) {
      return res.status(500).json({ error: 'Central database connection failed' });
    }

    const { active } = req.query;
    let whereClause = '';
    let params = [];

    if (active === '1') {
      whereClause = 'WHERE IsActive = 1';
    }

    const sql = `
      SELECT 
        HospitalID,
        NameAr,
        NameEn,
        Code,
        SortOrder,
        IsActive,
        CreatedAt
      FROM hospitals
      ${whereClause}
      ORDER BY SortOrder ASC, NameAr ASC
    `;

    const [rows] = await pool.query(sql, params);
    
    console.log(`✅ [central-hospitals] تم جلب ${rows.length} مستشفى`);
    
    return res.json(rows);
  } catch (err) {
    console.error('GET /api/central/hospitals error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/central/hospitals/:id
 * الحصول على مستشفى واحد بالمعرف
 */
router.get('/central/hospitals/:id', async (req, res) => {
  try {
    const hospitalId = req.params.id;
    const pool = await getCentralPool();
    
    if (!pool) {
      return res.status(500).json({ error: 'Central database connection failed' });
    }

    const sql = `
      SELECT 
        HospitalID,
        NameAr,
        NameEn,
        Code,
        SortOrder,
        IsActive,
        CreatedAt
      FROM hospitals
      WHERE HospitalID = ?
    `;

    const [rows] = await pool.query(sql, [hospitalId]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Hospital not found' });
    }

    return res.json(rows[0]);
  } catch (err) {
    console.error('GET /api/central/hospitals/:id error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;
