// اختبار استعلام بسيط
import { centralDb } from './config/db.js';

async function testSimpleQuery() {
  console.log('🧪 اختبار استعلام بسيط...\n');

  try {
    // 1. فحص وجود الجدول
    console.log('1. فحص وجود جدول complaints:');
    const [tables] = await centralDb.query("SHOW TABLES LIKE 'complaints'");
    if (tables.length > 0) {
      console.log('   ✅ جدول complaints موجود');
    } else {
      console.log('   ❌ جدول complaints غير موجود');
      return;
    }

    // 2. فحص عدد الصفوف
    console.log('\n2. فحص عدد الصفوف:');
    const [count] = await centralDb.query('SELECT COUNT(*) as count FROM complaints');
    console.log(`   إجمالي الصفوف: ${count[0].count}`);

    // 3. فحص الصفوف غير المحذوفة
    console.log('\n3. فحص الصفوف غير المحذوفة:');
    const [activeCount] = await centralDb.query('SELECT COUNT(*) as count FROM complaints WHERE (IsDeleted IS NULL OR IsDeleted = 0)');
    console.log(`   الصفوف النشطة: ${activeCount[0].count}`);

    // 4. فحص مستشفى 11
    console.log('\n4. فحص مستشفى 11:');
    const [hospital11Count] = await centralDb.query('SELECT COUNT(*) as count FROM complaints WHERE HospitalID = 11 AND (IsDeleted IS NULL OR IsDeleted = 0)');
    console.log(`   بلاغات مستشفى 11: ${hospital11Count[0].count}`);

    // 5. عينة من البيانات
    console.log('\n5. عينة من البيانات:');
    const [sample] = await centralDb.query(`
      SELECT 
        ComplaintID, TicketNumber, PatientFullName, HospitalID, 
        StatusCode, PriorityCode, CreatedAt, IsDeleted
      FROM complaints 
      WHERE (IsDeleted IS NULL OR IsDeleted = 0)
      ORDER BY CreatedAt DESC 
      LIMIT 5
    `);
    
    if (sample.length > 0) {
      console.log('   عينة من البلاغات:');
      sample.forEach(row => {
        console.log(`   - ${row.TicketNumber}: ${row.PatientFullName} (مستشفى ${row.HospitalID}, ${row.StatusCode})`);
      });
    } else {
      console.log('   لا توجد بلاغات نشطة');
    }

    // 6. اختبار الاستعلام المطابق للواجهة
    console.log('\n6. اختبار الاستعلام المطابق للواجهة:');
    const testSQL = `
      SELECT 
        c.ComplaintID AS id,
        c.TicketNumber AS ticket,
        c.PatientFullName AS fullName,
        c.PatientMobile AS mobile,
        c.FileNumber AS fileNumber,
        c.StatusCode AS status,
        c.PriorityCode AS priority,
        c.HospitalID AS hospitalId,
        DATE_FORMAT(c.CreatedAt, '%Y-%m-%d %H:%i') AS createdAt,
        DATE_FORMAT(c.UpdatedAt, '%Y-%m-%d %H:%i') AS lastUpdate
      FROM complaints c
      WHERE 1=1
        AND c.HospitalID = ?
        AND (c.IsDeleted IS NULL OR c.IsDeleted = 0)
      ORDER BY c.CreatedAt DESC
      LIMIT 9
    `;

    const [testResults] = await centralDb.query(testSQL, [11]);
    console.log(`   نتائج الاستعلام: ${testResults.length} بلاغ`);
    testResults.forEach(row => {
      console.log(`   - ${row.ticket}: ${row.fullName} (${row.status})`);
    });

  } catch (error) {
    console.error('❌ خطأ في الاختبار:', error);
  }
}

testSimpleQuery().then(() => {
  console.log('\n✅ انتهى الاختبار');
  process.exit(0);
}).catch(error => {
  console.error('❌ فشل الاختبار:', error);
  process.exit(1);
});
