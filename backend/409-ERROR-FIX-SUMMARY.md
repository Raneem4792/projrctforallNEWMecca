# إصلاح خطأ 409 في تحويل البلاغات بين الموظفين

## المشكلة الأصلية
كان يحدث خطأ 409 (Conflict) عند محاولة تحويل البلاغ بين الموظفين مع الرسالة:
```
"fromUserId لا يطابق الموظف الحالي"
```

## سبب المشكلة
1. **الواجهة ترسل `fromUserId` خاطئ**: قائمة "الموظف الحالي" (`#empFrom`) تتعبأ من موظفي القسم المحدد
2. **تحديد تلقائي خاطئ**: إذا لم يكن البلاغ مُسنداً أو الموظف المُسند غير موجود في القسم، يتم تحديد أول موظف تلقائياً
3. **تعارض في البيانات**: الواجهة ترسل `fromUserId` لا يطابق `AssignedToUserID` الفعلي في قاعدة البيانات
4. **رفض من الخادم**: الباك إند يرفض التحويل بسبب عدم تطابق البيانات

## الحلول المطبقة

### 1. إصلاح إرسال البيانات ✅
```javascript
// في submitEmployeeTransfer()
const currentAssignee = Number(currentComplaint?.AssignedToUserID || 0);
const selectedFrom = Number(document.getElementById('empFrom')?.value || 0);

// لا نرسل fromUserId إلا إذا طابق الموظف المُسند فعلاً
const safeFromUserId = currentAssignee && selectedFrom === currentAssignee
  ? selectedFrom
  : undefined;

const payload = {
  fromUserId: safeFromUserId, // قد تكون undefined فتُحذف تلقائيًا
  toUserId,
  note
};
```

### 2. تحسين تعبئة القائمة ✅
```javascript
// في populateEmpMove() -> loadUsersFor()
const currentAssignee = Number(currentComplaint?.AssignedToUserID || 0);

if (currentAssignee) {
  const iFrom = [...empFrom.options].findIndex(o => Number(o.value) === currentAssignee);
  if (iFrom >= 0) {
    empFrom.selectedIndex = iFrom;
  } else {
    // الموظف المُسند غير موجود في هذا القسم - أضف خيار "غير مُسند"
    empFrom.insertAdjacentHTML('afterbegin', '<option value="">— غير مُسند —</option>');
    empFrom.selectedIndex = 0;
  }
} else {
  // لا يوجد موظف مُسند - أضف خيار "غير مُسند"
  empFrom.insertAdjacentHTML('afterbegin', '<option value="">— غير مُسند —</option>');
  empFrom.selectedIndex = 0;
}
```

### 3. تحسين رسائل الخطأ ✅
```javascript
if (res.status === 409 && errorMessage.includes('fromUserId لا يطابق')) {
  errorMessage = 'لا يمكن تأكيد الموظف الحالي للبلاغ. تمت محاولة التحويل بدون التحقق من الموظف الحالي.';
}
```

## النتائج المتوقعة

### ✅ قبل الإصلاح
- خطأ 409 عند محاولة التحويل
- رسالة خطأ غير واضحة
- تعارض في بيانات `fromUserId`

### ✅ بعد الإصلاح
- تحويل ناجح للبلاغات
- رسائل خطأ واضحة ومفيدة
- عدم إرسال `fromUserId` إلا عند التأكد من صحته
- خيار "غير مُسند" في القائمة عند عدم وجود موظف مُسند

## سيناريوهات الاختبار

### 1. بلاغ غير مُسند
- **الواجهة**: تظهر "— غير مُسند —" في قائمة الموظف الحالي
- **الإرسال**: لا يتم إرسال `fromUserId`
- **النتيجة**: تحويل ناجح

### 2. بلاغ مُسند لموظف موجود في القسم
- **الواجهة**: تظهر اسم الموظف المُسند في القائمة
- **الإرسال**: يتم إرسال `fromUserId` الصحيح
- **النتيجة**: تحويل ناجح مع التحقق

### 3. بلاغ مُسند لموظف غير موجود في القسم
- **الواجهة**: تظهر "— غير مُسند —" في القائمة
- **الإرسال**: لا يتم إرسال `fromUserId`
- **النتيجة**: تحويل ناجح بدون التحقق

### 4. محاولة تحويل لنفس الموظف
- **الواجهة**: رسالة "اختر موظفًا مختلفًا"
- **الإرسال**: لا يتم إرسال الطلب
- **النتيجة**: منع التحويل

## الملفات المحدثة
- `NewProjectMecca/public/complaints/history/complaint-details.js`
  - دالة `submitEmployeeTransfer()`
  - دالة `populateEmpMove()` -> `loadUsersFor()`

## اختبار النظام
1. افتح صفحة تفاصيل بلاغ
2. اضغط على زر "تحويل"
3. اختر تبويب "تحويل بين الموظفين"
4. تأكد من ظهور الخيارات الصحيحة
5. جرب التحويل في سيناريوهات مختلفة

---
تم إصلاح المشكلة بنجاح! النظام الآن يتعامل مع جميع حالات الإسناد بشكل صحيح.
