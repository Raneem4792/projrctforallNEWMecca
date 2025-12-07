// pressganeyRoutes.js - مسارات Press Ganey
import express from 'express';
import multer from 'multer';
import xlsx from 'xlsx';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissionGuard.js';
import { resolveHospitalId } from '../middleware/resolveHospitalId.js';
import { attachHospitalPool } from '../middleware/hospitalPool.js';
import * as hospitalPoolModule from '../middleware/hospitalPool.js';

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
          TripName,
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
 * Middleware مخصص: يتحقق من البيانات أولاً قبل تطبيق resolveHospitalId
 * إذا كان هناك hospitalId في الطلب أو كانت البيانات تحتوي على FacilityName، نتخطى middleware المستشفى
 */
async function conditionalHospitalMiddleware(req, res, next) {
  try {
    // التحقق من وجود hospitalId في الطلب
    const hospitalIdFromRequest = 
      Number(req.body.hospitalId) || 
      Number(req.body.HospitalID) || 
      Number(req.query.hospitalId) ||
      Number(req.headers['x-hospital-id']) ||
      null;

    const data = req.body.rows || req.body.data || [];
    const hasFacilityNames = Array.isArray(data) && data.some(item => item.FacilityName);
    
    // إذا كان هناك hospitalId محدد أو كان التنسيق الجديد (FacilityName)، نتخطى middleware المستشفى
    // لأننا سنتعامل معه في المعالج مباشرة
    if (hospitalIdFromRequest || hasFacilityNames) {
      return next();
    }
    
    // التنسيق القديم: نحتاج middleware المستشفى
    resolveHospitalId(req, res, () => {
      attachHospitalPool(req, res, next);
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/pressganey/save
 * حفظ البيانات المعالجة من الواجهة في قاعدة البيانات
 * يتوقع: { quarter, year, rows, questions }
 */
router.post(
  '/save',
  requireAuth,
  requirePermission('PRESSGANEY_IMPORT'),
  conditionalHospitalMiddleware,
  async (req, res, next) => {
    try {
      const { quarter, year, rows, questions } = req.body;
      const data = rows || req.body.data || [];

      if (!Array.isArray(data) || !data.length) {
        return res.status(400).json({ ok: false, message: 'لا توجد بيانات للحفظ' });
      }

      // التحقق من وجود hospitalId في الطلب (الأولوية الأولى)
      const hospitalIdFromRequest = 
        Number(req.body.hospitalId) || 
        Number(req.body.HospitalID) || 
        Number(req.query.hospitalId) ||
        Number(req.headers['x-hospital-id']) ||
        req.hospitalId ||
        null;

      // التحقق من وجود FacilityName (التنسيق الجديد)
      const hasFacilityNames = data.some(item => item.FacilityName);
      
      // إذا كان هناك hospitalId محدد في الطلب، استخدمه مباشرة
      // حتى لو كانت البيانات تحتوي على FacilityName (قد تكون خاطئة)
      if (hospitalIdFromRequest && hospitalIdFromRequest > 0) {
        console.log(`✅ استخدام hospitalId من الطلب: ${hospitalIdFromRequest}`);
        // استخدام hospitalId المحدد مباشرة
        const pool = await hospitalPoolModule.getHospitalPool(hospitalIdFromRequest);
        
        if (!pool) {
          return res.status(400).json({ 
            ok: false, 
            message: `تعذر الاتصال بقاعدة بيانات المستشفى ${hospitalIdFromRequest}` 
          });
        }

        const conn = await pool.getConnection();
        let saved = 0;
        let errors = 0;
        const errorDetails = [];

        try {
          await conn.beginTransaction();

          for (const item of data) {
            try {
              const itemQuarter = item.quarter || quarter || 'Q1';
              const itemYear = item.year || year || new Date().getFullYear();

              await conn.query(`
                INSERT INTO pressganey_data
                (HospitalID, TripName, department_key, department_name_ar, department_name_en,
                 question_code, question_text_en, question_text_ar,
                 satisfied_count, not_satisfied_count, mean_score, diff,
                 quarter, year, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
                ON DUPLICATE KEY UPDATE
                  TripName = VALUES(TripName),
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
                hospitalIdFromRequest,
                item.TripName || null,
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
              errorDetails.push({
                item: item.department_key || item.departmentKey || 'غير محدد',
                error: e.message
              });
            }
          }

          await conn.commit();
          console.log(`✅ تم حفظ ${saved} سجل بنجاح في المستشفى ${hospitalIdFromRequest}${errors > 0 ? `، ${errors} أخطاء` : ''}`);
        } catch (e) {
          await conn.rollback();
          console.error('Transaction error:', e);
          throw e;
        } finally {
          conn.release();
        }

        return res.json({
          ok: true,
          saved,
          errors,
          errorDetails: errors > 0 ? errorDetails : undefined,
          message: `✅ تم حفظ ${saved} سجل بنجاح${errors > 0 ? `، ${errors} أخطاء` : ''}`
        });
      }
      
      // إذا كانت البيانات تحتوي على FacilityName وليس هناك hospitalId محدد
      if (hasFacilityNames) {
        // حفظ البيانات لكل مستشفى بناءً على اسم المستشفى
        return await saveByFacilityName(req, res, data, quarter, year);
      }

      // التنسيق القديم: استخدام hospitalId من middleware
      const pool = req.hospitalPool;
      const hid = req.hospitalId;
      
      if (!pool || !hid) {
        return res.status(400).json({ 
          ok: false, 
          message: 'يجب تحديد المستشفى أولاً. أرسل hospitalId في body أو headers.' 
        });
      }

      const conn = await pool.getConnection();
      let saved = 0;
      let errors = 0;
      const errorDetails = [];

      try {
        await conn.beginTransaction();

        for (const item of data) {
          try {
            const itemQuarter = item.quarter || quarter || 'Q1';
            const itemYear = item.year || year || new Date().getFullYear();

            await conn.query(`
              INSERT INTO pressganey_data
              (HospitalID, TripName, department_key, department_name_ar, department_name_en,
               question_code, question_text_en, question_text_ar,
               satisfied_count, not_satisfied_count, mean_score, diff,
               quarter, year, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
              ON DUPLICATE KEY UPDATE
                TripName = VALUES(TripName),
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
              item.TripName || null,
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
            errorDetails.push({
              item: item.department_key || item.departmentKey || 'غير محدد',
              error: e.message
            });
          }
        }

        await conn.commit();
        
        console.log(`✅ تم حفظ ${saved} سجل بنجاح في المستشفى ${hid}${errors > 0 ? `، ${errors} أخطاء` : ''}`);
      } catch (e) {
        await conn.rollback();
        console.error('Transaction error:', e);
        throw e;
      } finally {
        conn.release();
      }

      res.json({
        ok: true,
        saved,
        errors,
        errorDetails: errors > 0 ? errorDetails : undefined,
        message: `✅ تم حفظ ${saved} سجل بنجاح${errors > 0 ? `، ${errors} أخطاء` : ''}`
      });
    } catch (err) {
      console.error('POST /api/pressganey/save error:', err);
      next(err);
    }
  }
);

// دالة حفظ البيانات لكل مستشفى بناءً على اسم المستشفى
async function saveByFacilityName(req, res, data, defaultQuarter, defaultYear) {
  const { getCentralPool } = await import('../db/centralPool.js');
  const mysql = await import('mysql2/promise');
  
  try {
    const centralPool = await getCentralPool();
    if (!centralPool) {
      return res.status(500).json({ ok: false, message: 'تعذر الاتصال بقاعدة البيانات المركزية' });
    }

    // جلب قائمة المستشفيات
    const [hospitals] = await centralPool.query(`
      SELECT HospitalID, NameAr, NameEn, DbHost, DbUser, DbPass, DbName
      FROM hospitals 
      WHERE IFNULL(IsActive, Active) = 1 AND DbName IS NOT NULL
    `);

    // إنشاء mapping بين أسماء المستشفيات و HospitalID
    const hospitalMap = {};
    hospitals.forEach(h => {
      const nameAr = (h.NameAr || '').toLowerCase().trim();
      const nameEn = (h.NameEn || '').toLowerCase().trim();
      hospitalMap[nameAr] = h;
      hospitalMap[nameEn] = h;
      // إضافة اختصارات شائعة
      if (nameAr.includes('عبدالله')) hospitalMap['king abdullah'] = h;
      if (nameAr.includes('فيصل')) hospitalMap['king faisal'] = h;
      if (nameAr.includes('عبدالعزيز')) hospitalMap['king abdulaziz'] = h;
    });

    // تجميع البيانات حسب المستشفى
    const dataByHospital = {};
    for (const item of data) {
      const facilityName = (item.FacilityName || '').toString().trim();
      if (!facilityName) continue;

      // البحث عن المستشفى (مطابقة جزئية)
      let hospital = null;
      const facilityLower = facilityName.toLowerCase();
      
      for (const [key, hosp] of Object.entries(hospitalMap)) {
        if (facilityLower.includes(key) || key.includes(facilityLower)) {
          hospital = hosp;
          break;
        }
      }

      // إذا لم نجد مطابقة، نبحث في القائمة مباشرة
      if (!hospital) {
        hospital = hospitals.find(h => 
          (h.NameAr && facilityLower.includes(h.NameAr.toLowerCase())) ||
          (h.NameEn && facilityLower.includes(h.NameEn.toLowerCase())) ||
          (h.NameAr && h.NameAr.toLowerCase().includes(facilityLower)) ||
          (h.NameEn && h.NameEn.toLowerCase().includes(facilityLower))
        );
      }

      if (!hospital) {
        console.warn(`⚠️ لم يتم العثور على مستشفى: ${facilityName}`);
        continue;
      }

      if (!dataByHospital[hospital.HospitalID]) {
        dataByHospital[hospital.HospitalID] = {
          hospital,
          items: []
        };
      }

      dataByHospital[hospital.HospitalID].items.push(item);
    }

    // حفظ البيانات لكل مستشفى
    let totalSaved = 0;
    let totalErrors = 0;
    const results = [];

    for (const [hospitalId, { hospital, items }] of Object.entries(dataByHospital)) {
      try {
        const hospitalPool = mysql.default.createPool({
          host: hospital.DbHost || process.env.CENTRAL_DB_HOST,
          user: hospital.DbUser || process.env.CENTRAL_DB_USER,
          password: typeof hospital.DbPass !== 'undefined' ? hospital.DbPass : process.env.CENTRAL_DB_PASS,
          database: hospital.DbName,
          waitForConnections: true,
          connectionLimit: 5
        });

        const conn = await hospitalPool.getConnection();
        let saved = 0;
        let errors = 0;
        const errorDetails = [];

        try {
          await conn.beginTransaction();

          for (const item of items) {
            try {
              const itemQuarter = item.quarter || defaultQuarter || 'Q1';
              const itemYear = item.year || defaultYear || new Date().getFullYear();

              await conn.query(`
                INSERT INTO pressganey_data
                (HospitalID, TripName, department_key, department_name_ar, department_name_en,
                 question_code, question_text_en, question_text_ar,
                 satisfied_count, not_satisfied_count, mean_score, diff,
                 quarter, year, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
                ON DUPLICATE KEY UPDATE
                  TripName = VALUES(TripName),
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
                hospital.HospitalID,
                item.TripName || null,
                item.department_key || item.departmentKey || 'Overall',
                item.department_name_ar || item.departmentNameAr || 'إجمالي',
                item.department_name_en || item.departmentNameEn || 'Overall',
                item.question_code || item.questionCode || 'overall_mean',
                item.question_text_en || item.questionTextEn || 'Overall Mean Score',
                item.question_text_ar || item.questionTextAr || 'متوسط السكور العام',
                item.satisfied_count || item.satisfiedCount || item.nsize || 0,
                item.not_satisfied_count || item.notSatisfiedCount || 0,
                item.mean_score || item.meanScore || 0,
                item.diff || 0,
                itemQuarter,
                itemYear
              ]);
              saved++;
            } catch (e) {
              console.error(`Save item error for ${hospital.NameAr}:`, e);
              errors++;
              errorDetails.push({
                hospital: hospital.NameAr || hospital.NameEn,
                item: item.department_key || item.departmentKey || 'غير محدد',
                error: e.message
              });
            }
          }

          await conn.commit();
          console.log(`✅ تم حفظ ${saved} سجل بنجاح في ${hospital.NameAr}${errors > 0 ? `، ${errors} أخطاء` : ''}`);
          totalSaved += saved;
          totalErrors += errors;
          results.push({
            hospital: hospital.NameAr || hospital.NameEn,
            saved,
            errors,
            errorDetails: errors > 0 ? errorDetails.filter(e => e.hospital === (hospital.NameAr || hospital.NameEn)) : undefined
          });
        } catch (e) {
          await conn.rollback();
          console.error(`Transaction error for ${hospital.NameAr}:`, e);
          throw e;
        } finally {
          conn.release();
          await hospitalPool.end();
        }
      } catch (err) {
        console.error(`Error saving data for hospital ${hospital.NameAr}:`, err);
        totalErrors += items.length;
      }
    }

    res.json({
      ok: true,
      saved: totalSaved,
      errors: totalErrors,
      results,
      message: `✅ تم حفظ ${totalSaved} سجل في ${results.length} مستشفى${totalErrors > 0 ? `، ${totalErrors} أخطاء` : ''}`
    });
  } catch (err) {
    console.error('Error in saveByFacilityName:', err);
    throw err;
  }
}

export default router;

