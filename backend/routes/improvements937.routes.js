import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissionGuard.js';
import { resolveHospitalId } from '../middleware/resolveHospitalId.js';
import { attachHospitalPool } from '../middleware/hospitalPool.js';

const router = express.Router();

/**
 * دالة مساعدة لجلب مشروع 937 والتأكد من تبعيته للمستشفى
 */
async function fetchProject(pool, hospitalId, projectId) {
  const [rows] = await pool.query(
    `
      SELECT p.*, d.NameAr AS DepartmentName
      FROM improvement_projects_937 p
      LEFT JOIN departments d
        ON d.DepartmentID = p.DepartmentID
       AND d.HospitalID = p.HospitalID
      WHERE p.Project937ID = ? AND p.HospitalID = ? AND IFNULL(p.IsDeleted,0) = 0
      LIMIT 1
    `,
    [projectId, hospitalId]
  );
  return rows.length ? rows[0] : null;
}

/**
 * جلب قائمة مشاريع 937
 */
router.get(
  '/',
  requireAuth,
  requirePermission('IMPROVEMENTS_MODULE'),
  requirePermission('IMPROVEMENT_VIEW'),
  resolveHospitalId,
  attachHospitalPool,
  async (req, res, next) => {
    try {
      const pool = req.hospitalPool;
      const hid = req.hospitalId;
      const { status } = req.query;

      const args = [hid];
      let sql = `
        SELECT 
          p.*,
          d.NameAr AS DepartmentName
        FROM improvement_projects_937 p
        LEFT JOIN departments d
          ON d.DepartmentID = p.DepartmentID
         AND d.HospitalID = p.HospitalID
        WHERE p.HospitalID = ?
          AND IFNULL(p.IsDeleted,0) = 0
      `;

      if (status) {
        sql += ' AND p.StatusCode = ?';
        args.push(status);
      }

      sql += ' ORDER BY p.CreatedAt DESC LIMIT 500';

      const [rows] = await pool.query(sql, args);
      res.json({ ok: true, items: rows || [] });
    } catch (err) {
      console.error('GET /api/improvements/937 error:', err);
      next(err);
    }
  }
);

/**
 * جلب مشروع واحد
 */
router.get(
  '/:id',
  requireAuth,
  requirePermission('IMPROVEMENT_VIEW'),
  resolveHospitalId,
  attachHospitalPool,
  async (req, res, next) => {
    try {
      const pool = req.hospitalPool;
      const hid = req.hospitalId;
      const projectId = Number(req.params.id);

      const project = await fetchProject(pool, hid, projectId);
      if (!project) {
        return res.status(404).json({ ok: false, message: 'المشروع غير موجود' });
      }

      res.json({ ok: true, project });
    } catch (err) {
      console.error('GET /api/improvements/937/:id error:', err);
      next(err);
    }
  }
);

/**
 * اعتماد مشروع 937 (من مدير الجودة)
 */
router.post(
  '/:id/approve',
  requireAuth,
  requirePermission('IMPROVEMENT_APPROVE'),
  resolveHospitalId,
  attachHospitalPool,
  async (req, res, next) => {
    try {
      const pool = req.hospitalPool;
      const hid = req.hospitalId;
      const projectId = Number(req.params.id);
      const userId = req.user?.UserID || null;

      const project = await fetchProject(pool, hid, projectId);
      if (!project) {
        return res.status(404).json({ ok: false, message: 'المشروع غير موجود' });
      }

      if (project.StatusCode !== 'UNDER_APPROVAL') {
        return res.status(400).json({
          ok: false,
          message: 'لا يمكن اعتماد المشروع في حالته الحالية'
        });
      }

      await pool.query(
        `
          UPDATE improvement_projects_937
          SET StatusCode = 'APPROVED',
              ApprovedByUserID = ?,
              ApprovedAt = NOW()
          WHERE Project937ID = ? AND HospitalID = ?
        `,
        [userId, projectId, hid]
      );

      res.json({ ok: true, message: 'تم اعتماد المشروع بنجاح' });
    } catch (err) {
      console.error('POST /api/improvements/937/:id/approve error:', err);
      next(err);
    }
  }
);

/**
 * إضافة رد التنفيذ (من فريق المشروع)
 */
router.post(
  '/:id/implementation',
  requireAuth,
  requirePermission('IMPROVEMENT_EDIT'),
  resolveHospitalId,
  attachHospitalPool,
  async (req, res, next) => {
    try {
      const pool = req.hospitalPool;
      const hid = req.hospitalId;
      const projectId = Number(req.params.id);
      const userId = req.user?.UserID || null;
      const { responseText, filesCount = 0 } = req.body || {};

      const project = await fetchProject(pool, hid, projectId);
      if (!project) {
        return res.status(404).json({ ok: false, message: 'المشروع غير موجود' });
      }

      if (project.StatusCode !== 'APPROVED' && project.StatusCode !== 'IN_PROGRESS') {
        return res.status(400).json({
          ok: false,
          message: 'يمكن إرسال الرد بعد اعتماد المشروع فقط'
        });
      }

      await pool.query(
        `
          UPDATE improvement_projects_937
          SET StatusCode = 'IN_PROGRESS',
              ImplementationResponse = ?,
              ImplementationFilesCount = ?,
              ImplementationByUserID = ?,
              ImplementationDate = NOW()
          WHERE Project937ID = ? AND HospitalID = ?
        `,
        [responseText || null, Number(filesCount) || 0, userId, projectId, hid]
      );

      res.json({ ok: true, message: 'تم حفظ رد التنفيذ' });
    } catch (err) {
      console.error('POST /api/improvements/937/:id/implementation error:', err);
      next(err);
    }
  }
);

/**
 * قرار المدير على رد التنفيذ (اعتماد / رفض)
 */
router.post(
  '/:id/implementation/decision',
  requireAuth,
  requirePermission('IMPROVEMENT_APPROVE'),
  resolveHospitalId,
  attachHospitalPool,
  async (req, res, next) => {
    try {
      const pool = req.hospitalPool;
      const hid = req.hospitalId;
      const projectId = Number(req.params.id);
      const userId = req.user?.UserID || null;
      const { decision } = req.body || {};

      const project = await fetchProject(pool, hid, projectId);
      if (!project) {
        return res.status(404).json({ ok: false, message: 'المشروع غير موجود' });
      }

      if (project.StatusCode !== 'IN_PROGRESS') {
        return res.status(400).json({
          ok: false,
          message: 'يجب أن يكون المشروع في مرحلة التنفيذ قبل اتخاذ القرار'
        });
      }

      if (!['APPROVED', 'REJECTED'].includes(String(decision || '').toUpperCase())) {
        return res.status(400).json({
          ok: false,
          message: 'قيمة القرار غير صالحة'
        });
      }

      const finalStatus = decision.toUpperCase() === 'APPROVED' ? 'COMPLETED' : 'REJECTED';

      await pool.query(
        `
          UPDATE improvement_projects_937
          SET StatusCode = ?,
              ImplementationApprovalStatus = ?,
              ImplementationApprovalByUserID = ?,
              ImplementationApprovalAt = NOW()
          WHERE Project937ID = ? AND HospitalID = ?
        `,
        [finalStatus, decision.toUpperCase(), userId, projectId, hid]
      );

      res.json({ ok: true, message: 'تم تحديث حالة المشروع' });
    } catch (err) {
      console.error('POST /api/improvements/937/:id/implementation/decision error:', err);
      next(err);
    }
  }
);

/**
 * تحديث مشروع 937
 * PUT /api/improvements/937/:id
 */
router.put(
  '/:id',
  requireAuth,
  requirePermission('IMPROVEMENT_EDIT'),
  resolveHospitalId,
  attachHospitalPool,
  async (req, res, next) => {
    try {
      const pool = req.hospitalPool;
      const hid = req.hospitalId;
      const projectId = Number(req.params.id);
      const userId = req.user?.UserID || null;

      const project = await fetchProject(pool, hid, projectId);
      if (!project) {
        return res.status(404).json({ ok: false, message: 'المشروع غير موجود' });
      }

      const {
        ProjectName,
        ProjectCategory,
        ProjectCategoryOriginal,
        DepartmentID,
        MainTypeID,
        SubTypeID,
        ImpactReason,
        ProjectDescription,
        AimStatement,
        PriorityCode,
        StatusCode,
        StartDate,
        DueDate,
        SmartSpecific,
        SmartMeasurable,
        SmartAchievable,
        SmartRealistic,
        SmartTimeBound
      } = req.body || {};

      // بناء استعلام UPDATE ديناميكي
      const updates = [];
      const values = [];

      if (ProjectName !== undefined) {
        updates.push('ProjectName = ?');
        values.push(ProjectName);
      }
      if (ProjectCategory !== undefined) {
        updates.push('ProjectCategory = ?');
        values.push(ProjectCategory);
      }
      if (DepartmentID !== undefined) {
        updates.push('DepartmentID = ?');
        values.push(DepartmentID ? Number(DepartmentID) : null);
      }
      if (MainTypeID !== undefined) {
        updates.push('MainTypeID = ?');
        values.push(MainTypeID ? Number(MainTypeID) : null);
      }
      if (SubTypeID !== undefined) {
        updates.push('SubTypeID = ?');
        values.push(SubTypeID ? Number(SubTypeID) : null);
      }
      if (ImpactReason !== undefined) {
        updates.push('ImpactReason = ?');
        values.push(ImpactReason || null);
      }
      if (ProjectDescription !== undefined) {
        updates.push('ProjectDescription = ?');
        values.push(ProjectDescription || null);
      }
      if (AimStatement !== undefined) {
        updates.push('AimStatement = ?');
        values.push(AimStatement || null);
      }
      if (PriorityCode !== undefined) {
        updates.push('PriorityCode = ?');
        values.push(String(PriorityCode || 'MEDIUM').toUpperCase());
      }
      if (StatusCode !== undefined && StatusCode !== null && StatusCode !== '') {
        updates.push('StatusCode = ?');
        const statusUpper = String(StatusCode).toUpperCase();
        console.log('🔄 Updating StatusCode to:', statusUpper);
        values.push(statusUpper);
      } else if (StatusCode === '') {
        console.warn('⚠️ StatusCode is empty string, skipping update');
      }
      if (StartDate !== undefined) {
        updates.push('StartDate = ?');
        values.push(StartDate || null);
      }
      if (DueDate !== undefined) {
        updates.push('DueDate = ?');
        values.push(DueDate || null);
      }
      if (SmartSpecific !== undefined) {
        updates.push('Smart_Specific = ?');
        values.push(SmartSpecific ? 1 : 0);
      }
      if (SmartMeasurable !== undefined) {
        updates.push('Smart_Measurable = ?');
        values.push(SmartMeasurable ? 1 : 0);
      }
      if (SmartAchievable !== undefined) {
        updates.push('Smart_Achievable = ?');
        values.push(SmartAchievable ? 1 : 0);
      }
      if (SmartRealistic !== undefined) {
        updates.push('Smart_Realistic = ?');
        values.push(SmartRealistic ? 1 : 0);
      }
      if (SmartTimeBound !== undefined) {
        updates.push('Smart_TimeBound = ?');
        values.push(SmartTimeBound ? 1 : 0);
      }

      if (updates.length === 0) {
        return res.status(400).json({ ok: false, message: 'لم يتم إرسال أي بيانات للتحديث' });
      }

      values.push(projectId, hid);

      console.log('📝 UPDATE query:', `UPDATE improvement_projects_937 SET ${updates.join(', ')} WHERE Project937ID = ? AND HospitalID = ?`);
      console.log('📦 Values:', values);

      const [result] = await pool.query(
        `
          UPDATE improvement_projects_937
          SET ${updates.join(', ')}
          WHERE Project937ID = ? AND HospitalID = ? AND IFNULL(IsDeleted,0) = 0
        `,
        values
      );

      console.log('✅ Update result:', result.affectedRows, 'rows affected');

      res.json({ ok: true, message: 'تم تحديث المشروع بنجاح' });
    } catch (err) {
      console.error('PUT /api/improvements/937/:id error:', err);
      next(err);
    }
  }
);

export default router;

