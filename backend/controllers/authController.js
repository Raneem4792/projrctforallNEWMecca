// controllers/authController.js
import { pool } from '../config/db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { validationResult } from 'express-validator';

function signToken(user) {
  const payload = { uid: user.UserID, role: user.RoleID, hosp: user.HospitalID, dept: user.DepartmentID };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES || '7d' });
}

export async function signup(req, res, next) {
  try {
    // 1) التحقق من المدخلات
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const msg = errors.array()[0].msg;
      return res.status(400).json({ success: false, message: msg, errors: errors.array() });
    }

    // 2) استقبل كل صيغ القسم (قديم/جديد)
    const {
      FullName, Username, Mobile, NationalID,
      MainDepartmentID, SubDepartmentID, DepartmentID,  // <-- مهم جداً
      Email, Password
    } = req.body;

    // 3) حددي القسم النهائي (أولوية: فرعي ثم رئيسي ثم DepartmentID القديم)
    const finalDeptId = Number(SubDepartmentID) || Number(MainDepartmentID) || Number(DepartmentID) || null;
    if (!finalDeptId) {
      return res.status(400).json({ success: false, message: 'الرجاء اختيار القسم' });
    }

    // 4) اجلب HospitalID من القسم وتأكد أنه مُفعل
    const [[dept]] = await pool.query(
      'SELECT DepartmentID, HospitalID FROM departments WHERE DepartmentID = ? AND IsActive = 1',
      [finalDeptId]
    );
    if (!dept) {
      return res.status(400).json({ success: false, message: 'القسم المحدد غير موجود أو غير مُفعل' });
    }

    // 5) تحقق من التفرّد
    const [dups] = await pool.query(
      `SELECT Username, Email, Mobile, NationalID FROM users
       WHERE Username = ? OR (Email IS NOT NULL AND Email = ?) OR
             (Mobile IS NOT NULL AND Mobile = ?) OR
             (NationalID IS NOT NULL AND NationalID = ?)`,
      [Username, Email || null, Mobile || null, NationalID || null]
    );
    if (dups.length > 0) {
      const d = dups[0];
      let msg = 'البيانات المدخلة مستخدمة من قبل';
      if (d.Username === Username) msg = 'اسم المستخدم مستخدم مسبقًا';
      else if (Email && d.Email === Email) msg = 'البريد الإلكتروني مستخدم مسبقًا';
      else if (Mobile && d.Mobile === Mobile) msg = 'رقم الجوال مستخدم مسبقًا';
      else if (NationalID && d.NationalID === NationalID) msg = 'الهوية الوطنية مستخدمة مسبقًا';
      return res.status(409).json({ success: false, message: msg });
    }

    // 6) تجزئة كلمة المرور
    const hash = await bcrypt.hash(Password, 12);

    // 7) إنشاء المستخدم (RoleID=2 افتراضي)
    const [result] = await pool.query(
      `INSERT INTO users
        (RoleID, HospitalID, DepartmentID, FullName, Username, Email, Mobile, NationalID, PasswordHash, IsActive)
       VALUES
        (2, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [dept.HospitalID, finalDeptId, FullName, Username, Email || null, Mobile || null, NationalID || null, hash]
    );

    const userId = result.insertId;

    // 8) أعلام الصلاحيات الافتراضية
    await pool.query(
      `INSERT INTO user_permission_flags
       (UserID, dashboard_overview, complaints_create, complaints_track,
        data_export_excel, admin_manage_users, admin_permissions, admin_logs, admin_trash,
        request_submit, request_track)
       VALUES (?, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1)`,
      [userId]
    );

    // 9) جهزي التوكن والرد
    const token = signToken({
      UserID: userId,
      RoleID: 2,
      HospitalID: dept.HospitalID,
      DepartmentID: finalDeptId
    });

    return res.status(201).json({
      success: true,
      message: 'تم إنشاء الحساب بنجاح',
      user: {
        UserID: userId,
        FullName,
        Username,
        Email,
        Mobile,
        RoleID: 2,
        HospitalID: dept.HospitalID,
        DepartmentID: finalDeptId
      },
      token
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      err.status = 409;
      err.publicMessage = 'أحد الحقول الفريدة مستخدم سابقًا';
    }
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const { Username, Password } = req.body;

    if (!Username || !Password) {
      return res.status(400).json({ success: false, message: 'اسم المستخدم وكلمة المرور مطلوبان' });
    }

    // البحث عن المستخدم
    const [[user]] = await pool.query(
      `SELECT u.*, r.RoleName, h.NameAr AS HospitalName, d.NameAr AS DepartmentName
       FROM users u
       JOIN roles r ON r.RoleID = u.RoleID
       JOIN hospitals h ON h.HospitalID = u.HospitalID
       JOIN departments d ON d.DepartmentID = u.DepartmentID
       WHERE u.Username = ? AND u.IsActive = 1`,
      [Username]
    );

    if (!user) {
      return res.status(401).json({ success: false, message: 'بيانات الدخول غير صحيحة' });
    }

    // التحقق من كلمة المرور
    const isValidPassword = await bcrypt.compare(Password, user.PasswordHash);
    if (!isValidPassword) {
      return res.status(401).json({ success: false, message: 'بيانات الدخول غير صحيحة' });
    }

    // إنشاء التوكن
    const token = signToken(user);

    // إزالة كلمة المرور من الاستجابة
    delete user.PasswordHash;

    res.json({
      success: true,
      message: 'تم تسجيل الدخول بنجاح',
      user,
      token
    });
  } catch (err) {
    next(err);
  }
}
