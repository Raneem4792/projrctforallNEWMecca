// routes/projects.routes.js
import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { resolveHospitalId } from '../middleware/resolveHospitalId.js';
import { attachHospitalPool } from '../middleware/hospitalPool.js';

const router = express.Router();

router.post('/', requireAuth, resolveHospitalId, attachHospitalPool, async (req, res) => {
  try {
    const pool = req.hospitalPool;
    const { Title, Description, DepartmentID, Priority } = req.body;
    const HospitalID = req.hospitalId;

    if (!Title || !Description || !DepartmentID) {
      return res.status(400).json({ error: 'Title, Description, DepartmentID مطلوبة' });
    }

    // احصل على TypeID لنوع "IMPROVEMENT_PROJECT"
    const [t] = await pool.query(
      'SELECT ComplaintTypeID FROM complaint_types WHERE TypeCode = ? LIMIT 1',
      ['IMPROVEMENT_PROJECT']
    );
    if (!t.length) {
      return res.status(400).json({ error: 'نوع IMPROVEMENT_PROJECT غير موجود. أضفه في complaint_types.' });
    }
    const typeId = t[0].ComplaintTypeID;

    const [ins] = await pool.query(`
      INSERT INTO complaints
      (HospitalID, DepartmentID, ComplaintTypeID, Title, Description, Priority, Status, CreatedByUserID)
      VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?)
    `, [HospitalID, DepartmentID, typeId, Title, Description, (Priority || 'MEDIUM'), req.user.UserID]);

    res.status(201).json({ ProjectComplaintID: ins.insertId });
  } catch (err) {
    console.error('POST /api/projects error:', err);
    res.status(500).json({ error: 'Failed to create improvement project' });
  }
});

export default router;
