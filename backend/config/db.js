// config/db.js - نظام قواعد البيانات الذكي متعدد المستشفيات
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

// إعدادات الاتصال الأساسية
const DB_CONFIG = {
  host: process.env.CENTRAL_DB_HOST || '127.0.0.1',
  user: process.env.CENTRAL_DB_USER || 'root',
  password: process.env.CENTRAL_DB_PASS || 'Raneem11',
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4_general_ci'
};

// القاعدة المركزية (للمديرين والبحث العام)
export const centralDb = mysql.createPool({
  ...DB_CONFIG,
  database: process.env.CENTRAL_DB_NAME || 'hospitals_mecca4'
});

// إضافة معلومات للتشخيص
centralDb._dbName = 'hospitals_mecca4';
centralDb._hospitalId = 'CENTRAL';

// كاش لاتصالات المستشفيات
const hospitalPools = new Map(); // key: hospitalId -> Pool

/**
 * الحصول على اتصال قاعدة المستشفى بناءً على HospitalID
 * @param {number} hospitalId - معرف المستشفى
 * @returns {Promise<Pool>} اتصال قاعدة المستشفى
 */
export async function getHospitalPool(hospitalId) {
  if (hospitalPools.has(hospitalId)) {
    return hospitalPools.get(hospitalId);
  }

  try {
    // جلب معلومات المستشفى من القاعدة المركزية
    const [rows] = await centralDb.query(
      `SELECT HospitalID, Code, NameAr, DbName FROM hospitals WHERE HospitalID = ? LIMIT 1`,
      [hospitalId]
    );

    if (!rows.length) {
      throw new Error(`مستشفى غير موجود: ${hospitalId}`);
    }

    const hospital = rows[0];
    
    // تحديد اسم قاعدة البيانات
    // أولوية: DbName المخصص، ثم hosp_Code، ثم hosp_HospitalID
    const dbName = hospital.DbName || 
                   `hosp_${hospital.Code}` || 
                   `hosp_${hospitalId}`;

    console.log(`🏥 إنشاء اتصال للمستشفى ${hospital.NameAr} (${dbName})`);

    // إنشاء اتصال جديد للمستشفى
    const pool = mysql.createPool({
      host: process.env.CENTRAL_DB_HOST || '127.0.0.1',
      user: process.env.CENTRAL_DB_USER || 'root', // نفس المستخدم للمستشفيات
      password: process.env.CENTRAL_DB_PASS || 'Raneem11',
      database: dbName,
      waitForConnections: true,
      connectionLimit: 5,
      charset: 'utf8mb4_general_ci'
    });

    // إضافة معلومات للتشخيص
    pool._dbName = dbName;
    pool._hospitalId = hospitalId;
    
    console.log(`✅ [getHospitalPool] تم إنشاء اتصال لقاعدة: ${dbName}`);

    // حفظ في الكاش
    hospitalPools.set(hospitalId, pool);
    return pool;

  } catch (error) {
    console.error(`❌ خطأ في إنشاء اتصال المستشفى ${hospitalId}:`, error.message);
    throw error;
  }
}

/**
 * الحصول على الاتصال المناسب حسب نوع المستخدم
 * @param {Object} user - بيانات المستخدم من التوكن
 * @param {Object} req - طلب HTTP (للمديرين)
 * @returns {Promise<Pool>} الاتصال المناسب
 */
export async function getContextualPool(user, req = null) {
  console.log(`🔍 [getContextualPool] المستخدم:`, {
    UserID: user?.UserID,
    HospitalID: user?.HospitalID,
    RoleID: user?.RoleID,
    hasUser: !!user
  });

  // إذا لم يكن هناك مستخدم (زائر عادي) -> القاعدة المركزية
  if (!user) {
    console.log(`🔍 [getContextualPool] لا يوجد مستخدم -> القاعدة المركزية`);
    return centralDb;
  }

  // أدوار المديرين (يرون كل شيء)
  const ADMIN_ROLES = [1, 4]; // SUPER_ADMIN, CLUSTER_MANAGER
  
  const roleId = user.RoleID ?? user.roleId;
  if (ADMIN_ROLES.includes(roleId)) {
    console.log(`🔍 [getContextualPool] مدير (RoleID: ${roleId})`);
    // إذا طلب مستشفى محدد
    const requestedHospitalId = req?.query?.hospitalId;
    if (requestedHospitalId) {
      console.log(`🔍 [getContextualPool] مدير يطلب مستشفى محدد: ${requestedHospitalId}`);
      return await getHospitalPool(parseInt(requestedHospitalId));
    }
    // وإلا القاعدة المركزية
    console.log(`🔍 [getContextualPool] مدير بدون مستشفى محدد -> القاعدة المركزية`);
    return centralDb;
  }

  // باقي المستخدمين -> قاعدة مستشفاهم
  const hospitalId = user.HospitalID ?? user.hospitalId;
  if (hospitalId) {
    console.log(`🔍 [getContextualPool] مستخدم عادي (RoleID: ${roleId}) -> قاعدة المستشفى ${hospitalId}`);
    return await getHospitalPool(hospitalId);
  }

  // افتراضي: القاعدة المركزية
  console.log(`🔍 [getContextualPool] لا يوجد HospitalID -> القاعدة المركزية`);
  return centralDb;
}

/**
 * تنظيف الاتصالات (للاستخدام عند إغلاق التطبيق)
 */
export async function closeAllConnections() {
  console.log('🔄 إغلاق جميع اتصالات قواعد البيانات...');
  
  await centralDb.end();
  
  for (const [hospitalId, pool] of hospitalPools) {
    await pool.end();
    console.log(`✅ تم إغلاق اتصال المستشفى ${hospitalId}`);
  }
  
  hospitalPools.clear();
}

// للتوافق مع الكود القديم
export const pool = centralDb;

/**
 * اختبار الاتصال بقاعدة البيانات (لا يوقف التطبيق عند الفشل)
 */
export async function testConnection() {
  try {
    const connection = await centralDb.getConnection();
    console.log('✅ تم الاتصال بالقاعدة المركزية:', process.env.CENTRAL_DB_NAME || 'hospitals_mecca4');
    connection.release();
    return true;
  } catch (error) {
    console.error('❌ فشل الاتصال بقاعدة البيانات:', error.message);
    console.error('⚠️  تحذير: الخادم سيستمر في العمل، لكن بعض الوظائف قد لا تعمل');
    console.error('🔧 تأكد من:');
    console.error('   1. تشغيل MySQL');
    console.error('   2. صحة إعدادات قاعدة البيانات في ملف .env');
    console.error('   3. وجود قاعدة البيانات:', process.env.CENTRAL_DB_NAME || 'hospitals_mecca4');
    return false;
  }
}

// اختبار الاتصال بشكل غير متزامن (لا يمنع بدء الخادم)
testConnection().catch(err => {
  console.error('⚠️  خطأ في اختبار الاتصال:', err.message);
});

// تنظيف عند إغلاق التطبيق
process.on('SIGINT', closeAllConnections);
process.on('SIGTERM', closeAllConnections);