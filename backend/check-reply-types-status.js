// التحقق من حالة أنواع الردود في قاعدة البيانات
// التشغيل: node check-reply-types-status.js

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function checkReplyTypes() {
  console.log('🔍 التحقق من حالة جدول reply_types...\n');
  console.log('═'.repeat(60));

  let connection;
  try {
    // الاتصال بقاعدة البيانات
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || '127.0.0.1',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASS || 'Raneem11',
      database: process.env.DB_NAME || 'hospitals_mecca'
    });

    console.log('✅ تم الاتصال بقاعدة البيانات بنجاح\n');

    // 1. التحقق من وجود الجدول
    console.log('1️⃣  التحقق من وجود جدول reply_types...');
    const [tables] = await connection.query(
      `SHOW TABLES LIKE 'reply_types'`
    );

    if (tables.length === 0) {
      console.log('❌ جدول reply_types غير موجود!');
      console.log('\nℹ️  يجب إنشاء الجدول أولاً:');
      console.log('   CREATE TABLE reply_types (');
      console.log('     ReplyTypeID INT PRIMARY KEY AUTO_INCREMENT,');
      console.log('     NameAr VARCHAR(100),');
      console.log('     NameEn VARCHAR(100),');
      console.log('     IsActive TINYINT DEFAULT 1,');
      console.log('     SortOrder INT DEFAULT 999');
      console.log('   );');
      return;
    }

    console.log('✅ الجدول موجود\n');

    // 2. عد الصفوف
    console.log('2️⃣  عد أنواع الردود...');
    const [[{ total }]] = await connection.query(
      `SELECT COUNT(*) as total FROM reply_types`
    );

    const [[{ active }]] = await connection.query(
      `SELECT COUNT(*) as active FROM reply_types WHERE IsActive = 1`
    );

    console.log(`   📊 المجموع: ${total}`);
    console.log(`   ✅ النشط: ${active}`);
    console.log(`   ❌ غير نشط: ${total - active}\n`);

    if (total === 0) {
      console.log('⚠️  الجدول فارغ!\n');
      console.log('ℹ️  لإضافة بيانات تجريبية:');
      console.log('   mysql -u root -p hospitals_mecca < backend/sql/insert-reply-types.sql');
      return;
    }

    // 3. عرض الأنواع النشطة
    console.log('3️⃣  أنواع الردود النشطة (IsActive = 1):');
    console.log('─'.repeat(60));

    const [activeTypes] = await connection.query(
      `SELECT ReplyTypeID, NameAr, NameEn, SortOrder
       FROM reply_types
       WHERE IsActive = 1
       ORDER BY COALESCE(SortOrder, 999), ReplyTypeID`
    );

    if (activeTypes.length === 0) {
      console.log('⚠️  لا توجد أنواع رد نشطة!');
      console.log('\nℹ️  لتفعيل جميع الأنواع:');
      console.log('   UPDATE reply_types SET IsActive = 1;');
    } else {
      activeTypes.forEach((type, index) => {
        console.log(`   ${index + 1}. [${type.ReplyTypeID}] ${type.NameAr || type.NameEn} (ترتيب: ${type.SortOrder || 999})`);
      });
    }

    console.log('\n' + '─'.repeat(60));

    // 4. عرض الأنواع غير النشطة
    const [inactiveTypes] = await connection.query(
      `SELECT ReplyTypeID, NameAr, NameEn
       FROM reply_types
       WHERE IsActive = 0`
    );

    if (inactiveTypes.length > 0) {
      console.log('\n4️⃣  أنواع الردود غير النشطة (IsActive = 0):');
      console.log('─'.repeat(60));
      inactiveTypes.forEach((type, index) => {
        console.log(`   ${index + 1}. [${type.ReplyTypeID}] ${type.NameAr || type.NameEn}`);
      });
      console.log('\n💡 هذه الأنواع لا تظهر في القائمة المنسدلة');
    }

    // 5. اختبار الـ API
    console.log('\n5️⃣  لاختبار الـ API:');
    console.log('─'.repeat(60));
    console.log('   افتح في المتصفح:');
    console.log('   http://localhost:3001/api/reply-types\n');

    console.log('═'.repeat(60));
    console.log('✨ انتهى التحقق!');

    if (active > 0) {
      console.log('\n✅ كل شيء جاهز! القائمة ستعمل بشكل صحيح');
    } else {
      console.log('\n⚠️  يجب تفعيل أنواع الردود أو إضافة بيانات جديدة');
    }

  } catch (error) {
    console.error('\n❌ خطأ:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n⚠️  MySQL غير شغّال! شغّله أولاً');
    } else if (error.code === 'ER_BAD_DB_ERROR') {
      console.log('\n⚠️  قاعدة البيانات غير موجودة!');
      console.log('   أنشئها بـ: CREATE DATABASE hospitals_mecca;');
    }
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

checkReplyTypes();

