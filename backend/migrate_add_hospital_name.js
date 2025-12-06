import { createPool } from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function migrate() {
  console.log('🚀 Starting migration for complaint_targets table (Add TargetHospitalName)...');

  const pool = createPool({
    host: process.env.CENTRAL_DB_HOST || '127.0.0.1',
    user: process.env.CENTRAL_DB_USER || 'root',
    password: process.env.CENTRAL_DB_PASS || 'SamarAmer12345@',
    database: process.env.CENTRAL_DB_NAME || 'hospitals_mecca3',
    waitForConnections: true,
    connectionLimit: 1,
    queueLimit: 0
  });

  try {
    const conn = await pool.getConnection();
    console.log('✅ Connected to database.');

    try {
      // Check if column exists
      const [rows] = await conn.query("SHOW COLUMNS FROM complaint_targets LIKE 'TargetHospitalName'");
      if (rows.length === 0) {
        console.log('➕ Adding column TargetHospitalName...');
        await conn.query("ALTER TABLE complaint_targets ADD COLUMN TargetHospitalName VARCHAR(150) NULL COMMENT 'اسم المنشأة المستهدفة'");
        console.log('✅ Column TargetHospitalName added.');
      } else {
        console.log('ℹ️ Column TargetHospitalName already exists.');
      }
    } catch (err) {
      console.error(`❌ Error adding column:`, err.message);
    }

    console.log('🏁 Migration completed.');
    conn.release();
  } catch (err) {
    console.error('❌ Migration failed:', err);
  } finally {
    await pool.end();
  }
}

migrate();
