# إصلاح مشكلة CORS للـ X-Hospital-Id Header

## المشكلة
عند إرسال `X-Hospital-Id` header من الفرونت إند، كان يظهر خطأ:
```
Request header x-hospital-id is not allowed by Access-Control-Allow-Headers
POST ... net::ERR_FAILED
```

## السبب
إعدادات CORS في `app.js` لم تكن تتضمن `X-Hospital-Id` في `allowedHeaders`.

## الحل المطبق

### 1. تحديث إعدادات CORS في `app.js`
```javascript
app.use(cors({
  origin: ['http://127.0.0.1:5500', 'http://localhost:5500', 'http://localhost:3000', 'http://127.0.0.1:3000'],
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Hospital-Id','X-Requested-With'], // 👈 تم إضافة X-Hospital-Id
  credentials: true
}));

// ✅ رد على preflight للجميع (لضمان عمل CORS)
app.options('*', cors());
```

### 2. ترتيب الميدلويرات الصحيح
```javascript
// في routes/complaints.js
router.post('/', 
  requireAuth,                    // 1. التحقق من التوكن
  upload.array('attachments', 10), // 2. معالجة FormData
  resolveHospitalId,              // 3. تحديد المستشفى (يقرأ من header/query/body/token)
  async (req, res) => { ... }     // 4. Controller
);
```

### 3. دعم متعدد المصادر في resolveHospitalId
```javascript
// في middleware/resolveHospitalId.js
// 1) من الكويري
let hospitalId = Number(req.query.hospitalId || 0);

// 2) من الهيدر (للمشكلة multipart/form-data)
if (!hospitalId) hospitalId = Number(req.headers['x-hospital-id'] || 0);

// 3) من البودي
if (!hospitalId) hospitalId = Number(req.body?.hospitalId || req.body?.HospitalID || 0);

// 4) من المستخدم (للموظف المصادق عليه)
if (!hospitalId) hospitalId = Number(req.user?.HospitalID || req.user?.hospitalId || 0);
```

## المزايا
- ✅ **يعمل مع FormData** - يحل مشكلة multipart/form-data
- ✅ **يعمل مع JSON** - متوافق مع جميع أنواع الطلبات
- ✅ **آمن** - يحافظ على التحقق من التوكن
- ✅ **مرن** - يدعم query, header, body, token
- ✅ **متوافق مع CORS** - لا توجد مشاكل في preflight requests

## الاختبار
```bash
# اختبار CORS
node test-cors-fix.js

# اختبار multipart
node test-multipart-fix.js
```

## ملاحظات مهمة
1. **يجب إعادة تشغيل الخادم** بعد تحديث `app.js`
2. تأكد من أن Origin في CORS يتطابق مع URL الفرونت
3. الحل يعمل مع جميع أنواع المستخدمين (Cluster Admin, Hospital Employee)
4. لا يؤثر على الوظائف الموجودة

## تدفق العمل
1. الفرونت يرسل `X-Hospital-Id` في header
2. CORS يسمح بالـ header
3. `resolveHospitalId` يقرأ من header
4. البلاغ يُنشأ بنجاح
