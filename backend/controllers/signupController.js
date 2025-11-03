// controllers/signupController.js - كنترولر إنشاء الحساب مع اختيار المستشفى
import { getCentralPool, getHospitalPool } from '../dbManager.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { validationResult } from 'express-validator';

export async function signup(req, res, next) {
  try {
    // 1) التحقق من المدخلات
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        message: errors.array()[0].msg 
      });
    }

    const { 
      fullName = req.body.full_name || req.body.name || '',
      username = req.body.user_name || '',
      email = req.body.email_address || '',
      password = '',
      hospitalId = req.body.hospital_id || null,
      roleCode = req.body.role_code || 'EMPLOYEE', 
      departmentId = req.body.department_id || null 
    } = req.body;

    // التحقق من البيانات المطلوبة
    if (!fullName || !fullName.trim()) {
      return res.status(400).json({ 
        success: false, 
        message: 'الاسم الكامل مطلوب' 
      });
    }
    
    if (!username || !username.trim()) {
      return res.status(400).json({ 
        success: false, 
        message: 'اسم المستخدم مطلوب' 
      });
    }
    
    if (!password || password.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'كلمة المرور مطلوبة ويجب أن تكون 6 أحرف على الأقل' 
      });
    }
    
    if (!hospitalId) {
      return res.status(400).json({ 
        success: false, 
        message: 'المستشفى مطلوب' 
      });
    }

    // 2) الاتصال بالقاعدة المركزية
    const central = await getCentralPool();
    const conn = await central.getConnection();
    
    try {
      await conn.beginTransaction();

      // 3) التحقق من وجود المستشفى ومفعل
      const [hRows] = await conn.query(
        `SELECT HospitalID, NameAr FROM hospitals WHERE HospitalID = ? AND IsActive = 1`, 
        [hospitalId]
      );
      
      if (!hRows.length) {
        await conn.rollback();
        return res.status(404).json({ 
          success: false, 
          message: 'المستشفى غير موجود أو غير مفعل' 
        });
      }

      const hospital = hRows[0];

      // 4) التحقق من تفرّد اسم المستخدم والبريد في القاعدة المركزية
      const [dupe] = await conn.query(
        `SELECT 1 FROM users WHERE Username = ? OR (Email IS NOT NULL AND Email = ?) LIMIT 1`,
        [username, email || null]
      );
      
      if (dupe.length) {
        await conn.rollback();
        return res.status(409).json({ 
          success: false, 
          message: 'اسم المستخدم أو البريد مستخدم مسبقًا' 
        });
      }

      // 5) تجزئة كلمة المرور
      const passHash = await bcrypt.hash(password, 12);

      // 6) إنشاء المستخدم في القاعدة المركزية
      const [uRes] = await conn.query(`
        INSERT INTO users (FullName, Username, Email, PasswordHash, IsActive, CreatedAt)
        VALUES (?, ?, ?, ?, 1, NOW())
      `, [fullName, username, email || null, passHash]);
      
      const centralUserId = uRes.insertId;

      // 7) جلب معرف الدور
      const [rRows] = await conn.query(
        `SELECT RoleID, Code FROM roles WHERE Code IN ('HOSPITAL_ADMIN', 'EMPLOYEE') AND IsActive = 1`
      );
      
      const roleMap = Object.fromEntries(rRows.map(r => [r.Code, r.RoleID]));
      const roleId = roleMap[roleCode] || roleMap['EMPLOYEE'];

      if (!roleId) {
        await conn.rollback();
        return res.status(400).json({ 
          success: false, 
          message: 'الدور المحدد غير موجود' 
        });
      }

      // 8) تعيين الدور للمستخدم في القاعدة المركزية
      await conn.query(`
        INSERT INTO user_roles (UserID, RoleID, HospitalID, IsActive, CreatedAt)
        VALUES (?, ?, ?, 1, NOW())
      `, [centralUserId, roleId, hospitalId]);

      // 9) إنشاء المستخدم في قاعدة بيانات المستشفى المختارة
      const hospPool = await getHospitalPool(hospitalId);
      const [hURes] = await hospPool.query(`
        INSERT INTO users (FullName, Username, Email, PasswordHash, DepartmentID, IsActive, CreatedAt, CentralUserID)
        VALUES (?, ?, ?, ?, ?, 1, NOW(), ?)
      `, [fullName, username, email || null, passHash, departmentId, centralUserId]);

      await conn.commit();

      // 10) إصدار JWT لنطاق المستشفى مباشرة
      const token = jwt.sign({
        UserID: centralUserId,
        RoleCode: roleCode,
        HospitalID: Number(hospitalId),
        Perms: roleCode === 'HOSPITAL_ADMIN' 
          ? ['dashboard.view', 'complaints.read', 'complaints.create', 'users.manage']
          : ['dashboard.view', 'complaints.read', 'complaints.create']
      }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES || '7d' });

      return res.status(201).json({
        success: true,
        token,
        mode: 'hospital',
        hospital: {
          HospitalID: Number(hospitalId),
          NameAr: hospital.NameAr
        },
        user: {
          UserID: centralUserId,
          FullName: fullName,
          Username: username,
          Email: email,
          RoleCode: roleCode
        },
        message: 'تم إنشاء الحساب وتسجيل الدخول بنجاح'
      });

    } catch (err) {
      try { 
        await conn.rollback(); 
      } catch (rollbackErr) {
        console.error('خطأ في التراجع:', rollbackErr);
      }
      throw err;
    } finally {
      conn.release();
    }

  } catch (err) {
    console.error('خطأ في إنشاء الحساب:', err);
    
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ 
        success: false, 
        message: 'اسم المستخدم أو البريد مستخدم مسبقًا' 
      });
    }
    
    next(err);
  }
}

/**
 * جلب قائمة المستشفيات المتاحة للتسجيل
 */
export async function getAvailableHospitals(req, res, next) {
  try {
    const central = await getCentralPool();
    
    const [hospitals] = await central.query(`
SELECT HospitalID, NameAr, Code
FROM hospitals
WHERE IsActive = 1
ORDER BY NameAr;

    `);

    res.json({
      success: true,
      data: hospitals,
      message: 'تم جلب قائمة المستشفيات بنجاح'
    });

  } catch (error) {
    console.error('خطأ في جلب المستشفيات:', error);
    next(error);
  }
}

/**
 * جلب الأقسام المتاحة في مستشفى محدد
 */
export async function getHospitalDepartments(req, res, next) {
  try {
    const { hospitalId } = req.params;
    
    if (!hospitalId) {
      return res.status(400).json({ 
        success: false, 
        message: 'معرف المستشفى مطلوب' 
      });
    }

    const hospPool = await getHospitalPool(hospitalId);
    
    const [departments] = await hospPool.query(`
      SELECT DepartmentID, NameAr, Description
      FROM departments 
      WHERE IsActive = 1 
      ORDER BY NameAr
    `);

    res.json({
      success: true,
      data: departments,
      message: 'تم جلب قائمة الأقسام بنجاح'
    });

  } catch (error) {
    console.error('خطأ في جلب الأقسام:', error);
    next(error);
  }
}
