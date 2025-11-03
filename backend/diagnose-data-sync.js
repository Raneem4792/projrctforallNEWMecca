// أداة تشخيص مزامنة البيانات بين القواعد
import { centralDb, getHospitalPool } from './config/db.js';

async function diagnoseDataSync() {
  console.log('🔍 تشخيص مزامنة البيانات...\n');

  try {
    // 1. فحص القاعدة المركزية
    console.log('📊 القاعدة المركزية (hospitals_mecca4):');
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

    // 3. فحص البحث عن "رنيم"
    console.log('\n🔍 اختبار البحث عن "رنيم":');
    const [searchResults] = await centralDb.query(`
      SELECT 
        ComplaintID,
        TicketNumber,
        PatientFullName,
        HospitalID,
        CreatedAt
      FROM complaints 
      WHERE PatientFullName LIKE '%رنيم%'
      ORDER BY CreatedAt DESC
      LIMIT 5
    `);

    if (searchResults.length > 0) {
      console.log(`   تم العثور على ${searchResults.length} نتيجة:`);
      searchResults.forEach(complaint => {
        console.log(`   - ${complaint.TicketNumber}: ${complaint.PatientFullName} (مستشفى ${complaint.HospitalID})`);
      });
    } else {
      console.log('   ❌ لا توجد نتائج للبحث عن "رنيم" في القاعدة المركزية');
    }

    // 4. فحص قاعدة مستشفى معين (مثال: مستشفى 11)
    console.log('\n🏥 فحص قاعدة مستشفى 11:');
    try {
      const hospitalPool = await getHospitalPool(11);
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

      // البحث عن "رنيم" في قاعدة المستشفى
      const [hospital11Search] = await hospitalPool.query(`
        SELECT 
          ComplaintID,
          TicketNumber,
          PatientFullName,
          CreatedAt
        FROM complaints 
        WHERE PatientFullName LIKE '%رنيم%'
        ORDER BY CreatedAt DESC
        LIMIT 5
      `);

      if (hospital11Search.length > 0) {
        console.log(`   ✅ تم العثور على ${hospital11Search.length} نتيجة في قاعدة المستشفى:`);
        hospital11Search.forEach(complaint => {
          console.log(`   - ${complaint.TicketNumber}: ${complaint.PatientFullName}`);
        });
      } else {
        console.log('   ❌ لا توجد نتائج للبحث عن "رنيم" في قاعدة المستشفى');
      }

    } catch (error) {
      console.log('   ❌ خطأ في الوصول لقاعدة المستشفى:', error.message);
    }

    // 5. توصيات
    console.log('\n💡 التوصيات:');
    if (centralStats[0].total_complaints === 0) {
      console.log('   ⚠️ القاعدة المركزية فارغة - تحتاج مزامنة فورية');
    } else if (hospitalStats.some(h => h.complaints_count === 0)) {
      console.log('   ⚠️ بعض المستشفيات لا تحتوي على بلاغات في المركزية');
    } else {
      console.log('   ✅ البيانات متزامنة بشكل جيد');
    }

  } catch (error) {
    console.error('❌ خطأ في التشخيص:', error.message);
  }
}

// تشغيل التشخيص
diagnoseDataSync().then(() => {
  console.log('\n✅ انتهى التشخيص');
  process.exit(0);
}).catch(error => {
  console.error('❌ فشل التشخيص:', error);
  process.exit(1);
});
