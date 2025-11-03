# نظام الصلاحيات المستقلة لبطاقات مركز الإدارة

## 📋 نظرة عامة

تم إنشاء نظام صلاحيات مستقل لكل بطاقة في صفحة **مركز الإدارة**، يتيح التحكم الدقيق في من يمكنه الوصول إلى كل وظيفة إدارية.

## 🔑 الصلاحيات الثلاثة الجديدة

| المفتاح | الاسم بالعربية | الوصف |
|---------|----------------|--------|
| `ADMIN_DEPARTMENTS` | إدارة الأقسام | التحكم في إظهار بطاقة إدارة الأقسام |
| `ADMIN_HOSPITAL` | إدارة المستشفى | التحكم في إظهار بطاقة إدارة المستشفى |
| `ADMIN_CLUSTERS` | إدارة المستشفيات (التجمع) | التحكم في إظهار بطاقة إدارة المستشفيات |

---

## 🗂️ الملفات المُحدّثة

### 1️⃣ **SQL - إضافة الصلاحيات للقاعدة المركزية**
📄 `backend/sql/add-admin-card-permissions.sql`

```sql
INSERT IGNORE INTO permissions (PermissionKey, NameAr, Category) VALUES
('ADMIN_DEPARTMENTS', 'إدارة الأقسام', 'system'),
('ADMIN_HOSPITAL',    'إدارة المستشفى', 'system'),
('ADMIN_CLUSTERS',    'إدارة المستشفيات (التجمع)', 'system');
```

**⚡ التنفيذ:** شغّل هذا الملف مرة واحدة على القاعدة المركزية.

---

### 2️⃣ **Backend - API Endpoint**
📄 `backend/routes/auth.routes.js`

#### نقطة النهاية: `GET /api/auth/me-permissions`

**التحديثات:**
- ✅ مدير التجمع يحصل على الصلاحيات الثلاثة تلقائياً
- ✅ مستخدمو المستشفيات يحصلون عليها حسب جدول `user_permissions`

**مثال على الرد:**
```json
{
  "ok": true,
  "canSubmit": true,
  "canTrack": true,
  "adminPanel": true,
  "adminDepartments": true,
  "adminHospital": true,
  "adminClusters": true,
  "user": {
    "UserID": 1,
    "RoleID": 1,
    "scope": "central"
  }
}
```

---

### 3️⃣ **Backend - Permissions Controller**
📄 `backend/controllers/permissions.controller.js`

#### الدوال المُحدّثة:

##### أ) `getUserPermissions` - قراءة صلاحيات مستخدم
```javascript
adminDepartments: has('ADMIN_DEPARTMENTS'),
adminHospital: has('ADMIN_HOSPITAL'),
adminClusters: has('ADMIN_CLUSTERS')
```

##### ب) `saveUserPermissions` - حفظ صلاحيات مستخدم
```javascript
const { adminDepartments, adminHospital, adminClusters } = req.body;

adminDepartments ? await upsert('ADMIN_DEPARTMENTS') : await drop('ADMIN_DEPARTMENTS');
adminHospital ? await upsert('ADMIN_HOSPITAL') : await drop('ADMIN_HOSPITAL');
adminClusters ? await upsert('ADMIN_CLUSTERS') : await drop('ADMIN_CLUSTERS');
```

##### ج) `getMyPermissions` - صلاحيات المستخدم الحالي
```javascript
adminDepartments: has('ADMIN_DEPARTMENTS'),
adminHospital: has('ADMIN_HOSPITAL'),
adminClusters: has('ADMIN_CLUSTERS')
```

---

### 4️⃣ **Frontend - واجهة الصلاحيات**
📄 `NewProjectMecca/public/admin/admin-permissions.html`

#### أ) HTML - مربعات الاختيار الجديدة
```html
<label class="flex items-center gap-3">
  <input type="checkbox" id="p_admin_depts" class="w-4 h-4">
  <span>إدارة الأقسام</span>
</label>

<label class="flex items-center gap-3">
  <input type="checkbox" id="p_admin_hospital" class="w-4 h-4">
  <span>إدارة المستشفى</span>
</label>

<label class="flex items-center gap-3">
  <input type="checkbox" id="p_admin_clusters" class="w-4 h-4">
  <span>إدارة المستشفيات (التجمع)</span>
</label>
```

#### ب) JavaScript - تحميل الحالة
```javascript
$('#p_admin_depts').checked = !!p.adminDepartments;
$('#p_admin_hospital').checked = !!p.adminHospital;
$('#p_admin_clusters').checked = !!p.adminClusters;
```

#### ج) JavaScript - الحفظ
```javascript
const payload = {
  // ... الصلاحيات الأخرى
  adminDepartments: $('#p_admin_depts').checked,
  adminHospital: $('#p_admin_hospital').checked,
  adminClusters: $('#p_admin_clusters').checked
};
```

---

### 5️⃣ **Frontend - صفحة مركز الإدارة**
📄 `NewProjectMecca/public/admin/admin-hub.html`

#### أ) HTML - البطاقات مع IDs
```html
<!-- إدارة المستشفيات (التجمع) -->
<a id="cardAdminClusters" href="admin-hospitals.html"
   class="block bg-white rounded-2xl ... hidden">
  ...
</a>

<!-- إدارة المستشفى -->
<a id="cardAdminHospital" href="admin-hospital.html"
   class="block bg-white rounded-2xl ... hidden">
  ...
</a>

<!-- إدارة الأقسام -->
<a id="cardAdminDepts" href="admin-departments.html"
   class="block bg-white rounded-2xl ... hidden">
  ...
</a>
```

#### ب) JavaScript - نظام الإظهار/الإخفاء
```javascript
(async () => {
  const API_BASE = window.API_BASE || 'http://localhost:3001';
  const token = localStorage.getItem('token');
  
  const res = await fetch(`${API_BASE}/api/auth/me-permissions`, {
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  });

  const p = await res.json();
  
  // دالة لإظهار/إخفاء البطاقة
  const show = (id, shouldShow) => {
    const el = document.getElementById(id);
    if (shouldShow) {
      el.classList.remove('hidden');
      el.style.display = '';
    } else {
      el.classList.add('hidden');
      el.style.display = 'none';
    }
  };

  // التحقق من كون المستخدم مدير التجمع
  const isCentral = p?.user?.scope === 'central' || p?.user?.HospitalID == null;

  // إظهار/إخفاء البطاقات حسب الصلاحيات
  show('cardAdminDepts',    isCentral || p.adminDepartments === true);
  show('cardAdminHospital', isCentral || p.adminHospital    === true);
  show('cardAdminClusters', isCentral || p.adminClusters    === true);
})();
```

---

## 🚀 خطوات التشغيل

### 1️⃣ تنفيذ SQL
```bash
# اتصل بالقاعدة المركزية وشغّل:
mysql -u root -p central_db < backend/sql/add-admin-card-permissions.sql
```

### 2️⃣ إعادة تشغيل الخادم
```bash
cd backend
node app.js
```

### 3️⃣ منح الصلاحيات للمستخدمين
1. افتح: `http://localhost:3001/NewProjectMecca/public/admin/admin-permissions.html`
2. اختر المستشفى
3. اختر المستخدم
4. فعّل الصلاحيات المطلوبة:
   - ✅ إدارة الأقسام
   - ✅ إدارة المستشفى
   - ✅ إدارة المستشفيات (التجمع)
5. احفظ التغييرات

---

## 🔒 القواعد الأمنية

### مدير التجمع (Cluster Admin)
- ✅ يرى **جميع البطاقات الثلاثة** تلقائياً
- ✅ لا يحتاج لصلاحيات من جدول `user_permissions`
- ✅ يُتعرف عليه من: `scope === 'central'` أو `HospitalID == null`

### مدير المستشفى (Hospital Admin)
- ⚙️ يحتاج صلاحيات صريحة لكل بطاقة
- ⚙️ يُمنح الصلاحيات من صفحة الصلاحيات
- ⚙️ يُحفظ في `user_permissions` لمستشفاه

### الموظف العادي (Employee)
- ⚙️ يحتاج صلاحيات صريحة لكل بطاقة
- ⚙️ يُمنح الصلاحيات من صفحة الصلاحيات
- ⚙️ يُحفظ في `user_permissions` لمستشفاه

---

## 📊 بنية قاعدة البيانات

### جدول `permissions` (القاعدة المركزية)
```sql
PermissionID | PermissionKey        | NameAr                      | Category
-------------|----------------------|-----------------------------|----------
...          | ADMIN_DEPARTMENTS    | إدارة الأقسام              | system
...          | ADMIN_HOSPITAL       | إدارة المستشفى             | system
...          | ADMIN_CLUSTERS       | إدارة المستشفيات (التجمع)  | system
```

### جدول `user_permissions` (قاعدة كل مستشفى)
```sql
UserID | HospitalID | PermissionKey     | ViewScope | GrantedAt
-------|------------|-------------------|-----------|-------------------
5      | 2          | ADMIN_DEPARTMENTS | NULL      | 2025-01-15 10:30:00
5      | 2          | ADMIN_HOSPITAL    | NULL      | 2025-01-15 10:30:00
```

---

## ✅ المزايا

1. **تحكم دقيق**: كل بطاقة لها صلاحية مستقلة
2. **مرونة**: يمكن منح صلاحيات مختلفة لمستخدمين مختلفين
3. **أمان**: البطاقات مخفية افتراضياً وتظهر حسب الصلاحية
4. **تجربة مستخدم**: لا يرى المستخدم إلا ما يحتاجه
5. **توافق**: متوافق مع النظام الحالي للصلاحيات

---

## 🧪 الاختبار

### اختبار مدير التجمع
```javascript
// سجّل دخول كمدير التجمع (cluster.admin)
// افتح: http://localhost:3001/NewProjectMecca/public/admin/admin-hub.html
// النتيجة المتوقعة: جميع البطاقات الثلاثة ظاهرة
```

### اختبار مدير المستشفى
```javascript
// سجّل دخول كمدير مستشفى
// امنحه صلاحية ADMIN_HOSPITAL فقط
// افتح: http://localhost:3001/NewProjectMecca/public/admin/admin-hub.html
// النتيجة المتوقعة: بطاقة "إدارة المستشفى" فقط ظاهرة
```

### اختبار الموظف
```javascript
// سجّل دخول كموظف عادي
// امنحه صلاحية ADMIN_DEPARTMENTS فقط
// افتح: http://localhost:3001/NewProjectMecca/public/admin/admin-hub.html
// النتيجة المتوقعة: بطاقة "إدارة الأقسام" فقط ظاهرة
```

---

## 📝 ملاحظات مهمة

1. **الصلاحيات في القاعدة المركزية**: تُعرّف مرة واحدة في جدول `permissions`
2. **الصلاحيات الفعلية**: تُحفظ في `user_permissions` لكل مستشفى
3. **مدير التجمع**: له جميع الصلاحيات تلقائياً دون حاجة لحفظها
4. **البطاقات المخفية**: افتراضياً مخفية (`hidden`) وتظهر بعد التحقق من الصلاحيات
5. **التحقق المزدوج**: في الـ Backend (API) والـ Frontend (إظهار/إخفاء)

---

## 🛠️ استكشاف الأخطاء

### المشكلة: البطاقات لا تظهر
**الحل:**
1. افتح Console المتصفح (F12)
2. تحقق من Logs:
   ```
   ✅ الصلاحيات: {...}
   🔍 هل مدير التجمع؟ true/false
   ✅ إظهار البطاقة: cardAdminDepts
   ```
3. تحقق من `localStorage.getItem('token')`
4. تحقق من رد API: `/api/auth/me-permissions`

### المشكلة: لا يمكن الحفظ
**الحل:**
1. تحقق من Console المتصفح
2. تحقق من رد API: `PUT /api/permissions/users/:userId`
3. تحقق من وجود الصلاحيات في `payload`
4. تحقق من logs الخادم

### المشكلة: SQL خطأ
**الحل:**
1. تحقق من وجود جدول `permissions` في القاعدة المركزية
2. استخدم `INSERT IGNORE` لتجنب Duplicate Entry
3. تحقق من صلاحيات المستخدم لقاعدة البيانات

---

## 📚 المراجع

- [نظام الصلاحيات الأساسي](./PERMISSIONS_SETUP.md)
- [Multi-Tenant Architecture](./SMART-MULTI-TENANT-SYSTEM.md)
- [دليل الـ API](./README.md)

---

**تم التنفيذ بنجاح ✅**  
*نظام صلاحيات مستقل لكل بطاقة في مركز الإدارة*

