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

export default router;
