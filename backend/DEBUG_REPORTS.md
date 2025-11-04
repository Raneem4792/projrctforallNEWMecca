# 🔍 دليل تشخيص مشكلة /api/reports/summary.pdf

## ✅ الخطوات المطلوبة:

### 1. إعادة تشغيل السيرفر

**مهم جداً:** أي تعديل على ملفات routes يحتاج إعادة تشغيل كاملة!

```bash
cd backend
# أوقفي السيرفر القديم بـ Ctrl + C
node app.js
```

**يجب أن ترى في التيرمنال:**
```
📦 [app.js] جاري تحميل reports routes...
✅ reports.routes.js loaded
✅ reports.routes.js mounted at /api/reports
📦 [app.js] جاري تركيب reports routes على /api/reports...
✅ [app.js] reportsRoutes loaded successfully
✅ Reports routes mounted at /api/reports
   - GET  /api/reports/test (اختباري)
   - GET  /api/reports/summary.pdf
   - POST /api/reports/summary.pdf
🚀 API يعمل على http://localhost:3001
```

**إذا لم تر هذه الرسائل:**
- ❌ الملف `backend/routes/reports.routes.js` غير موجود أو فيه خطأ
- ❌ هناك خطأ في import في `app.js`

---

### 2. اختبار Route مباشرة

**افتح في المتصفح:**
```
http://localhost:3001/api/reports/test
```

**إذا رأيت:**
```json
{"ok":true,"route":"reports test","message":"reports routes working!"}
```
✅ **الـ router يعمل بشكل صحيح!**

**إذا رأيت 404:**
- ❌ الـ router لم يُحمّل بشكل صحيح
- ❌ أو الـ requireAuth يمنع الوصول (لكن يجب أن يرجع 401 وليس 404)

---

### 3. اختبار من صفحة التقارير

1. افتح صفحة التقارير
2. افتح Developer Console (F12)
3. اضغط زر **PDF** لتقرير "ملخّص التجمع"

**في Console (المتصفح) يجب أن ترى:**
```
[Export] فحص حالة خاصة: {reportKey: "summary", format: "pdf", isSummaryPdf: true}
[Export] ✅ حالة خاصة - استخدام POST
[Export] ✅ تم أخذ صورة من canvas، حجم: ...
[Export] بيانات الجدول: {rowsCount: ..., firstRow: {...}}
[Export] طلب تقرير: {url: "http://localhost:3001/api/reports/summary.pdf", method: "POST", hasAuth: true}
```

**في تيرمنال السيرفر يجب أن ترى:**
```
🔍 [REQUEST] POST /api/reports/summary.pdf { hasAuth: true, contentType: 'application/json', query: null }
🔐 [AUTH] التحقق من التوكن: {...}
✅ [AUTH] التوكن صالح: {...}
📄 [exportSummaryPdf] دخلنا الدالة { method: 'POST', hasBody: true, ... }
```

---

### 4. التحقق من الملفات

**تأكد من أن `backend/routes/reports.routes.js` يحتوي على:**
```javascript
router.post('/summary.pdf', reportsController.exportSummaryPdf);
```

**تأكد من أن `backend/app.js` يحتوي على:**
```javascript
import reportsRoutes from './routes/reports.routes.js';
// ...
app.use('/api/reports', reportsRoutes);
```

---

### 5. إذا استمر الخطأ

**إذا كان الخطأ 401 بدلاً من 404:**
- المشكلة في التوكن أو المصادقة
- تحقق من رسائل `🔐 [AUTH]` في التيرمنال

**إذا بقي 404:**
- تأكد من أن السيرفر أعيد تشغيله بعد التعديلات
- تأكد من أن الملفات محفوظة
- تحقق من أن لا يوجد نسخة قديمة من الملف في مكان آخر

---

## 📋 Checklist سريع:

- [ ] السيرفر أعيد تشغيله بعد التعديلات
- [ ] رسائل `✅ reports.routes.js loaded` تظهر في التيرمنال
- [ ] `/api/reports/test` يعمل (يرجع JSON)
- [ ] Console في المتصفح يظهر `method: "POST"`
- [ ] تيرمنال السيرفر يظهر `🔍 [REQUEST] POST /api/reports/summary.pdf`

