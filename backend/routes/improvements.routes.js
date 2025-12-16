import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissionGuard.js';
import { resolveHospitalId } from '../middleware/resolveHospitalId.js';
import { attachHospitalPool, getCentralPool } from '../middleware/hospitalPool.js';

const router = express.Router();

/**
 * إنشاء مشروع تحسيني من النوع OTHER (جدول مستقل)
 * POST /api/improvements/other
 */
router.post(
  '/other',
  requireAuth,
  requirePermission('IMPROVEMENTS_MODULE'),
  requirePermission('IMPROVEMENT_CREATE'),
  resolveHospitalId,
  attachHospitalPool,
  async (req, res, next) => {
    try {
      const pool = req.hospitalPool;
      const hid = req.hospitalId;
      if (!hid) {
        return res.status(400).json({ success: false, message: 'Hospital ID missing' });
      }

      const {
        title,
        departmentId,
        improvementArea,
        projectCategory,
        problemStatement,
        aimStatement,
        currentState,
        proposedSolution,
        kpis,
        requiredResources,
        priority = 'MEDIUM',
        projectOwner,
        startDate,
        dueDate,
        duration,
        teamMembers,
        notes,
        status = 'DRAFT'
      } = req.body || {};

      // تحقق أساسي
      const missing = [];
      if (!title) missing.push('title');
      if (!departmentId) missing.push('departmentId');
      if (!improvementArea) missing.push('improvementArea');
      if (!problemStatement) missing.push('problemStatement');
      if (!aimStatement) missing.push('aimStatement');
      if (!proposedSolution) missing.push('proposedSolution');
      if (missing.length) {
        return res.status(400).json({ success: false, message: 'Missing fields', missing });
      }

      const [result] = await pool.query(
        `INSERT INTO improvement_projects_other 
         (HospitalID, ProjectType, Title, DepartmentID, ImprovementArea, ProjectCategory,
          ProblemStatement, AimStatement, CurrentState, ProposedSolution, KPIs,
          RequiredResources, Priority, ProjectOwner, StartDate, DueDate, DurationMonths,
          TeamMembers, Notes, Status, CreatedBy)
         VALUES (?, 'OTHER', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          hid,
          title,
          Number(departmentId),
          improvementArea,
          projectCategory || null,
          problemStatement,
          aimStatement,
          currentState || null,
          proposedSolution,
          kpis || null,
          requiredResources || null,
          String(priority || 'MEDIUM').toUpperCase(),
          projectOwner || null,
          startDate || null,
          dueDate || null,
          duration || null,
          teamMembers || null,
          notes || null,
          status || 'DRAFT',
          req.user?.UserID || null
        ]
      );

      return res.json({ success: true, projectId: result.insertId });
    } catch (err) {
      console.error('POST /api/improvements/other error:', err);
      next(err);
    }
  }
);

/**
 * عرض مشاريع OTHER
 * GET /api/improvements/other
 */
router.get(
  '/other',
  requireAuth,
  requirePermission('IMPROVEMENTS_MODULE'),
  requirePermission('IMPROVEMENT_VIEW'),
  resolveHospitalId,
  attachHospitalPool,
  async (req, res, next) => {
    try {
      const pool = req.hospitalPool;
      const hid = req.hospitalId;
      if (!hid) {
        return res.status(400).json({ success: false, message: 'Hospital ID missing' });
      }

      const { status, dept, q } = req.query || {};

      let sql = `
        SELECT 
          p.*,
          d.NameAr AS DepartmentName
        FROM improvement_projects_other p
        LEFT JOIN departments d 
          ON d.DepartmentID = p.DepartmentID
         AND d.HospitalID  = p.HospitalID
        WHERE p.HospitalID = ?
      `;
      const args = [hid];

      if (status) {
        sql += ' AND p.Status = ?';
        args.push(String(status));
      }
      if (dept) {
        sql += ' AND p.DepartmentID = ?';
        args.push(Number(dept));
      }
      if (q) {
        sql += ' AND (p.Title LIKE ? OR p.ProblemStatement LIKE ? OR p.AimStatement LIKE ?)';
        const like = `%${q}%`;
        args.push(like, like, like);
      }

      sql += ' ORDER BY p.CreatedAt DESC';

      const [rows] = await pool.query(sql, args);

      res.json({ success: true, data: rows });
    } catch (err) {
      console.error('GET /api/improvements/other error:', err);
      next(err);
    }
  }
);

/**
 * جلب مشروع OTHER واحد
 * GET /api/improvements/other/:id
 */
router.get(
  '/other/:id',
  requireAuth,
  requirePermission('IMPROVEMENT_VIEW'),
  resolveHospitalId,
  attachHospitalPool,
  async (req, res, next) => {
    try {
      const pool = req.hospitalPool;
      const hid = req.hospitalId;
      const projectId = Number(req.params.id);

      if (!hid) {
        return res.status(400).json({ success: false, message: 'Hospital ID missing' });
      }

      const [rows] = await pool.query(`
        SELECT 
          p.*,
          d.NameAr AS DepartmentName
        FROM improvement_projects_other p
        LEFT JOIN departments d
          ON d.DepartmentID = p.DepartmentID
         AND d.HospitalID = p.HospitalID
        WHERE p.ProjectID = ? AND p.HospitalID = ?
        LIMIT 1
      `, [projectId, hid]);

      if (!rows.length) {
        return res.status(404).json({ success: false, message: 'المشروع غير موجود' });
      }

      res.json({ success: true, data: rows[0] });
    } catch (err) {
      console.error('GET /api/improvements/other/:id error:', err);
      next(err);
    }
  }
);

/**
 * تحديث مشروع OTHER
 * PUT /api/improvements/other/:id
 */
router.put(
  '/other/:id',
  requireAuth,
  requirePermission('IMPROVEMENT_EDIT'),
  resolveHospitalId,
  attachHospitalPool,
  async (req, res, next) => {
    try {
      const pool = req.hospitalPool;
      const hid = req.hospitalId;
      const projectId = Number(req.params.id);

      if (!hid) {
        return res.status(400).json({ success: false, message: 'Hospital ID missing' });
      }

      const {
        Title,
        DepartmentID,
        ImprovementArea,
        ProjectCategory,
        ProblemStatement,
        AimStatement,
        CurrentState,
        ProposedSolution,
        KPIs,
        RequiredResources,
        Priority,
        ProjectOwner,
        StartDate,
        DueDate,
        DurationMonths,
        TeamMembers,
        Notes,
        Status
      } = req.body || {};

      // التحقق من وجود المشروع
      const [checkRows] = await pool.query(
        `SELECT ProjectID FROM improvement_projects_other WHERE ProjectID = ? AND HospitalID = ?`,
        [projectId, hid]
      );

      if (!checkRows.length) {
        return res.status(404).json({ success: false, message: 'المشروع غير موجود' });
      }

      await pool.query(`
        UPDATE improvement_projects_other
        SET
          Title = ?,
          DepartmentID = ?,
          ImprovementArea = ?,
          ProjectCategory = ?,
          ProblemStatement = ?,
          AimStatement = ?,
          CurrentState = ?,
          ProposedSolution = ?,
          KPIs = ?,
          RequiredResources = ?,
          Priority = ?,
          ProjectOwner = ?,
          StartDate = ?,
          DueDate = ?,
          DurationMonths = ?,
          TeamMembers = ?,
          Notes = ?,
          Status = ?,
          UpdatedAt = CURRENT_TIMESTAMP
        WHERE ProjectID = ? AND HospitalID = ?
      `, [
        Title,
        DepartmentID ? Number(DepartmentID) : null,
        ImprovementArea,
        ProjectCategory || null,
        ProblemStatement,
        AimStatement,
        CurrentState || null,
        ProposedSolution,
        KPIs || null,
        RequiredResources || null,
        Priority ? String(Priority).toUpperCase() : 'MEDIUM',
        ProjectOwner || null,
        StartDate || null,
        DueDate || null,
        DurationMonths ? Number(DurationMonths) : null,
        TeamMembers || null,
        Notes || null,
        Status ? String(Status).toUpperCase() : 'DRAFT',
        projectId,
        hid
      ]);

      res.json({ success: true, message: 'تم تحديث المشروع بنجاح' });
    } catch (err) {
      console.error('PUT /api/improvements/other/:id error:', err);
      next(err);
    }
  }
);

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
 * ✅ إحصائيات المشاريع التحسينية (جميع الأنواع)
 * GET /api/improvements/stats
 * يجمع البيانات من قواعد المستشفيات المختلفة
 * ⚠️ يجب أن يكون قبل route /:id
 */
router.get(
  '/stats',
  requireAuth,
  requirePermission('IMPROVEMENT_VIEW'),
  async (req, res, next) => {
    try {
      const centralPool = await getCentralPool();
      const { getHospitalPool } = await import('../middleware/hospitalPool.js');
      
      // ✅ جلب قائمة المستشفيات النشطة
      const [hospitals] = await centralPool.query(`
        SELECT HospitalID, NameAr, Code
        FROM hospitals
        WHERE IsActive = 1
        ORDER BY NameAr
      `);

      // ✅ دالة لجلب إحصائيات مستشفى واحد
      async function getHospitalStats(hospital) {
        try {
          const hospitalPool = await getHospitalPool(hospital.HospitalID);
          
          // ✅ جلب الإحصائيات من الجداول الثلاثة
          const [stats937] = await hospitalPool.query(`
            SELECT 
              StatusCode AS Status,
              COUNT(*) AS Count
            FROM improvement_projects_937
            WHERE IFNULL(IsDeleted, 0) = 0
            GROUP BY StatusCode
          `).catch(() => [[{ Status: null, Count: 0 }]]);

          const [statsPG] = await hospitalPool.query(`
            SELECT 
              Status,
              COUNT(*) AS Count
            FROM improvement_pressganey_projects
            GROUP BY Status
          `).catch(() => [[{ Status: null, Count: 0 }]]);

          const [statsOther] = await hospitalPool.query(`
            SELECT 
              Status,
              COUNT(*) AS Count
            FROM improvement_projects_other
            GROUP BY Status
          `).catch(() => [[{ Status: null, Count: 0 }]]);

          // ✅ دمج الإحصائيات
          const allStats = [...stats937, ...statsPG, ...statsOther];
          
          const result = {
            HospitalID: hospital.HospitalID,
            HospitalName: hospital.NameAr || hospital.Code || `مستشفى ${hospital.HospitalID}`,
            ApprovedCount: 0,
            CancelledCount: 0,
            CompletedCount: 0,
            InProgressCount: 0,
            PendingCount: 0,
            TotalProjects: 0
          };

          allStats.forEach(stat => {
            const status = String(stat.Status || '').toUpperCase();
            const count = Number(stat.Count) || 0;
            
            result.TotalProjects += count;
            
            if (status === 'APPROVED') {
              result.ApprovedCount += count;
            } else if (status === 'COMPLETED') {
              result.CompletedCount += count;
            } else if (status === 'IN_PROGRESS') {
              result.InProgressCount += count;
            } else if (status === 'CANCELLED' || status === 'REJECTED') {
              result.CancelledCount += count;
            } else if (status === 'PROPOSED' || status === 'UNDER_APPROVAL' || status === 'DRAFT') {
              result.PendingCount += count;
            }
          });

          return result;
        } catch (err) {
          console.warn(`⚠️ Error getting stats for hospital ${hospital.HospitalID}:`, err.message);
          return {
            HospitalID: hospital.HospitalID,
            HospitalName: hospital.NameAr || hospital.Code || `مستشفى ${hospital.HospitalID}`,
            ApprovedCount: 0,
            CancelledCount: 0,
            CompletedCount: 0,
            InProgressCount: 0,
            PendingCount: 0,
            TotalProjects: 0
          };
        }
      }

      // ✅ جلب إحصائيات جميع المستشفيات (بالتوازي)
      const statsPromises = hospitals.map(h => getHospitalStats(h));
      const statsResults = await Promise.all(statsPromises);
      
      // ✅ فلترة المستشفيات التي لديها مشاريع
      const rows = statsResults.filter(row => row.TotalProjects > 0);

      // ✅ حساب الإجماليات العامة
      const totals = rows.reduce((acc, row) => {
        acc.total += Number(row.TotalProjects) || 0;
        acc.approved += Number(row.ApprovedCount) || 0;
        acc.cancelled += Number(row.CancelledCount) || 0;
        acc.completed += Number(row.CompletedCount) || 0;
        acc.inProgress += Number(row.InProgressCount) || 0;
        acc.pending += Number(row.PendingCount) || 0;
        return acc;
      }, {
        total: 0,
        approved: 0,
        cancelled: 0,
        completed: 0,
        inProgress: 0,
        pending: 0
      });

      res.json({
        success: true,
        data: rows,
        totals
      });
    } catch (err) {
      console.error('GET /api/improvements/stats error:', err);
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
    const userId = req.user?.UserID;

    const {
      Title, ProblemStatement, AimStatement, DepartmentID,
      Priority, Status, StartDate, DueDate, BudgetEstimate,
      ExpectedImpact,
      SuccessCriteria, TeamMembers, ProgressNotes,
      SmartSpecific, SmartMeasurable, SmartAchievable,
      SmartRealistic, SmartTimebound
    } = req.body || {};

    // جلب السجل القديم قبل التحديث
    const [oldRows] = await pool.query(`
      SELECT 
        Title, ProblemStatement, AimStatement, DepartmentID,
        Priority, Status, StartDate, DueDate, BudgetEstimate,
        ExpectedImpact, SuccessCriteria, TeamMembers, ProgressNotes
      FROM improvement_projects
      WHERE ProjectID = ? AND HospitalID = ? AND IsDeleted = 0
    `, [projectId, hid]);

    if (oldRows.length === 0) {
      return res.status(404).json({ 
        ok: false,
        error: 'Project not found' 
      });
    }

    const old = oldRows[0];

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
        SuccessCriteria = COALESCE(?, SuccessCriteria),
        TeamMembers = COALESCE(?, TeamMembers),
        ProgressNotes = COALESCE(?, ProgressNotes),
        SmartSpecific = COALESCE(?, SmartSpecific),
        SmartMeasurable = COALESCE(?, SmartMeasurable),
        SmartAchievable = COALESCE(?, SmartAchievable),
        SmartRealistic = COALESCE(?, SmartRealistic),
        SmartTimebound = COALESCE(?, SmartTimebound),
        UpdatedAt = CURRENT_TIMESTAMP
      WHERE ProjectID = ? AND HospitalID = ? AND IsDeleted = 0
    `, [
      Title, ProblemStatement, AimStatement, DepartmentID ? Number(DepartmentID) : null,
      Priority, Status, StartDate, DueDate, BudgetEstimate,
      ExpectedImpact,
      SuccessCriteria || null, TeamMembers || null, ProgressNotes || null,
      SmartSpecific !== undefined ? (SmartSpecific ? 1 : 0) : null,
      SmartMeasurable !== undefined ? (SmartMeasurable ? 1 : 0) : null,
      SmartAchievable !== undefined ? (SmartAchievable ? 1 : 0) : null,
      SmartRealistic !== undefined ? (SmartRealistic ? 1 : 0) : null,
      SmartTimebound !== undefined ? (SmartTimebound ? 1 : 0) : null,
      projectId, hid
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        ok: false,
        error: 'Project not found or no changes made' 
      });
    }

    // بناء ملخص التغييرات
    const changes = [];
    const statusMap = {
      'DRAFT': 'مسودة',
      'PROPOSED': 'مقترح',
      'APPROVED': 'معتمد',
      'IN_PROGRESS': 'قيد التنفيذ',
      'COMPLETED': 'مكتمل',
      'CANCELLED': 'ملغي'
    };
    const priorityMap = {
      'LOW': 'منخفضة',
      'MEDIUM': 'متوسطة',
      'HIGH': 'عالية',
      'CRITICAL': 'حرجة'
    };

    if (Status && old.Status !== Status) {
      changes.push(`الحالة من "${statusMap[old.Status] || old.Status}" إلى "${statusMap[Status] || Status}"`);
    }
    if (Priority && old.Priority !== Priority) {
      changes.push(`الأولوية من "${priorityMap[old.Priority] || old.Priority}" إلى "${priorityMap[Priority] || Priority}"`);
    }
    if (DepartmentID && old.DepartmentID !== Number(DepartmentID)) {
      changes.push('تم تغيير القسم');
    }
    if (Title && old.Title !== Title) {
      changes.push('تم تعديل العنوان');
    }
    if (StartDate && old.StartDate?.toISOString?.().slice(0,10) !== StartDate) {
      changes.push('تم تعديل تاريخ البداية');
    }
    if (DueDate && old.DueDate?.toISOString?.().slice(0,10) !== DueDate) {
      changes.push('تم تعديل تاريخ الانتهاء المتوقع');
    }
    if (TeamMembers && old.TeamMembers !== TeamMembers) {
      changes.push('تم تعديل فريق العمل');
    }
    if (ProgressNotes && old.ProgressNotes !== ProgressNotes) {
      changes.push('تم تحديث ملاحظات التقدم');
    }
    if (SuccessCriteria && old.SuccessCriteria !== SuccessCriteria) {
      changes.push('تم تحديث معايير النجاح');
    }
    if (ProblemStatement && old.ProblemStatement !== ProblemStatement) {
      changes.push('تم تعديل وصف المشكلة');
    }
    if (AimStatement && old.AimStatement !== AimStatement) {
      changes.push('تم تعديل الهدف');
    }

    // إضافة سجل التعديلات إذا كان هناك تغييرات
    if (changes.length > 0 && userId) {
      try {
        await pool.query(`
          INSERT INTO improvement_project_history
          (ProjectID, HospitalID, ChangedByUserID, ChangeSummary, OldStatus, NewStatus, OldPriority, NewPriority)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          projectId, hid, userId,
          changes.join('، '),
          old.Status || null,
          Status || null,
          old.Priority || null,
          Priority || null
        ]);
      } catch (historyErr) {
        // إذا فشل إدخال السجل، لا نفشل العملية الرئيسية
        console.error('Failed to save history:', historyErr);
      }
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
    const hid = Number(req.body?.hospitalId) || req.hospitalId;
    const projectType = (req.body?.projectType || '').toString();

    if (projectType === '937') {
      const {
        projectName,
        impactReason,
        projectDescription,
        aimStatement,
        departmentId,
        mainTypeId,
        subTypeId,
        priority = 'MEDIUM',
        startDate = null,
        dueDate = null,
        projectCategory,
        projectCategoryOther,
        smartChecklist = {}
      } = req.body || {};

      const missing = [];
      if (!projectName) missing.push('projectName');
      if (!impactReason) missing.push('impactReason');
      if (!hid) missing.push('HospitalID');

      if (missing.length) {
        return res.status(400).json({
          ok: false,
          error: 'حقول ناقصة',
          missing
        });
      }

      const effectiveCategory =
        (projectCategoryOther && projectCategoryOther.trim()) ||
        (projectCategory && projectCategory.trim()) ||
        null;

      const insertPayload937 = {
        GlobalID: uuidv4(),
        HospitalID: hid,
        DepartmentID: departmentId ? Number(departmentId) : null,
        ProjectCategory: effectiveCategory,
        ProjectName: projectName,
        ImpactReason: impactReason || null,
        ProjectDescription: projectDescription || null,
        AimStatement: aimStatement || null,
        MainTypeID: mainTypeId ? Number(mainTypeId) : null,
        SubTypeID: subTypeId ? Number(subTypeId) : null,
        PriorityCode: String(priority || 'MEDIUM').toUpperCase(),
        StatusCode: 'UNDER_APPROVAL',
        Smart_Specific: smartChecklist?.specific ? 1 : 0,
        Smart_Measurable: smartChecklist?.measurable ? 1 : 0,
        Smart_Achievable: smartChecklist?.achievable ? 1 : 0,
        Smart_Realistic: smartChecklist?.realistic ? 1 : 0,
        Smart_TimeBound: smartChecklist?.timeBound ? 1 : 0,
        StartDate: startDate || null,
        DueDate: dueDate || null,
        CreatedByUserID: req.user?.UserID || null
      };

      const [ins937] = await pool.query(
        'INSERT INTO improvement_projects_937 SET ?',
        insertPayload937
      );

      return res.status(201).json({
        ok: true,
        success: true,
        Project937ID: ins937.insertId,
        message: 'تم إنشاء مشروع 937 بنجاح'
      });
    }

    const {
      Title,
      ProblemStatement,
      AimStatement,
      DepartmentID,
      Priority = 'MEDIUM',
      StartDate = null,
      DueDate = null,
      BudgetEstimate = null,
      SmartSpecific = false,
      SmartMeasurable = false,
      SmartAchievable = false,
      SmartRealistic = false,
      SmartTimebound = false,
      TeamMembers = null
    } = req.body || {};

    const missing = [];
    if (!Title) missing.push('Title');
    if (!ProblemStatement) missing.push('ProblemStatement');
    if (!DepartmentID) missing.push('DepartmentID');
    if (missing.length) return res.status(400).json({ error: 'حقول ناقصة', missing });

    const insertPayload = {
      HospitalID: hid,
      Title,
      ProblemStatement: ProblemStatement || null,
      AimStatement: AimStatement || null,
      DepartmentID: Number(DepartmentID) || null,
      Priority,
      Status: 'PROPOSED',
      StartDate: StartDate || null,
      DueDate: DueDate || null,
      BudgetEstimate: BudgetEstimate || null,
      OwnerUserID: req.user.UserID,
      CreatedByUserID: req.user.UserID,
      SmartSpecific: SmartSpecific ? 1 : 0,
      SmartMeasurable: SmartMeasurable ? 1 : 0,
      SmartAchievable: SmartAchievable ? 1 : 0,
      SmartRealistic: SmartRealistic ? 1 : 0,
      SmartTimebound: SmartTimebound ? 1 : 0,
      TeamMembers: TeamMembers || null
    };

    const [ins] = await pool.query('INSERT INTO improvement_projects SET ?', insertPayload);

    res.status(201).json({ 
      ok: true,
      success: true,
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

/**
 * استرجاع سجل التعديلات لمشروع تحسيني
 */
router.get('/:id/history', requireAuth, requirePermission('IMPROVEMENT_VIEW'), resolveHospitalId, attachHospitalPool, async (req, res, next) => {
  try {
    const pool = req.hospitalPool;
    const hid = req.hospitalId;
    const projectId = req.params.id;

    const [rows] = await pool.query(`
      SELECT 
        h.HistoryID,
        h.ChangedAt,
        h.ChangeSummary,
        h.OldStatus,
        h.NewStatus,
        h.OldPriority,
        h.NewPriority,
        u.FullName AS ChangedByName,
        u.Username AS ChangedByUsername
      FROM improvement_project_history h
      LEFT JOIN users u ON u.UserID = h.ChangedByUserID
      WHERE h.ProjectID = ? AND h.HospitalID = ?
      ORDER BY h.ChangedAt DESC
      LIMIT 50
    `, [projectId, hid]);

    res.json(rows || []);
  } catch (err) {
    // إذا كان الجدول غير موجود، نرجع مصفوفة فارغة
    if (err.code === 'ER_NO_SUCH_TABLE') {
      return res.json([]);
    }
    console.error('GET /api/improvements/:id/history error:', err);
    next(err);
  }
});

/**
 * إضافة تقدم للمشروع (ملاحظة تقدم + تحديث اختياري للحالة)
 */
router.post('/:id/progress', requireAuth, requirePermission('IMPROVEMENT_EDIT'), resolveHospitalId, attachHospitalPool, async (req, res, next) => {
  try {
    const pool = req.hospitalPool;
    const hid = req.hospitalId;
    const projectId = req.params.id;
    const userId = req.user?.UserID;

    const { note, progressPercent, newStatus } = req.body || {};

    if (!note || !note.trim()) {
      return res.status(400).json({
        ok: false,
        error: 'وصف التقدم مطلوب'
      });
    }

    // جلب المشروع الحالي
    const [projectRows] = await pool.query(`
      SELECT Status, ProgressNotes
      FROM improvement_projects
      WHERE ProjectID = ? AND HospitalID = ? AND IsDeleted = 0
    `, [projectId, hid]);

    if (projectRows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: 'Project not found'
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
    updateValues.push(projectId, hid);

    const [result] = await pool.query(`
      UPDATE improvement_projects
      SET ${updateFields.join(', ')}
      WHERE ProjectID = ? AND HospitalID = ? AND IsDeleted = 0
    `, updateValues);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        ok: false,
        error: 'Failed to update project'
      });
    }

    // إضافة سجل في جدول التاريخ
    if (userId) {
      try {
        const changes = [`إضافة تقدم: ${note.trim()}`];
        if (newStatus && newStatus !== oldStatus) {
          const statusMap = {
            'DRAFT': 'مسودة',
            'PROPOSED': 'مقترح',
            'APPROVED': 'معتمد',
            'IN_PROGRESS': 'قيد التنفيذ',
            'COMPLETED': 'مكتمل',
            'CANCELLED': 'ملغي'
          };
          changes.push(`تحديث الحالة من "${statusMap[oldStatus] || oldStatus}" إلى "${statusMap[newStatus] || newStatus}"`);
        }

        await pool.query(`
          INSERT INTO improvement_project_history
          (ProjectID, HospitalID, ChangedByUserID, ChangeSummary, OldStatus, NewStatus)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [
          projectId, hid, userId,
          changes.join('، '),
          oldStatus || null,
          (newStatus && newStatus !== oldStatus) ? newStatus : null
        ]);
      } catch (historyErr) {
        // إذا فشل إدخال السجل، لا نفشل العملية الرئيسية
        console.error('Failed to save history:', historyErr);
      }
    }

    res.json({
      ok: true,
      message: 'تم حفظ التقدم بنجاح'
    });
  } catch (err) {
    console.error('POST /api/improvements/:id/progress error:', err);
    next(err);
  }
});

// ✅ اعتماد المشروع عبر تغيير الحالة إلى "APPROVED"
// يدعم جميع أنواع المشاريع: 937, PressGaney, OTHER
router.put(
  '/approve/:id',
  requireAuth,
  requirePermission('IMPROVEMENT_APPROVE'),
  resolveHospitalId,
  attachHospitalPool,
  async (req, res) => {
    try {
      const pool = req.hospitalPool;
      const hid = req.hospitalId;
      const projectId = Number(req.params.id);
      const approverId = req.user?.UserID || null;
      const { type } = req.query; // ✅ نوع المشروع: OTHER, PRESSGANEY, 937

      if (!hid) {
        return res.status(400).json({ success: false, message: 'Hospital ID missing' });
      }

      if (!type) {
        return res.status(400).json({ success: false, message: 'نوع المشروع مطلوب (type=OTHER|PRESSGANEY|937)' });
      }

      const projectType = String(type).toUpperCase();
      console.log('🔄 Approving project:', { projectId, type: projectType, hospitalId: hid });

      let sql = '';
      let params = [];
      let currentStatus = null;
      let statusField = 'Status';

      // ✅ تحديد الجدول والعمود حسب نوع المشروع
      switch (projectType) {
        case 'OTHER':
          // التحقق من وجود المشروع والحالة الحالية
          const [rowsOther] = await pool.query(`
            SELECT Status
            FROM improvement_projects_other
            WHERE ProjectID = ? AND HospitalID = ?
            LIMIT 1
          `, [projectId, hid]);
          
          if (rowsOther.length === 0) {
            return res.status(404).json({ success: false, message: 'المشروع غير موجود' });
          }
          
          currentStatus = rowsOther[0].Status;
          
          // التحقق من الحالة
          if (currentStatus === 'APPROVED') {
            return res.json({ success: false, message: 'المشروع معتمد مسبقًا' });
          }
          
          // تحديث الحالة
          sql = `
            UPDATE improvement_projects_other
            SET Status = 'APPROVED',
                UpdatedAt = CURRENT_TIMESTAMP
            WHERE ProjectID = ? AND HospitalID = ?
          `;
          params = [projectId, hid];
          break;

        case 'PRESSGANEY':
          // التحقق من وجود المشروع والحالة الحالية
          const [rowsPG] = await pool.query(`
            SELECT Status
            FROM improvement_pressganey_projects
            WHERE ProjectID = ? AND HospitalID = ?
            LIMIT 1
          `, [projectId, hid]);
          
          if (rowsPG.length === 0) {
            return res.status(404).json({ success: false, message: 'المشروع غير موجود' });
          }
          
          currentStatus = rowsPG[0].Status;
          
          // التحقق من الحالة
          if (currentStatus === 'APPROVED') {
            return res.json({ success: false, message: 'المشروع معتمد مسبقًا' });
          }
          
          // تحديث الحالة
          sql = `
            UPDATE improvement_pressganey_projects
            SET Status = 'APPROVED',
                UpdatedAt = CURRENT_TIMESTAMP
            WHERE ProjectID = ? AND HospitalID = ?
          `;
          params = [projectId, hid];
          break;

        case '937':
          // التحقق من وجود المشروع والحالة الحالية
          const [rows937] = await pool.query(`
            SELECT StatusCode
            FROM improvement_projects_937
            WHERE Project937ID = ? AND HospitalID = ? AND IFNULL(IsDeleted,0) = 0
            LIMIT 1
          `, [projectId, hid]);
          
          if (rows937.length === 0) {
            return res.status(404).json({ success: false, message: 'المشروع غير موجود' });
          }
          
          currentStatus = rows937[0].StatusCode;
          statusField = 'StatusCode';
          
          // التحقق من الحالة
          if (currentStatus === 'APPROVED') {
            return res.json({ success: false, message: 'المشروع معتمد مسبقًا' });
          }
          
          // لمشاريع 937: يجب أن تكون الحالة UNDER_APPROVAL
          if (currentStatus !== 'UNDER_APPROVAL') {
            return res.status(400).json({ 
              success: false, 
              message: 'لا يمكن اعتماد المشروع في حالته الحالية. يجب أن تكون الحالة "قيد الاعتماد"' 
            });
          }
          
          // تحديث الحالة
          sql = `
            UPDATE improvement_projects_937
            SET StatusCode = 'APPROVED',
                ApprovedByUserID = ?,
                ApprovedAt = NOW()
            WHERE Project937ID = ? AND HospitalID = ? AND IFNULL(IsDeleted,0) = 0
          `;
          params = [approverId, projectId, hid];
          break;

        default:
          return res.status(400).json({ success: false, message: 'نوع مشروع غير مدعوم. يجب أن يكون: OTHER, PRESSGANEY, أو 937' });
      }

      // تنفيذ التحديث
      const [result] = await pool.query(sql, params);
      console.log('✅ Update result:', result.affectedRows, 'rows affected');

      if (result.affectedRows === 0) {
        return res.status(500).json({ success: false, message: 'فشل تحديث حالة المشروع' });
      }

      return res.json({ success: true, message: '✅ تم اعتماد المشروع وتغيير حالته إلى "معتمد"' });
    } catch (err) {
      console.error('PUT /api/improvements/approve/:id error:', err);
      return res.status(500).json({ success: false, message: 'خطأ في عملية الاعتماد: ' + err.message });
    }
  }
);

export default router;
