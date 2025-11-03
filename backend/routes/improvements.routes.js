import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissionGuard.js';
import { resolveHospitalId } from '../middleware/resolveHospitalId.js';
import { attachHospitalPool } from '../middleware/hospitalPool.js';

const router = express.Router();

/**
 * استرجاع قائمة المشاريع التحسينية مع الفلاتر
 * Query params: hospitalId, status, dept, q (search)
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
      const hid  = req.hospitalId;
      const { status, dept, q } = req.query;

      let sql = `
        SELECT 
          ip.*,
          d.NameAr AS DepartmentName
        FROM improvement_projects ip
        LEFT JOIN departments d 
          ON d.DepartmentID = ip.DepartmentID 
         AND d.HospitalID  = ip.HospitalID
        WHERE ip.HospitalID = ? 
          AND ip.IsDeleted = 0
      `;
      const args = [hid];

      if (status) { 
        sql += ' AND ip.Status = ?'; 
        args.push(status); 
      }
      if (dept) { 
        sql += ' AND ip.DepartmentID = ?'; 
        args.push(Number(dept)); 
      }
      if (q) {
        sql += ' AND (ip.Title LIKE ? OR ip.ProblemStatement LIKE ? OR ip.AimStatement LIKE ?)';
        const like = `%${q}%`;
        args.push(like, like, like);
      }

      sql += ' ORDER BY ip.UpdatedAt DESC LIMIT 500';

      const [rows] = await pool.query(sql, args);
      res.json(rows);
    } catch (err) {
      console.error('GET /api/improvements error:', err);
      next(err);
    }
  }
);

/**
 * استرجاع مشروع تحسيني واحد بالمعرف
 */
router.get('/:id', requireAuth, requirePermission('IMPROVEMENT_VIEW'), resolveHospitalId, attachHospitalPool, async (req, res, next) => {
  try {
    const pool = req.hospitalPool;
    const hid = req.hospitalId;
    const projectId = req.params.id;

    const [rows] = await pool.query(`
      SELECT 
        ip.*,
        d.NameAr AS DepartmentName
      FROM improvement_projects ip
      LEFT JOIN departments d 
        ON d.DepartmentID = ip.DepartmentID 
       AND d.HospitalID = ip.HospitalID
      WHERE ip.ProjectID = ? AND ip.HospitalID = ? AND ip.IsDeleted = 0
    `, [projectId, hid]);

    if (rows.length === 0) {
      return res.status(404).json({ 
        ok: false,
        error: 'Project not found' 
      });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('GET /api/improvements/:id error:', err);
    next(err);
  }
});

/**
 * تحديث مشروع تحسيني
 */
router.put('/:id', requireAuth, requirePermission('IMPROVEMENT_EDIT'), resolveHospitalId, attachHospitalPool, async (req, res, next) => {
  try {
    const pool = req.hospitalPool;
    const hid = req.hospitalId;
    const projectId = req.params.id;

    const {
      Title, ProblemStatement, AimStatement, DepartmentID,
      Priority, Status, StartDate, DueDate, BudgetEstimate,
      ExpectedImpact
    } = req.body || {};

    // تحديث البيانات
    const [result] = await pool.query(`
      UPDATE improvement_projects 
      SET 
        Title = COALESCE(?, Title),
        ProblemStatement = COALESCE(?, ProblemStatement),
        AimStatement = COALESCE(?, AimStatement),
        DepartmentID = COALESCE(?, DepartmentID),
        Priority = COALESCE(?, Priority),
        Status = COALESCE(?, Status),
        StartDate = COALESCE(?, StartDate),
        DueDate = COALESCE(?, DueDate),
        BudgetEstimate = COALESCE(?, BudgetEstimate),
        ExpectedImpact = COALESCE(?, ExpectedImpact),
        UpdatedAt = CURRENT_TIMESTAMP
      WHERE ProjectID = ? AND HospitalID = ? AND IsDeleted = 0
    `, [
      Title, ProblemStatement, AimStatement, DepartmentID ? Number(DepartmentID) : null,
      Priority, Status, StartDate, DueDate, BudgetEstimate,
      ExpectedImpact, projectId, hid
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        ok: false,
        error: 'Project not found or no changes made' 
      });
    }

    res.json({ 
      ok: true,
      message: 'تم تحديث المشروع بنجاح' 
    });
  } catch (err) {
    console.error('PUT /api/improvements/:id error:', err);
    next(err);
  }
});

/**
 * حذف مشروع تحسيني (soft delete)
 */
router.delete('/:id', requireAuth, requirePermission('IMPROVEMENT_DELETE'), resolveHospitalId, attachHospitalPool, async (req, res, next) => {
  try {
    const pool = req.hospitalPool;
    const hid = req.hospitalId;
    const projectId = req.params.id;

    const [result] = await pool.query(`
      UPDATE improvement_projects 
      SET IsDeleted = 1, UpdatedAt = CURRENT_TIMESTAMP
      WHERE ProjectID = ? AND HospitalID = ? AND IsDeleted = 0
    `, [projectId, hid]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        ok: false,
        error: 'Project not found' 
      });
    }

    res.json({ 
      ok: true,
      message: 'تم حذف المشروع بنجاح' 
    });
  } catch (err) {
    console.error('DELETE /api/improvements/:id error:', err);
    next(err);
  }
});

/**
 * إنشاء مشروع تحسيني في جدول improvement_projects
 * يتوقع JSON:
 * { Title, ProblemStatement, AimStatement, DepartmentID, Priority, StartDate, DueDate, BudgetEstimate }
 */
router.post('/', requireAuth, requirePermission('IMPROVEMENT_CREATE'), resolveHospitalId, attachHospitalPool, async (req, res, next) => {
  try {
    const pool = req.hospitalPool;
    const hid = req.hospitalId;

    const {
      Title, ProblemStatement, AimStatement,
      DepartmentID, Priority = 'MEDIUM',
      StartDate = null, DueDate = null, BudgetEstimate = null
    } = req.body || {};

    // تحقق الحقول الأساسية
    const missing = [];
    if (!Title) missing.push('Title');
    if (!ProblemStatement) missing.push('ProblemStatement');
    if (!DepartmentID) missing.push('DepartmentID');
    if (missing.length) return res.status(400).json({ error: 'حقول ناقصة', missing });

    // إدخال
    const [ins] = await pool.query(`
      INSERT INTO improvement_projects
      (HospitalID, Title, ProblemStatement, AimStatement, DepartmentID, Priority, Status,
       StartDate, DueDate, BudgetEstimate, OwnerUserID, CreatedByUserID)
      VALUES (?,?,?,?,?,?, 'PROPOSED', ?,?,?, ?,?)
    `, [
      hid, Title, ProblemStatement || null, AimStatement || null,
      Number(DepartmentID) || null, Priority,
      StartDate || null, DueDate || null, BudgetEstimate || null,
      req.user.UserID, req.user.UserID
    ]);

    res.status(201).json({ 
      ok: true,
      ProjectID: ins.insertId,
      message: 'تم إنشاء المشروع بنجاح'
    });
  } catch (err) {
    console.error('POST /api/improvements error:', err);
    next(err);
  }
});

/**
 * استرجاع تقرير مشروع تحسيني
 */
router.get('/:id/report', requireAuth, requirePermission('IMPROVEMENT_REPORT_VIEW'), resolveHospitalId, attachHospitalPool, async (req, res, next) => {
  try {
    const pool = req.hospitalPool;
    const hid = req.hospitalId;
    const projectId = req.params.id;

    const [rows] = await pool.query(`
      SELECT 
        ip.*,
        d.NameAr AS DepartmentName
      FROM improvement_projects ip
      LEFT JOIN departments d 
        ON d.DepartmentID = ip.DepartmentID 
       AND d.HospitalID = ip.HospitalID
      WHERE ip.ProjectID = ? AND ip.HospitalID = ? AND ip.IsDeleted = 0
    `, [projectId, hid]);

    if (rows.length === 0) {
      return res.status(404).json({ 
        ok: false,
        error: 'Project not found' 
      });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('GET /api/improvements/:id/report error:', err);
    next(err);
  }
});

export default router;
