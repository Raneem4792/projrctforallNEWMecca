# 🔐 API المستخدمين - Users API

## نظرة عامة
تم إضافة API كامل لإدارة المستخدمين مع ربط قاعدة البيانات مباشرة.

## 📋 Endpoints المتاحة

### 1. جلب جميع المستخدمين
```
GET /api/users
```
**الاستجابة:**
```json
[
  {
    "UserID": 1,
    "RoleID": 2,
    "HospitalID": 1,
    "DepartmentID": 3,
    "FullName": "سارة الشريف",
    "Username": "sara",
    "Email": "sara@example.com",
    "Mobile": "0550000001",
    "NationalID": "1234567890",
    "IsActive": 1,
    "CreatedAt": "2025-01-27T10:00:00.000Z",
    "UpdatedAt": "2025-01-27T10:00:00.000Z",
    "HospitalNameAr": "مستشفى الملك عبدالعزيز",
    "DepartmentNameAr": "قسم الطوارئ"
  }
]
```

### 2. جلب مستخدم واحد
```
GET /api/users/:id
```

### 3. إضافة مستخدم جديد
```
POST /api/users
```
**البيانات المطلوبة:**
```json
{
  "RoleID": 2,
  "HospitalID": 1,
  "DepartmentID": 3,
  "FullName": "سارة الشريف",
  "Username": "sara",
  "Email": "sara@example.com",
  "Mobile": "0550000001",
  "NationalID": "1234567890",
  "PasswordHash": "hashed-password",
  "IsActive": 1
}
```

### 4. تعديل مستخدم
```
PUT /api/users/:id
```

### 5. حذف مستخدم
```
DELETE /api/users/:id
```

## 🧪 اختبار API

لتشغيل اختبار شامل للـ API:
```bash
node test-users-api.js
```

## 📝 مثال على الاستخدام من الواجهة

```javascript
// جلب جميع المستخدمين
async function loadUsers() {
  try {
    const res = await fetch('/api/users');
    const users = await res.json();
    console.log('المستخدمون:', users);
    return users;
  } catch (error) {
    console.error('خطأ في جلب المستخدمين:', error);
  }
}

// إضافة مستخدم جديد
async function addUser(userData) {
  try {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData)
    });
    
    if (res.ok) {
      const result = await res.json();
      console.log('تم إضافة المستخدم:', result.UserID);
      return result;
    } else {
      throw new Error('فشل في إضافة المستخدم');
    }
  } catch (error) {
    console.error('خطأ في إضافة المستخدم:', error);
  }
}

// تعديل مستخدم
async function updateUser(id, userData) {
  try {
    const res = await fetch(`/api/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData)
    });
    
    if (res.ok) {
      console.log('تم تحديث المستخدم بنجاح');
      return true;
    } else {
      throw new Error('فشل في تحديث المستخدم');
    }
  } catch (error) {
    console.error('خطأ في تحديث المستخدم:', error);
  }
}

// حذف مستخدم
async function deleteUser(id) {
  try {
    const res = await fetch(`/api/users/${id}`, {
      method: 'DELETE'
    });
    
    if (res.ok) {
      console.log('تم حذف المستخدم بنجاح');
      return true;
    } else {
      throw new Error('فشل في حذف المستخدم');
    }
  } catch (error) {
    console.error('خطأ في حذف المستخدم:', error);
  }
}
```

## 🔗 الجداول المطلوبة

الـ API يتطلب وجود الجداول التالية:
- `users` - جدول المستخدمين الرئيسي
- `hospitals` - جدول المستشفيات (للعرض في JOIN)
- `departments` - جدول الأقسام (للعرض في JOIN)

## ⚠️ ملاحظات مهمة

1. **الأمان**: يجب إضافة تشفير كلمات المرور قبل الإنتاج
2. **التحقق**: يُنصح بإضافة validation للبيانات المدخلة
3. **الصلاحيات**: يجب إضافة middleware للتحقق من الصلاحيات
4. **التشفير**: يجب تشفير كلمات المرور قبل الحفظ

## 🚀 التشغيل

1. تأكد من تشغيل الخادم:
```bash
npm start
```

2. اختبر الـ API:
```bash
curl http://localhost:3001/api/users
```

3. أو استخدم ملف الاختبار:
```bash
node test-users-api.js
```
