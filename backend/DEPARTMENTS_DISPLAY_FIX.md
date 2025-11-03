# إصلاح مشكلة عدم ظهور الأقسام في المستشفيات الجديدة

## 🎯 المشكلة
الأقسام محفوظة في قاعدة المستشفى الجديدة لكن لا تظهر في واجهة إدارة الأقسام بسبب:
- الراوتر لم يكن موجوداً (`GET /api/admin/departments`)
- SELECT كان يحاول جلب أعمدة قديمة غير موجودة (`DefaultEmail`, `HeadName`, `HeadEmail`)

## ✅ الحل المطبق

### 1. إضافة راوتر GET للأقسام
تم إضافة راوتر جديد لجلب قائمة الأقسام:
```javascript
GET /api/admin/departments?hospitalId=<id>
```

### 2. SELECT ديناميكي متوافق
تم جعل SELECT يتكيف تلقائياً مع وجود أو عدم وجود الأعمدة القديمة:

```javascript
// التحقق من وجود الأعمدة القديمة
const [cols] = await pool.query(
  `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=? AND TABLE_NAME='departments'`,
  [db]
);
const hasLegacyCols = 
  names.includes('DefaultEmail') &&
  names.includes('HeadName') &&
  names.includes('HeadEmail');

// بناء SELECT ديناميكي
const select =
  `SELECT
     DepartmentID, HospitalID, ParentDepartmentID, Code,
     NameAr, NameEn, IsActive, SortOrder, CreatedAt, UpdatedAt
     ${hasLegacyCols
        ? ', DefaultEmail, HeadName, HeadEmail'
        : ', NULL AS DefaultEmail, NULL AS HeadName, NULL AS HeadEmail'}
   FROM departments
   WHERE HospitalID = ?
   ORDER BY SortOrder ASC, DepartmentID ASC`;
```

### 3. إصلاح راوتر GET واحد (GET /:id)
تم إصلاح الراوتر الذي يجلب تفاصيل قسم واحد ليكون ديناميكي أيضاً.

## 📋 النتيجة

### القواعد القديمة (مع الأعمدة القديمة):
- ✅ يجلب الأعمدة الفعلية (`DefaultEmail`, `HeadName`, `HeadEmail`)
- ✅ يعمل بشكل طبيعي

### القواعد الجديدة (بالقالب الجديد):
- ✅ يرجع `NULL` للأعمدة القديمة بأسماء مستعارة
- ✅ الواجهة لا تتكسر
- ✅ الأقسام تظهر بشكل صحيح

## 🔍 التحقق من النجاح

1. **اختبر API مباشرة**:
   ```bash
   GET http://localhost:3001/api/admin/departments?hospitalId=10
   ```

2. **تحقق من السجلات في قاعدة البيانات**:
   ```sql
   USE hosp_<code>;
   SELECT HospitalID, NameAr FROM departments;
   ```

3. **إذا كانت HospitalID = 0**، قم بتحديثها:
   ```sql
   UPDATE departments SET HospitalID = <hospital_id>;
   ```

## ✨ المميزات

- ✅ يعمل مع القواعد القديمة والجديدة
- ✅ لا يحتاج تعديل دائم في الكود
- ✅ يكتشف تلقائياً وجود الأعمدة
- ✅ لا يسبب أخطاء `Unknown column`
- ✅ الواجهة مستقرة (نفس الأسماء للأعمدة)

الميل لتحديث القواعد القديمة ليطابقوا القالب الجديد فيما بعد بدون تعديل الكود.
