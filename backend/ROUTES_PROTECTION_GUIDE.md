# دليل حماية الـ Routes بالصلاحيات

## نظرة عامة
تم إنشاء middleware مساعد للتحقق من صلاحيات المستخدم قبل الوصول إلى routes معينة.

---

## 📦 الملف المساعد

### `middleware/checkPermission.js`

يحتوي على:
1. **`hasPermissionFor(userId, hospitalId, permissionKey)`** - دالة للتحقق من صلاحية محددة
2. **`requirePermission(permissionKey)`** - Middleware للتحقق من صلاحية واحدة
3. **`requireAnyPermission(permissionKeys[])`** - Middleware للتحقق من أي صلاحية من قائمة

---

## 🔒 أمثلة الاستخدام

### 1. حماية route بصلاحية واحدة

```javascript
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/checkPermission.js';

// route سلة المحذوفات - يتطلب صلاحية HOSPITAL_TRASH
router.get('/admin/trash', 
  requireAuth,                           // تسجيل الدخول
  requirePermission('HOSPITAL_TRASH'),   // الصلاحية
  async (req, res) => {
    // كود عرض المحذوفات
  }
);
```

### 2. حماية route بأكثر من صلاحية (OR)

```javascript
import { requireAnyPermission } from '../middleware/checkPermission.js';

// يمكن الوصول بصلاحية LOGS أو TRASH
router.get('/admin/view-activity', 
  requireAuth,
  requireAnyPermission(['HOSPITAL_LOGS', 'HOSPITAL_TRASH']),
  async (req, res) => {
    // كود عرض النشاط
  }
);
```

### 3. استخدام الدالة المساعدة مباشرة

```javascript
import { hasPermissionFor } from '../middleware/checkPermission.js';

router.post('/admin/some-action', requireAuth, async (req, res) => {
  // تحقق يدوي
  const allowed = await hasPermissionFor(
    req.user.UserID, 
    req.user.HospitalID, 
    'HOSPITAL_TRASH'
  );
  
  if (!allowed) {
    return res.status(403).json({ 
      ok: false, 
      error: 'ليس لديك صلاحية' 
    });
  }
  
  // تابع العملية...
});
```

---

## 🎯 الصلاحيات المتاحة للاستخدام

| المفتاح | الوصف |
|--------|-------|
| `HOSPITAL_TRASH` | إدارة المحذوفات |
| `HOSPITAL_LOGS` | عرض السجلات |
| `HOSPITAL_PERMISSIONS` | إدارة الصلاحيات |
| `HOSPITAL_USERS` | إدارة المستخدمين |
| `HOSPITAL_CREATE` | إضافة مستشفى جديد |

---

## 📋 خطوات التطبيق على Routes موجودة

### مثال: حماية routes المحذوفات

**الملف:** `routes/admin-trash.js` (إذا كان موجوداً)

```javascript
import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/checkPermission.js';

const router = express.Router();

// عرض المحذوفات
router.get('/', 
  requireAuth, 
  requirePermission('HOSPITAL_TRASH'),
  async (req, res) => {
    // كود عرض المحذوفات
  }
);

// استعادة عنصر
router.post('/restore/:id', 
  requireAuth, 
  requirePermission('HOSPITAL_TRASH'),
  async (req, res) => {
    // كود الاستعادة
  }
);

// حذف نهائي
router.delete('/permanent/:id', 
  requireAuth, 
  requirePermission('HOSPITAL_TRASH'),
  async (req, res) => {
    // كود الحذف النهائي
  }
);

export default router;
```

---

## ✅ المميزات

1. **✅ مدير التجمع مسموح تلقائياً** - لا يحتاج فحص الصلاحيات
2. **✅ رسائل خطأ واضحة** - 403 Forbidden مع توضيح السبب
3. **✅ سهل الاستخدام** - middleware بسيط وواضح
4. **✅ مرن** - يمكن التحقق من صلاحية واحدة أو عدة صلاحيات
5. **✅ Logging كامل** - تسجيل كل محاولة وصول

---

## 🧪 الاختبار

### 1. اختبار مدير التجمع (يجب أن يمر):
```bash
# افتح أي route محمي بصلاحية
# مدير التجمع يجب أن يصل بدون مشاكل
```

### 2. اختبار مستخدم بدون صلاحية (يجب أن يرفض):
```bash
# افتح route محمي بصلاحية HOSPITAL_TRASH
# مستخدم بدون الصلاحية يجب أن يحصل على 403
```

### 3. اختبار مستخدم بالصلاحية (يجب أن يمر):
```bash
# امنح المستخدم صلاحية HOSPITAL_TRASH من صفحة الصلاحيات
# افتح route محمي بنفس الصلاحية
# يجب أن يصل بنجاح
```

---

## 🔐 الأمان

### Client-side (الواجهة):
- الأيقونات مخفية إذا لم تكن الصلاحية موجودة

### Server-side (الخادم):
- ✅ **التحقق الإلزامي** من الصلاحية قبل تنفيذ أي عملية
- ✅ لا يمكن تجاوز الحماية بتعديل الواجهة
- ✅ استخدام `requireAuth` قبل فحص الصلاحيات دائماً

---

## 📝 ملاحظات

1. **الترتيب مهم**: دائماً استخدم `requireAuth` قبل `requirePermission`
2. **مدير التجمع**: له جميع الصلاحيات تلقائياً بدون إدخال في `user_permissions`
3. **Logging**: جميع محاولات الوصول مسجلة في console للمراجعة

---

## 🚀 التطبيق السريع

لحماية جميع routes إدارة المستشفى، يمكنك فتح كل ملف route وإضافة middleware:

```javascript
// routes/admin-trash.js
import { requirePermission } from '../middleware/checkPermission.js';
router.use(requirePermission('HOSPITAL_TRASH')); // يطبق على جميع routes في الملف

// routes/admin-logs.js
import { requirePermission } from '../middleware/checkPermission.js';
router.use(requirePermission('HOSPITAL_LOGS'));

// routes/admin-users.js
import { requirePermission } from '../middleware/checkPermission.js';
router.use(requirePermission('HOSPITAL_USERS'));
```

---

**تاريخ الإنشاء:** 2025-10-25  
**الإصدار:** 1.0  
**الحالة:** ✅ جاهز للاستخدام

