// backend/routes/publicStats.js
import express from 'express';
import { getCentralPool } from '../db/centralPool.js';
import { getTenantPoolByHospitalId } from '../db/tenantManager.js';

const router = express.Router();

/**
 * GET /api/public/landing-stats
 * يرجّع إحصائيات الصفحة الرئيسية محسوبة مباشرة من قواعد بيانات المستشفيات:
 * - عدد البلاغات: COUNT(*) من complaints في كل قاعدة فرعية (جميع البلاغات)
 * - عدد المستفيدين: COUNT(DISTINCT PatientIDNumber) من جميع قواعد بيانات المستشفيات
 * - عدد المستشفيات: SELECT COUNT(*) FROM hospitals WHERE IsActive=1 من القاعدة المركزية
 */
router.get('/landing-stats', async (req, res) => {
  try {
    const central = await getCentralPool();

    // 🏥 1. جلب جميع المستشفيات الفعالة من القاعدة المركزية
    const [hospitals] = await central.query(`
      SELECT HospitalID, DbHost, DbUser, DbPass, DbName, NameAr
      FROM hospitals
      WHERE IsActive = 1
    `);

    let totalComplaints = 0;
    let totalPatients = new Set();
    const totalHospitals = hospitals.length;

    // 🧮 2. المرور على كل مستشفى وحساب بياناته
    for (const h of hospitals) {
      try {
        const pool = await getTenantPoolByHospitalId(h.HospitalID);

        // عدد البلاغات (جميع البلاغات)
        const [complaints] = await pool.query(`
          SELECT COUNT(*) AS cnt FROM complaints
        `);
        totalComplaints += complaints[0]?.cnt || 0;

        // عدد المستفيدين (DISTINCT PatientIDNumber)
        const [patients] = await pool.query(`
          SELECT DISTINCT PatientIDNumber FROM complaints
          WHERE PatientIDNumber IS NOT NULL AND PatientIDNumber <> ''
        `);
        patients.forEach(p => {
          if (p.PatientIDNumber) {
            totalPatients.add(p.PatientIDNumber);
          }
        });

      } catch (err) {
        console.warn(`⚠️ خطأ في ${h.NameAr} (HospitalID: ${h.HospitalID}):`, err.message);
        // نكمل مع المستشفيات الأخرى
      }
    }

    // 🔢 3. إرسال النتائج النهائية
    res.json({
      totalComplaintsProcessed: totalComplaints,
      activeBeneficiaries: totalPatients.size,
      hospitalCoveragePercent: totalHospitals // عدد المستشفيات النشطة
    });

  } catch (err) {
    console.error('❌ landing-stats error:', err);
    // في حالة الخطأ، نرجع القيم الافتراضية
    res.status(500).json({
      totalComplaintsProcessed: 15000,
      activeBeneficiaries: 5000,
      hospitalCoveragePercent: 100
    });
  }
});

const footerDefaults = {
  orgName: process.env.FOOTER_ORG_NAME || 'تجمع مكة الصحي',
  systemName: process.env.FOOTER_SYSTEM_NAME || 'نظام البلاغات',
  description: process.env.FOOTER_DESCRIPTION || 'منصة رسمية لتقديم ومتابعة البلاغات',
  support1: process.env.FOOTER_SUPPORT_NUMBER_1 || '0559735137',
  support2: process.env.FOOTER_SUPPORT_NUMBER_2 || '0542282550',
  email: process.env.FOOTER_SUPPORT_EMAIL || 'support@makkahhealth.gov.sa',
  hours: process.env.FOOTER_WORKING_HOURS || '24/7'
};

router.get('/footer-info', (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        ...footerDefaults
      }
    });
  } catch (error) {
    console.error('❌ footer-info error:', error);
    res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء تحميل بيانات الفوتر'
    });
  }
});

export default router;

