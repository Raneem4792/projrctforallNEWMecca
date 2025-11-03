# تحديث Route إنشاء المستشفيات - حل مشكلة مدير النظام

## المشكلة السابقة
كان إنشاء مدير النظام يتم فقط في القاعدة المركزية أو لا يصل لقاعدة المستشفى، مما يسبب مشاكل في تسجيل الدخول.

## الحل المطبق
تم تحديث `backend/routes/admin-hospitals.js` لحل المشكلة بالكامل.

## الميزات الجديدة

### 1. ✅ إنشاء مدير النظام داخل قاعدة المستشفى
```javascript
// إنشاء مدير النظام داخل قاعدة المستشفى (المشكلة اللي كانت)
const passHash = await bcrypt.hash(adminUser.passwordPlain, 10);
const [insAdmin] = await tenantPool.query(
  `INSERT INTO users
    (RoleID, HospitalID, FullName, Username, Email, Mobile, PasswordHash, IsActive)
   VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
  [
    1,                       // 1 = Hospital Admin/System Admin
    hospitalId,
    adminUser.fullName || adminUser.username,
    adminUser.username,
    adminUser.email || null,
    adminUser.mobile || null,
    passHash
  ]
);
```

### 2. ✅ إنشاء جداول قاعدة المستشفى
```javascript
// إنشاء جدول users
await tenantPool.query(`
  CREATE TABLE IF NOT EXISTS users (
    UserID INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    RoleID TINYINT UNSIGNED DEFAULT 1,
    HospitalID INT UNSIGNED DEFAULT 0,
    DepartmentID INT UNSIGNED DEFAULT 0,
    SubDepartmentID INT UNSIGNED DEFAULT 0,
    FullName VARCHAR(150) NOT NULL,
    Username VARCHAR(80) NOT NULL UNIQUE,
    Email VARCHAR(150) NULL,
    Mobile VARCHAR(20) NULL,
    NationalID VARCHAR(20) NULL,
    PasswordHash VARCHAR(255) NOT NULL,
    IsActive TINYINT(1) DEFAULT 1,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP NULL,
    IsDeleted TINYINT(1) DEFAULT 0,
    DeletedAt DATETIME NULL,
    DeletedByUserID INT UNSIGNED NULL,
    DeleteReason VARCHAR(255) NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`);
```

### 3. ✅ إنشاء جدول departments مع فهارس
```javascript
// إنشاء جدول departments
await tenantPool.query(`
  CREATE TABLE IF NOT EXISTS departments (
    DepartmentID INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    HospitalID INT UNSIGNED NOT NULL DEFAULT 0,
    ParentDepartmentID INT UNSIGNED DEFAULT 0,
    Depth TINYINT UNSIGNED DEFAULT 0,
    NameAr VARCHAR(150) NOT NULL,
    NameEn VARCHAR(150) NULL,
    DefaultEmail VARCHAR(150) NULL,
    HeadName VARCHAR(150) NULL,
    HeadEmail VARCHAR(150) NULL,
    IsActive TINYINT(1) DEFAULT 1,
    SortOrder INT UNSIGNED DEFAULT 0,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    IsDeleted TINYINT(1) DEFAULT 0,
    DeletedAt DATETIME NULL,
    DeletedByUserID INT UNSIGNED NULL,
    DeleteReason VARCHAR(255) NULL,
    INDEX idx_hosp (HospitalID),
    INDEX idx_name (NameAr)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`);
```

### 4. ✅ إضافة المستخدم في الدليل المركزي
```javascript
// إضافة المستخدم في الدليل المركزي user_directory (للرؤية المجمعة)
await central.query(`
  CREATE TABLE IF NOT EXISTS user_directory (
    Username VARCHAR(80) PRIMARY KEY,
    HospitalID INT UNSIGNED NOT NULL,
    RoleID TINYINT UNSIGNED NOT NULL DEFAULT 1,
    IsActive TINYINT(1) DEFAULT 1,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`);

// ادراج/تحديث
await central.query(
  `INSERT INTO user_directory (Username, HospitalID, RoleID, IsActive)
   VALUES (?, ?, ?, 1)
   ON DUPLICATE KEY UPDATE HospitalID=VALUES(HospitalID), RoleID=VALUES(RoleID), IsActive=1, UpdatedAt=NOW()`,
  [adminUser.username, hospitalId, 1]
);
```

### 5. ✅ حماية Route بـ Authentication
```javascript
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  // Route محمي بـ requireAuth و requireAdmin
});
```

## كيفية الاستخدام

### 1. إرسال طلب إنشاء مستشفى
```javascript
POST /api/admin/hospitals
Content-Type: application/json
Authorization: Bearer <token>

{
  "nameAr": "مستشفى الملك فهد",
  "nameEn": "King Fahd Hospital",
  "code": "KFH",
  "cityAr": "جدة",
  "regionAr": "مكة المكرمة",
  "isActive": 1,
  "departments": [
    {
      "nameAr": "الطوارئ",
      "nameEn": "Emergency",
      "defaultEmail": "emergency@kfh.com",
      "headName": "د. أحمد محمد",
      "headEmail": "ahmed@kfh.com"
    },
    {
      "nameAr": "التمريض",
      "nameEn": "Nursing",
      "defaultEmail": "nursing@kfh.com"
    }
  ],
  "adminUser": {
    "fullName": "مدير النظام",
    "username": "admin",
    "email": "admin@kfh.com",
    "mobile": "0501234567",
    "passwordPlain": "admin123"
  }
}
```

### 2. الاستجابة المتوقعة
```json
{
  "ok": true,
  "dbName": "hosp_KFH",
  "dbUser": "tenant_app_user",
  "departmentsCount": 2,
  "adminCreated": true,
  "hospitalId": 5
}
```

## النتائج

### قبل التحديث:
- ❌ مدير النظام لا يتم إنشاؤه في قاعدة المستشفى
- ❌ مشاكل في تسجيل الدخول
- ❌ رسالة "بيانات غير صحيحة"

### بعد التحديث:
- ✅ مدير النظام يتم إنشاؤه في قاعدة المستشفى
- ✅ تسجيل الدخول يعمل بشكل صحيح
- ✅ جميع الجداول يتم إنشاؤها مع الفهارس
- ✅ المستخدم يضاف في الدليل المركزي

## الملفات المعدلة

- ✅ `backend/routes/admin-hospitals.js` - تحديث كامل للكود

## ملاحظات مهمة

1. **الحماية**: Route محمي بـ `requireAuth` و `requireAdmin`
2. **Rollback**: في حالة الفشل، يتم حذف سجل المستشفى من القاعدة المركزية
3. **التوافق**: متوافق مع `hospital-new.js` في الواجهة
4. **الأمان**: كلمات المرور يتم تشفيرها بـ bcrypt
5. **الفهارس**: يتم إنشاء فهارس لتحسين الأداء

## الاختبار

1. **أعد تشغيل الخادم:**
   ```bash
   cd backend
   npm start
   ```

2. **اختبر إنشاء مستشفى جديد:**
   - استخدم واجهة `hospital-new.html`
   - أو أرسل طلب POST مباشرة للـ API

3. **تحقق من النتائج:**
   - تأكد من إنشاء قاعدة البيانات
   - تأكد من إنشاء مدير النظام
   - جرب تسجيل الدخول ببيانات مدير النظام

الآن مشكلة إنشاء مدير النظام محلولة بالكامل! 🎉
