// backend/middleware/hospitalPool.js
// نظام إدارة اتصالات قواعد بيانات المستشفيات

import mysql from 'mysql2/promise';
import { URL } from 'url';

// Cache للـ pools لتجنب إنشاء اتصالات متكررة
const poolsCache = new Map();

/**
 * تحويل DSN إلى كائن إعدادات
 */
function dsnToObj(dsn) {
  const u = new URL(dsn);
  return {
    host: u.hostname,
    port: u.port || 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname?.slice(1) || undefined,
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  };
}

/**
 * الحصول على Pool للقاعدة المركزية
 */
export async function getCentralPool() {
  if (!process.env.CENTRAL_DSN) {
    throw new Error('CENTRAL_DSN غير معرّف في .env');
  }

  const cacheKey = 'central';
  
  if (poolsCache.has(cacheKey)) {
    return poolsCache.get(cacheKey);
  }

  const config = dsnToObj(process.env.CENTRAL_DSN);
  const pool = mysql.createPool(config);
  poolsCache.set(cacheKey, pool);
  
  return pool;
}

/**
 * الحصول على Pool لمستشفى معين
 * @param {number} hospitalId - معرّف المستشفى
 */
export async function getHospitalPool(hospitalId) {
  if (!hospitalId) {
    throw new Error('Hospital ID is required');
  }

  const cacheKey = `hospital_${hospitalId}`;

  // إذا موجود في الـ cache، أرجعه
  if (poolsCache.has(cacheKey)) {
    return poolsCache.get(cacheKey);
  }

  // جلب بيانات الاتصال من القاعدة المركزية
  const central = await getCentralPool();
  const [rows] = await central.query(
    `SELECT DbHost, DbName, DbUser, DbPass,
            COALESCE(IsActive, Active, 1) AS IsOn
     FROM hospitals
     WHERE HospitalID = ?`,
    [hospitalId]
  );

  if (!rows || rows.length === 0) {
    throw new Error(`المستشفى ${hospitalId} غير موجود`);
  }

  const { DbHost, DbName, DbUser, DbPass, IsOn } = rows[0];
  
  if (IsOn != 1) {
    throw new Error(`المستشفى ${hospitalId} غير مفعّل`);
  }

  // إنشاء Pool جديد
  const config = {
    host: DbHost,
    port: Number(process.env.DB_PORT || 3306), // افتراضي 3306 أو من متغير البيئة
    user: DbUser,
    password: DbPass,
    database: DbName,
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  };

  const pool = mysql.createPool(config);
  poolsCache.set(cacheKey, pool);

  return pool;
}

/**
 * Middleware: إضافة Hospital Pool للطلب
 * يقبل hospitalId من مصادر مختلفة: query, body, headers, user
 * لمديري التجمع المركزيين (RoleID = 1): hospitalId اختياري
 */
export async function attachHospitalPool(req, res, next) {
  try {
    // التحقق من أن المستخدم مدير تجمع مركزي
    const roleId = Number(req.user?.RoleID || req.user?.roleId || 0);
    const isCentralAdmin = roleId === 1; // مدير تجمع مركزي
    
    // البحث عن hospitalId من مصادر مختلفة
    const hid =
      Number(req.query.hospitalId) ||
      Number(req.body?.hospitalId) ||
      Number(req.body?.HospitalID) ||
      Number(req.headers['x-hospital-id']) ||
      Number(req.user?.hospitalId) ||
      Number(req.user?.hosp) ||
      Number(req.user?.HospitalID) ||
      req.hospitalId; // من middleware سابق

    // لمديري التجمع المركزيين: hospitalId اختياري
    if (isCentralAdmin && (!hid || Number.isNaN(hid))) {
      console.log('✅ [attachHospitalPool] مدير تجمع مركزي - تخطي hospitalId');
      req.hospitalId = null;
      req.hospitalPool = null;
      return next();
    }

    if (!hid || Number.isNaN(hid)) {
      return res.status(400).json({ 
        ok: false,
        message: 'hospitalId مفقود أو غير صالح' 
      });
    }

    req.hospitalId = hid;
    req.hospitalPool = await getHospitalPool(hid);
    next();
  } catch (error) {
    console.error('[attachHospitalPool] error:', error.message);
    res.status(500).json({ 
      ok: false,
      message: 'فشل تحديد قاعدة المستشفى' 
    });
  }
}

/**
 * تنظيف الـ cache (للصيانة)
 */
export async function clearPoolsCache() {
  for (const [key, pool] of poolsCache.entries()) {
    await pool.end();
    poolsCache.delete(key);
  }
  console.log('✅ تم تنظيف جميع اتصالات قواعد البيانات');
}

/**
 * إزالة pool معين من الـ cache
 */
export async function removePoolFromCache(hospitalId) {
  const cacheKey = `hospital_${hospitalId}`;
  
  if (poolsCache.has(cacheKey)) {
    const pool = poolsCache.get(cacheKey);
    await pool.end();
    poolsCache.delete(cacheKey);
    console.log(`✅ تم إزالة pool للمستشفى ${hospitalId} من الـ cache`);
  }
}

// إغلاق جميع الاتصالات عند إيقاف التطبيق
process.on('SIGINT', async () => {
  console.log('\n⏹️ إيقاف التطبيق...');
  await clearPoolsCache();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n⏹️ إيقاف التطبيق...');
  await clearPoolsCache();
  process.exit(0);
});

// ====== دوال مساعدة للبحث الديناميكي ======

/**
 * جلب كل المستشفيات المفعّلة مع أعمدة الاتصال
 */
export async function getActiveHospitals() {
  const central = await getCentralPool();
  const [rows] = await central.query(
    `SELECT HospitalID, DbHost, DbName, DbUser, DbPass
     FROM hospitals
     WHERE COALESCE(IsActive, Active, 1) = 1
     ORDER BY HospitalID ASC`
  );
  return rows;
}

/**
 * تأكيد أنّ البلاغ موجود في قاعدة مستشفى معيّن (آمن)
 * @param {number} hospitalId - معرّف المستشفى
 * @param {object} searchParams - معاملات البحث
 * @param {number} searchParams.complaintId - معرّف البلاغ
 * @param {string} searchParams.globalId - المعرّف العام (اختياري)
 * @returns {number|null} - ComplaintID الحقيقي داخل المستشفى أو null
 */
export async function complaintExistsInHospital(hospitalId, { complaintId, globalId }) {
  let pool;
  try {
    pool = await getHospitalPool(hospitalId);   // 👈 كان يطيح هنا لو الـ ID غير موجود
  } catch (e) {
    // المستشفى غير موجود/غير مفعّل — تجاهلي وكَمّلي البحث
    return null;
  }
  
  // جرب البحث بـ GlobalID أولاً (الأدق)
  if (globalId) {
    try {
      const [[rowG]] = await pool.query(
        'SELECT ComplaintID FROM complaints WHERE GlobalID = ? LIMIT 1',
        [globalId]
      );
      if (rowG) return rowG.ComplaintID; // رجّع الـ ComplaintID الحقيقي داخل هالمستشفى
    } catch (e) {
      // تجاهل الأخطاء والكمل
    }
  }
  
  // جرب البحث بـ ComplaintID
  if (complaintId) {
    try {
      const [[rowC]] = await pool.query(
        'SELECT ComplaintID FROM complaints WHERE ComplaintID = ? LIMIT 1',
        [complaintId]
      );
      if (rowC) return rowC.ComplaintID;
    } catch (e) {
      // تجاهل الأخطاء والكمل
    }
  }
  
  return null;
}

export default {
  getCentralPool,
  getHospitalPool,
  attachHospitalPool,
  clearPoolsCache,
  removePoolFromCache,
  getActiveHospitals,
  complaintExistsInHospital
};

