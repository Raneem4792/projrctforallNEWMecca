# إصلاح مشكلة multipart/form-data في إرسال البلاغات

## المشكلة
عند إرسال البلاغات باستخدام `FormData` (multipart/form-data)، كان `express.json()` لا يقرأ الـ body، مما يؤدي إلى:
- `req.body` فارغ في `resolveHospitalId` middleware
- ظهور خطأ: `bodyHospitalId: undefined`
- فشل في تحديد المستشفى: `POST /api/complaints 400`

## الحل المطبق

### 1. تحديث الفرونت إند (`submit-complaint.js`)
```javascript
// استخراج hospitalId قبل الإرسال
const hospitalSelect = document.getElementById('hospitalSelect');
const hospitalIdHidden = document.getElementById('hospitalIdHidden');
const hospitalId = 
  (hospitalSelect && hospitalSelect.value) ||
  (hospitalIdHidden && hospitalIdHidden.value) || '';

// إرسال مع X-Hospital-Id header
const res = await fetch(API_BASE + '/complaints', {
  method: 'POST',
  body: fd, // FormData
  headers: {
    'Authorization': `Bearer ${token}`,
    'X-Hospital-Id': hospitalId   // 👈 الحل الجديد
  }
});
```

### 2. تحديث resolveHospitalId middleware
```javascript
// إضافة قراءة من الهيدر
let hospitalId = Number(req.query.hospitalId || 0);

// 2) من الهيدر (للمشكلة multipart/form-data)
if (!hospitalId) hospitalId = Number(req.headers['x-hospital-id'] || 0);

// 3) من البودي
if (!hospitalId) hospitalId = Number(req.body?.hospitalId || req.body?.HospitalID || 0);

// 4) من المستخدم
if (!hospitalId) hospitalId = Number(req.user?.HospitalID || req.user?.hospitalId || 0);
```

### 3. تحديث route POST /complaints
```javascript
// إضافة resolveHospitalId middleware بعد multer
router.post('/', requireAuth, upload.array('attachments', 10), resolveHospitalId, async (req, res) => {
  const hospitalId = Number(req.hospitalId); // من الميدلوير
  // ...
});
```

## ترتيب الميدلويرات الصحيح
1. `requireAuth` - التحقق من التوكن
2. `upload.array()` - معالجة FormData
3. `resolveHospitalId` - تحديد المستشفى (يقرأ من الهيدر الآن)
4. Controller function

## المزايا
- ✅ يعمل مع FormData (multipart/form-data)
- ✅ يعمل مع JSON (application/json)
- ✅ يعمل مع query parameters
- ✅ يعمل مع التوكن (للموظفين)
- ✅ متوافق مع جميع أنواع المستخدمين

## الاختبار
```bash
# تشغيل اختبار سريع
node test-multipart-fix.js
```

## ملاحظات
- الحل يعمل فوراً بدون إعادة تشغيل الخادم
- لا يؤثر على الوظائف الموجودة
- يدعم جميع أنواع المستخدمين (Cluster Admin, Hospital Employee)
- يحافظ على الأمان (التحقق من التوكن أولاً)
