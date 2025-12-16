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
      ProjectCategory VARCHAR(100) NULL COMMENT 'نوع المشروع (القيمة الفعلية)',
      ProjectCategoryOriginal VARCHAR(50) NULL COMMENT 'نوع المشروع الأصلي من القائمة',
      CreatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UpdatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_pressganey_hospital (HospitalID),
      INDEX idx_pressganey_status (Status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  
  // إنشاء جدول SMART checklist
  await pool.query(`
    CREATE TABLE IF NOT EXISTS improvement_pressganey_smart (
      SmartID BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      ProjectID INT UNSIGNED NOT NULL,
      \`Specific\` TINYINT(1) DEFAULT 0 COMMENT 'محدد',
      \`Measurable\` TINYINT(1) DEFAULT 0 COMMENT 'قابل للقياس',
      \`Achievable\` TINYINT(1) DEFAULT 0 COMMENT 'قابل للتحقق',
      \`Realistic\` TINYINT(1) DEFAULT 0 COMMENT 'واقعي',
      \`TimeBound\` TINYINT(1) DEFAULT 0 COMMENT 'بزمن محدد',
      CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_pg_smart_project (ProjectID),
      CONSTRAINT fk_pg_smart_project
        FOREIGN KEY (ProjectID)
        REFERENCES improvement_pressganey_projects(ProjectID)
        ON DELETE CASCADE
    ) ENGINE=InnoDB
      DEFAULT CHARSET=utf8mb4
      COLLATE=utf8mb4_unicode_ci
      COMMENT='جدول معايير SMART لمشاريع PressGaney';
  `);
  
  // إضافة الحقول إذا لم تكن موجودة (للجداول الموجودة)
  // MySQL لا يدعم IF NOT EXISTS مع ADD COLUMN، لذا نتحقق يدوياً
  try {
    const [columns] = await pool.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'improvement_pressganey_projects'
        AND COLUMN_NAME IN ('ProjectCategory', 'ProjectCategoryOriginal', 'ProgressNotes', 'ProgressPercent')
    `);
    
    const existingColumns = columns.map(c => c.COLUMN_NAME);
    
    // إضافة الحقول المفقودة فقط
    const alterStatements = [];
    
    if (!existingColumns.includes('ProjectCategory')) {
      alterStatements.push('ADD COLUMN ProjectCategory VARCHAR(100) NULL COMMENT \'نوع المشروع (القيمة الفعلية)\'');
    }
    
    if (!existingColumns.includes('ProjectCategoryOriginal')) {
      alterStatements.push('ADD COLUMN ProjectCategoryOriginal VARCHAR(50) NULL COMMENT \'نوع المشروع الأصلي من القائمة\'');
    }
    
    if (!existingColumns.includes('ProgressNotes')) {
      alterStatements.push('ADD COLUMN ProgressNotes TEXT NULL COMMENT \'ملاحظات التقدم\'');
    }
    
    if (!existingColumns.includes('ProgressPercent')) {
      alterStatements.push('ADD COLUMN ProgressPercent DECIMAL(5,2) NULL COMMENT \'نسبة التقدم\'');
    }
    
    if (alterStatements.length > 0) {
      await pool.query(`
        ALTER TABLE improvement_pressganey_projects
        ${alterStatements.join(',\n        ')}
      `);
      console.log(`✅ Added ${alterStatements.length} column(s) to improvement_pressganey_projects`);
    }
  } catch (err) {
    console.warn('Warning adding columns to improvement_pressganey_projects:', err.message);
  }
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
        dueDate,
        projectCategory,
        projectCategoryOriginal,
        smartChecklist
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
           ProposedSolution, Priority, ProjectOwner, Status, StartDate, DueDate,
           ProjectCategory, ProjectCategoryOriginal)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        dueDate || null,
        projectCategory || null,
        projectCategoryOriginal || null
      ];

      const [result] = await pool.query(sql, params);
      const projectId = result.insertId;

      // حفظ معايير SMART إذا كانت موجودة
      if (smartChecklist && typeof smartChecklist === 'object') {
        try {
          await pool.query(`
            INSERT INTO improvement_pressganey_smart
              (ProjectID, \`Specific\`, \`Measurable\`, \`Achievable\`, \`Realistic\`, \`TimeBound\`)
            VALUES (?, ?, ?, ?, ?, ?)
          `, [
            projectId,
            smartChecklist.specific ? 1 : 0,
            smartChecklist.measurable ? 1 : 0,
            smartChecklist.achievable ? 1 : 0,
            smartChecklist.realistic ? 1 : 0,
            smartChecklist.timeBound ? 1 : 0
          ]);
        } catch (smartErr) {
          console.warn('Warning: Failed to save SMART checklist:', smartErr.message);
          // لا نوقف العملية إذا فشل حفظ SMART
        }
      }

      res.json({ success: true, projectId: projectId, message: 'تم إنشاء مشروع PressGaney بنجاح' });
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
        dueDate,
        projectCategory,
        projectCategoryOriginal,
        smartChecklist
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
          ProjectCategory = ?,
          ProjectCategoryOriginal = ?,
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
        projectCategory || null,
        projectCategoryOriginal || null,
        projectId,
        hospitalId
      ];

      const [result] = await pool.query(sql, params);
      if (!result.affectedRows) {
        return res.status(404).json({ success: false, message: 'المشروع غير موجود' });
      }

      // تحديث معايير SMART إذا كانت موجودة
      if (smartChecklist && typeof smartChecklist === 'object') {
        try {
          // التحقق من وجود سجل SMART موجود
          const [existingSmart] = await pool.query(
            'SELECT SmartID FROM improvement_pressganey_smart WHERE ProjectID = ?',
            [projectId]
          );

          if (existingSmart.length > 0) {
            // تحديث السجل الموجود
            await pool.query(`
              UPDATE improvement_pressganey_smart SET
                \`Specific\` = ?,
                \`Measurable\` = ?,
                \`Achievable\` = ?,
                \`Realistic\` = ?,
                \`TimeBound\` = ?,
                UpdatedAt = CURRENT_TIMESTAMP
              WHERE ProjectID = ?
            `, [
              smartChecklist.specific ? 1 : 0,
              smartChecklist.measurable ? 1 : 0,
              smartChecklist.achievable ? 1 : 0,
              smartChecklist.realistic ? 1 : 0,
              smartChecklist.timeBound ? 1 : 0,
              projectId
            ]);
          } else {
            // إنشاء سجل جديد
            await pool.query(`
              INSERT INTO improvement_pressganey_smart
                (ProjectID, \`Specific\`, \`Measurable\`, \`Achievable\`, \`Realistic\`, \`TimeBound\`)
              VALUES (?, ?, ?, ?, ?, ?)
            `, [
              projectId,
              smartChecklist.specific ? 1 : 0,
              smartChecklist.measurable ? 1 : 0,
              smartChecklist.achievable ? 1 : 0,
              smartChecklist.realistic ? 1 : 0,
              smartChecklist.timeBound ? 1 : 0
            ]);
          }
        } catch (smartErr) {
          console.warn('Warning: Failed to update SMART checklist:', smartErr.message);
          // لا نوقف العملية إذا فشل تحديث SMART
        }
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

      const project = rows[0];

      // جلب معايير SMART إذا كانت موجودة
      try {
        const [smartRows] = await pool.query(
          `SELECT \`Specific\`, \`Measurable\`, \`Achievable\`, \`Realistic\`, \`TimeBound\` 
           FROM improvement_pressganey_smart WHERE ProjectID = ?`,
          [projectId]
        );
        
        if (smartRows.length > 0) {
          project.smartChecklist = {
            specific: smartRows[0].Specific === 1,
            measurable: smartRows[0].Measurable === 1,
            achievable: smartRows[0].Achievable === 1,
            realistic: smartRows[0].Realistic === 1,
            timeBound: smartRows[0].TimeBound === 1
          };
        }
      } catch (smartErr) {
        console.warn('Warning: Failed to load SMART checklist:', smartErr.message);
        // لا نوقف العملية إذا فشل تحميل SMART
      }

      res.json({ success: true, data: project });
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

/**
 * إضافة تقدم لمشروع PressGaney
 * POST /api/improvements/pressganey/:id/progress
 */
router.post(
  '/pressganey/:id/progress',
  requireAuth,
  requirePermission('IMPROVEMENT_EDIT'),
  resolveHospitalId,
  attachHospitalPool,
  async (req, res, next) => {
    try {
      // التأكد من وجود الجدول والحقول
      await ensurePressGaneyTable(req.hospitalPool);
      
      const pool = req.hospitalPool;
      const hospitalId = req.hospitalId;
      const projectId = Number(req.params.id);
      const userId = req.user?.UserID;

      if (!hospitalId) {
        return res.status(400).json({ success: false, message: 'لم يتم تحديد المستشفى' });
      }

      const { note, progressPercent, newStatus } = req.body || {};

      if (!note || !note.trim()) {
        return res.status(400).json({
          success: false,
          message: 'وصف التقدم مطلوب'
        });
      }

      // جلب المشروع الحالي
      const [projectRows] = await pool.query(`
        SELECT Status, ProgressNotes
        FROM improvement_pressganey_projects
        WHERE ProjectID = ? AND HospitalID = ?
      `, [projectId, hospitalId]);

      if (projectRows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'المشروع غير موجود'
        });
      }

      const oldProject = projectRows[0];
      const oldStatus = oldProject.Status;
      const oldProgressNotes = oldProject.ProgressNotes || '';

      // بناء ملاحظة التقدم الجديدة مع التاريخ
      const now = new Date();
      const dateStr = now.toLocaleDateString('ar-SA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      const newNote = `\n[${dateStr}] ${note.trim()}`;
      const updatedProgressNotes = oldProgressNotes + newNote;

      // تحديث المشروع
      const updateFields = [];
      const updateValues = [];

      // تحديث ProgressNotes
      updateFields.push('ProgressNotes = ?');
      updateValues.push(updatedProgressNotes);

      if (newStatus && newStatus !== oldStatus) {
        updateFields.push('Status = ?');
        updateValues.push(newStatus);
      }

      if (progressPercent != null) {
        updateFields.push('ProgressPercent = ?');
        updateValues.push(Number(progressPercent));
      }

      updateFields.push('UpdatedAt = CURRENT_TIMESTAMP');
      updateValues.push(projectId, hospitalId);

      const [result] = await pool.query(`
        UPDATE improvement_pressganey_projects
        SET ${updateFields.join(', ')}
        WHERE ProjectID = ? AND HospitalID = ?
      `, updateValues);

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: 'فشل في تحديث المشروع'
        });
      }

      res.json({
        success: true,
        message: 'تم حفظ التقدم بنجاح'
      });
    } catch (err) {
      console.error('POST /api/improvements/pressganey/:id/progress error:', err);
      next(err);
    }
  }
);

export default router;
