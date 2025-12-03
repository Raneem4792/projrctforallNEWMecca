import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissionGuard.js';
import { resolveHospitalId } from '../middleware/resolveHospitalId.js';
import { attachHospitalPool } from '../middleware/hospitalPool.js';

const router = express.Router();

/**
 * GET /api/dashboard/mystery/by-department
 * Query:
 *  - hospitalId?   (اختياري لمدير التجمع)
 *  - from?, to?    (تواريخ; اختياري)
 *  - limit?        (افتراضي 20)
 */
router.get('/dashboard/mystery/by-department',
  requireAuth,
  requirePermission('DASH_CHART_MYSTERY_BY_DEPT'),
  // اجلب hospitalId من query أو من التوكن
  (req, res, next) => {
    req.query.hospitalId = req.query.hospitalId || req.headers['x-hospital-id'] || req.user?.HospitalID || null;
    next();
  },
  resolveHospitalId,   // يملأ req.hospitalId
  attachHospitalPool,  // يملأ req.hospitalPool
  async (req, res) => {
    try {
      console.log('🔍 Mystery by-department query:', req.query, 'hospitalId=', req.hospitalId);
      
      const pool = req.hospitalPool;
      if (!pool) return res.status(400).json({ success:false, message:'No hospital pool' });

      const { from, to } = req.query;
      const limit = Math.min(parseInt(req.query.limit||'20',10), 100);

      const where = ['HospitalID = ?'];
      const args  = [req.hospitalId];

      // فلترة التاريخ: إذا كان الملف يحتوي VisitDate null نستخدم فترة PeriodFrom/To
      if (from) { 
        where.push('(VisitDate IS NULL OR VisitDate >= ? OR PeriodFrom >= ?)');
        args.push(from, from);
      }
      if (to) { 
        where.push('(VisitDate IS NULL OR VisitDate <= ? OR PeriodTo <= ?)');
        args.push(to, to);
      }

      const sql = `
        SELECT
          COALESCE(DomainAr,'غير محدد') AS DepartmentName,
          SUM(CASE WHEN Status='OPEN'   THEN 1 ELSE 0 END) AS OpenCount,
          SUM(CASE WHEN Status='CLOSED' THEN 1 ELSE 0 END) AS ClosedCount,
          COUNT(*) AS TotalCount
        FROM mystery_complaints
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        GROUP BY COALESCE(DomainAr,'غير محدد')
        ORDER BY TotalCount DESC
        LIMIT ?
      `;
      args.push(limit);

      const [rows] = await pool.query(sql, args);

      return res.json({
        success: true,
        meta: { hospitalId: req.hospitalId, from: from||null, to: to||null, limit },
        data: rows
      });
    } catch (e) {
      console.error('GET /dashboard/mystery/by-department error:', e);
      res.status(500).json({ success:false, message:'Server error' });
    }
  }
);

/**
 * GET /api/dashboard/secret-visitor/delay
 * Query:
 *  - hospitalId?   (اختياري لمدير التجمع)
 * Returns:
 *  - delayed: عدد البلاغات المتأخرة (> 7 أيام)
 *  - notDelayed: عدد البلاغات غير المتأخرة (≤ 7 أيام)
 */
router.get('/dashboard/secret-visitor/delay',
  requireAuth,
  requirePermission('DASH_CHART_MYSTERY_BY_DEPT'),
  // اجلب hospitalId من query أو من التوكن
  (req, res, next) => {
    req.query.hospitalId = req.query.hospitalId || req.headers['x-hospital-id'] || req.user?.HospitalID || null;
    next();
  },
  resolveHospitalId,   // يملأ req.hospitalId (يمكن أن يكون null لمدير التجمع)
  async (req, res) => {
    try {
      const { getHospitalPool } = await import('../config/db.js');
      const { getCentralPool } = await import('../db/centralPool.js');
      const centralPool = await getCentralPool();
      
      const user = req.user || {};
      const isClusterManager = !user.HospitalID || user.RoleID === 1;
      const requestedHospitalId = req.query.hospitalId ? parseInt(req.query.hospitalId, 10) : null;

      let hospitalsList = [];

      // إذا المستخدم مدير التجمع → يجيب كل المستشفيات (أو المستشفى المحدد)
      if (isClusterManager) {
        if (requestedHospitalId) {
          const [rows] = await centralPool.query(
            `SELECT HospitalID, NameAr, DbName FROM hospitals WHERE HospitalID = ? AND IsActive = 1`, 
            [requestedHospitalId]
          );
          hospitalsList = rows;
        } else {
          const [rows] = await centralPool.query(
            `SELECT HospitalID, NameAr, DbName FROM hospitals WHERE IsActive = 1 ORDER BY SortOrder`
          );
          hospitalsList = rows;
        }
      } else {
        // موظف مستشفى: فقط مستشفاه
        const hId = Number(user.HospitalID || req.hospitalId);
        if (!hId) {
          return res.status(400).json({ success: false, message: 'HospitalID غير محدد' });
        }
        const [rows] = await centralPool.query(
          `SELECT HospitalID, NameAr, DbName FROM hospitals WHERE HospitalID = ? AND IsActive = 1`, 
          [hId]
        );
        hospitalsList = rows;
      }

      let totalDelayed = 0;
      let totalNotDelayed = 0;

      // نلف على كل المستشفيات ونحسب البلاغات
      for (const h of hospitalsList) {
        try {
          const hospitalPool = await getHospitalPool(h.HospitalID);
          
          // استعلامين منفصلين لتجنب التعقيد
          // حساب الأيام من الساعات: FLOOR(hours / 24)
          const [delayedRows] = await hospitalPool.query(`
            SELECT COUNT(*) AS count
            FROM complaints
            WHERE IsSecretVisitor = 1 
              AND (IsDeleted = 0 OR IsDeleted IS NULL)
              AND CreatedAt IS NOT NULL
              AND FLOOR(
                TIMESTAMPDIFF(
                  HOUR,
                  CreatedAt,
                  IF(StatusCode = 'CLOSED', UpdatedAt, NOW())
                ) / 24
              ) > 7
          `);

          const [notDelayedRows] = await hospitalPool.query(`
            SELECT COUNT(*) AS count
            FROM complaints
            WHERE IsSecretVisitor = 1 
              AND (IsDeleted = 0 OR IsDeleted IS NULL)
              AND CreatedAt IS NOT NULL
              AND FLOOR(
                TIMESTAMPDIFF(
                  HOUR,
                  CreatedAt,
                  IF(StatusCode = 'CLOSED', UpdatedAt, NOW())
                ) / 24
              ) <= 7
          `);

          const delayed = Number(delayedRows[0]?.count || 0);
          const notDelayed = Number(notDelayedRows[0]?.count || 0);

          totalDelayed += delayed;
          totalNotDelayed += notDelayed;

          console.log(`📊 ${h.NameAr} (${h.HospitalID}): متأخر=${delayed}, غير متأخر=${notDelayed}`);
        } catch (err) {
          console.warn(`⚠️ خطأ في مستشفى ${h.NameAr}:`, err.message);
        }
      }

      return res.json({
        success: true,
        data: {
          delayed: totalDelayed,
          notDelayed: totalNotDelayed
        }
      });
    } catch (e) {
      console.error('GET /dashboard/secret-visitor/delay error:', e);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

/**
 * GET /api/dashboard/secret-visitor/delay/list
 * Query:
 *  - hospitalId?   (اختياري لمدير التجمع)
 *  - type: 'delayed' | 'notDelayed' (نوع البلاغات المطلوبة)
 * Returns: قائمة البلاغات المتأخرة أو غير المتأخرة
 */
router.get('/dashboard/secret-visitor/delay/list',
  requireAuth,
  requirePermission('DASH_CHART_MYSTERY_BY_DEPT'),
  (req, res, next) => {
    req.query.hospitalId = req.query.hospitalId || req.headers['x-hospital-id'] || req.user?.HospitalID || null;
    next();
  },
  resolveHospitalId,
  async (req, res) => {
    try {
      const { getHospitalPool } = await import('../config/db.js');
      const { getCentralPool } = await import('../db/centralPool.js');
      const centralPool = await getCentralPool();
      
      const user = req.user || {};
      const isClusterManager = !user.HospitalID || user.RoleID === 1;
      const requestedHospitalId = req.query.hospitalId ? parseInt(req.query.hospitalId, 10) : null;
      const type = req.query.type || 'delayed'; // 'delayed' or 'notDelayed'
      const isDelayed = type === 'delayed';

      let hospitalsList = [];

      if (isClusterManager) {
        if (requestedHospitalId) {
          const [rows] = await centralPool.query(
            `SELECT HospitalID, NameAr, DbName FROM hospitals WHERE HospitalID = ? AND IsActive = 1`, 
            [requestedHospitalId]
          );
          hospitalsList = rows;
        } else {
          const [rows] = await centralPool.query(
            `SELECT HospitalID, NameAr, DbName FROM hospitals WHERE IsActive = 1 ORDER BY SortOrder`
          );
          hospitalsList = rows;
        }
      } else {
        const hId = Number(user.HospitalID || req.hospitalId);
        if (!hId) {
          return res.status(400).json({ success: false, message: 'HospitalID غير محدد' });
        }
        const [rows] = await centralPool.query(
          `SELECT HospitalID, NameAr, DbName FROM hospitals WHERE HospitalID = ? AND IsActive = 1`, 
          [hId]
        );
        hospitalsList = rows;
      }

      const allComplaints = [];

      for (const h of hospitalsList) {
        try {
          const hospitalPool = await getHospitalPool(h.HospitalID);
          
          const [rows] = await hospitalPool.query(`
            SELECT
              ComplaintID,
              TicketNumber,
              PatientFullName,
              Description,
              StatusCode,
              PriorityCode,
              CreatedAt,
              UpdatedAt,
              FLOOR(
                TIMESTAMPDIFF(
                  HOUR,
                  CreatedAt,
                  IF(StatusCode = 'CLOSED', UpdatedAt, NOW())
                ) / 24
              ) AS daysDiff,
              TIMESTAMPDIFF(
                HOUR,
                CreatedAt,
                IF(StatusCode = 'CLOSED', UpdatedAt, NOW())
              ) AS hoursDiff
            FROM complaints
            WHERE IsSecretVisitor = 1 
              AND (IsDeleted = 0 OR IsDeleted IS NULL)
              AND CreatedAt IS NOT NULL
              AND FLOOR(
                TIMESTAMPDIFF(
                  HOUR,
                  CreatedAt,
                  IF(StatusCode = 'CLOSED', UpdatedAt, NOW())
                ) / 24
              ) ${isDelayed ? '>' : '<='} 7
            ORDER BY CreatedAt DESC
            LIMIT 100
          `);

          rows.forEach(row => {
            allComplaints.push({
              ...row,
              HospitalID: h.HospitalID,
              HospitalName: h.NameAr
            });
          });
        } catch (err) {
          console.warn(`⚠️ خطأ في مستشفى ${h.NameAr}:`, err.message);
        }
      }

      return res.json({
        success: true,
        data: allComplaints,
        count: allComplaints.length,
        type: type
      });
    } catch (e) {
      console.error('GET /dashboard/secret-visitor/delay/list error:', e);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

export default router;
