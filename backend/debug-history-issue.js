// أداة تشخيص مشكلة سجل البلاغات
import { centralDb, getContextualPool } from './config/db.js';

async function debugHistoryIssue() {
  console.log('🔍 تشخيص مشكلة سجل البلاغات...\n');

  try {
    // 1. فحص القاعدة المركزية
    console.log('📊 فحص القاعدة المركزية:');
    const [centralStats] = await centralDb.query(`
      SELECT 
        COUNT(*) as total_complaints,
        COUNT(DISTINCT HospitalID) as hospitals_count,
        MIN(CreatedAt) as oldest_complaint,
        MAX(CreatedAt) as newest_complaint
      FROM complaints
    `);
    console.log('   إجمالي البلاغات:', centralStats[0].total_complaints);
    console.log('   عدد المستشفيات:', centralStats[0].hospitals_count);
    console.log('   أقدم بلاغ:', centralStats[0].oldest_complaint);
    console.log('   أحدث بلاغ:', centralStats[0].newest_complaint);

    // 2. فحص البلاغات حسب المستشفى
    console.log('\n🏥 البلاغات حسب المستشفى:');
    const [hospitalStats] = await centralDb.query(`
      SELECT 
        h.HospitalID,
        h.NameAr,
        h.Code,
        COUNT(c.ComplaintID) as complaints_count
      FROM hospitals h
      LEFT JOIN complaints c ON h.HospitalID = c.HospitalID
      GROUP BY h.HospitalID, h.NameAr, h.Code
      ORDER BY complaints_count DESC
    `);

    for (const stat of hospitalStats) {
      console.log(`   ${stat.NameAr} (${stat.Code}): ${stat.complaints_count} بلاغ`);
    }

    // 3. اختبار API endpoint مباشرة
    console.log('\n🧪 اختبار API endpoint:');
    
    // محاكاة طلب بدون توكن
    console.log('   اختبار بدون توكن:');
    const [noTokenRows] = await centralDb.query(`
      SELECT 
        c.ComplaintID,
        c.TicketNumber,
        c.PatientFullName,
        c.HospitalID,
        c.CreatedAt
      FROM complaints c
      ORDER BY c.CreatedAt DESC
      LIMIT 5
    `);
    console.log(`   النتائج: ${noTokenRows.length} بلاغ`);

    // محاكاة طلب مع hospitalId=11
    console.log('   اختبار مع hospitalId=11:');
    const [hospital11Rows] = await centralDb.query(`
      SELECT 
        c.ComplaintID,
        c.TicketNumber,
        c.PatientFullName,
        c.HospitalID,
        c.CreatedAt
      FROM complaints c
      WHERE c.HospitalID = 11
      ORDER BY c.CreatedAt DESC
      LIMIT 5
    `);
    console.log(`   النتائج: ${hospital11Rows.length} بلاغ`);

    // 4. فحص قاعدة مستشفى 11
    console.log('\n🏥 فحص قاعدة مستشفى 11:');
    try {
      const hospitalPool = await getContextualPool({ hospitalId: 11 }, null);
      const [hospital11Stats] = await hospitalPool.query(`
        SELECT 
          COUNT(*) as total_complaints,
          MIN(CreatedAt) as oldest_complaint,
          MAX(CreatedAt) as newest_complaint
        FROM complaints
      `);
      
      console.log('   إجمالي البلاغات في قاعدة المستشفى:', hospital11Stats[0].total_complaints);
      console.log('   أقدم بلاغ:', hospital11Stats[0].oldest_complaint);
      console.log('   أحدث بلاغ:', hospital11Stats[0].newest_complaint);

      // اختبار البحث في قاعدة المستشفى
      const [hospital11Search] = await hospitalPool.query(`
        SELECT 
          ComplaintID,
          TicketNumber,
          PatientFullName,
          CreatedAt
        FROM complaints 
        ORDER BY CreatedAt DESC
        LIMIT 5
      `);

      console.log(`   نتائج البحث: ${hospital11Search.length} بلاغ`);
      if (hospital11Search.length > 0) {
        console.log('   أمثلة:');
        hospital11Search.forEach(complaint => {
          console.log(`   - ${complaint.TicketNumber}: ${complaint.PatientFullName}`);
        });
      }

    } catch (error) {
      console.log('   ❌ خطأ في الوصول لقاعدة المستشفى:', error.message);
    }

    // 5. تحليل المشكلة
    console.log('\n💡 تحليل المشكلة:');
    if (centralStats[0].total_complaints === 0) {
      console.log('   ⚠️ القاعدة المركزية فارغة - البلاغات في قواعد المستشفيات فقط');
      console.log('   🔧 الحل: استخدام fallback لقواعد المستشفيات');
    } else if (hospitalStats.some(h => h.complaints_count === 0)) {
      console.log('   ⚠️ بعض المستشفيات لا تحتوي على بلاغات في المركزية');
      console.log('   🔧 الحل: تفعيل المزامنة أو استخدام fallback');
    } else {
      console.log('   ✅ البيانات متزامنة بشكل جيد');
    }

    // 6. توصيات
    console.log('\n🎯 التوصيات:');
    console.log('   1. تأكد من إرسال hospitalId في الطلب');
    console.log('   2. تحقق من عمل fallback mechanism');
    console.log('   3. راجع console السيرفر للوج');
    console.log('   4. اختبر مع مستشفى محدد');

  } catch (error) {
    console.error('❌ خطأ في التشخيص:', error.message);
  }
}

// تشغيل التشخيص
debugHistoryIssue().then(() => {
  console.log('\n✅ انتهى التشخيص');
  process.exit(0);
}).catch(error => {
  console.error('❌ فشل التشخيص:', error);
  process.exit(1);
});
