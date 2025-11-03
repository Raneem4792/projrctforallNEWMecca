# دليل سريع: صلاحية إضافة مستشفى

## 🎯 الهدف
تطبيق نظام صلاحيات لزر **"إضافة مستشفى جديد"** باستخدام صلاحية `HOSPITAL_CREATE`

---

## ✅ التعديلات المنفذة

### 1. Backend - API Response
📁 `routes/auth.routes.js`
```javascript
// في /api/auth/me-permissions
{
  canCreateHospital: true,  // للمركزي دائماً
  // أو
  canCreateHospital: hasPermission('HOSPITAL_CREATE')  // للمستخدمين الآخرين
}
```

### 2. Backend - Permissions Controller
📁 `controllers/permissions.controller.js`
- قراءة: `hospitalCreate: has('HOSPITAL_CREATE')`
- حفظ: `hospitalCreate ? await upsert('HOSPITAL_CREATE') : await drop('HOSPITAL_CREATE')`

### 3. Backend - Route Protection
📁 `routes/admin-hospitals.js`
```javascript
// حماية POST /api/admin/hospitals
const isCentral = req.user?.scope === 'central' || req.user?.HospitalID == null;
let allowed = isCentral || await hasPermissionFor(..., 'HOSPITAL_CREATE');

if (!allowed) {
  return res.status(403).json({ error: 'ليس لديك صلاحية' });
}
```

### 4. Frontend - Permissions Page
📁 `public/admin/admin-permissions.html`
```html
<input type="checkbox" id="p_hospital_create">
<span>إضافة مستشفى جديد</span>
```

### 5. Frontend - Hospitals Page
📁 `public/admin/admin-hospitals.html`
```javascript
// فحص الصلاحية وإظهار الزر
async function checkCreateHospitalPermission() {
  const data = await fetch('/api/auth/me-permissions');
  if (data.canCreateHospital === true) {
    btnAddHospital.style.display = 'flex';
  }
}
```

---

## 🔐 كيف يعمل؟

### مدير التجمع (Central Admin):
✅ صلاحية **تلقائية** دائماً  
✅ الزر **يظهر** دائماً  
✅ **مسموح** بإنشاء مستشفيات  

### مدير مستشفى / موظف:
1. يجب منح الصلاحية من صفحة الصلاحيات ✏️
2. يُحفظ في `user_permissions` 💾
3. الزر يظهر فقط إذا كانت الصلاحية ممنوحة 👁️
4. السيرفر يفحص قبل السماح بالعملية 🔒

---

## 📝 قاعدة البيانات

```sql
-- الصلاحية موجودة في جدول permissions
PermissionKey: 'HOSPITAL_CREATE'
NameAr: 'إضافة مستشفى'
Category: 'cluster'

-- وتُخزن للمستخدمين في:
user_permissions (UserID, HospitalID, PermissionKey)
```

---

## 🧪 اختبار سريع

1. **مدير تجمع:**
   - افتح `/admin/admin-hospitals.html`
   - الزر يظهر مباشرة ✅

2. **مدير مستشفى بدون صلاحية:**
   - نفس الصفحة
   - الزر مخفي ❌

3. **منح الصلاحية:**
   - `/admin/admin-permissions.html`
   - اختر المستخدم
   - فعّل "إضافة مستشفى جديد"
   - احفظ ✅
   - الزر يظهر الآن في صفحة المستشفيات ✅

---

## ✅ النتيجة
- نفس منطق الصلاحيات الموجود
- نفس جدول `user_permissions`
- نفس صفحة الصلاحيات
- حماية كاملة في الواجهة والخادم
- تجربة مستخدم ممتازة

