# تحديث عرض اسم التصنيف بدلاً من الرقم

## نظرة عامة
تم تحديث النظام لعرض اسم التصنيف الفعلي من جدول `complaint_types` بدلاً من عرض رقم التصنيف فقط.

## المشكلة السابقة
كان النظام يعرض:
```
التصنيف: 4
```

## الحل المطبق
الآن النظام يعرض:
```
التصنيف: الخطة العلاجية
```

## التحديثات المطبقة

### 1. Backend - تعديل الاستعلامات

#### أ. استعلام `/api/complaints/history` (القاعدة المركزية):
```sql
-- قبل التحديث
SELECT 
  c.ComplaintID AS id,
  c.ComplaintTypeID AS type,
  ...
FROM complaints c
LEFT JOIN hospitals h ON h.HospitalID = c.HospitalID

-- بعد التحديث
SELECT 
  c.ComplaintID AS id,
  c.ComplaintTypeID AS type,
  t.TypeName AS typeName,
  ...
FROM complaints c
LEFT JOIN hospitals h ON h.HospitalID = c.HospitalID
LEFT JOIN complaint_types t ON c.ComplaintTypeID = t.ComplaintTypeID
```

#### ب. استعلام `/api/complaints/history` (قاعدة المستشفى):
```sql
-- قبل التحديث
SELECT 
  c.ComplaintID AS id,
  c.ComplaintTypeID AS type,
  ...
FROM complaints c

-- بعد التحديث
SELECT 
  c.ComplaintID AS id,
  c.ComplaintTypeID AS type,
  t.TypeName AS typeName,
  ...
FROM complaints c
LEFT JOIN complaint_types t ON c.ComplaintTypeID = t.ComplaintTypeID
```

#### ج. استعلام `/api/complaints/track`:
```sql
-- كان يحتوي بالفعل على JOIN مع complaint_types
SELECT 
  c.ComplaintID AS id,
  ct.TypeName AS ComplaintTypeNameAr,
  ct.TypeNameEn AS ComplaintTypeNameEn,
  ...
FROM complaints c
LEFT JOIN complaint_types ct ON ct.ComplaintTypeID = c.ComplaintTypeID
```

### 2. Frontend - تحديث العرض

#### أ. صفحة سجل البلاغات (`complaints-history.js`):
```javascript
// قبل التحديث
<div><span class="font-semibold text-gray-800">التصنيف:</span> ${escapeHTML(c.type || '')}</div>

// بعد التحديث
<div><span class="font-semibold text-gray-800">التصنيف:</span> ${escapeHTML(c.typeName || c.type || '—')}</div>
```

#### ب. صفحة تفاصيل البلاغ (`complaint-details.js`):
```javascript
// كان يستخدم بالفعل الاسم الصحيح
const typeNameAr = c.ComplaintTypeNameAr || c.TypeName || c.typeName || '';
```

## البيانات المُرسلة

### من API إلى Frontend:
```json
{
  "items": [
    {
      "id": 5,
      "ticket": "C-2025-000004",
      "fullName": "سموره",
      "type": 4,
      "typeName": "الخطة العلاجية",
      "status": "OPEN",
      "priority": "MEDIUM"
    }
  ]
}
```

## الملفات المحدثة

### Backend:
1. **`backend/routes/complaints.js`**
   - إضافة `LEFT JOIN complaint_types` في استعلام `/api/complaints/history`
   - إضافة `t.TypeName AS typeName` في SELECT

### Frontend:
1. **`NewProjectMecca/public/complaints/history/complaints-history.js`**
   - تحديث عرض التصنيف لاستخدام `c.typeName` بدلاً من `c.type`

## النتيجة

### ✅ **في صفحة سجل البلاغات:**
- **قبل:** `التصنيف: 4`
- **بعد:** `التصنيف: الخطة العلاجية`

### ✅ **في صفحة تفاصيل البلاغ:**
- كان يعرض الاسم بالفعل بشكل صحيح
- لا يحتاج تحديث

### ✅ **الأمان:**
- استخدام `LEFT JOIN` لضمان عدم فقدان البلاغات حتى لو لم يكن لها تصنيف
- عرض `—` كقيمة افتراضية عند عدم وجود اسم التصنيف

## الاختبار

### 1. اختبار صفحة سجل البلاغات:
1. افتح صفحة سجل البلاغات
2. تحقق من أن التصنيف يظهر بالاسم وليس بالرقم
3. تأكد من أن البلاغات بدون تصنيف تظهر `—`

### 2. اختبار صفحة تفاصيل البلاغ:
1. افتح أي بلاغ من سجل البلاغات
2. تحقق من أن التصنيف يظهر بالاسم في صفحة التفاصيل

### 3. اختبار Console:
- افتح Developer Tools
- تحقق من أن البيانات تحتوي على `typeName`
- تأكد من عدم وجود أخطاء JavaScript

## ملاحظات إضافية

### 1. التوافق مع البيانات القديمة:
- النظام يدعم البيانات القديمة التي قد لا تحتوي على `typeName`
- يتم استخدام `c.typeName || c.type || '—'` كـ fallback

### 2. الأداء:
- استخدام `LEFT JOIN` بدلاً من `INNER JOIN` لضمان عدم فقدان البيانات
- الاستعلام محسن ولا يؤثر على الأداء

### 3. قابلية التوسع:
- يمكن إضافة المزيد من الحقول من جدول `complaint_types` في المستقبل
- النظام جاهز لإضافة `TypeNameEn` للعرض باللغة الإنجليزية
