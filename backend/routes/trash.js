// routes/trash.js
import express from 'express';
import { 
  listTrash,
  listDeletedComplaints,
  restoreItem, 
  purgeItem, 
  emptyTrash,
  getTrashStats,
  getTrashItem
} from '../controllers/trashController.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

/**
 * @route   GET /api/trash/complaints
 * @desc    جلب البلاغات المحذوفة فقط حسب المستشفى
 * @access  Private (يتطلب مصادقة)
 * @query   hospitalId - معرّف المستشفى (مطلوب)
 */
router.get('/complaints', requireAuth, listDeletedComplaints);

/**
 * @route   GET /api/trash
 * @desc    جلب قائمة المحذوفات حسب المستشفى (جميع الأنواع)
 * @access  Private (يتطلب مصادقة)
 * @query   hospitalId - معرّف المستشفى (مطلوب)
 */
router.get('/', requireAuth, listTrash);

/**
 * @route   GET /api/trash/stats
 * @desc    جلب إحصائيات السلة
 * @access  Private
 * @query   hospitalId - معرّف المستشفى (اختياري - إذا لم يُرسل يجلب لكل المستشفيات)
 */
router.get('/stats', requireAuth, getTrashStats);

/**
 * @route   GET /api/trash/:id
 * @desc    جلب تفاصيل عنصر محذوف
 * @access  Private
 * @param   id - معرّف السجل في السلة
 */
router.get('/:id', requireAuth, getTrashItem);

/**
 * @route   POST /api/trash/:id/restore
 * @desc    استرجاع عنصر من السلة
 * @access  Private
 * @param   id - معرّف السجل في السلة
 */
router.post('/:id/restore', requireAuth, restoreItem);

/**
 * @route   DELETE /api/trash/:id
 * @desc    حذف نهائي لعنصر (تفريغ من السلة)
 * @access  Private (Admin فقط - يُفضل إضافة middleware للتحقق)
 * @param   id - معرّف السجل في السلة
 */
router.delete('/:id', requireAuth, purgeItem);

/**
 * @route   POST /api/trash/empty
 * @desc    تفريغ سلة مستشفى بالكامل
 * @access  Private (Admin فقط)
 * @body    { hospitalId: number }
 */
router.post('/empty', requireAuth, emptyTrash);

export default router;

