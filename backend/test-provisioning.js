// backend/test-provisioning.js
// ملف اختبار نظام Provisioning المستشفيات

import dotenv from 'dotenv';
dotenv.config();

import { provisionHospital, deprovisionHospital } from './provisioner.js';
import mysql from 'mysql2/promise';
import { URL } from 'url';

// ألوان للطباعة في الكونسول
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  bold: '\x1b[1m'
};

function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

// تحويل DSN إلى كائن
function dsnToObj(dsn) {
  const u = new URL(dsn);
  return {
    host: u.hostname,
    port: u.port || 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname?.slice(1) || undefined,
  };
}

// اختبار 1: التحقق من الاتصال بالقاعدة المركزية
async function testCentralConnection() {
  log(colors.blue + colors.bold, '\n📡 اختبار 1: الاتصال بالقاعدة المركزية');
  
  try {
    const config = dsnToObj(process.env.CENTRAL_DSN);
    const conn = await mysql.createConnection(config);
    const [rows] = await conn.query('SELECT 1 as test');
    await conn.end();
    
    log(colors.green, '✅ الاتصال بالقاعدة المركزية نجح');
    return true;
  } catch (err) {
    log(colors.red, '❌ فشل الاتصال بالقاعدة المركزية:', err.message);
    return false;
  }
}

// اختبار 2: التحقق من صلاحيات Root
async function testRootPrivileges() {
  log(colors.blue + colors.bold, '\n🔐 اختبار 2: صلاحيات Root');
  
  try {
    const config = dsnToObj(process.env.MYSQL_ROOT_DSN);
    delete config.database;
    
    const conn = await mysql.createConnection(config);
    
    // اختبار CREATE DATABASE
    await conn.query('CREATE DATABASE IF NOT EXISTS test_provisioning_temp');
    log(colors.green, '✅ صلاحية CREATE DATABASE متوفرة');
    
    // اختبار CREATE USER
    await conn.query(`CREATE USER IF NOT EXISTS 'test_user_temp'@'${process.env.DB_HOST}' IDENTIFIED BY 'test123'`);
    log(colors.green, '✅ صلاحية CREATE USER متوفرة');
    
    // تنظيف
    await conn.query('DROP DATABASE IF EXISTS test_provisioning_temp');
    await conn.query(`DROP USER IF EXISTS 'test_user_temp'@'${process.env.DB_HOST}'`);
    
    await conn.end();
    log(colors.green, '✅ جميع الصلاحيات متوفرة');
    return true;
  } catch (err) {
    log(colors.red, '❌ فشل اختبار الصلاحيات:', err.message);
    return false;
  }
}

// اختبار 3: إنشاء مستشفى تجريبي
async function testCreateHospital() {
  log(colors.blue + colors.bold, '\n🏥 اختبار 3: إنشاء مستشفى تجريبي');
  
  const testCode = 'TEST' + Date.now().toString().slice(-4);
  
  try {
    const result = await provisionHospital({
      nameAr: 'مستشفى تجريبي',
      nameEn: 'Test Hospital',
      code: testCode,
      cityAr: 'مكة المكرمة',
      isActive: 1
    });
    
    log(colors.green, '✅ تم إنشاء المستشفى بنجاح');
    log(colors.yellow, '📋 التفاصيل:');
    console.log('   - Hospital ID:', result.hospitalId);
    console.log('   - Database:', result.dbName);
    console.log('   - User:', result.dbUser);
    
    return { success: true, hospitalId: result.hospitalId, dbName: result.dbName };
  } catch (err) {
    log(colors.red, '❌ فشل إنشاء المستشفى:', err.message);
    return { success: false };
  }
}

// اختبار 4: التحقق من القاعدة المُنشأة
async function testVerifyDatabase(dbName) {
  log(colors.blue + colors.bold, '\n🔍 اختبار 4: التحقق من القاعدة المُنشأة');
  
  if (!dbName) {
    log(colors.yellow, '⚠️ تخطي الاختبار (لا يوجد dbName)');
    return false;
  }
  
  try {
    const config = dsnToObj(process.env.MYSQL_ROOT_DSN);
    delete config.database;
    
    const conn = await mysql.createConnection({ ...config, database: dbName });
    
    // عرض الجداول
    const [tables] = await conn.query('SHOW TABLES');
    log(colors.green, `✅ القاعدة ${dbName} موجودة`);
    log(colors.yellow, `📊 عدد الجداول: ${tables.length}`);
    
    if (tables.length > 0) {
      console.log('   الجداول:');
      tables.slice(0, 5).forEach(t => {
        console.log('   -', Object.values(t)[0]);
      });
      if (tables.length > 5) {
        console.log('   ... و', tables.length - 5, 'جداول أخرى');
      }
    }
    
    await conn.end();
    return true;
  } catch (err) {
    log(colors.red, '❌ فشل التحقق من القاعدة:', err.message);
    return false;
  }
}

// اختبار 5: حذف المستشفى التجريبي
async function testDeleteHospital(hospitalId) {
  log(colors.blue + colors.bold, '\n🗑️ اختبار 5: حذف المستشفى التجريبي');
  
  if (!hospitalId) {
    log(colors.yellow, '⚠️ تخطي الاختبار (لا يوجد hospitalId)');
    return false;
  }
  
  try {
    await deprovisionHospital(hospitalId);
    log(colors.green, '✅ تم حذف المستشفى بنجاح');
    return true;
  } catch (err) {
    log(colors.red, '❌ فشل حذف المستشفى:', err.message);
    return false;
  }
}

// تشغيل جميع الاختبارات
async function runAllTests() {
  log(colors.bold, '\n' + '='.repeat(60));
  log(colors.bold, '🧪 بدء اختبارات نظام Provisioning المستشفيات');
  log(colors.bold, '='.repeat(60));
  
  const results = {
    central: false,
    root: false,
    create: false,
    verify: false,
    delete: false
  };
  
  let hospitalId = null;
  let dbName = null;
  
  // اختبار 1: الاتصال المركزي
  results.central = await testCentralConnection();
  
  if (results.central) {
    // اختبار 2: صلاحيات Root
    results.root = await testRootPrivileges();
    
    if (results.root) {
      // اختبار 3: إنشاء مستشفى
      const createResult = await testCreateHospital();
      results.create = createResult.success;
      hospitalId = createResult.hospitalId;
      dbName = createResult.dbName;
      
      if (results.create) {
        // اختبار 4: التحقق من القاعدة
        results.verify = await testVerifyDatabase(dbName);
        
        // اختبار 5: حذف المستشفى
        results.delete = await testDeleteHospital(hospitalId);
      }
    }
  }
  
  // النتيجة النهائية
  log(colors.bold, '\n' + '='.repeat(60));
  log(colors.bold, '📊 ملخص النتائج:');
  log(colors.bold, '='.repeat(60));
  
  const allPassed = Object.values(results).every(r => r === true);
  
  console.log(`\n   1. اتصال القاعدة المركزية: ${results.central ? '✅' : '❌'}`);
  console.log(`   2. صلاحيات Root:           ${results.root ? '✅' : '❌'}`);
  console.log(`   3. إنشاء مستشفى:            ${results.create ? '✅' : '❌'}`);
  console.log(`   4. التحقق من القاعدة:       ${results.verify ? '✅' : '❌'}`);
  console.log(`   5. حذف المستشفى:            ${results.delete ? '✅' : '❌'}`);
  
  log(colors.bold, '\n' + '='.repeat(60));
  
  if (allPassed) {
    log(colors.green + colors.bold, '🎉 جميع الاختبارات نجحت!');
    log(colors.green, '✅ نظام Provisioning جاهز للاستخدام');
  } else {
    log(colors.red + colors.bold, '⚠️ بعض الاختبارات فشلت!');
    log(colors.yellow, '📝 راجع التفاصيل أعلاه وتحقق من:');
    console.log('   - إعدادات .env');
    console.log('   - صلاحيات MySQL');
    console.log('   - وجود ملف hospital_template.sql');
  }
  
  log(colors.bold, '='.repeat(60) + '\n');
  
  process.exit(allPassed ? 0 : 1);
}

// تشغيل الاختبارات
runAllTests().catch(err => {
  log(colors.red, '❌ خطأ غير متوقع:', err);
  process.exit(1);
});

