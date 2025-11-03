/**
 * @fileoverview Sync Worker - عامل المزامنة التلقائية
 * @description يسحب أحداث outbox من قواعد المستشفيات ويرسلها للمركز
 * 
 * Features:
 * - يعمل كخلفية (background job) كل دقيقة
 * - يتصل بكل قاعدة مستشفى نشطة
 * - يسحب الأحداث غير المعالجة
 * - يرسلها لـ API المركزي
 * - يعلّم الأحداث كـ "معالجة" في المستشفى
 * - يسجل الأخطاء والإحصائيات
 * 
 * Usage:
 *   const syncWorker = require('./workers/sync-worker');
 *   syncWorker.start();  // بدء التشغيل التلقائي
 *   syncWorker.stop();   // إيقاف
 *   await syncWorker.runOnce(); // تشغيل يدوي
 * 
 * @requires mysql2
 * @requires axios
 * @requires ../db/centralPool
 */

const mysql = require('mysql2/promise');
const axios = require('axios');
const centralPool = require('../db/centralPool');

// ===== الإعدادات =====
const CONFIG = {
  // فاصل زمني بين كل دورة مزامنة (بالملي ثانية)
  intervalMs: 60 * 1000, // دقيقة واحدة
  
  // عدد الأحداث المسحوبة في كل دفعة من كل مستشفى
  batchSize: 500,
  
  // الحد الأقصى لمحاولات إعادة الإرسال
  maxRetries: 3,
  
  // مهلة الاتصال بقواعد المستشفيات
  dbTimeout: 10000, // 10 ثواني
  
  // عنوان API المركزي (localhost في الإنتاج سيكون نفس الخادم)
  centralApiUrl: process.env.CENTRAL_API_URL || 'http://localhost:3000/api/sync/inbox',
  
  // تفعيل/تعطيل السجلات التفصيلية
  verbose: process.env.SYNC_VERBOSE === 'true' || false
};

// ===== المتغيرات العامة =====
let intervalId = null;
let isRunning = false;
let stats = {
  totalRuns: 0,
  totalEventsSynced: 0,
  totalErrors: 0,
  lastRun: null,
  lastSuccess: null,
  lastError: null
};

/**
 * اتصال بقاعدة بيانات مستشفى
 * @param {object} hospital - بيانات المستشفى من جدول hospitals
 * @returns {Promise<mysql.Connection>}
 */
async function connectToHospital(hospital) {
  try {
    const connection = await mysql.createConnection({
      host: hospital.DbHost || 'localhost',
      user: hospital.DbUser || 'root',
      password: hospital.DbPass || '',
      database: hospital.DbName,
      timezone: '+03:00',
      connectTimeout: CONFIG.dbTimeout
    });

    if (CONFIG.verbose) {
      console.log(`✓ اتصال ناجح بـ ${hospital.NameAr} (${hospital.DbName})`);
    }

    return connection;
  } catch (error) {
    console.error(`✗ فشل الاتصال بـ ${hospital.NameAr}:`, error.message);
    throw error;
  }
}

/**
 * سحب أحداث outbox غير المعالجة من مستشفى
 * @param {mysql.Connection} conn - اتصال قاعدة المستشفى
 * @param {number} limit - عدد الأحداث
 * @returns {Promise<Array>}
 */
async function fetchOutboxEvents(conn, limit) {
  const [events] = await conn.query(`
    SELECT 
      EventID,
      EventType,
      AggregateType,
      AggregateGlobalID,
      HospitalID,
      Payload,
      OccurredAt
    FROM outbox_events
    WHERE Processed = 0
    ORDER BY EventID ASC
    LIMIT ?
  `, [limit]);

  return events;
}

/**
 * تحويل نوع الحدث من المستشفى إلى تنسيق المركز
 * @param {string} eventType - نوع الحدث من المستشفى
 * @param {string} aggregateType - نوع الكيان
 * @returns {object} { EntityType, Operation }
 */
function mapEventToOperation(eventType, aggregateType) {
  const mapping = {
    'COMPLAINT_CREATED': { EntityType: 'COMPLAINT', Operation: 'INSERT' },
    'COMPLAINT_UPDATED': { EntityType: 'COMPLAINT', Operation: 'UPDATE' },
    'COMPLAINT_DELETED': { EntityType: 'COMPLAINT', Operation: 'DELETE' },
    'RESPONSE_ADDED': { EntityType: 'RESPONSE', Operation: 'INSERT' }
  };

  return mapping[eventType] || { 
    EntityType: aggregateType.toUpperCase(), 
    Operation: 'INSERT' 
  };
}

/**
 * إرسال الأحداث إلى API المركزي
 * @param {number} hospitalId - معرّف المستشفى
 * @param {Array} events - قائمة الأحداث
 * @returns {Promise<object>} - استجابة API
 */
async function sendToCentral(hospitalId, events) {
  // تحويل الأحداث للتنسيق المطلوب
  const formattedEvents = events.map(e => {
    const { EntityType, Operation } = mapEventToOperation(e.EventType, e.AggregateType);
    
    return {
      LocalEventID: e.EventID,
      EntityType,
      Operation,
      GlobalID: e.AggregateGlobalID,
      Payload: typeof e.Payload === 'string' ? JSON.parse(e.Payload) : e.Payload
    };
  });

  try {
    const response = await axios.post(CONFIG.centralApiUrl, {
      sourceHospitalId: hospitalId,
      events: formattedEvents
    }, {
      timeout: 30000, // 30 ثانية
      headers: {
        'Content-Type': 'application/json',
        'X-Sync-Worker': 'true'
      }
    });

    return response.data;
  } catch (error) {
    if (error.response) {
      // الخادم رد بخطأ
      throw new Error(`API Error ${error.response.status}: ${error.response.data?.error || error.message}`);
    } else if (error.request) {
      // لم يصل الطلب
      throw new Error('فشل الوصول لـ API المركزي - تحقق من الاتصال');
    } else {
      throw error;
    }
  }
}

/**
 * تعليم الأحداث كـ "معالجة" في قاعدة المستشفى
 * @param {mysql.Connection} conn - اتصال المستشفى
 * @param {Array<number>} eventIds - معرّفات الأحداث
 */
async function markEventsAsProcessed(conn, eventIds) {
  if (eventIds.length === 0) return;

  await conn.query(`
    UPDATE outbox_events
    SET Processed = 1,
        ProcessedAt = NOW()
    WHERE EventID IN (?)
  `, [eventIds]);

  if (CONFIG.verbose) {
    console.log(`  ✓ تم تعليم ${eventIds.length} حدث كمعالج`);
  }
}

/**
 * معالجة مزامنة مستشفى واحد
 * @param {object} hospital - بيانات المستشفى
 * @returns {Promise<object>} - إحصائيات المزامنة
 */
async function syncHospital(hospital) {
  let conn = null;
  const result = {
    hospitalId: hospital.HospitalID,
    hospitalName: hospital.NameAr,
    success: false,
    eventsFetched: 0,
    eventsSent: 0,
    eventsFailed: 0,
    error: null
  };

  try {
    // 1. الاتصال بالمستشفى
    conn = await connectToHospital(hospital);

    // 2. سحب الأحداث غير المعالجة
    const events = await fetchOutboxEvents(conn, CONFIG.batchSize);
    result.eventsFetched = events.length;

    if (events.length === 0) {
      if (CONFIG.verbose) {
        console.log(`  ℹ️ ${hospital.NameAr}: لا توجد أحداث جديدة`);
      }
      result.success = true;
      return result;
    }

    console.log(`📤 ${hospital.NameAr}: جاري إرسال ${events.length} حدث...`);

    // 3. إرسال للمركز
    const centralResponse = await sendToCentral(hospital.HospitalID, events);

    result.eventsSent = centralResponse.processed || 0;
    result.eventsFailed = centralResponse.failed || 0;

    // 4. تعليم الأحداث الناجحة
    if (centralResponse.processedEventIds && centralResponse.processedEventIds.length > 0) {
      await markEventsAsProcessed(conn, centralResponse.processedEventIds);
    }

    result.success = true;
    console.log(`✅ ${hospital.NameAr}: نجح ${result.eventsSent}، فشل ${result.eventsFailed}`);

    // تسجيل الأخطاء إن وُجدت
    if (centralResponse.errors && centralResponse.errors.length > 0) {
      console.warn(`⚠️ ${hospital.NameAr}: أخطاء المعالجة:`, centralResponse.errors);
    }

  } catch (error) {
    result.success = false;
    result.error = error.message;
    console.error(`❌ ${hospital.NameAr}: خطأ في المزامنة -`, error.message);
  } finally {
    if (conn) {
      await conn.end();
    }
  }

  return result;
}

/**
 * تشغيل دورة مزامنة واحدة لكل المستشفيات
 * @returns {Promise<object>} - إحصائيات الدورة
 */
async function runOnce() {
  if (isRunning) {
    console.log('⏩ دورة مزامنة قيد التشغيل بالفعل، تخطي...');
    return { skipped: true };
  }

  isRunning = true;
  const startTime = Date.now();
  stats.totalRuns++;
  stats.lastRun = new Date();

  console.log('\n═══════════════════════════════════════════════════');
  console.log(`🔄 بدء دورة المزامنة #${stats.totalRuns} - ${new Date().toLocaleString('ar-SA')}`);
  console.log('═══════════════════════════════════════════════════');

  const runStats = {
    startTime: stats.lastRun,
    hospitals: [],
    totalFetched: 0,
    totalSent: 0,
    totalFailed: 0,
    errors: []
  };

  try {
    // 1. جلب قائمة المستشفيات النشطة
    const [hospitals] = await centralPool.query(`
      SELECT 
        HospitalID, NameAr, NameEn, Code,
        DbHost, DbUser, DbPass, DbName
      FROM hospitals
      WHERE IsActive = 1
        AND DbName IS NOT NULL 
        AND DbName != ''
      ORDER BY SortOrder, NameAr
    `);

    console.log(`📋 عدد المستشفيات النشطة: ${hospitals.length}`);

    if (hospitals.length === 0) {
      console.log('⚠️ لا توجد مستشفيات نشطة للمزامنة');
      return runStats;
    }

    // 2. معالجة كل مستشفى
    for (const hospital of hospitals) {
      const hospitalResult = await syncHospital(hospital);
      runStats.hospitals.push(hospitalResult);
      
      runStats.totalFetched += hospitalResult.eventsFetched;
      runStats.totalSent += hospitalResult.eventsSent;
      runStats.totalFailed += hospitalResult.eventsFailed;
      
      if (!hospitalResult.success) {
        runStats.errors.push({
          hospital: hospitalResult.hospitalName,
          error: hospitalResult.error
        });
        stats.totalErrors++;
      } else if (hospitalResult.eventsSent > 0) {
        stats.totalEventsSynced += hospitalResult.eventsSent;
        stats.lastSuccess = new Date();
      }

      // انتظار قصير بين المستشفيات لتخفيف الحمل
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // 3. ملخص الدورة
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('\n─────────────────────────────────────────────────');
    console.log('📊 ملخص الدورة:');
    console.log(`   ⏱️  المدة: ${duration} ثانية`);
    console.log(`   📥 أحداث مسحوبة: ${runStats.totalFetched}`);
    console.log(`   ✅ أحداث أُرسلت: ${runStats.totalSent}`);
    console.log(`   ❌ أحداث فشلت: ${runStats.totalFailed}`);
    console.log(`   🏥 مستشفيات ناجحة: ${runStats.hospitals.filter(h => h.success).length}/${hospitals.length}`);
    
    if (runStats.errors.length > 0) {
      console.log('\n⚠️ الأخطاء:');
      runStats.errors.forEach(e => console.log(`   - ${e.hospital}: ${e.error}`));
      stats.lastError = { time: new Date(), errors: runStats.errors };
    }
    
    console.log('─────────────────────────────────────────────────\n');

  } catch (error) {
    console.error('❌ خطأ فادح في دورة المزامنة:', error);
    stats.lastError = { time: new Date(), error: error.message };
    runStats.errors.push({ general: error.message });
  } finally {
    isRunning = false;
  }

  return runStats;
}

/**
 * بدء التشغيل التلقائي (كل X ملي ثانية)
 */
function start() {
  if (intervalId) {
    console.log('⚠️ عامل المزامنة يعمل بالفعل');
    return;
  }

  console.log(`🚀 بدء عامل المزامنة - دورة كل ${CONFIG.intervalMs / 1000} ثانية`);
  
  // تشغيل فوري أول مرة
  runOnce();
  
  // ثم تشغيل دوري
  intervalId = setInterval(runOnce, CONFIG.intervalMs);
}

/**
 * إيقاف التشغيل التلقائي
 */
function stop() {
  if (!intervalId) {
    console.log('⚠️ عامل المزامنة غير نشط');
    return;
  }

  clearInterval(intervalId);
  intervalId = null;
  console.log('🛑 تم إيقاف عامل المزامنة');
}

/**
 * الحصول على الإحصائيات الحالية
 */
function getStats() {
  return {
    ...stats,
    isRunning,
    config: CONFIG
  };
}

/**
 * تحديث الإعدادات
 */
function updateConfig(newConfig) {
  Object.assign(CONFIG, newConfig);
  console.log('✓ تم تحديث إعدادات المزامنة:', newConfig);
}

// ===== التصدير =====
module.exports = {
  start,
  stop,
  runOnce,
  getStats,
  updateConfig,
  CONFIG
};

// ===== التشغيل التلقائي إذا كان ملف مستقل =====
if (require.main === module) {
  console.log('🎯 تشغيل عامل المزامنة كعملية مستقلة...\n');
  start();

  // معالجة الإيقاف الآمن
  process.on('SIGINT', () => {
    console.log('\n⏸️ إشارة إيقاف مستلمة...');
    stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n⏸️ إشارة إنهاء مستلمة...');
    stop();
    process.exit(0);
  });
}


