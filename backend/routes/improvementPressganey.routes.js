import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissionGuard.js';
import { resolveHospitalId } from '../middleware/resolveHospitalId.js';
import { attachHospitalPool } from '../middleware/hospitalPool.js';

const router = express.Router();

async function ensurePressGaneyTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS improvement_pressganey_projects (
      ProjectID INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      HospitalID INT UNSIGNED NOT NULL,
      ZoneID INT UNSIGNED NULL,
      TripID INT UNSIGNED NULL,
      SurveyQuestion TEXT NULL,
      Q1_Percentage DECIMAL(5,2) NULL,
      Q2_Percentage DECIMAL(5,2) NULL,
      Q3_Percentage DECIMAL(5,2) NULL,
      Q4_Percentage DECIMAL(5,2) NULL,
      MeasurementPeriod VARCHAR(255) NULL,
      ProjectTitle VARCHAR(255) NOT NULL,
      ProblemStatement TEXT NULL,
      AimStatement TEXT NULL,
      ProposedSolution TEXT NULL,
      Priority VARCHAR(32) NOT NULL DEFAULT 'MEDIUM',
      ProjectOwner VARCHAR(255) NULL,
      Status VARCHAR(32) NOT NULL DEFAULT 'PROPOSED',
      StartDate DATE NULL,
      DueDate DATE NULL,
      CreatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UpdatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_pressganey_hospital (HospitalID),
      INDEX idx_pressganey_status (Status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

function parsePercent(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
}

router.use(
  '/pressganey',
  requireAuth,
  requirePermission('IMPROVEMENTS_MODULE'),
  resolveHospitalId,
  attachHospitalPool,
  async (req, res, next) => {
    try {
      await ensurePressGaneyTable(req.hospitalPool);
      next();
    } catch (err) {
      console.error('ensurePressGaneyTable error:', err);
      res.status(500).json({ success: false, message: 'تعذر تجهيز جدول PressGaney', details: err.message });
    }
  }
);

router.post(
  '/pressganey',
  requirePermission('IMPROVEMENT_CREATE'),
  async (req, res, next) => {
    try {
      const pool = req.hospitalPool;
      const hospitalId = req.hospitalId;
      if (!hospitalId) {
        return res.status(400).json({ success: false, message: 'لم يتم تحديد المستشفى' });
      }

      const {
        zoneId,
        tripId,
        surveyQuestion,
        q1Percentage,
        q2Percentage,
        q3Percentage,
        q4Percentage,
        measurementPeriod,
        title,
        projectTitle,
        problemStatement,
        aimStatement,
        proposedSolution,
        priority,
        projectOwner,
        status,
        startDate,
        dueDate
      } = req.body || {};

      const finalTitle = projectTitle || title;
      if (!finalTitle) {
        return res.status(400).json({ success: false, message: 'حقل عنوان المشروع مطلوب' });
      }

      const sql = `
        INSERT INTO improvement_pressganey_projects
          (HospitalID, ZoneID, TripID, SurveyQuestion,
           Q1_Percentage, Q2_Percentage, Q3_Percentage, Q4_Percentage,
           MeasurementPeriod, ProjectTitle, ProblemStatement, AimStatement,
           ProposedSolution, Priority, ProjectOwner, Status, StartDate, DueDate)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const params = [
        hospitalId,
        zoneId ? Number(zoneId) : null,
        tripId ? Number(tripId) : null,
        surveyQuestion || null,
        parsePercent(q1Percentage),
        parsePercent(q2Percentage),
        parsePercent(q3Percentage),
        parsePercent(q4Percentage),
        measurementPeriod || null,
        finalTitle,
        problemStatement || null,
        aimStatement || null,
        proposedSolution || null,
        (priority || 'MEDIUM').toUpperCase(),
        projectOwner || null,
        status || 'PROPOSED',
        startDate || null,
        dueDate || null
      ];

      const [result] = await pool.query(sql, params);
      res.json({ success: true, projectId: result.insertId, message: 'تم إنشاء مشروع PressGaney بنجاح' });
    } catch (err) {
      console.error('POST /api/improvements/pressganey error:', err);
      next(err);
    }
  }
);

router.put(
  '/pressganey/:id',
  requirePermission('IMPROVEMENT_EDIT'),
  async (req, res, next) => {
    try {
      const pool = req.hospitalPool;
      const hospitalId = req.hospitalId;
      const projectId = Number(req.params.id);
      if (!hospitalId) {
        return res.status(400).json({ success: false, message: 'لم يتم تحديد المستشفى' });
      }
      if (!projectId) {
        return res.status(400).json({ success: false, message: 'رقم المشروع غير صالح' });
      }

      const {
        zoneId,
        tripId,
        surveyQuestion,
        q1Percentage,
        q2Percentage,
        q3Percentage,
        q4Percentage,
        measurementPeriod,
        title,
        projectTitle,
        problemStatement,
        aimStatement,
        proposedSolution,
        priority,
        projectOwner,
        status,
        startDate,
        dueDate
      } = req.body || {};

      const sql = `
        UPDATE improvement_pressganey_projects SET
          ZoneID = ?,
          TripID = ?,
          SurveyQuestion = ?,
          Q1_Percentage = ?,
          Q2_Percentage = ?,
          Q3_Percentage = ?,
          Q4_Percentage = ?,
          MeasurementPeriod = ?,
          ProjectTitle = COALESCE(?, ProjectTitle),
          ProblemStatement = ?,
          AimStatement = ?,
          ProposedSolution = ?,
          Priority = ?,
          ProjectOwner = ?,
          Status = ?,
          StartDate = ?,
          DueDate = ?,
          UpdatedAt = CURRENT_TIMESTAMP
        WHERE ProjectID = ? AND HospitalID = ?
      `;

      const params = [
        zoneId ? Number(zoneId) : null,
        tripId ? Number(tripId) : null,
        surveyQuestion || null,
        parsePercent(q1Percentage),
        parsePercent(q2Percentage),
        parsePercent(q3Percentage),
        parsePercent(q4Percentage),
        measurementPeriod || null,
        projectTitle || title || null,
        problemStatement || null,
        aimStatement || null,
        proposedSolution || null,
        (priority || 'MEDIUM').toUpperCase(),
        projectOwner || null,
        status || 'PROPOSED',
        startDate || null,
        dueDate || null,
        projectId,
        hospitalId
      ];

      const [result] = await pool.query(sql, params);
      if (!result.affectedRows) {
        return res.status(404).json({ success: false, message: 'المشروع غير موجود' });
      }

      res.json({ success: true, message: 'تم تحديث المشروع بنجاح' });
    } catch (err) {
      console.error('PUT /api/improvements/pressganey/:id error:', err);
      next(err);
    }
  }
);

router.get(
  '/pressganey',
  requirePermission('IMPROVEMENT_VIEW'),
  async (req, res, next) => {
    try {
      const pool = req.hospitalPool;
      const hospitalId = req.hospitalId;
      if (!hospitalId) {
        return res.status(400).json({ success: false, message: 'لم يتم تحديد المستشفى' });
      }

      const statusFilter = req.query?.status;
      const sql = `
        SELECT *
        FROM improvement_pressganey_projects
        WHERE HospitalID = ?
        ${statusFilter ? 'AND Status = ?' : ''}
        ORDER BY UpdatedAt DESC
      `;
      const params = statusFilter ? [hospitalId, statusFilter] : [hospitalId];

      const [rows] = await pool.query(sql, params);
      res.json({ success: true, data: rows });
    } catch (err) {
      console.error('GET /api/improvements/pressganey error:', err);
      next(err);
    }
  }
);

router.get(
  '/pressganey/:id',
  requirePermission('IMPROVEMENT_VIEW'),
  async (req, res, next) => {
    try {
      const pool = req.hospitalPool;
      const hospitalId = req.hospitalId;
      const projectId = Number(req.params.id);
      if (!hospitalId) {
        return res.status(400).json({ success: false, message: 'لم يتم تحديد المستشفى' });
      }

      const [rows] = await pool.query(
        `SELECT * FROM improvement_pressganey_projects WHERE ProjectID = ? AND HospitalID = ?`,
        [projectId, hospitalId]
      );

      if (!rows.length) {
        return res.status(404).json({ success: false, message: 'المشروع غير موجود' });
      }

      res.json({ success: true, data: rows[0] });
    } catch (err) {
      console.error('GET /api/improvements/pressganey/:id error:', err);
      next(err);
    }
  }
);

router.delete(
  '/pressganey/:id',
  requirePermission('IMPROVEMENT_DELETE'),
  async (req, res, next) => {
    try {
      const pool = req.hospitalPool;
      const hospitalId = req.hospitalId;
      const projectId = Number(req.params.id);
      if (!hospitalId) {
        return res.status(400).json({ success: false, message: 'لم يتم تحديد المستشفى' });
      }

      const [result] = await pool.query(
        `DELETE FROM improvement_pressganey_projects WHERE ProjectID = ? AND HospitalID = ?`,
        [projectId, hospitalId]
      );

      if (!result.affectedRows) {
        return res.status(404).json({ success: false, message: 'المشروع غير موجود' });
      }

      res.json({ success: true, message: 'تم حذف المشروع بنجاح' });
    } catch (err) {
      console.error('DELETE /api/improvements/pressganey/:id error:', err);
      next(err);
    }
  }
);

export default router;
