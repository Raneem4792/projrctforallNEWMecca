// اختبار بيانات سجل البلاغات
import { centralDb, getContextualPool } from './config/db.js';

async function testHistoryData() {
  console.log('🧪 اختبار بيانات سجل البلاغات...\n');

  try {
    // 1. فحص القاعدة المركزية
    console.log('1. فحص القاعدة المركزية:');
    const [centralRows] = await centralDb.query('SELECT COUNT(*) as count FROM complaints');
    console.log(`   إجمالي البلاغات في المركزية: ${centralRows[0].count}`);

    if (centralRows[0].count > 0) {
      const [sampleRows] = await centralDb.query('SELECT ComplaintID, TicketNumber, PatientFullName, HospitalID FROM complaints LIMIT 5');
      console.log('   عينة من البلاغات:');
      sampleRows.forEach(row => {
        console.log(`   - ${row.TicketNumber}: ${row.PatientFullName} (مستشفى ${row.HospitalID})`);
      });
    }

    // 2. فحص قواعد المستشفيات
    console.log('\n2. فحص قواعد المستشفيات:');
    const [hospitals] = await centralDb.query('SELECT HospitalID, NameAr, Code FROM hospitals LIMIT 5');
    
    for (const hospital of hospitals) {
      try {
        const pool = await getContextualPool({ hospitalId: hospital.HospitalID }, null);
        const [rows] = await pool.query('SELECT COUNT(*) as count FROM complaints');
        console.log(`   مستشفى ${hospital.HospitalID} (${hospital.NameAr}): ${rows[0].count} بلاغ`);
        
        if (rows[0].count > 0) {
          const [sampleRows] = await pool.query('SELECT ComplaintID, TicketNumber, PatientFullName FROM complaints LIMIT 3');
          console.log('     عينة:');
          sampleRows.forEach(row => {
            console.log(`     - ${row.TicketNumber}: ${row.PatientFullName}`);
          });
        }
      } catch (error) {
        console.log(`   مستشفى ${hospital.HospitalID}: خطأ - ${error.message}`);
      }
    }

    // 3. اختبار استعلام مشابه للواجهة
    console.log('\n3. اختبار استعلام مشابه للواجهة:');
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
        DATE_FORMAT(c.CreatedAt, '%Y-%m-%d %H:%i') AS createdAt
      FROM complaints c
      WHERE 1=1
        AND (c.IsDeleted IS NULL OR c.IsDeleted = 0)
      ORDER BY c.CreatedAt DESC
      LIMIT 5
    `;

    // اختبار على المركزية
    const [centralTestRows] = await centralDb.query(testSQL);
    console.log(`   نتائج المركزية: ${centralTestRows.length} بلاغ`);
    centralTestRows.forEach(row => {
      console.log(`   - ${row.ticket}: ${row.fullName} (${row.status})`);
    });

    // اختبار على مستشفى 11
    try {
      const pool = await getContextualPool({ hospitalId: 11 }, null);
      const [hospitalTestRows] = await pool.query(testSQL);
      console.log(`   نتائج مستشفى 11: ${hospitalTestRows.length} بلاغ`);
      hospitalTestRows.forEach(row => {
        console.log(`   - ${row.ticket}: ${row.fullName} (${row.status})`);
      });
    } catch (error) {
      console.log(`   خطأ في مستشفى 11: ${error.message}`);
    }

  } catch (error) {
    console.error('❌ خطأ في الاختبار:', error);
  }
}

testHistoryData().then(() => {
  console.log('\n✅ انتهى الاختبار');
  process.exit(0);
}).catch(error => {
  console.error('❌ فشل الاختبار:', error);
  process.exit(1);
});
