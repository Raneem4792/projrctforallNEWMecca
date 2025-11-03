// utils/validators.js
import { body } from 'express-validator';

export const signupRules = [
  body('FullName')
    .trim().notEmpty().withMessage('الاسم الكامل مطلوب')
    .isLength({ min: 3, max: 150 }).withMessage('الاسم غير صالح'),

  body('Username')
    .trim().notEmpty().withMessage('اسم المستخدم مطلوب')
    .isLength({ min: 3, max: 80 }).withMessage('اسم المستخدم غير صالح')
    .matches(/^[A-Za-z0-9._-]+$/).withMessage('اسم المستخدم يجب أن يكون حروف/أرقام/._- فقط'),

  body('Mobile')
    .optional({ checkFalsy: true })
    .trim().matches(/^05\d{8}$/).withMessage('رقم الجوال يجب أن يبدأ بـ05 وطوله 10 أرقام'),

  body('NationalID')
    .optional({ checkFalsy: true })
    .trim().matches(/^\d{10}$/).withMessage('الهوية الوطنية يجب أن تكون 10 أرقام'),

  body('Email')
    .optional({ checkFalsy: true }).isEmail().withMessage('البريد الإلكتروني غير صالح')
    .normalizeEmail(),

  body('Password')
    .isLength({ min: 8 }).withMessage('كلمة المرور يجب ألا تقل عن 8 أحرف')
    .matches(/[A-Za-z]/).withMessage('كلمة المرور يجب أن تحتوي على حروف')
    .matches(/\d/).withMessage('كلمة المرور يجب أن تحتوي على أرقام'),

  // قبول أي صيغة للقسم
  body('MainDepartmentID')
    .optional({ nullable: true, checkFalsy: true }).toInt().isInt({ min: 1 }).withMessage('القسم الرئيسي غير صالح'),

  body('SubDepartmentID')
    .optional({ nullable: true, checkFalsy: true }).toInt().isInt({ min: 1 }).withMessage('القسم الفرعي غير صالح'),

  body('DepartmentID') // دعم النموذج القديم إن وُجد
    .optional({ nullable: true, checkFalsy: true }).toInt().isInt({ min: 1 }).withMessage('القسم غير صالح')
];

// قواعد تسجيل الدخول
export const loginRules = [
  body('usernameOrEmail')
    .trim().notEmpty().withMessage('ادخل اسم المستخدم أو البريد الإلكتروني'),
  
  body('password')
    .isLength({ min: 1 }).withMessage('كلمة المرور مطلوبة'),
  
  body('remember')
    .optional().isBoolean().withMessage('قيمة تذكّرني غير صحيحة')
];
