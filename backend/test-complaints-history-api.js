// test-complaints-history-api.js
// ملف اختبار سريع لـ API تاريخ البلاغات

import { pool } from './config/db.js';

async function testComplaintsHistoryAPI() {
  console.log('🧪 اختبار API تاريخ البلاغات...\n');

  try {
    // 1️⃣ التحقق من وجود بيانات في جدول complaints
    console.log('1️⃣ التحقق من البيانات في جدول complaints...');
    const [complaints] = await pool.query(`
      SELECT COUNT(*) AS total 
      FROM complaints
    `);
    
    const total = complaints[0]?.total || 0;
    console.log(`✅ عدد البلاغات في قاعدة البيانات: ${total}\n`);

    if (total === 0) {
      console.log('⚠️  لا توجد بيانات بلاغات بعد!');
      console.log('💡 قم بإنشاء بلاغات من صفحة التقديم أولاً\n');
      return;
    }

    // 2️⃣ عرض عينة من البيانات
    console.log('2️⃣ عينة من البلاغات:');
    const [sample] = await pool.query(`
      SELECT 
        c.TicketNumber,
        c.PatientFullName,
        c.StatusCode,
        c.PriorityCode,
        COALESCE(h.NameAr, h.NameEn) AS Hospital,
        COALESCE(ct.TypeName, ct.TypeNameEn) AS Type,
        DATE_FORMAT(c.CreatedAt, '%Y-%m-%d') AS CreatedDate
      FROM complaints c
      LEFT JOIN hospitals h ON h.HospitalID = c.HospitalID
      LEFT JOIN complaint_types ct ON ct.ComplaintTypeID = c.ComplaintTypeID
      ORDER BY c.CreatedAt DESC
      LIMIT 5
    `);

    sample.forEach((row, i) => {
      console.log(`   ${i + 1}. ${row.TicketNumber} - ${row.PatientFullName}`);
      console.log(`      المستشفى: ${row.Hospital || 'N/A'}`);
      console.log(`      النوع: ${row.Type || 'N/A'}`);
      console.log(`      الحالة: ${row.StatusCode} | الأولوية: ${row.PriorityCode}`);
      console.log(`      التاريخ: ${row.CreatedDate}\n`);
    });

    // 3️⃣ إحصائيات الحالات
    console.log('3️⃣ إحصائيات الحالات:');
    const [stats] = await pool.query(`
      SELECT 
        StatusCode,
        COUNT(*) AS count
      FROM complaints
      GROUP BY StatusCode
    `);

    stats.forEach(s => {
      console.log(`   - ${s.StatusCode}: ${s.count} بلاغ`);
    });
    console.log('');

    // 4️⃣ التحقق من وجود أسماء المستشفيات
    console.log('4️⃣ التحقق من جدول المستشفيات:');
    const [hospitals] = await pool.query(`
      SELECT COUNT(*) AS total 
      FROM hospitals
    `);
    console.log(`✅ عدد المستشفيات: ${hospitals[0]?.total || 0}\n`);

    // 5️⃣ التحقق من وجود أنواع البلاغات
    console.log('5️⃣ التحقق من جدول أنواع البلاغات:');
    const [types] = await pool.query(`
      SELECT COUNT(*) AS total 
      FROM complaint_types
    `);
    console.log(`✅ عدد أنواع البلاغات: ${types[0]?.total || 0}\n`);

    // 6️⃣ تعليمات الاختبار
    console.log('6️⃣ تعليمات الاختبار:');
    console.log('   ✓ السيرفر يجب أن يكون شغال: http://localhost:3001');
    console.log('   ✓ اختبر API مباشرة:');
    console.log('     http://localhost:3001/api/complaints/history?page=1&pageSize=9');
    console.log('');
    console.log('   ✓ اختبر مع فلاتر:');
    console.log('     http://localhost:3001/api/complaints/history?status=open');
    console.log('     http://localhost:3001/api/complaints/history?hospital=مستشفى الملك عبدالعزيز');
    console.log('');
    console.log('   ✓ افتح الصفحة:');
    console.log('     NewProjectMecca/public/complaints/history/complaints-history.html\n');

    console.log('🎉 الاختبار انتهى بنجاح!');

  } catch (error) {
    console.error('❌ خطأ في الاختبار:', error.message);
    console.error(error);
  } finally {
    await pool.end();
  }
}

// تشغيل الاختبار
testComplaintsHistoryAPI();

