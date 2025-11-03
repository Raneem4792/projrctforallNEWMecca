// backend/routes/health.routes.js
import express from 'express';
import { getCentralPool } from '../db/centralPool.js';

const router = express.Router();

// اختبار الاتصال بالقاعدة المركزية
router.get('/db/central', async (req, res) => {
  try {
    const db = await getCentralPool();
    const [r] = await db.query('SELECT 1 AS ok');
    res.json({ 
      success: true,
      ok: r[0].ok === 1,
      message: 'الاتصال بالقاعدة المركزية ناجح'
    });
  } catch (e) {
    console.error('❌ خطأ في الاتصال بالقاعدة المركزية:', e);
    res.status(500).json({ 
      success: false,
      ok: false, 
      error: e.message,
      message: 'فشل الاتصال بالقاعدة المركزية'
    });
  }
});

// اختبار الاتصال بقاعدة المستشفى
router.get('/db/tenant/:hospitalId', async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const { getTenantPoolByHospitalId } = await import('../db/tenantManager.js');
    const db = await getTenantPoolByHospitalId(Number(hospitalId));
    const [r] = await db.query('SELECT 1 AS ok');
    res.json({ 
      success: true,
      ok: r[0].ok === 1,
      message: `الاتصال بقاعدة المستشفى ${hospitalId} ناجح`
    });
  } catch (e) {
    console.error(`❌ خطأ في الاتصال بقاعدة المستشفى ${req.params.hospitalId}:`, e);
    res.status(500).json({ 
      success: false,
      ok: false, 
      error: e.message,
      message: `فشل الاتصال بقاعدة المستشفى ${req.params.hospitalId}`
    });
  }
});

// اختبار جدول المشاريع التحسينية في قاعدة المستشفى
router.get('/db/tenant/:hospitalId/improvements', async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const { getTenantPoolByHospitalId } = await import('../db/tenantManager.js');
    const db = await getTenantPoolByHospitalId(Number(hospitalId));
    
    // التحقق من وجود الجدول
    const [tables] = await db.query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'improvement_projects'
    `);
    
    if (tables.length === 0) {
      return res.status(404).json({
        success: false,
        ok: false,
        error: 'Table not found',
        message: `جدول improvement_projects غير موجود في قاعدة المستشفى ${hospitalId}`
      });
    }
    
    // التحقق من عدد السجلات
    const [count] = await db.query('SELECT COUNT(*) as count FROM improvement_projects WHERE IsDeleted = 0');
    
    res.json({ 
      success: true,
      ok: true,
      tableExists: true,
      recordCount: count[0].count,
      message: `جدول improvement_projects موجود في قاعدة المستشفى ${hospitalId} ويحتوي على ${count[0].count} سجل`
    });
  } catch (e) {
    console.error(`❌ خطأ في التحقق من جدول المشاريع في المستشفى ${req.params.hospitalId}:`, e);
    res.status(500).json({ 
      success: false,
      ok: false, 
      error: e.message,
      message: `فشل في التحقق من جدول المشاريع في المستشفى ${req.params.hospitalId}`
    });
  }
});

// اختبار جدول الزائر السري في قاعدة المستشفى
router.get('/db/tenant/:hospitalId/mystery', async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const { getTenantPoolByHospitalId } = await import('../db/tenantManager.js');
    const db = await getTenantPoolByHospitalId(Number(hospitalId));
    
    // التحقق من وجود الجدول
    const [tables] = await db.query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'mystery_complaints'
    `);
    
    if (tables.length === 0) {
      return res.status(404).json({
        success: false,
        ok: false,
        error: 'Table not found',
        message: `جدول mystery_complaints غير موجود في قاعدة المستشفى ${hospitalId}`
      });
    }
    
    // التحقق من عدد السجلات
    const [count] = await db.query('SELECT COUNT(*) as count FROM mystery_complaints');
    
    // جلب عينة من البيانات
    const [sample] = await db.query(`
      SELECT MysteryID, HospitalID, DomainAr, QuestionAr, Status, Priority, CreatedAt
      FROM mystery_complaints 
      ORDER BY CreatedAt DESC 
      LIMIT 5
    `);
    
    res.json({ 
      success: true,
      ok: true,
      tableExists: true,
      recordCount: count[0].count,
      sampleData: sample,
      message: `جدول mystery_complaints موجود في قاعدة المستشفى ${hospitalId} ويحتوي على ${count[0].count} سجل`
    });
  } catch (e) {
    console.error(`❌ خطأ في التحقق من جدول الزائر السري في المستشفى ${req.params.hospitalId}:`, e);
    res.status(500).json({ 
      success: false,
      ok: false, 
      error: e.message,
      message: `فشل في التحقق من جدول الزائر السري في المستشفى ${req.params.hospitalId}`
    });
  }
});

// اختبار عام للصحة
router.get('/', (req, res) => {
  res.json({ 
    success: true,
    message: 'API يعمل بشكل صحيح',
    timestamp: new Date().toISOString(),
    env: {
      CENTRAL_DB_HOST: process.env.CENTRAL_DB_HOST || 'غير محدد',
      CENTRAL_DB_USER: process.env.CENTRAL_DB_USER || 'غير محدد',
      CENTRAL_DB_NAME: process.env.CENTRAL_DB_NAME || 'غير محدد'
    }
  });
});

export default router;
