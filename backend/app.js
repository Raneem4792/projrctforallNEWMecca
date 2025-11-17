// app.js
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

// تحميل متغيرات البيئة في أول السطر
dotenv.config();

// التحقق من المتغيرات الأساسية عند بدء التطبيق
const requiredEnvVars = ['CENTRAL_DB_HOST', 'CENTRAL_DB_USER', 'CENTRAL_DB_NAME'];
const missingVars = requiredEnvVars.filter(v => !process.env[v]);

if (missingVars.length > 0) {
  console.error('❌ خطأ: متغيرات البيئة التالية مفقودة في ملف .env:');
  missingVars.forEach(v => console.error(`   - ${v}`));
  console.error('\nأضف هذه المتغيرات إلى ملف .env:');
  console.error('CENTRAL_DB_HOST=127.0.0.1');
  console.error('CENTRAL_DB_USER=root');
  console.error('CENTRAL_DB_PASS=SamarAmer12345@');
  console.error('CENTRAL_DB_NAME=hospitals_mecca3\n');
  // لا نوقف التطبيق، فقط تحذير
}

import authRoutes from './routes/auth.routes.js';
import healthRoutes from './routes/health.routes.js';
import departmentsNewRoutes from './routes/departments-new.js';
import departmentsRoutes from './routes/departments.js'; // Multi-tenant departments
import complaintTransfersRoutes from './routes/complaintTransfers.js'; // Transfer routes
import complaintsListRoutes from './routes/complaints-list.js';
import debugRoutes from './routes/debug.js';
import lookupRoutes from './routes/lookups.js';
import adminDepartmentRoutes from './routes/admin-departments.js';
import adminHospitalsRoutes from './routes/admin-hospitals.js';
import metaRoutes from './routes/meta.js';
import complaintRoutes from './routes/complaints.js';
import complaintsRouterMultiTenant from './routes/complaints.routes.js'; // Multi-tenant
import employeeRoutes from './routes/employees.js';
import hospitalRoutes from './routes/hospitals.js';
import hospitalsRoutes from './routes/hospitals.routes.js';
import permissionsRoutes from './routes/permissions.routes.js';
import userRoutes from './routes/users.js';
import usersRoutes from './routes/users.js'; // Multi-tenant users
import logsRoutes from './routes/logs.js';
import dashboardTotalRouter from './routes/dashboardTotal.js';
import complaintsRouter from './routes/complaints.js';
import trashRoutes from './routes/trash.js';
import complaintResponsesRoutes from './routes/complaintResponses.js';
import mysteryResponsesRoutes from './routes/mysteryResponses.js';
import complaintStatusesRoutes from './routes/complaintStatuses.js';
import complaintsDeleteRoutes from './routes/complaints-delete.js';
import complaintTargetsRoutes from './routes/complaintTargets.js';
import utilsRoutes from './routes/utils.routes.js';
import complaintsTransferRoutes from './routes/complaints.transfer.routes.js';
import { startComplaintTransferProcessor } from './services/complaintTransferProcessor.js';
import metaRoutesNew from './routes/meta.routes.js';
import projectsRoutes from './routes/projects.routes.js';
import improvementsRoutes from './routes/improvements.routes.js';
import improvements937Routes from './routes/improvements937.routes.js';
import imports937Routes from './routes/imports937.routes.js';
import mysteryComplaintsRoutes from './routes/mystery-complaints.routes.js';
import mysteryDashboardRoutes from './routes/mystery-dashboard.routes.js';
import centralRoutes from './routes/central.routes.js';
import publicComplaintsRoutes from './routes/public-complaints.js';
import publicStatsRoutes from './routes/publicStats.js';
import archiveRoutes from './routes/archiveRoutes.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import clusterReportsRoutes from './routes/clusterReports.js';
import reportsRoutes from './routes/reports.routes.js';
import pressganeyRoutes from './routes/pressganeyRoutes.js';
import hospitalTripsRoutes from './routes/hospitalTrips.js';
import path from 'path';
import { fileURLToPath } from 'url';
import improvementPressganeyRoutes from './routes/improvementPressganey.routes.js';

// تأكيد تحميل reports routes
console.log('📦 [app.js] جاري تحميل reports routes...');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// الأمان والأداء
// تعطيل بعض إعدادات helmet التي قد تمنع تحميل CSS/JS
app.use(helmet({
  contentSecurityPolicy: false, // تعطيل CSP لتجنب مشاكل تحميل الموارد
  crossOriginEmbedderPolicy: false
}));
// زيادة حجم body limit لاستيعاب الصور الكبيرة (base64)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(morgan('dev'));

// إعدادات CORS (يتم إعادة استخدامها لضمان الاتساق)
const corsOptions = {
  origin: [
    'http://127.0.0.1:5500',
    'http://127.0.0.1:5501', // ✅ إضافة المنفذ 5501
    'http://localhost:5500',
    'http://localhost:5501', // ✅ إضافة المنفذ 5501
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001'
  ],
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Hospital-Id','X-Requested-With'],
  credentials: true
};

app.use(cors(corsOptions));

// ✅ رد على preflight للجميع (لضمان عمل CORS)
app.options('*', cors(corsOptions));

// اختبار صحة الخدمة
app.get('/api/health', (req, res) => res.json({ 
  ok: true, 
  message: 'API يعمل بشكل صحيح',
  timestamp: new Date().toISOString()
}));

// ملفات الرفع (المرفقات)
app.use('/api/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/uploads/response-attachments', express.static(path.join(__dirname, 'uploads', 'response-attachments')));
app.use('/api/uploads/responses', express.static(path.join(__dirname, 'uploads', 'responses')));

// إعداد إضافي لضمان عرض الملفات
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ✅ خدمة الملفات الثابتة للواجهة (aliases متعددة لدعم المسارات القديمة والجديدة)
const publicPath = path.join(__dirname, '..', 'NewProjectMecca', 'public');

// Middleware لتسجيل طلبات الملفات الثابتة (للتشخيص)
app.use((req, res, next) => {
  if (req.url.includes('/assets/') || req.url.includes('/public/') || req.url.includes('/NewProjectMecca/') || req.url.endsWith('.css') || req.url.endsWith('.js') || req.url.endsWith('.html')) {
    console.log(`📦 Static file request: ${req.method} ${req.url}`);
  }
  next();
});

// إعدادات static files مع MIME types صحيحة
const staticOptions = {
  setHeaders: (res, filePath) => {
    // تعيين Content-Type بشكل صريح حسب نوع الملف
    if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
      console.log(`✅ Serving CSS: ${filePath}`);
    } else if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      console.log(`✅ Serving JS: ${filePath}`);
    } else if (filePath.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
    } else if (filePath.endsWith('.png')) {
      res.setHeader('Content-Type', 'image/png');
    } else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
      res.setHeader('Content-Type', 'image/jpeg');
    }
    // تعطيل cache أثناء التطوير
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
};

// خدمة الأصول على المسار /public/assets (الأولوية الأعلى - للروابط النسبية)
app.use('/public/assets', express.static(path.join(publicPath, 'assets'), staticOptions));

// خدمة الأصول على المسار /assets (مهم جداً للـ CSS و JS)
app.use('/assets', express.static(path.join(publicPath, 'assets'), staticOptions));

// خدمة المجلد public على المسار /public (للتوافق مع الروابط القديمة)
app.use('/public', express.static(publicPath, staticOptions));

// خدمة المجلد public على الجذر (للمسارات الجديدة النظيفة)
app.use(express.static(publicPath, staticOptions));

// الصفحة الرئيسية والصفحات الثابتة
app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, '..', 'NewProjectMecca', 'index', 'index.html');
  res.sendFile(indexPath);
});

// معالج favicon (لتجنب 404)
app.get('/favicon.ico', (req, res) => {
  const faviconPath = path.join(__dirname, '..', 'NewProjectMecca', 'public', 'assets', 'img', 'logo.png');
  res.sendFile(faviconPath, (err) => {
    if (err) {
      res.status(204).end(); // No Content - تجاهل إذا لم يوجد
    }
  });
});

// خدمة مجلد NewProjectMecca الكامل على المسار /NewProjectMecca
const newProjectMeccaPath = path.join(__dirname, '..', 'NewProjectMecca');
app.use('/NewProjectMecca', express.static(newProjectMeccaPath, staticOptions));

// خدمة ملفات index
app.use('/index', express.static(path.join(__dirname, '..', 'NewProjectMecca', 'index'), staticOptions));

// خدمة ملفات dashboard
app.use('/dashboard', express.static(path.join(__dirname, '..', 'NewProjectMecca', 'dashboard'), staticOptions));

// Route مساعد لتوجيه صفحات auth و complaints
app.get('/auth/*', (req, res, next) => {
  const filePath = path.join(publicPath, req.path);
  res.sendFile(filePath, (err) => {
    if (err) next();
  });
});

app.get('/complaints/*', (req, res, next) => {
  const filePath = path.join(publicPath, req.path);
  res.sendFile(filePath, (err) => {
    if (err) next();
  });
});

app.get('/admin/*', (req, res, next) => {
  const filePath = path.join(publicPath, req.path);
  res.sendFile(filePath, (err) => {
    if (err) next();
  });
});

// المسارات الرئيسية
// ⚠️ ترتيب الـ routes مهم جداً: الـ specific routes يجب أن تأتي قبل الـ dynamic routes

// 0. Public routes (بدون توثيق) - لها الأولوية القصوى
app.use('/api/public', publicStatsRoutes); // إحصائيات الصفحة الرئيسية
app.use('/api/public', publicComplaintsRoutes); // بلاغات عامة

// 1. Routes ثابتة ومحددة (Specific routes) - لها الأولوية
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/debug', debugRoutes);
app.use('/api/lookups', lookupRoutes);
app.use('/api/admin/departments', adminDepartmentRoutes);
app.use('/api/admin/hospitals', adminHospitalsRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/hospitals', hospitalRoutes);
app.use('/api/hospitals', hospitalsRoutes);
app.use('/api/permissions', permissionsRoutes);
app.use('/api/users', userRoutes); // /api/users/...
app.use('/api/logs', logsRoutes);
app.use('/api/trash', trashRoutes);
app.use('/api/dashboard/total', dashboardTotalRouter);
app.use('/api/departments', departmentsNewRoutes);
app.use('/api/complaints-list', complaintsListRoutes);
app.use('/api', hospitalTripsRoutes);
app.use('/api', imports937Routes); // استيراد 937
app.use('/api', mysteryComplaintsRoutes); // بلاغات الزائر السري
app.use('/api', mysteryDashboardRoutes); // لوحة تحكم الزائر السري
app.use('/api', centralRoutes); // القاعدة المركزية
app.use('/api/complaints', complaintsRouterMultiTenant); // ✅ Multi-tenant (قواعد المستشفيات)
app.use('/api/complaints', complaintsRouter); // Single-tenant (fallback)
app.use('/api/projects', projectsRoutes);
app.use('/api/improvements/937', improvements937Routes); // مشاريع 937 المتخصصة
// ✅ ضع مسار PressGaney قبل المسارات العامة لتجنب التقاط /:id
app.use('/api/improvements', improvementPressganeyRoutes);
app.use('/api/improvements', improvementsRoutes); // مشاريع التحسين
app.use('/api/archive', archiveRoutes); // ركن الأرشيف ✅
app.use('/api/cluster-reports', clusterReportsRoutes); // بلاغات إدارة التجمع ✅
app.use('/api/pressganey', pressganeyRoutes); // Press Ganey ✅

// ✅ تقارير PDF/Excel - مع logging للتأكد
console.log('📦 [app.js] جاري تركيب reports routes على /api/reports...');
if (!reportsRoutes) {
  console.error('❌ [app.js] reportsRoutes is undefined!');
} else {
  console.log('✅ [app.js] reportsRoutes loaded successfully');
}
app.use('/api/reports', reportsRoutes); // تقارير PDF/Excel ✅

// Debug: تأكيد تسجيل routes
console.log('✅ Archive routes mounted at /api/archive');
console.log('✅ Reports routes mounted at /api/reports');
console.log('   - GET  /api/reports/test (اختباري)');
console.log('   - GET  /api/reports/summary.pdf');
console.log('   - POST /api/reports/summary.pdf');
console.log('   - GET  /api/archive/test (اختباري)');
console.log('   - POST /api/archive/upload');
console.log('   - GET  /api/archive/list');
console.log('   - GET  /api/archive/download/:fileId');

// 1.5. Public meta routes (قبل أي middleware يتطلب hospitalId)
app.use('/api', metaRoutes);
app.use('/api/meta', metaRoutesNew);

// 2. Routes محددة للردود والحالات - قبل usersRoutes لتجنب التداخل مع /:id
app.use('/api', complaintResponsesRoutes); // /api/reply-types, /api/complaints/:id/responses
app.use('/api', mysteryResponsesRoutes); // /api/mystery-complaints/:id/responses
app.use('/api', complaintStatusesRoutes); // /api/complaint-statuses, /api/complaints/:id/status
app.use('/api', complaintsDeleteRoutes); // /api/complaints/:id (DELETE) - حذف البلاغات
app.use('/api', complaintTargetsRoutes); // /api/complaint-targets - بلاغات الموظفين

// 3. Multi-tenant routes (تحتوي على dynamic params مثل /:id)
app.use('/api', departmentsRoutes); // Multi-tenant departments
app.use('/api', complaintTransfersRoutes); // Transfer routes
app.use('/api/complaints', complaintsTransferRoutes); // New transfer routes
app.use('/api', usersRoutes); // Multi-tenant users - ⚠️ يجب أن يكون بعد reply-types
app.use('/api/utils', utilsRoutes); // مسارات الأدوات المساعدة

console.log('✅ Mounted routes in correct order:');
console.log('   - /api/reply-types (before usersRoutes)');
console.log('   - /api/complaint-statuses (before usersRoutes)');
console.log('   - /api/users (multi-tenant, with /:id)');
console.log('   - Other multi-tenant routes');

// Logging middleware للتتبع (قبل notFound) - للتأكد من وصول الطلبات
app.use((req, res, next) => {
  if (req.path.startsWith('/api/reports')) {
    console.log(`🔍 [REQUEST] ${req.method} ${req.path}`, {
      hasAuth: !!req.headers.authorization,
      contentType: req.headers['content-type'],
      query: Object.keys(req.query).length ? req.query : null
    });
  }
  next();
});

// معالجة الأخطاء
app.use(notFound);
app.use(errorHandler);

// تشغيل الخادم
const port = process.env.PORT || 3001;
const host = process.env.HOST || 'localhost';

app.listen(port, host, () => {
  console.log(`🚀 API يعمل على http://${host}:${port}`);
  console.log(`🌐 يمكن الوصول أيضاً عبر: http://localhost:${port}`);
  console.log(`📊 Health Check: http://${host}:${port}/api/health`);
  console.log(`🔗 Central DB Test: http://${host}:${port}/api/health/db/central`);
  console.log(`🔐 Auth Routes: http://${host}:${port}/api/auth`);
  console.log(`🏥 Hospitals: http://${host}:${port}/api/hospitals`);
  console.log(`🏢 Departments: http://${host}:${port}/api/departments`);
  console.log(`📋 Lookups: http://${host}:${port}/api/lookups`);
  console.log(`🔍 Track Complaints: http://${host}:${port}/api/complaints/track`);
  
  // بدء خدمة معالجة تحويلات البلاغات بين المستشفيات
  startComplaintTransferProcessor();
});
