// test-status-change.js
// اختبار نظام تغيير حالة البلاغ

import { pool } from './config/db.js';
import dotenv from 'dotenv';
dotenv.config();

async function testStatusChange() {
  console.log('🧪 اختبار نظام تغيير حالة البلاغ...\n');
  console.log('═'.repeat(60));

  let connection;
  try {
    connection = await pool.getConnection();
    console.log('✅ تم الاتصال بقاعدة البيانات بنجاح\n');

    // 1. التحقق من وجود جدول الحالات
    console.log('1️⃣  التحقق من جدول الحالات...');
    const [tables] = await connection.query(`
      SELECT TABLE_NAME 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = ? 
      AND TABLE_NAME = 'complaint_statuses'
    `, [process.env.DB_NAME]);

    if (tables.length === 0) {
      console.log('❌ جدول complaint_statuses غير موجود!');
      console.log('   يجب تشغيل SQL script أولاً');
      return;
    }
    
    console.log('✅ جدول الحالات موجود\n');

    // 2. اختبار جلب الحالات
    console.log('2️⃣  اختبار جلب الحالات...');
    const [statuses] = await connection.query(`
      SELECT StatusCode, LabelAr, LabelEn, SortOrder
      FROM complaint_statuses
      ORDER BY SortOrder ASC, StatusCode ASC
    `);
    
    console.log(`   ✅ تم جلب ${statuses.length} حالة`);
    statuses.forEach(s => {
      console.log(`      - ${s.StatusCode}: ${s.LabelAr} (${s.LabelEn})`);
    });
    console.log('');

    // 3. اختبار جلب البلاغات
    console.log('3️⃣  اختبار جلب البلاغات...');
    const [complaints] = await connection.query(`
      SELECT ComplaintID, TicketNumber, StatusCode, HospitalID
      FROM complaints 
      LIMIT 1
    `);
    
    if (complaints.length === 0) {
      console.log('   ⚠️  لا توجد بلاغات في قاعدة البيانات');
      return;
    }
    
    const complaint = complaints[0];
    console.log(`   ✅ تم العثور على البلاغ: ${complaint.ComplaintID} (${complaint.StatusCode})`);

    // 4. اختبار تغيير الحالة
    console.log('\n4️⃣  اختبار تغيير الحالة...');
    
    const newStatus = 'IN_PROGRESS';
    const testNote = 'اختبار تغيير الحالة - ملاحظة تجريبية';
    
    await connection.beginTransaction();
    
    // تحديث حالة البلاغ
    await connection.query(`
      UPDATE complaints
      SET StatusCode = ?, UpdatedAt = CURRENT_TIMESTAMP
      WHERE ComplaintID = ?
    `, [newStatus, complaint.ComplaintID]);
    
    console.log(`   ✅ تم تحديث حالة البلاغ إلى: ${newStatus}`);
    
    // إضافة رد داخلي يوثق التغيير
    await connection.query(`
      INSERT INTO complaint_responses
        (ComplaintID, ResponderUserID, ReplyTypeID, TargetStatusCode, Message, IsInternal)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      complaint.ComplaintID,
      1, // UserID افتراضي
      1, // ReplyTypeID افتراضي
      newStatus,
      `تغيير حالة البلاغ: ${newStatus} — ${testNote}`,
      1  // داخلي
    ]);
    
    console.log(`   📝 تم إضافة رد داخلي يوثق التغيير`);
    
    // التحقق من التغيير
    const [[updatedComplaint]] = await connection.query(`
      SELECT StatusCode FROM complaints WHERE ComplaintID = ?
    `, [complaint.ComplaintID]);
    
    console.log(`   🔍 الحالة الجديدة: ${updatedComplaint.StatusCode}`);
    
    // تنظيف البيانات التجريبية
    await connection.query(`
      DELETE FROM complaint_responses 
      WHERE Message LIKE '%اختبار تغيير الحالة%'
    `);
    
    await connection.query(`
      UPDATE complaints
      SET StatusCode = ?, UpdatedAt = CURRENT_TIMESTAMP
      WHERE ComplaintID = ?
    `, [complaint.StatusCode, complaint.ComplaintID]);
    
    await connection.commit();
    console.log('   🧹 تم تنظيف البيانات التجريبية');

    console.log('\n🎉 تم اختبار نظام تغيير الحالة بنجاح!');
    console.log('\n📋 الخطوات التالية:');
    console.log('   1. تشغيل الخادم: npm start');
    console.log('   2. فتح: http://localhost:3001/complaints/history/complaint-details.html?ticket=C-2025-000008');
    console.log('   3. الضغط على "تغيير الحالة"');
    console.log('   4. اختيار حالة جديدة وإضافة ملاحظة');
    console.log('   5. التحقق من تحديث الحالة والرد الداخلي');

  } catch (error) {
    console.error('❌ خطأ في الاختبار:', error.message);
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

// تشغيل الاختبار
testStatusChange();
