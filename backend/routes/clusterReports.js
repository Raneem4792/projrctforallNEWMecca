// backend/routes/clusterReports.js
import express from 'express';
import { body, param, query } from 'express-validator';
import * as ctrl from '../controllers/clusterReportsController.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadCluster } from '../middleware/uploads.js';

const router = express.Router();

router.use(requireAuth);

// POST /api/cluster-reports - إنشاء بلاغ جديد
// ملاحظة: ترتيب middleware مهم - multer أولاً لقراءة FormData ثم validation
router.post('/',
  uploadCluster.array('attachments', 10),
  query('hospitalId').exists().withMessage('hospitalId مطلوب في query string').toInt(),
  body('title').trim().isLength({ min: 3 }).withMessage('العنوان يجب أن يكون 3 أحرف على الأقل'),
  body('description').trim().isLength({ min: 5 }).withMessage('الوصف يجب أن يكون 5 أحرف على الأقل'),
  body('priorityCode').optional().isIn(['LOW','MEDIUM','HIGH','CRITICAL']).withMessage('الأولوية غير صحيحة'),
  body('locationType').optional().isIn(['HOSPITAL','CLINIC','DEPARTMENT','OTHER']).withMessage('نوع الموقع غير صحيح'),
  body('departmentId').optional().isInt().withMessage('معرف القسم يجب أن يكون رقماً'),
  ctrl.createReport
);

// GET /api/cluster-reports - قائمة البلاغات
// hospitalId اختياري - إذا لم يُرسل، يتم جلب البيانات من جميع المستشفيات
router.get('/',
  query('hospitalId').optional().toInt(),
  query('status').optional().isIn(['OPEN','IN_PROGRESS','RESOLVED','CLOSED','CANCELLED']),
  query('priority').optional().isIn(['LOW','MEDIUM','HIGH','CRITICAL']),
  query('q').optional().isString(),
  query('page').optional().toInt(),
  query('pageSize').optional().toInt(),
  ctrl.listReports
);

// GET /api/cluster-reports/:id - تفاصيل بلاغ
router.get('/:id',
  query('hospitalId').exists().withMessage('hospitalId مطلوب').toInt(),
  param('id').isInt({ min: 1 }).withMessage('معرف البلاغ غير صحيح'),
  ctrl.getReportById
);

// PUT /api/cluster-reports/:id - تحديث بلاغ
router.put('/:id',
  query('hospitalId').exists().withMessage('hospitalId مطلوب').toInt(),
  param('id').isInt({ min: 1 }).withMessage('معرف البلاغ غير صحيح'),
  body('title').optional().isLength({ min: 3 }).withMessage('العنوان قصير جداً'),
  body('description').optional().isLength({ min: 5 }).withMessage('الوصف قصير جداً'),
  body('priorityCode').optional().isIn(['LOW','MEDIUM','HIGH','CRITICAL']),
  body('locationType').optional().isIn(['HOSPITAL','CLINIC','DEPARTMENT','OTHER']),
  body('departmentId').optional().isInt(),
  ctrl.updateReport
);

// PATCH /api/cluster-reports/:id/status - تغيير الحالة
router.patch('/:id/status',
  query('hospitalId').exists().withMessage('hospitalId مطلوب').toInt(),
  param('id').isInt({ min: 1 }).withMessage('معرف البلاغ غير صحيح'),
  body('status').isIn(['OPEN','IN_PROGRESS','RESOLVED','CLOSED','CANCELLED']).withMessage('الحالة غير صحيحة'),
  ctrl.changeStatus
);

// PATCH /api/cluster-reports/:id/assign - تعيين مستخدم
router.patch('/:id/assign',
  query('hospitalId').exists().withMessage('hospitalId مطلوب').toInt(),
  param('id').isInt({ min: 1 }).withMessage('معرف البلاغ غير صحيح'),
  body('assignedToUserId').isInt({ min: 1 }).withMessage('معرف المستخدم غير صحيح'),
  ctrl.assignReport
);

// POST /api/cluster-reports/:id/attachments - إضافة مرفقات
router.post('/:id/attachments',
  query('hospitalId').exists().withMessage('hospitalId مطلوب').toInt(),
  param('id').isInt({ min: 1 }).withMessage('معرف البلاغ غير صحيح'),
  uploadCluster.array('attachments', 10),
  ctrl.addAttachments
);

// DELETE /api/cluster-reports/:id/attachments/:attachmentId - حذف مرفق
router.delete('/:id/attachments/:attachmentId',
  query('hospitalId').exists().withMessage('hospitalId مطلوب').toInt(),
  param('id').isInt({ min: 1 }).withMessage('معرف البلاغ غير صحيح'),
  param('attachmentId').isInt({ min: 1 }).withMessage('معرف المرفق غير صحيح'),
  ctrl.deleteAttachment
);

// POST /api/cluster-reports/:id/responses - إضافة رد
router.post('/:id/responses',
  uploadCluster.array('attachments', 10),
  query('hospitalId').exists().withMessage('hospitalId مطلوب').toInt(),
  param('id').isInt({ min: 1 }).withMessage('معرف البلاغ غير صحيح'),
  body('replyText').trim().notEmpty().withMessage('نص الرد مطلوب'),
  ctrl.addResponse
);

// GET /api/cluster-reports/:id/responses - قائمة الردود
router.get('/:id/responses',
  query('hospitalId').exists().withMessage('hospitalId مطلوب').toInt(),
  param('id').isInt({ min: 1 }).withMessage('معرف البلاغ غير صحيح'),
  ctrl.listResponses
);

export default router;

