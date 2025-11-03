# إصلاح مشكلة أعمدة الأقسام غير الموجودة

## 🎯 المشكلة
عند إنشاء أو تحديث قسم، كان النظام يحاول استخدام أعمدة غير موجودة في القالب الجديد:
- `DefaultEmail`
- `HeadName` 
- `HeadEmail`

مما يسبب خطأ MySQL: `Unknown column 'DefaultEmail' in 'field list'`

## ✅ الحل المطبق

### 1. إصلاح راوتر الأقسام (`admin-departments.js`)

#### INSERT (إضافة قسم جديد):
```sql
-- قبل الإصلاح
INSERT INTO departments
(HospitalID, ParentDepartmentID, Code, NameAr, NameEn,
 DefaultEmail, HeadName, HeadEmail, IsActive, SortOrder, CreatedAt, UpdatedAt)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)

-- بعد الإصلاح
INSERT INTO departments
(HospitalID, ParentDepartmentID, Code, NameAr, NameEn, IsActive, SortOrder, CreatedAt, UpdatedAt)
VALUES (?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
```

#### UPDATE (تحديث قسم موجود):
```sql
-- قبل الإصلاح
UPDATE departments
SET ParentDepartmentID=?,
    Code = COALESCE(?, Code),
    NameAr = COALESCE(?, NameAr),
    NameEn = COALESCE(?, NameEn),
    DefaultEmail = COALESCE(?, DefaultEmail),
    HeadName = COALESCE(?, HeadName),
    HeadEmail = COALESCE(?, HeadEmail),
    IsActive = COALESCE(?, IsActive),
    UpdatedAt = CURRENT_TIMESTAMP
WHERE DepartmentID=? AND HospitalID=?

-- بعد الإصلاح
UPDATE departments
SET ParentDepartmentID = ?,
    Code = ?,
    NameAr = ?,
    NameEn = ?,
    IsActive = ?,
    UpdatedAt = CURRENT_TIMESTAMP
WHERE DepartmentID = ? AND HospitalID = ?
```

### 2. إصلاح ملف التوفير (`provisioner.js`)

#### حذف دالة `ensureDeptColumns`:
- كانت تحاول إضافة الأعمدة القديمة
- لم تعد مطلوبة مع القالب الجديد

#### إصلاح SQL إدراج الأقسام:
```sql
-- قبل الإصلاح
INSERT INTO departments 
(HospitalID, NameAr, NameEn, Code, DefaultEmail, HeadName, HeadEmail, IsActive, SortOrder)
VALUES (1, ?, ?, ?, ?, ?, ?, 1, ?)

-- بعد الإصلاح
INSERT INTO departments 
(HospitalID, NameAr, NameEn, Code, IsActive, SortOrder)
VALUES (1, ?, ?, ?, 1, ?)
```

### 3. تنظيف استخراج البيانات

#### إزالة الحقول غير المستخدمة من `req.body`:
```javascript
// قبل الإصلاح
const { NameAr, NameEn, ParentDepartmentID, DefaultEmail, HeadName, HeadEmail } = req.body;

// بعد الإصلاح
const { NameAr, NameEn, ParentDepartmentID } = req.body;
```

## 📋 الأعمدة المدعومة في القالب الجديد

جدول `departments` في القالب الجديد يحتوي على:
- `DepartmentID` (Primary Key)
- `HospitalID` (Foreign Key)
- `ParentDepartmentID` (Self Reference)
- `Code` (VARCHAR)
- `NameAr` (VARCHAR)
- `NameEn` (VARCHAR)
- `IsActive` (TINYINT)
- `SortOrder` (SMALLINT)
- `CreatedAt` (TIMESTAMP)
- `UpdatedAt` (TIMESTAMP)

## ✅ النتيجة

الآن جميع عمليات إنشاء وتحديث الأقسام تعمل بشكل صحيح مع القالب الجديد:
- ✅ إضافة قسم جديد
- ✅ تحديث قسم موجود
- ✅ إنشاء مستشفى جديد مع أقسام
- ✅ لا توجد أخطاء MySQL

## 🔍 اختبار التغييرات

1. **إنشاء قسم جديد**:
   ```bash
   POST /api/admin/departments
   {
     "NameAr": "قسم الاختبار",
     "NameEn": "Test Department",
     "Code": "TEST"
   }
   ```

2. **تحديث قسم موجود**:
   ```bash
   PUT /api/admin/departments/:id
   {
     "NameAr": "قسم محدث",
     "IsActive": 1
   }
   ```

3. **إنشاء مستشفى جديد**:
   ```bash
   POST /api/admin/hospitals
   {
     "nameAr": "مستشفى الاختبار",
     "code": "TEST",
     "departments": [
       {"nameAr": "الطوارئ", "nameEn": "Emergency"}
     ]
   }
   ```
