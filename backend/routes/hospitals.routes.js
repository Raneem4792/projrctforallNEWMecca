// routes/hospitals.routes.js (ESM)
import express from 'express';
import { getCentralPool } from '../db/centralPool.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// GET /api/hospitals  → يرجّع المستشفيات الفعّالة من المركزي
router.get('/', async (req, res) => {
  try {
    const central = await getCentralPool();
    const [rows] = await central.query(
      `SELECT HospitalID, NameAr, Code 
         FROM hospitals 
        WHERE IsActive = 1 
        ORDER BY NameAr`
    );
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;