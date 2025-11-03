// routes/logs.js
import express from 'express';
import { pool } from '../config/db.js';

const router = express.Router();

/**
 * GET /api/logs?hospitalId=1&limit=100&offset=0&search=نص
 * يرجّع أحدث السجلات لمستشفى محدد (إلزامي).
 */
router.get('/', async (req, res) => {
  try {
    const { hospitalId, limit = 100, offset = 0, search } = req.query;
    if (!hospitalId) return res.status(400).json({ error: 'hospitalId is required' });

    const params = [hospitalId];
    let where = 'l.HospitalID = ?';
    if (search) {
      where += ' AND (l.ActionAr LIKE ? OR l.Details LIKE ? OR u.FullName LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like, like);
    }

    const sql = `
      SELECT 
        l.LogID, l.HospitalID, l.ActorUserID, l.ActionCode, l.ActionAr, l.Details, l.CreatedAt,
        u.FullName   AS ActorName,
        h.NameAr     AS HospitalNameAr
      FROM logs l
      LEFT JOIN users u     ON u.UserID = l.ActorUserID
      LEFT JOIN hospitals h ON h.HospitalID = l.HospitalID
      WHERE ${where}
      ORDER BY l.CreatedAt DESC
      LIMIT ? OFFSET ?`;

    params.push(Number(limit), Number(offset));

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('GET /logs error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * POST /api/logs
 * body: { HospitalID, ActorUserID, ActionCode, ActionAr, Details }
 * لإضافة سجل جديد من أي حدث في النظام.
 */
router.post('/', async (req, res) => {
  try {
    const { HospitalID, ActorUserID = null, ActionCode, ActionAr = null, Details = null } = req.body;
    if (!HospitalID || !ActionCode) return res.status(400).json({ error: 'HospitalID and ActionCode are required' });

    const [r] = await pool.query(
      `INSERT INTO logs (HospitalID, ActorUserID, ActionCode, ActionAr, Details)
       VALUES (?, ?, ?, ?, ?)`,
      [HospitalID, ActorUserID, ActionCode, ActionAr, Details]
    );
    res.status(201).json({ LogID: r.insertId });
  } catch (err) {
    console.error('POST /logs error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;
