import express from 'express';
import jwt from 'jsonwebtoken';
import config from '../config/multi-tenant.js';
import { getTenantPoolByHospitalId } from '../db/tenantManager.js';

const router = express.Router();

const STATIC_TRIPS = [
  'التنويم','الطوارئ','العيادات','الرعاية المنزلية','خدمات الأشعة',
  'مراكز القلب التنويم','مراكز القلب العيادات','مراكز الأورام التنويم','مراكز الأورام العيادات',
  'فحص ما قبل الزواج','خدمات الأسنان','مراكز الكلى القطاع الحكومي','مراكز الرعاية الأولية',
  'التأهيل الطبي العيادات','جراحة اليوم الواحد','بنوك الدم','مراكز علاج السكري'
].map(name => ({ TripName: name }));

const STATIC_ZONES = [
  'التقييم العام','الوجبات','الطبيب','فريق التمريض','الوصول','الغرفة','التسجيل',
  'الزوار والعائلة','المرافق','الصيدلة','المختبر','المسائل الشخصية','الرعاية المقدمة',
  'ذوي الإعاقة','بلاغات 937','غسيل الكلى','المواعيد والتسجيل','الانتقال خلال الزيارة',
  'التوعية والمعلومات','ترتيب الرعاية المنزلية'
].map(name => ({ ZoneName: name }));

router.get('/trips/list', (_req, res) => {
  res.json(STATIC_TRIPS);
});

router.get('/zones/list', (_req, res) => {
  res.json(STATIC_ZONES);
});

router.get('/treatment-trips', requireAuth, (req, res) => {
  withHospitalPool(req, res, async (pool) => {
    const [rows] = await pool.query('SELECT TripID, TripName, IFNULL(IsAvailable,0) AS IsAvailable FROM treatment_trips ORDER BY TripName');
    res.json({ data: rows || [] });
  });
});

router.get('/zones', requireAuth, (req, res) => {
  withHospitalPool(req, res, async (pool) => {
    const [rows] = await pool.query('SELECT ZoneID, ZoneName, IFNULL(IsAvailable,0) AS IsAvailable FROM zones ORDER BY ZoneName');
    res.json({ data: rows || [] });
  });
});

function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    return res.status(401).json({ success: false, message: 'مطلوب تسجيل الدخول' });
  }
  try {
    req.user = jwt.verify(token, config.jwt.secret);
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'انتهت الجلسة، سجّل الدخول مجدداً' });
  }
}

function resolveHospitalId(req) {
  return Number(
    req.headers['x-hospital-id'] ||
    req.headers['X-Hospital-Id'] ||
    req.headers['X-hospital-id'] ||
    req.user?.HospitalID ||
    req.user?.hospitalId ||
    req.user?.hosp ||
    req.query?.hospitalId ||
    req.query?.hid || 0
  );
}

async function ensureTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS treatment_trips (
      TripID INT AUTO_INCREMENT PRIMARY KEY,
      TripName VARCHAR(255) NOT NULL UNIQUE,
      IsAvailable TINYINT(1) DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS zones (
      ZoneID INT AUTO_INCREMENT PRIMARY KEY,
      ZoneName VARCHAR(255) NOT NULL UNIQUE,
      IsAvailable TINYINT(1) DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await Promise.all(
    STATIC_TRIPS.map(t => pool.query('INSERT IGNORE INTO treatment_trips (TripName) VALUES (?)', [t.TripName]))
  );
  await Promise.all(
    STATIC_ZONES.map(z => pool.query('INSERT IGNORE INTO zones (ZoneName) VALUES (?)', [z.ZoneName]))
  );
}

async function withHospitalPool(req, res, handler) {
  try {
    const hospitalId = resolveHospitalId(req);
    if (!hospitalId) {
      return res.status(400).json({ success: false, message: 'لا يمكن تحديد المستشفى الحالي' });
    }
    const pool = await getTenantPoolByHospitalId(hospitalId);
    await ensureTables(pool);
    await handler(pool, hospitalId);
  } catch (err) {
    console.error('❌ hospitalTrips error:', err);
    res.status(500).json({ success: false, message: 'خطأ في معالجة الطلب', details: err.message });
  }
}

router.get('/hospital/trips', requireAuth, (req, res) => {
  withHospitalPool(req, res, async (pool) => {
    const [rows] = await pool.query('SELECT TripName, IFNULL(IsAvailable,0) AS IsAvailable FROM treatment_trips ORDER BY TripID');
    res.json(rows || []);
  });
});

router.post('/hospital/trips/update', requireAuth, (req, res) => {
  withHospitalPool(req, res, async (pool) => {
    const { TripName, IsAvailable } = req.body || {};
    if (!TripName) {
      return res.status(400).json({ success: false, message: 'TripName مطلوب' });
    }
    const [result] = await pool.query('UPDATE treatment_trips SET IsAvailable=? WHERE TripName=?', [IsAvailable ? 1 : 0, TripName]);
    if (result.affectedRows === 0) {
      await pool.query('INSERT INTO treatment_trips (TripName, IsAvailable) VALUES (?, ?)', [TripName, IsAvailable ? 1 : 0]);
    }
    res.json({ success: true });
  });
});

router.get('/hospital/zones', requireAuth, (req, res) => {
  withHospitalPool(req, res, async (pool) => {
    const [rows] = await pool.query('SELECT ZoneName, IFNULL(IsAvailable,0) AS IsAvailable FROM zones ORDER BY ZoneID');
    res.json(rows || []);
  });
});

router.post('/hospital/zones/update', requireAuth, (req, res) => {
  withHospitalPool(req, res, async (pool) => {
    const { ZoneName, IsAvailable } = req.body || {};
    if (!ZoneName) {
      return res.status(400).json({ success: false, message: 'ZoneName مطلوب' });
    }
    const [result] = await pool.query('UPDATE zones SET IsAvailable=? WHERE ZoneName=?', [IsAvailable ? 1 : 0, ZoneName]);
    if (result.affectedRows === 0) {
      await pool.query('INSERT INTO zones (ZoneName, IsAvailable) VALUES (?, ?)', [ZoneName, IsAvailable ? 1 : 0]);
    }
    res.json({ success: true });
  });
});

export default router;

