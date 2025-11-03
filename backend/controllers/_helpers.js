// controllers/_helpers.js
// دوال مساعدة مشتركة بين controllers

import { getCentralPool, getHospitalPool } from '../middleware/hospitalPool.js';

/**
 * دالة ذكية لتحديد hospitalId للبلاغ (آمنة)
 * نفس الدالة المستخدمة في complaintResponsesController
 */
// فاحص سريع لوجود المستشفى ومفعّل
async function hospitalExists(hid) {
  try {
    const central = await getCentralPool();
    const [rows] = await central.query(
      `SELECT 1
         FROM hospitals
        WHERE HospitalID = ?
          AND COALESCE(IsActive, Active, 1) = 1
        LIMIT 1`,
      [hid]
    );
    return rows.length > 0;
  } catch (e) {
    return false;
  }
}

export async function resolveHospitalIdForComplaint(req, complaintId) {
  console.log('🔍 [resolveHospitalIdForComplaint] البحث عن البلاغ:', complaintId);
  
  // خذي من الـ query أو من الـ body إن وُجد
  const qId = Number(req.query?.hospitalId || 0);
  const bId = Number(req.body?.hospitalId || 0);
  const uId = Number(req.user?.HospitalID || 0); // قد يكون null لمدير التجمع

  // ✅ جرّبي المرشحين لكن اقبلي فقط الموجودين فعلاً
  for (const hid of [qId, bId, uId]) {
    if (hid && await hospitalExists(hid)) {
      console.log('✅ [resolveHospitalIdForComplaint] تم العثور على مستشفى صحيح:', hid);
      const found = await complaintExistsInHospital(hid, { complaintId });
      if (found) {
        console.log('✅ [resolveHospitalIdForComplaint] تم العثور على البلاغ في المستشفى:', hid);
        return hid;
      }
    }
  }

  // 🔎 لو مافي رقم صالح، استنتجي المستشفى من البلاغ نفسه
  try {
    console.log('🔍 [resolveHospitalIdForComplaint] البحث في جميع المستشفيات...');
    const hospitals = await getActiveHospitals();
    console.log('📋 [resolveHospitalIdForComplaint] عدد المستشفيات:', hospitals.length);
    
    for (const h of hospitals) {
      const hid = Number(h.HospitalID);
      console.log('🔍 [resolveHospitalIdForComplaint] فحص المستشفى:', hid);
      const found = await complaintExistsInHospital(hid, { complaintId });
      if (found) {
        console.log('✅ [resolveHospitalIdForComplaint] تم العثور على البلاغ في المستشفى:', hid);
        return hid;
      }
    }
  } catch (e) {
    console.error('❌ [resolveHospitalIdForComplaint] خطأ في البحث:', e.message);
  }

  throw new Error(`تعذّر تحديد مستشفى البلاغ (${complaintId})`);
}

/**
 * تأكيد أنّ البلاغ موجود في قاعدة مستشفى معيّن (آمن)
 */
export async function complaintExistsInHospital(hospitalId, { complaintId, globalId }) {
  let pool;
  try {
    pool = await getHospitalPool(hospitalId);
  } catch (e) {
    console.log('❌ [complaintExistsInHospital] خطأ في الاتصال بالمستشفى:', hospitalId, e.message);
    return null;
  }
  
  // جرب البحث بـ ComplaintID أولاً (الأسرع)
  if (complaintId) {
    try {
      const [[rowC]] = await pool.query(
        'SELECT ComplaintID FROM complaints WHERE ComplaintID = ? LIMIT 1',
        [complaintId]
      );
      if (rowC) {
        console.log('✅ [complaintExistsInHospital] تم العثور على البلاغ في المستشفى:', hospitalId);
        return rowC.ComplaintID;
      }
    } catch (e) {
      console.log('❌ [complaintExistsInHospital] خطأ في البحث بـ ComplaintID:', e.message);
    }
  }
  
  // جرب البحث بـ GlobalID (إذا كان متوفراً)
  if (globalId) {
    try {
      const [[rowG]] = await pool.query(
        'SELECT ComplaintID FROM complaints WHERE GlobalID = ? LIMIT 1',
        [globalId]
      );
      if (rowG) {
        console.log('✅ [complaintExistsInHospital] تم العثور على البلاغ بـ GlobalID في المستشفى:', hospitalId);
        return rowG.ComplaintID;
      }
    } catch (e) {
      console.log('❌ [complaintExistsInHospital] خطأ في البحث بـ GlobalID:', e.message);
    }
  }
  
  console.log('❌ [complaintExistsInHospital] البلاغ غير موجود في المستشفى:', hospitalId);
  return null;
}

/**
 * جلب كل المستشفيات المفعّلة مع أعمدة الاتصال
 */
export async function getActiveHospitals() {
  const central = await getCentralPool();
  const [rows] = await central.query(
    `SELECT HospitalID, DbHost, DbName, DbUser, DbPass
     FROM hospitals
     WHERE COALESCE(IsActive, Active, 1) = 1
     ORDER BY HospitalID ASC`
  );
  return rows;
}

/**
 * دالة لضمان وجود Shadow User في جدول users من user_directory
 * نفس الدالة المستخدمة في complaintResponsesController
 */
export async function ensureLocalUserForDirectory(pool, username, hospitalId, departmentId = 0) {
  try {
    // تحقق من وجود المستخدم في جدول users
    const [[existingUser]] = await pool.query(
      'SELECT UserID FROM users WHERE Username = ? LIMIT 1',
      [username]
    );
    
    if (existingUser) {
      return existingUser.UserID;
    }

    // جلب بيانات المستخدم من user_directory
    const [[dirUser]] = await pool.query(
      `SELECT Username, FullName, Email, Phone, RoleID, DepartmentID
       FROM user_directory 
       WHERE Username = ? LIMIT 1`,
      [username]
    );

    if (!dirUser) {
      throw new Error(`المستخدم ${username} غير موجود في user_directory`);
    }

    // إنشاء Shadow User في جدول users
    const [insertResult] = await pool.query(
      `INSERT INTO users 
       (Username, FullName, Email, Phone, RoleID, DepartmentID, HospitalID, IsActive, CreatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, NOW())`,
      [
        dirUser.Username,
        dirUser.FullName || dirUser.Username,
        dirUser.Email || null,
        dirUser.Phone || null,
        dirUser.RoleID || 1,
        dirUser.DepartmentID || departmentId,
        hospitalId,
      ]
    );

    return insertResult.insertId;
  } catch (error) {
    console.error('خطأ في ensureLocalUserForDirectory:', error);
    throw error;
  }
}

/**
 * تحديد UserID المحلي (Shadow User للموظفين)
 * نفس المنطق المستخدم في complaintResponsesController
 */
export async function resolveResponderUserId(req, hospitalId) {
  const pool = await getHospitalPool(hospitalId);

  const roleId = Number(req.user?.RoleID || 0);
  const userId = Number(req.user?.UserID || 0);
  const username = (req.user?.Username || req.user?.username || '').trim();
  const fullName = (req.user?.FullName || req.user?.fullName || username || 'Cluster User').trim();

  // 👑 مدير التجمع: أنشيء/استخدمي مستخدم Proxy محلي باسم ثابت
  if (roleId === 1) {
    const proxy = `central_${userId || 'user'}`;
    const [u] = await pool.query(`SELECT UserID FROM users WHERE Username=? LIMIT 1`, [proxy]);
    if (u.length) return u[0].UserID;

    const [ins] = await pool.query(
      `INSERT INTO users (RoleID, HospitalID, DepartmentID, FullName, Username, Email, Mobile, PasswordHash, IsActive, CreatedAt)
       VALUES (2, ?, NULL, ?, ?, NULL, NULL, '$2b$10$placeholderhashxxxxxxxxxxxxxxx', 1, NOW())`,
      [hospitalId, fullName, proxy]
    );
    return ins.insertId;
  }

  // 👷 موظف المستشفى:
  if (username) {
    // لو عندك user_directory، تأكدي من وجوده (اختياري)
    // ثم ابحثي/أنشئي المستخدم في جدول users المحلي
    const [u] = await pool.query(`SELECT UserID FROM users WHERE Username=? LIMIT 1`, [username]);
    if (u.length) return u[0].UserID;

    const [ins] = await pool.query(
      `INSERT INTO users (RoleID, HospitalID, DepartmentID, FullName, Username, Email, Mobile, PasswordHash, IsActive, CreatedAt)
       VALUES (2, ?, NULL, ?, ?, NULL, NULL, '$2b$10$placeholderhashxxxxxxxxxxxxxxx', 1, NOW())`,
      [hospitalId, fullName || username, username]
    );
    return ins.insertId;
  }

  // لا تعتمدي على HospitalID في التوكن إطلاقًا
  throw new Error('تعذّر تحديد المستخدم المحلي'); // بدل "Hospital ID مفقود في التوكن"
}
