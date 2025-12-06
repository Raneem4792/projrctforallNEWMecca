import { createPool } from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function migrate() {
  console.log('🚀 Starting migration for complaint_targets table (Add HospitalID)...');

  const centralPool = createPool({
    host: process.env.CENTRAL_DB_HOST || '127.0.0.1',
    user: process.env.CENTRAL_DB_USER || 'root',
    password: process.env.CENTRAL_DB_PASS || 'SamarAmer12345@',
    database: process.env.CENTRAL_DB_NAME || 'hospitals_mecca3',
    waitForConnections: true,
    connectionLimit: 1,
    queueLimit: 0
  });

  try {
    console.log('✅ Connected to central database.');

    // جلب قائمة جميع المستشفيات النشطة
    const [hospitals] = await centralPool.query(`
      SELECT HospitalID, NameAr, DbHost, DbUser, DbPass, DbName
      FROM hospitals
      WHERE IsActive = 1
        AND DbName IS NOT NULL 
        AND DbName != ''
      ORDER BY HospitalID
    `);

    console.log(`📋 عدد المستشفيات النشطة: ${hospitals.length}`);

    if (hospitals.length === 0) {
      console.log('⚠️ لا توجد مستشفيات نشطة للمعالجة');
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    // معالجة كل مستشفى
    for (const hospital of hospitals) {
      try {
        console.log(`\n🔍 معالجة مستشفى: ${hospital.NameAr} (ID: ${hospital.HospitalID}, DB: ${hospital.DbName})`);

        // إنشاء اتصال بقاعدة بيانات المستشفى
        const hospitalPool = createPool({
          host: hospital.DbHost || process.env.CENTRAL_DB_HOST || '127.0.0.1',
          user: hospital.DbUser || process.env.CENTRAL_DB_USER || 'root',
          password: hospital.DbPass !== null && hospital.DbPass !== '' 
            ? hospital.DbPass 
            : (process.env.CENTRAL_DB_PASS || 'SamarAmer12345@'),
          database: hospital.DbName,
          waitForConnections: true,
          connectionLimit: 1,
          queueLimit: 0
        });

        try {
          // التحقق من وجود الجدول
          const [tables] = await hospitalPool.query(`SHOW TABLES LIKE 'complaint_targets'`);
          if (tables.length === 0) {
            console.log(`⚠️ الجدول complaint_targets غير موجود في ${hospital.DbName}`);
            await hospitalPool.end();
            continue;
          }

          // التحقق من وجود العمود
          const [columns] = await hospitalPool.query(`SHOW COLUMNS FROM complaint_targets LIKE 'HospitalID'`);
          if (columns.length === 0) {
            console.log(`➕ إضافة عمود HospitalID...`);
            await hospitalPool.query(`
              ALTER TABLE complaint_targets 
              ADD COLUMN HospitalID INT NULL COMMENT 'معرف المستشفى'
            `);
            console.log(`✅ تم إضافة عمود HospitalID`);
          } else {
            console.log(`ℹ️ عمود HospitalID موجود بالفعل`);
          }

          // تحديث القيم الموجودة باستخدام HospitalID الحالي
          const [updateResult] = await hospitalPool.query(`
            UPDATE complaint_targets 
            SET HospitalID = ?
            WHERE HospitalID IS NULL
          `, [hospital.HospitalID]);

          if (updateResult.affectedRows > 0) {
            console.log(`✅ تم تحديث ${updateResult.affectedRows} سجل بقيمة HospitalID = ${hospital.HospitalID}`);
          } else {
            console.log(`ℹ️ لا توجد سجلات تحتاج إلى تحديث`);
          }

          successCount++;
        } catch (err) {
          console.error(`❌ خطأ في معالجة مستشفى ${hospital.NameAr}:`, err.message);
          errorCount++;
        } finally {
          await hospitalPool.end();
        }

        // انتظار قصير بين المستشفيات
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (err) {
        console.error(`❌ خطأ في الاتصال بمستشفى ${hospital.NameAr}:`, err.message);
        errorCount++;
      }
    }

    console.log('\n─────────────────────────────────────────────────');
    console.log('📊 ملخص Migration:');
    console.log(`   ✅ نجح: ${successCount}`);
    console.log(`   ❌ فشل: ${errorCount}`);
    console.log('🏁 Migration completed.');
  } catch (err) {
    console.error('❌ Migration failed:', err);
  } finally {
    await centralPool.end();
  }
}

migrate().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
