#!/usr/bin/env node

/**
 * سكريبت اختبار حالة نظام سلة المحذوفات
 * الاستخدام: node test-trash-status.js
 */

import { pool } from './config/db.js';

console.log('\n🔍 === فحص حالة نظام سلة المحذوفات ===\n');

async function checkTrashSystem() {
  try {
    // 1. فحص جدول trash_bin
    console.log('1️⃣ فحص جدول trash_bin...');
    const [tables] = await pool.query("SHOW TABLES LIKE 'trash_bin'");
    
    if (tables.length === 0) {
      console.log('   ❌ جدول trash_bin غير موجود!');
      console.log('   💡 الحل: قم بإنشاء الجدول أولاً\n');
      await pool.end();
      return;
    }
    console.log('   ✅ جدول trash_bin موجود\n');

    // 2. فحص أعمدة trash_bin
    console.log('2️⃣ فحص أعمدة trash_bin...');
    const [columns] = await pool.query("DESCRIBE trash_bin");
    const columnNames = columns.map(c => c.Field);
    
    const requiredColumns = ['TrashID', 'HospitalID', 'SourceDB', 'EntityType', 'EntityTable', 
                             'EntityID', 'EntityTitle', 'EntitySnapshot', 'DeleteReason', 
                             'DeletedByUserID', 'DeletedAt', 'RestoredAt', 'PurgedAt'];
    
    let missingCols = [];
    requiredColumns.forEach(col => {
      if (!columnNames.includes(col)) {
        missingCols.push(col);
      }
    });
    
    if (missingCols.length > 0) {
      console.log(`   ⚠️  أعمدة مفقودة: ${missingCols.join(', ')}`);
    } else {
      console.log('   ✅ جميع الأعمدة موجودة');
    }
    console.log('');

    // 3. فحص أعمدة complaints
    console.log('3️⃣ فحص أعمدة الحذف في complaints...');
    const [complaintCols] = await pool.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'complaints'
        AND COLUMN_NAME IN ('IsDeleted', 'DeletedAt', 'DeletedByUserID', 'DeleteReason')
    `);
    
    const deleteCols = complaintCols.map(c => c.COLUMN_NAME);
    const requiredDeleteCols = ['IsDeleted', 'DeletedAt', 'DeletedByUserID', 'DeleteReason'];
    
    requiredDeleteCols.forEach(col => {
      if (deleteCols.includes(col)) {
        console.log(`   ✅ ${col} موجود`);
      } else {
        console.log(`   ❌ ${col} مفقود`);
      }
    });
    console.log('');

    // 4. إحصائيات البلاغات
    console.log('4️⃣ إحصائيات البلاغات:');
    const [[stats]] = await pool.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN IsDeleted = 1 THEN 1 ELSE 0 END) as deleted,
        SUM(CASE WHEN IsDeleted = 0 OR IsDeleted IS NULL THEN 1 ELSE 0 END) as active
      FROM complaints
    `);
    
    console.log(`   📊 إجمالي البلاغات: ${stats.total}`);
    console.log(`   ✅ نشطة: ${stats.active}`);
    console.log(`   🗑️  محذوفة: ${stats.deleted}`);
    console.log('');

    // 5. محتويات السلة
    console.log('5️⃣ محتويات السلة:');
    const [[trashStats]] = await pool.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN RestoredAt IS NOT NULL THEN 1 ELSE 0 END) as restored,
        SUM(CASE WHEN PurgedAt IS NOT NULL THEN 1 ELSE 0 END) as purged,
        SUM(CASE WHEN RestoredAt IS NULL AND PurgedAt IS NULL THEN 1 ELSE 0 END) as active
      FROM trash_bin
      WHERE EntityType = 'COMPLAINT'
    `);
    
    console.log(`   📦 إجمالي السجلات: ${trashStats.total}`);
    console.log(`   🗑️  في السلة (نشطة): ${trashStats.active}`);
    console.log(`   ↩️  مُسترجعة: ${trashStats.restored}`);
    console.log(`   🔥 محذوفة نهائياً: ${trashStats.purged}`);
    console.log('');

    // 6. التحقق من التطابق
    console.log('6️⃣ التحقق من التطابق:');
    const shouldMatch = stats.deleted === trashStats.total;
    
    if (shouldMatch) {
      console.log(`   ✅ التطابق صحيح: ${stats.deleted} بلاغ محذوف = ${trashStats.total} سجل في السلة`);
    } else {
      console.log(`   ⚠️  عدم تطابق: ${stats.deleted} بلاغ محذوف ≠ ${trashStats.total} سجل في السلة`);
      if (stats.deleted > trashStats.total) {
        console.log(`   💡 يوجد ${stats.deleted - trashStats.total} بلاغ محذوف لم يُضف للسلة`);
      }
    }
    console.log('');

    // 7. عرض آخر 5 عمليات حذف
    console.log('7️⃣ آخر 5 عمليات حذف:');
    const [recentDeletes] = await pool.query(`
      SELECT 
        t.TrashID,
        t.EntityTitle,
        t.DeletedAt,
        CASE 
          WHEN t.RestoredAt IS NOT NULL THEN 'مُسترجع'
          WHEN t.PurgedAt IS NOT NULL THEN 'محذوف نهائياً'
          ELSE 'في السلة'
        END as Status
      FROM trash_bin t
      WHERE t.EntityType = 'COMPLAINT'
      ORDER BY t.DeletedAt DESC
      LIMIT 5
    `);
    
    if (recentDeletes.length === 0) {
      console.log('   📭 لا توجد عمليات حذف مسجلة');
    } else {
      console.table(recentDeletes);
    }
    console.log('');

    // 8. فحص المستشفيات
    console.log('8️⃣ فحص جدول المستشفيات:');
    const [[hospitalStats]] = await pool.query(`
      SELECT COUNT(*) as total FROM hospitals
    `);
    console.log(`   🏥 عدد المستشفيات: ${hospitalStats.total}`);
    
    if (hospitalStats.total === 0) {
      console.log('   ⚠️  لا توجد مستشفيات - القائمة المنسدلة ستكون فارغة!');
    } else {
      console.log('   ✅ المستشفيات موجودة');
    }
    console.log('');

    // النتيجة النهائية
    console.log('═'.repeat(50));
    console.log('📋 النتيجة:');
    console.log('═'.repeat(50));
    
    if (tables.length > 0 && missingCols.length === 0 && deleteCols.length === 4) {
      console.log('✅ النظام جاهز للاستخدام!');
      console.log('');
      console.log('🧪 للاختبار:');
      console.log('   1. شغّل السيرفر: npm start');
      console.log('   2. افتح المتصفح وسجل دخول');
      console.log('   3. احذف بلاغ تجريبي');
      console.log('   4. تحقق من السلة في: /admin/admin-trash.html');
    } else {
      console.log('⚠️  النظام يحتاج إعداد:');
      if (missingCols.length > 0) {
        console.log(`   - أضف الأعمدة: ${missingCols.join(', ')}`);
      }
      if (deleteCols.length < 4) {
        console.log('   - أضف أعمدة الحذف في complaints');
      }
    }
    console.log('');

  } catch (error) {
    console.error('\n❌ خطأ:', error.message);
    console.error(error);
  } finally {
    await pool.end();
  }
}

checkTrashSystem();

