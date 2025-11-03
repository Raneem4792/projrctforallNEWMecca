import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { resolveHospitalId } from '../middleware/resolveHospitalId.js';
import { attachHospitalPool } from '../middleware/hospitalPool.js';
import { detectPriorityByKeywords, getPriorityInfo } from '../utils/priorityDetect.js';

const router = express.Router();

/**
 * POST /api/utils/priority-detect
 * معاينة فورية للأولوية بناءً على وصف البلاغ
 */
router.post('/priority-detect', requireAuth, resolveHospitalId, attachHospitalPool, async (req, res) => {
  try {
    const { description } = req.body || {};
    
    if (!description || typeof description !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'وصف البلاغ مطلوب'
      });
    }

    // استخراج الأولوية
    const detection = await detectPriorityByKeywords(req.hospitalPool, description);
    const priorityInfo = getPriorityInfo(detection.priority);

    res.json({
      success: true,
      priority: detection.priority,
      priorityInfo: priorityInfo,
      matched: detection.matched,
      description: description.substring(0, 100) + (description.length > 100 ? '...' : '')
    });

  } catch (error) {
    console.error('❌ خطأ في معاينة الأولوية:', error);
    res.status(500).json({
      success: false,
      message: 'خطأ في تحديد الأولوية',
      priority: 'MEDIUM'
    });
  }
});

/**
 * GET /api/utils/priority-keywords
 * جلب جميع الكلمات المفتاحية (للمراجعة)
 */
router.get('/priority-keywords', requireAuth, resolveHospitalId, attachHospitalPool, async (req, res) => {
  try {
    const [rows] = await req.hospitalPool.query(`
      SELECT Keyword, PriorityCode, Category, CreatedAt
      FROM priority_keywords
      ORDER BY PriorityCode DESC, Keyword ASC
    `);

    res.json({
      success: true,
      keywords: rows
    });

  } catch (error) {
    console.error('❌ خطأ في جلب الكلمات المفتاحية:', error);
    res.status(500).json({
      success: false,
      message: 'خطأ في جلب الكلمات المفتاحية'
    });
  }
});

export default router;
