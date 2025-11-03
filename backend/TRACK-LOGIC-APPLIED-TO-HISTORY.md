# 🔄 تطبيق منطق "تتبع البلاغ" على "سجل البلاغات"

## 🎯 **الهدف:**
جعل "سجل البلاغات" يعمل بنفس منطق "تتبع البلاغ" بالضبط - يعمل مع وبدون توكن، يدعم fallback، ويرجع 200 دائماً.

## 📊 **التحليل:**

### **منطق "تتبع البلاغ" (النموذج):**
1. ✅ **`optionalAuth`** - يعمل مع وبدون توكن
2. ✅ **`hospitalScopeSQL`** - يحدد النطاق حسب المستخدم
3. ✅ **البحث في المركزية أولاً** - `centralDb.query()`
4. ✅ **fallback لقاعدة المستشفى** - إذا لم توجد نتائج + `hospitalId`
5. ✅ **دعم `?hospitalId=`** - للزوار
6. ✅ **إرجاع 200 دائماً** - حتى لو فارغ
7. ✅ **إرسال التوكن** - إذا كان موجوداً
8. ✅ **إرسال `hospitalId`** - من localStorage
9. ✅ **معالجة النتائج الفارغة** - رسالة ودية

## 🔧 **التطبيق:**

### **1. الباكند - routes/complaints.js:**

#### **قبل التطبيق:**
```javascript
router.get('/history', requireAuth, async (req, res) => {
  // يتطلب توكن دائماً
  // fallback فقط للموظفين
  // لا يدعم ?hospitalId=
```

#### **بعد التطبيق:**
```javascript
router.get('/history', optionalAuth, async (req, res) => {
  // يعمل مع وبدون توكن
  // fallback للموظفين والزوار
  // يدعم ?hospitalId=
```

#### **التغييرات المطبقة:**
```javascript
// 1. تغيير الميدلوير
router.get('/history', optionalAuth, async (req, res) => {

// 2. تحسين اللوج
console.log(`📋 [HISTORY] البحث | hasUser: ${!!req.user} | hospitalId: ${req.user?.hospitalId || 'none'} | queryHospitalId: ${req.query.hospitalId || 'none'} | page: ${page}`);

// 3. تحسين fallback
if (!rows.length && (req.user?.hospitalId || req.query.hospitalId)) {
  const hospitalId = req.user?.hospitalId || parseInt(req.query.hospitalId, 10);
  if (Number.isFinite(hospitalId)) {
    console.log(`🔄 البحث في قاعدة المستشفى ${hospitalId} كبديل احتياطي`);
    try {
      const fakeUser = req.user || { roleId: 0, hospitalId };
      const pool = await getContextualPool(fakeUser, req);
      // ... باقي الكود
    } catch (error) {
      console.log('⚠️ خطأ في البحث الاحتياطي:', error.message);
    }
  }
}
```

### **2. الواجهة - complaints-history.js:**

#### **قبل التطبيق:**
```javascript
// إرسال التوكن فقط
const token = localStorage.getItem('token');
if (token) {
  headers['Authorization'] = `Bearer ${token}`;
}
```

#### **بعد التطبيق:**
```javascript
// إرسال التوكن + hospitalId
const token = localStorage.getItem('token');
if (token) {
  headers['Authorization'] = `Bearer ${token}`;
}

// إضافة hospitalId إذا كان متوفراً (لتفعيل fallback)
const hospitalId = localStorage.getItem('hospitalId');
if (hospitalId && hospitalId !== 'ALL') {
  params.set('hospitalId', hospitalId);
  console.log(`🏥 إرسال hospitalId: ${hospitalId}`);
}
```

#### **معالجة النتائج الفارغة:**
```javascript
// معالجة النتائج الفارغة بنفس منطق تتبع البلاغ
if (data.items && data.items.length === 0) {
  showNoResults('لا توجد بلاغات مطابقة للبحث');
  return;
}

function showNoResults(message) {
  els.results.innerHTML = `
    <div class="rounded-xl border border-gray-200 bg-white/70 p-6 text-center">
      <div class="text-4xl">🔍</div>
      <div class="mt-2 font-bold">${message}</div>
      <div class="text-sm text-gray-500 mt-1">جرّبي فلاتر أخرى أو تحققي من صحة البيانات المدخلة.</div>
    </div>
  `;
}
```

## 🧪 **الاختبار:**

### **1. اختبار بدون توكن:**
```bash
# يجب أن يعمل مع ?hospitalId=
GET /api/complaints/history?page=1&pageSize=9&hospitalId=11
```

### **2. اختبار مع توكن:**
```bash
# يجب أن يعمل مع التوكن
GET /api/complaints/history?page=1&pageSize=9
Authorization: Bearer [token]
```

### **3. اختبار fallback:**
```bash
# إذا لم توجد نتائج في المركزية
# يجب أن يبحث في قاعدة المستشفى
```

## 📊 **النتائج المتوقعة:**

### **سيناريو 1: موظف مع توكن**
```
🔐 [AUTH] التحقق من التوكن: { hasHeader: true, hasToken: true }
✅ [AUTH] التوكن صالح: { userId: 1, roleId: 2, hospitalId: 11 }
📋 [HISTORY] البحث | hasUser: true | hospitalId: 11 | queryHospitalId: none
🔄 البحث في قاعدة المستشفى 11 كبديل احتياطي
✅ تم العثور على 25 نتيجة في قاعدة المستشفى
```

### **سيناريو 2: زائر مع hospitalId**
```
🔐 [AUTH] التحقق من التوكن: { hasHeader: false, hasToken: false }
📋 [HISTORY] البحث | hasUser: false | hospitalId: none | queryHospitalId: 11
🔄 البحث في قاعدة المستشفى 11 كبديل احتياطي
✅ تم العثور على 25 نتيجة في قاعدة المستشفى
```

### **سيناريو 3: بدون نتائج**
```
📋 [HISTORY] البحث | hasUser: true | hospitalId: 11
🔄 البحث في قاعدة المستشفى 11 كبديل احتياطي
⚠️ خطأ في البحث الاحتياطي: No data found
# إرجاع 200 مع items: []
```

## 🎯 **الخلاصة:**

### **التحسينات المطبقة:**
1. ✅ **`optionalAuth`** بدلاً من `requireAuth`
2. ✅ **دعم `?hospitalId=`** للزوار
3. ✅ **fallback محسن** للموظفين والزوار
4. ✅ **إرسال `hospitalId`** من الواجهة
5. ✅ **معالجة النتائج الفارغة** برسالة ودية
6. ✅ **لوج تشخيصي محسن**

### **النتيجة:**
"سجل البلاغات" يعمل الآن بنفس منطق "تتبع البلاغ" بالضبط:
- يعمل مع وبدون توكن
- يدعم fallback لقاعدة المستشفى
- يرجع 200 دائماً
- يعرض رسائل ودية للنتائج الفارغة
- يدعم الزوار مع `?hospitalId=`

### **الاختبار:**
1. افتح صفحة سجل البلاغات
2. راقب console المتصفح والسيرفر
3. تأكد من ظهور رسائل التشخيص
4. تأكد من عمل fallback عند الحاجة
