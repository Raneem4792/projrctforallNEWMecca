/**
 * @fileoverview Sync Routes - مسارات المزامنة بين المركز والمستشفيات
 * @description API endpoints لاستقبال ومعالجة أحداث المزامنة من المستشفيات
 * 
 * Endpoints:
 * - POST /api/sync/inbox       - استقبال أحداث من مستشفى
 * - GET  /api/sync/status      - حالة المزامنة
 * - POST /api/sync/process     - معالجة دفعة يدوياً
 * - GET  /api/sync/pending     - عرض الأحداث المعلقة
 * 
 * @requires express
 * @requires ../db/centralPool
 */

const express = require('express');
const router = express.Router();
const centralPool = require('../db/centralPool');

/**
 * POST /api/sync/inbox
 * استقبال أحداث المزامنة من مستشفى
 * 
 * Body:
 * {
 *   sourceHospitalId: number,
 *   events: [
 *     {
 *       LocalEventID: number,        // EventID في قاعدة المستشفى
 *       EntityType: string,          // 'COMPLAINT' | 'RESPONSE' | 'ATTACHMENT'
 *       Operation: string,           // 'INSERT' | 'UPDATE' | 'DELETE'
 *       GlobalID: string,            // UUID
 *       Payload: object              // JSON بيانات الكيان
 *     }
 *   ]
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   received: number,
 *   processed: number,
 *   failed: number,
 *   processedEventIds: number[],   // للتعليم في المستشفى
 *   errors: string[]
 * }
 */
router.post('/inbox', async (req, res) => {
  const conn = await centralPool.getConnection();
  
  try {
    const { sourceHospitalId, events } = req.body;

    // التحقق من المدخلات
    if (!sourceHospitalId || !Array.isArray(events) || events.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid sourceHospitalId or events array'
      });
    }

    // التحقق من وجود المستشفى
    const [hospitals] = await conn.query(
      'SELECT HospitalID, NameAr FROM hospitals WHERE HospitalID = ? AND IsActive = 1',
      [sourceHospitalId]
    );

    if (hospitals.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Hospital ${sourceHospitalId} not found or inactive`
      });
    }

    await conn.beginTransaction();

    const processedEventIds = [];
    const errors = [];
    let received = 0;
    let processed = 0;
    let failed = 0;

    // معالجة كل حدث
    for (const event of events) {
      received++;
      
      try {
        const { LocalEventID, EntityType, Operation, GlobalID, Payload } = event;

        // التحقق من الحقول المطلوبة
        if (!EntityType || !Operation || !Payload) {
          errors.push(`Event ${LocalEventID}: Missing required fields`);
          failed++;
          continue;
        }

        // إدراج في sync_inbox
        const [insertResult] = await conn.query(
          `INSERT INTO sync_inbox 
           (SourceHospitalID, EntityType, Operation, GlobalID, EntityID, Payload)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            sourceHospitalId,
            EntityType,
            Operation,
            GlobalID || null,
            LocalEventID || null,
            JSON.stringify(Payload)
          ]
        );

        const inboxId = insertResult.insertId;

        // معالجة الحدث فوراً
        try {
          await conn.query('CALL process_inbox_row(?)', [inboxId]);
          processedEventIds.push(LocalEventID);
          processed++;
        } catch (procErr) {
          // فشلت المعالجة لكن الحدث مُسجل في inbox للمحاولة لاحقاً
          errors.push(`Event ${LocalEventID}: ${procErr.message}`);
          failed++;
        }
      } catch (eventErr) {
        errors.push(`Event ${event.LocalEventID || 'unknown'}: ${eventErr.message}`);
        failed++;
      }
    }

    await conn.commit();

    res.json({
      success: true,
      hospitalId: sourceHospitalId,
      hospitalName: hospitals[0].NameAr,
      received,
      processed,
      failed,
      processedEventIds,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    await conn.rollback();
    console.error('Sync inbox error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    conn.release();
  }
});

/**
 * GET /api/sync/status
 * عرض إحصائيات حالة المزامنة
 * 
 * Response:
 * {
 *   totalInbox: number,
 *   pending: number,
 *   processed: number,
 *   failed: number,
 *   oldestPending: Date,
 *   byHospital: [...]
 * }
 */
router.get('/status', async (req, res) => {
  try {
    const [summary] = await centralPool.query(`
      SELECT 
        COUNT(*) as totalInbox,
        SUM(CASE WHEN ProcessedAt IS NULL THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN ProcessedAt IS NOT NULL THEN 1 ELSE 0 END) as processed,
        SUM(CASE WHEN RetryCount > 0 THEN 1 ELSE 0 END) as failed,
        MIN(CASE WHEN ProcessedAt IS NULL THEN CreatedAt END) as oldestPending
      FROM sync_inbox
    `);

    const [byHospital] = await centralPool.query(`
      SELECT 
        i.SourceHospitalID,
        h.NameAr as hospitalName,
        h.Code as hospitalCode,
        COUNT(*) as total,
        SUM(CASE WHEN i.ProcessedAt IS NULL THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN i.ProcessedAt IS NOT NULL THEN 1 ELSE 0 END) as processed,
        SUM(CASE WHEN i.RetryCount > 0 THEN 1 ELSE 0 END) as withErrors,
        MAX(i.CreatedAt) as lastReceived
      FROM sync_inbox i
      JOIN hospitals h ON h.HospitalID = i.SourceHospitalID
      GROUP BY i.SourceHospitalID, h.NameAr, h.Code
      ORDER BY lastReceived DESC
    `);

    const [recentErrors] = await centralPool.query(`
      SELECT 
        InboxID,
        SourceHospitalID,
        EntityType,
        Operation,
        GlobalID,
        ErrorMessage,
        RetryCount,
        CreatedAt
      FROM sync_inbox
      WHERE ErrorMessage IS NOT NULL
      ORDER BY CreatedAt DESC
      LIMIT 10
    `);

    res.json({
      success: true,
      summary: summary[0],
      byHospital,
      recentErrors
    });

  } catch (error) {
    console.error('Sync status error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/sync/process
 * معالجة دفعة من الأحداث المعلقة يدوياً
 * 
 * Body:
 * {
 *   batchSize: number (default: 100)
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   processed: number
 * }
 */
router.post('/process', async (req, res) => {
  try {
    const { batchSize = 100 } = req.body;

    await centralPool.query('CALL process_inbox_batch(?)', [batchSize]);

    // عد الأحداث المعالجة
    const [result] = await centralPool.query(`
      SELECT COUNT(*) as processed
      FROM sync_inbox
      WHERE ProcessedAt IS NOT NULL
        AND ProcessedAt >= DATE_SUB(NOW(), INTERVAL 1 MINUTE)
    `);

    res.json({
      success: true,
      processed: result[0].processed,
      batchSize
    });

  } catch (error) {
    console.error('Sync process error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/sync/pending
 * عرض الأحداث المعلقة (غير المعالجة)
 * 
 * Query:
 * - hospitalId: number (optional)
 * - limit: number (default: 50)
 * 
 * Response:
 * {
 *   success: true,
 *   events: [...]
 * }
 */
router.get('/pending', async (req, res) => {
  try {
    const { hospitalId, limit = 50 } = req.query;

    let query = `
      SELECT 
        i.InboxID,
        i.SourceHospitalID,
        h.NameAr as hospitalName,
        h.Code as hospitalCode,
        i.EntityType,
        i.Operation,
        i.GlobalID,
        i.EntityID,
        i.CreatedAt,
        i.RetryCount,
        i.ErrorMessage,
        TIMESTAMPDIFF(MINUTE, i.CreatedAt, NOW()) as ageMinutes,
        LEFT(CAST(i.Payload AS CHAR), 500) as payloadPreview
      FROM sync_inbox i
      JOIN hospitals h ON h.HospitalID = i.SourceHospitalID
      WHERE i.ProcessedAt IS NULL
    `;

    const params = [];
    
    if (hospitalId) {
      query += ' AND i.SourceHospitalID = ?';
      params.push(hospitalId);
    }

    query += ' ORDER BY i.CreatedAt ASC LIMIT ?';
    params.push(parseInt(limit));

    const [events] = await centralPool.query(query, params);

    res.json({
      success: true,
      count: events.length,
      events
    });

  } catch (error) {
    console.error('Sync pending error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/sync/retry/:inboxId
 * إعادة محاولة معالجة حدث فاشل
 * 
 * Response:
 * {
 *   success: true,
 *   message: string
 * }
 */
router.post('/retry/:inboxId', async (req, res) => {
  const conn = await centralPool.getConnection();
  
  try {
    const { inboxId } = req.params;

    await conn.beginTransaction();

    // إعادة تعيين حالة المعالجة
    await conn.query(`
      UPDATE sync_inbox
      SET ProcessedAt = NULL,
          ErrorMessage = NULL
      WHERE InboxID = ?
    `, [inboxId]);

    // محاولة المعالجة
    await conn.query('CALL process_inbox_row(?)', [inboxId]);

    // التحقق من النتيجة
    const [result] = await conn.query(`
      SELECT ProcessedAt, ErrorMessage
      FROM sync_inbox
      WHERE InboxID = ?
    `, [inboxId]);

    await conn.commit();

    const wasProcessed = result[0]?.ProcessedAt !== null;

    res.json({
      success: wasProcessed,
      message: wasProcessed ? 'تمت المعالجة بنجاح' : 'فشلت المعالجة',
      error: result[0]?.ErrorMessage
    });

  } catch (error) {
    await conn.rollback();
    console.error('Sync retry error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    conn.release();
  }
});

/**
 * DELETE /api/sync/cleanup
 * حذف الأحداث المعالجة القديمة
 * 
 * Query:
 * - daysOld: number (default: 30)
 * 
 * Response:
 * {
 *   success: true,
 *   deleted: number
 * }
 */
router.delete('/cleanup', async (req, res) => {
  try {
    const { daysOld = 30 } = req.query;

    const [result] = await centralPool.query(`
      DELETE FROM sync_inbox
      WHERE ProcessedAt IS NOT NULL
        AND ProcessedAt < DATE_SUB(NOW(), INTERVAL ? DAY)
    `, [parseInt(daysOld)]);

    res.json({
      success: true,
      deleted: result.affectedRows,
      daysOld: parseInt(daysOld)
    });

  } catch (error) {
    console.error('Sync cleanup error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;


