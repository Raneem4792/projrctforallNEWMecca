// routes/reports.routes.js
import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as reportsController from '../controllers/reportsController.js';

console.log('✅ reports.routes.js loaded');

const router = express.Router();

// Middleware لإضافة CORS headers لجميع الـ responses
router.use((req, res, next) => {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  next();
});

// معالجة OPTIONS requests (CORS preflight) - قبل requireAuth
router.options('*', (req, res) => {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  res.sendStatus(200);
});

// جميع مسارات التقارير تحتاج توثيق
router.use(requireAuth);

// تقرير ملخّص التجمع
router.get('/summary.excel', reportsController.exportSummaryExcel);
router.get('/summary.pdf', reportsController.exportSummaryPdf);
// ➜ إضافة POST عشان نستقبل صورة الرسم والجدول
router.post('/summary.pdf', reportsController.exportSummaryPdf);

// 🔸 تقرير البلاغات التفصيلية (Excel/PDF)
router.get('/details.excel', reportsController.exportDetailsExcel);
router.get('/details.pdf', reportsController.exportDetailsPdf);
// ➜ إضافة POST عشان نستقبل صورة الجدول
router.post('/details.pdf', reportsController.exportDetailsPdf);

// 🔸 تقرير أداء الأقسام (Excel/PDF)
router.get('/departments.excel', reportsController.exportDepartmentsExcel);
// ➜ Route لجلب بيانات أداء الأقسام
router.get('/departments/data', reportsController.getDepartmentsPerformanceData);
// ➜ POST لتقرير PDF مع صورة الرسم والجدول
router.post('/departments.pdf', reportsController.exportDepartmentsPdf);

// 🔸 تقرير أداء الموظفين (Excel/PDF)
router.get('/employees.excel', reportsController.exportEmployeesExcel);
// ➜ Route لجلب بيانات أداء الموظفين
router.get('/employees/data', reportsController.getEmployeesPerformanceData);
// ➜ POST لتقرير PDF مع صورة الرسم والجدول
router.post('/employees.pdf', reportsController.exportEmployeesPdf);

// 🔸 تقرير البلاغات الحرجة (Excel/PDF)
router.get('/critical.excel', reportsController.exportCriticalExcel);
// ➜ Route لجلب بيانات البلاغات الحرجة
router.get('/critical/data', reportsController.getCriticalComplaintsData);
// ➜ POST لتقرير PDF مع صورة الجدول
router.post('/critical.pdf', reportsController.exportCriticalPdf);

// Route اختباري للتأكد من أن الـ router يعمل
router.get('/test', (req, res) => {
  res.json({ ok: true, route: 'reports test', message: 'reports routes working!' });
});

console.log('✅ reports.routes.js mounted at /api/reports');

export default router;

