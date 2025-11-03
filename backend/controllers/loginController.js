// controllers/loginController.js
import { pool } from '../config/db.js';
import { getCentralPool } from '../db/centralPool.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { validationResult } from 'express-validator';

function signToken(user, remember = false) {
  // ✅ تحديد نطاق المستخدم
  const scope = user.HospitalID ? 'hospital' : 'central';
  
  const payload = { 
    uid: user.UserID,
    userId: user.UserID,
    roleId: user.RoleID,
    scope: scope,
    roleScope: scope === 'central' ? 'cluster' : 'hospital',
    // ✅ HospitalID قد يكون null للمستخدم المركزي
    HospitalID: user.HospitalID || null,
    hosp: user.HospitalID || null,
    hospitalId: user.HospitalID || null,
    // DepartmentID للمستخدمين العاديين فقط
    dept: user.DepartmentID || null,
    departmentId: user.DepartmentID || null
  };
  
  const exp = remember ? (process.env.JWT_EXPIRES_REMEMBER || '30d')
                       : (process.env.JWT_EXPIRES || '7d');
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: exp });
}

export async function login(req, res, next) {
  try {
    // 1) تحقق المدخلات
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        message: errors.array()[0].msg 
      });
    }

    // ✅ دعم كلا الحقلين: usernameOrEmail و username (للتوافق مع الواجهات المختلفة)
    const usernameOrEmail = req.body.usernameOrEmail || req.body.username;
    const { password, remember = false } = req.body;
    
    if (!usernameOrEmail || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'اسم المستخدم وكلمة المرور مطلوبة' 
      });
    }
    
    console.log('🔐 محاولة تسجيل دخول:', usernameOrEmail);

    // ✅ حل مبسط ونهائي: البحث في جميع قواعد البيانات
    const centralPool = await getCentralPool();
    let user = null;

    console.log(`🔍 Searching for user: ${usernameOrEmail}`);

    // 1) البحث في جميع قواعد المستشفيات أولاً
    const [hospitals] = await centralPool.query(
      'SELECT HospitalID FROM hospitals WHERE IsActive = 1'
    );
    
    for (const hospital of hospitals) {
      try {
        const { getHospitalPool } = await import('../middleware/hospitalPool.js');
        const hospitalPool = await getHospitalPool(hospital.HospitalID);
        
        const [hospitalRows] = await hospitalPool.query(
          `SELECT u.UserID, u.RoleID, u.HospitalID, u.DepartmentID,
                  u.FullName, u.Username, u.Email, u.Mobile, u.PasswordHash, u.IsActive,
                  h.NameAr AS HospitalNameAr, d.NameAr AS DepartmentNameAr
             FROM users u
        LEFT JOIN hospitals h  ON h.HospitalID  = u.HospitalID
        LEFT JOIN departments d ON d.DepartmentID = u.DepartmentID
            WHERE (u.Username = ? OR (u.Email IS NOT NULL AND u.Email = ?)) 
              AND u.HospitalID = ? AND u.IsActive = 1
            LIMIT 1`,
          [usernameOrEmail, usernameOrEmail, hospital.HospitalID]
        );
        
        if (hospitalRows.length) {
          user = hospitalRows[0];
          console.log(`✅ Found user in hospital ${hospital.HospitalID}: ${user.Username}`);
          
          // مزامنة المستخدم إلى user_directory إذا لم يكن موجوداً
          try {
            await centralPool.query(
              `INSERT IGNORE INTO user_directory 
               (Username, HospitalID, RoleID, IsActive, CreatedAt, UpdatedAt) 
               VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
              [user.Username, user.HospitalID, user.RoleID, user.IsActive]
            );
            console.log(`🔄 Synced user to user_directory: ${user.Username}`);
          } catch (syncError) {
            console.warn(`⚠️ Failed to sync user to user_directory:`, syncError);
          }
          
          break;
        }
      } catch (error) {
        console.error(`❌ Error searching in hospital ${hospital.HospitalID}:`, error);
      }
    }

    // 2) إذا لم يتم العثور في المستشفيات، ابحث في القاعدة المركزية
    if (!user) {
      console.log(`🔍 Searching in central database for: ${usernameOrEmail}`);
      const [centralRows] = await centralPool.query(
        `SELECT u.UserID, u.RoleID, u.HospitalID, u.DepartmentID,
                u.FullName, u.Username, u.Email, u.Mobile, u.PasswordHash, u.IsActive,
                h.NameAr AS HospitalNameAr, d.NameAr AS DepartmentNameAr
           FROM users u
      LEFT JOIN hospitals h  ON h.HospitalID  = u.HospitalID
      LEFT JOIN departments d ON d.DepartmentID = u.DepartmentID
          WHERE (u.Username = ? OR (u.Email IS NOT NULL AND u.Email = ?)) 
            AND (u.HospitalID IS NULL OR u.HospitalID = 0) AND u.IsActive = 1
          LIMIT 1`,
        [usernameOrEmail, usernameOrEmail]
      );
      
      if (centralRows.length) {
        user = centralRows[0];
        console.log(`✅ Found user in central database: ${user.Username}`);
      }
    }

    if (!user) {
      // 3) إذا لم يتم العثور على المستخدم، تحقق من user_directory وحذف السجلات الميتة
      console.log(`🔍 User not found, checking user_directory for cleanup...`);
      try {
        const [userDirRows] = await centralPool.query(
          'SELECT Username, HospitalID FROM user_directory WHERE Username = ?',
          [usernameOrEmail]
        );
        
        if (userDirRows.length) {
          console.log(`🧹 Found orphaned user in user_directory: ${usernameOrEmail}, cleaning up...`);
          await centralPool.query(
            'DELETE FROM user_directory WHERE Username = ?',
            [usernameOrEmail]
          );
          console.log(`✅ Cleaned up orphaned user from user_directory: ${usernameOrEmail}`);
        }
      } catch (cleanupError) {
        console.warn('⚠️ Error during cleanup:', cleanupError);
      }
      
      return res.status(401).json({ 
        success: false, 
        message: 'بيانات الدخول غير صحيحة' 
      });
    }

    // ✅ معاملة HospitalID = 0 كـ NULL
    if (user.HospitalID === 0) {
      user.HospitalID = null;
    }

    if (!user.IsActive) {
      return res.status(403).json({ 
        success: false, 
        message: 'الحساب موقوف' 
      });
    }
    
    console.log(`🔍 LOGIN: Username=${user.Username}, RoleID=${user.RoleID}, HospitalID=${user.HospitalID}`);

    // 3) تحقق كلمة المرور مع التوافقية الرجعية
    let ok = false;
    if (user.PasswordHash?.startsWith('$2')) {
      // Bcrypt طبيعي
      ok = await bcrypt.compare(password, user.PasswordHash);
    } else if (/^[a-f0-9]{64}$/i.test(user.PasswordHash || '')) {
      // دعم SHA-256 القديم: احسب SHA-256 للمدخل وقارن، ثم رحّل إلى Bcrypt
      const enc = new TextEncoder();
      const buf = await crypto.subtle.digest('SHA-256', enc.encode(password));
      const hex = Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
      ok = (hex.toLowerCase() === String(user.PasswordHash).toLowerCase());
      if (ok) {
        const newHash = await bcrypt.hash(password, 10);
        try {
          const { getHospitalPool } = await import('../middleware/hospitalPool.js');
          const hp = await getHospitalPool(user.HospitalID || 0);
          await hp.query('UPDATE users SET PasswordHash=? WHERE UserID=?', [newHash, user.UserID]);
          console.log('🔄 Migrated legacy SHA-256 hash to Bcrypt for user', user.Username);
        } catch (migrationError) {
          console.warn('⚠️ Failed to migrate legacy hash:', migrationError);
        }
      }
    }
    
    if (!ok) {
      return res.status(401).json({ 
        success: false, 
        message: 'بيانات الدخول غير صحيحة' 
      });
    }

    // 4) اجلب أعلام الصلاحيات (اختياري لكن مفيد للواجهة)
    // للمستخدمين المركزيين، قد لا توجد أعلام (يُسمح بكل شيء)
    let flags = null;
    if (user.HospitalID) {
      // فقط للمستخدمين المرتبطين بمستشفى
      try {
        const [[result]] = await centralPool.query(
          `SELECT * FROM user_permission_flags WHERE UserID = ?`, 
          [user.UserID]
        );
        flags = result || null;
      } catch (e) {
        // تجاهل الأخطاء - الأعلام اختيارية
        console.log('⚠️ لا توجد أعلام صلاحيات للمستخدم');
      }
    }

    // 5) كوّن التوكن والرد
    const token = signToken(user, !!remember);

    // لا ترجع الهاش
    delete user.PasswordHash;
    
    // ✅ تحديد نوع المستخدم ونطاقه
    const scope = user.HospitalID ? 'hospital' : 'central';
    const roleCode = user.RoleID === 1 ? 'CLUSTER_ADMIN' : 
                     user.RoleID === 2 ? 'HOSPITAL_ADMIN' : 
                     user.RoleID === 3 ? 'EMPLOYEE' : 'DEPT_ADMIN';
    
    console.log(`✅ تسجيل دخول ناجح: ${user.Username} (Role: ${roleCode}, Scope: ${scope}, Hospital: ${user.HospitalID || 'N/A'})`);

    res.json({
      success: true,
      message: 'تم تسجيل الدخول بنجاح',
      token,
      user: {
        ...user,
        RoleCode: roleCode,
        Scope: scope,
        HospitalName: user.HospitalNameAr || null,
        DepartmentName: user.DepartmentNameAr || null
      },
      permissions: flags || null
    });
  } catch (err) {
    next(err);
  }
}
