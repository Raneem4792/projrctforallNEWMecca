// pressganeyRoutes.js - مسارات Press Ganey
import express from 'express';
import multer from 'multer';
import xlsx from 'xlsx';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissionGuard.js';
import { resolveHospitalId } from '../middleware/resolveHospitalId.js';
import { attachHospitalPool } from '../middleware/hospitalPool.js';

const router = express.Router();

// إعداد multer للرفع
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

/**
 * GET /api/pressganey/summary
 * ملخص البيانات
 */
router.get(
  '/summary',
  requireAuth,
  requirePermission('PRESSGANEY_VIEW'),
  resolveHospitalId,
  attachHospitalPool,
  async (req, res, next) => {
    try {
      const pool = req.hospitalPool;
      const hid = req.hospitalId;

      const [rows] = await pool.query(`
        SELECT 
          COUNT(DISTINCT department_key) as totalDepartments,
          AVG(mean_score) as avgScore,
          COUNT(*) as totalRecords
        FROM pressganey_data
        WHERE HospitalID = ?
      `, [hid]);

      res.json({
        ok: true,
        data: rows[0] || { totalDepartments: 0, avgScore: 0, totalRecords: 0 }
      });
    } catch (err) {
      console.error('GET /api/pressganey/summary error:', err);
      next(err);
    }
  }
);

/**
 * GET /api/pressganey/data
 * جلب جميع البيانات
 */
router.get(
  '/data',
  requireAuth,
  requirePermission('PRESSGANEY_VIEW'),
  resolveHospitalId,
  attachHospitalPool,
  async (req, res, next) => {
    try {
      const pool = req.hospitalPool;
      const hid = req.hospitalId;
      const { quarter, year, department } = req.query;

      let sql = `
        SELECT 
          id,
          department_key,
          department_name_ar,
          department_name_en,
          question_code,
          question_text_en,
          question_text_ar,
          satisfied_count,
          not_satisfied_count,
          mean_score,
          diff,
          quarter,
          year,
          created_at,
          updated_at
        FROM pressganey_data
        WHERE HospitalID = ?
      `;
      const args = [hid];

      if (quarter) {
        sql += ' AND quarter = ?';
        args.push(quarter);
      }
      if (year) {
        sql += ' AND year = ?';
        args.push(Number(year));
      }
      if (department) {
        sql += ' AND department_key = ?';
        args.push(department);
      }

      sql += ' ORDER BY year DESC, quarter DESC, department_name_ar';

      const [rows] = await pool.query(sql, args);

      res.json({
        ok: true,
        data: rows
      });
    } catch (err) {
      console.error('GET /api/pressganey/data error:', err);
      next(err);
    }
  }
);

// تم نقل معالجة Excel إلى الواجهة (pressganey.js)
// مسار /import تم تعطيله - المعالجة تتم في الواجهة الآن

/**
 * POST /api/pressganey/save
 * حفظ البيانات المعالجة من الواجهة في قاعدة البيانات
 * يتوقع: { quarter, year, rows, questions }
 */
router.post(
  '/save',
  requireAuth,
  requirePermission('PRESSGANEY_IMPORT'),
  resolveHospitalId,
  attachHospitalPool,
  async (req, res, next) => {
    try {
      const pool = req.hospitalPool;
      const hid = req.hospitalId;
      const { quarter, year, rows, questions } = req.body;

      // دعم التنسيق القديم أيضاً
      const data = rows || req.body.data || [];

      if (!Array.isArray(data) || !data.length) {
        return res.status(400).json({ ok: false, message: 'لا توجد بيانات للحفظ' });
      }

      const conn = await pool.getConnection();
      let saved = 0;
      let errors = 0;

      try {
        await conn.beginTransaction();

        for (const item of data) {
          try {
            // استخدام quarter و year من body إذا لم تكن موجودة في item
            const itemQuarter = item.quarter || quarter || 'Q1';
            const itemYear = item.year || year || new Date().getFullYear();

            await conn.query(`
              INSERT INTO pressganey_data
              (HospitalID, department_key, department_name_ar, department_name_en,
               question_code, question_text_en, question_text_ar,
               satisfied_count, not_satisfied_count, mean_score, diff,
               quarter, year, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
              ON DUPLICATE KEY UPDATE
                department_name_ar = VALUES(department_name_ar),
                department_name_en = VALUES(department_name_en),
                question_text_en = VALUES(question_text_en),
                question_text_ar = VALUES(question_text_ar),
                satisfied_count = VALUES(satisfied_count),
                not_satisfied_count = VALUES(not_satisfied_count),
                mean_score = VALUES(mean_score),
                diff = VALUES(diff),
                quarter = VALUES(quarter),
                year = VALUES(year),
                updated_at = NOW()
            `, [
              hid,
              item.department_key || item.departmentKey || 'غير محدد',
              item.department_name_ar || item.departmentNameAr || null,
              item.department_name_en || item.departmentNameEn || null,
              item.question_code || item.questionCode || null,
              item.question_text_en || item.questionTextEn || '',
              item.question_text_ar || item.questionTextAr || null,
              item.satisfied_count || item.satisfiedCount || item.nsize || 0,
              item.not_satisfied_count || item.notSatisfiedCount || 0,
              item.mean_score || item.meanScore || 0,
              item.diff || 0,
              itemQuarter,
              itemYear
            ]);
            saved++;
          } catch (e) {
            console.error('Save item error:', e);
            errors++;
          }
        }

        await conn.commit();
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }

      res.json({
        ok: true,
        saved,
        errors,
        message: `✅ تم حفظ ${saved} سجل بنجاح${errors > 0 ? `، ${errors} أخطاء` : ''}`
      });
    } catch (err) {
      console.error('POST /api/pressganey/save error:', err);
      next(err);
    }
  }
);

export default router;

