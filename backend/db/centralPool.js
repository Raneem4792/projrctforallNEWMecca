// backend/db/centralPool.js
import mysql from 'mysql2/promise';

let centralPool;

async function getCentralPool() {
  if (!centralPool) {
    const host = process.env.CENTRAL_DB_HOST || process.env.DB_HOST || '127.0.0.1';
    const user = process.env.CENTRAL_DB_USER || process.env.DB_USER || 'root';
    const password = process.env.CENTRAL_DB_PASS || process.env.DB_PASS || 'Raneem11';
    const database = process.env.CENTRAL_DB_NAME || process.env.DB_NAME || 'hospitals_mecca4';

    console.log('🔗 محاولة الاتصال بالقاعدة المركزية:', {
      host,
      user,
      database: database,
      password: password ? '' : 'فارغة'
    });

    if (!host || !user || !database) {
      throw new Error('Missing CENTRAL_DB_* env vars. Required: CENTRAL_DB_HOST, CENTRAL_DB_USER, CENTRAL_DB_NAME');
    }

    centralPool = mysql.createPool({
      host,
      user,
      password,
      database,
      waitForConnections: true,
      connectionLimit: 10,
    });
  }
  return centralPool;
}

export { getCentralPool };
