// backend/db/tenantManager.js
import mysql from 'mysql2/promise';
import { getCentralPool } from './centralPool.js';

const tenantPools = new Map();

function clean(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null; // '' و '   ' => null
}

async function loadHospitalConfig(hospitalId) {
  const central = await getCentralPool();
  const [rows] = await central.query(
    `SELECT HospitalID, DbHost, DbUser, DbPass, DbName, IsActive
       FROM hospitals
      WHERE HospitalID=? AND IFNULL(IsActive,1)=1`,
    [hospitalId]
  );
  return rows[0] || null;
}

export async function getTenantPoolByHospitalId(hospitalId) {
  if (tenantPools.has(hospitalId)) return tenantPools.get(hospitalId);

  const cfg = await loadHospitalConfig(hospitalId);
  if (!cfg) throw new Error(`Hospital ${hospitalId} not found or inactive`);

  // ✅ نظّف قيَم المركزي والبيئة معًا
  const host = clean(cfg.DbHost) || clean(process.env.DB_HOST) || '127.0.0.1';
  const user = clean(cfg.DbUser) || clean(process.env.DB_USER) || 'root';
  const password = clean(cfg.DbPass) || clean(process.env.DB_PASS) || 'Raneem11';
  const database = clean(cfg.DbName);
  if (!database) throw new Error(`Missing DbName for hospital ${hospitalId}`);

  const pool = mysql.createPool({
    host, user, password, database,
    waitForConnections: true,
    connectionLimit: 10,
    charset: 'utf8mb4',
  });

  tenantPools.set(hospitalId, pool);
  console.log(`✅ Connected to hospital DB: ${database} (HospitalID=${hospitalId}, user=${user || '(empty)'}@${host})`);
  return pool;
}

// إعادة تصدير getCentralPool ليكون متاحًا من tenantManager.js
export { getCentralPool };