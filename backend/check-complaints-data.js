// فحص بيانات جدول complaints
import { centralDb, getContextualPool } from './config/db.js';

async function checkComplaintsData() {
  console.log('🔍 فحص بيانات جدول complaints...\n');

  try {
    // 1. فحص القاعدة المركزية
    console.log('1. فحص القاعدة المركزية:');
    const [centralCount] = await centralDb.query('SELECT COUNT(*) as count FROM complaints');
    console.log(`   إجمالي البلاغات في المركزية: ${centralCount[0].count}`);

    if (centralCount[0].count > 0) {
      const [centralRows] = await centralDb.query(`
        SELECT 
          ComplaintID, TicketNumber, PatientFullName, HospitalID, 
          StatusCode, PriorityCode, CreatedAt, IsDeleted
        FROM complaints 
        ORDER BY CreatedAt DESC 
        LIMIT 5
      `);
      console.log('   عينة من البلاغات:');
      centralRows.forEach(row => {
        console.log(`   - ${row.TicketNumber}: ${row.PatientFullName} (مستشفى ${row.HospitalID}, ${row.StatusCode}, محذوف: ${row.IsDeleted})`);
      });
    }

    // 2. فحص مستشفى 11 (من التوكن)
    console.log('\n2. فحص مستشفى 11:');
    try {
      const pool = await getContextualPool({ hospitalId: 11 }, null);
      const [hospitalCount] = await pool.query('SELECT COUNT(*) as count FROM complaints');
      console.log(`   إجمالي البلاغات في مستشفى 11: ${hospitalCount[0].count}`);

      if (hospitalCount[0].count > 0) {
        const [hospitalRows] = await pool.query(`
          SELECT 
            ComplaintID, TicketNumber, PatientFullName, HospitalID, 
            StatusCode, PriorityCode, CreatedAt, IsDeleted
          FROM complaints 
          ORDER BY CreatedAt DESC 
          LIMIT 5
        `);
        console.log('   عينة من البلاغات:');
        hospitalRows.forEach(row => {
          console.log(`   - ${row.TicketNumber}: ${row.PatientFullName} (${row.StatusCode}, محذوف: ${row.IsDeleted})`);
        });
      }
    } catch (error) {
      console.log(`   خطأ في مستشفى 11: ${error.message}`);
    }

    // 3. اختبار الاستعلام المطابق للواجهة
    console.log('\n3. اختبار الاستعلام المطابق للواجهة:');
    
    // استعلام مشابه لما تستخدمه الواجهة
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

    // اختبار على المركزية
    console.log('   اختبار على المركزية:');
    const [centralTestRows] = await centralDb.query(testSQL, [11]);
    console.log(`   نتائج المركزية: ${centralTestRows.length} بلاغ`);
    centralTestRows.forEach(row => {
      console.log(`   - ${row.ticket}: ${row.fullName} (${row.status})`);
    });

    // اختبار على مستشفى 11
    console.log('   اختبار على مستشفى 11:');
    try {
      const pool = await getContextualPool({ hospitalId: 11 }, null);
      const [hospitalTestRows] = await pool.query(testSQL, [11]);
      console.log(`   نتائج مستشفى 11: ${hospitalTestRows.length} بلاغ`);
      hospitalTestRows.forEach(row => {
        console.log(`   - ${row.ticket}: ${row.fullName} (${row.status})`);
      });
    } catch (error) {
      console.log(`   خطأ في مستشفى 11: ${error.message}`);
    }

    // 4. فحص البلاغات المحذوفة
    console.log('\n4. فحص البلاغات المحذوفة:');
    const [deletedCount] = await centralDb.query('SELECT COUNT(*) as count FROM complaints WHERE IsDeleted = 1');
    console.log(`   البلاغات المحذوفة في المركزية: ${deletedCount[0].count}`);

    // 5. فحص الحالات المختلفة
    console.log('\n5. فحص الحالات المختلفة:');
    const [statusCounts] = await centralDb.query(`
      SELECT StatusCode, COUNT(*) as count 
      FROM complaints 
      WHERE (IsDeleted IS NULL OR IsDeleted = 0)
      GROUP BY StatusCode
    `);
    console.log('   توزيع الحالات:');
    statusCounts.forEach(row => {
      console.log(`   - ${row.StatusCode}: ${row.count}`);
    });

  } catch (error) {
    console.error('❌ خطأ في الفحص:', error);
  }
}

checkComplaintsData().then(() => {
  console.log('\n✅ انتهى الفحص');
  process.exit(0);
}).catch(error => {
  console.error('❌ فشل الفحص:', error);
  process.exit(1);
});
