# تحديث عرض بيانات الموظف المُبلّغ عليه في صفحة التفاصيل

## نظرة عامة
تم إضافة قسم جديد في صفحة تفاصيل البلاغ لعرض بيانات الموظف المُبلّغ عليه (إن وجد) من جدول `complaint_targets`.

## التحديثات المطبقة

### 1. Frontend - HTML (complaint-details.html)

#### إضافة قسم بيانات الموظف المُبلّغ عليه:
```html
<!-- بيانات الموظف المُبلّغ عليه -->
<section id="targetSection" class="card mt-4" style="display:none;">
  <div class="section-title">
    <span class="icon">👥</span>
    <h2>بيانات الموظف المُبلّغ عليه</h2>
  </div>
  
  <div class="grid sm:grid-cols-2 gap-3 text-[15px] text-gray-700">
    <div><span class="font-semibold text-gray-800">اسم الموظف:</span> <span id="targetEmployeeName">—</span></div>
    <div><span class="font-semibold text-gray-800">رقم الموظف:</span> <span id="targetEmployeeID">—</span></div>
    <div><span class="font-semibold text-gray-800">اسم القسم:</span> <span id="targetDepartmentName">—</span></div>
    <div><span class="font-semibold text-gray-800">رقم القسم:</span> <span id="targetDepartmentID">—</span></div>
  </div>
</section>
```

**الميزات:**
- القسم مخفي مبدئياً (`display:none`)
- نفس تصميم باقي البطاقات
- عرض 4 حقول: اسم الموظف، رقم الموظف، اسم القسم، رقم القسم

### 2. Frontend - JavaScript (complaint-details.js)

#### إضافة منطق عرض البيانات:
```javascript
// --- بيانات الموظف المُبلّغ عليه ---
if (c.targets && c.targets.length > 0) {
  const t = c.targets[0];
  const section = document.getElementById('targetSection');
  if (section) {
    section.style.display = 'block';
    document.getElementById('targetEmployeeName').textContent = t.TargetEmployeeName || '—';
    document.getElementById('targetEmployeeID').textContent = t.TargetEmployeeID || '—';
    document.getElementById('targetDepartmentName').textContent = t.TargetDepartmentName || '—';
    document.getElementById('targetDepartmentID').textContent = t.TargetDepartmentID || '—';
    
    console.log('✅ تم عرض بيانات الموظف المُبلّغ عليه:', t);
  }
} else {
  // ما فيه بيانات موظف، خفِ المربع
  const section = document.getElementById('targetSection');
  if (section) {
    section.style.display = 'none';
    console.log('ℹ️ لا توجد بيانات موظف مُبلّغ عليه');
  }
}
```

**المنطق:**
- يتحقق من وجود `c.targets` وطولها > 0
- إذا وُجدت بيانات، يعرض القسم ويملأ الحقول
- إذا لم توجد بيانات، يخفي القسم
- إضافة لوجات تشخيصية

### 3. Backend - API (complaints.js)

#### إضافة جلب بيانات الموظف المُبلّغ عليه:
```javascript
// ✅ جلب بيانات الموظف المُبلّغ عليه لكل بلاغ
for (let i = 0; i < items.length; i++) {
  const complaint = items[i];
  try {
    const [targets] = await hospitalPool.query(
      `SELECT TargetID, TargetEmployeeID, TargetEmployeeName,
              TargetDepartmentID, TargetDepartmentName, CreatedAt
       FROM complaint_targets
       WHERE ComplaintID = ?`,
      [complaint.ComplaintID]
    );
    
    complaint.targets = targets || [];
    console.log(`📋 [TRACK] بلاغ ${complaint.ComplaintID}: ${targets?.length || 0} موظف مُبلّغ عليه`);
  } catch (error) {
    console.error(`❌ [TRACK] خطأ في جلب بيانات الموظف للبلاغ ${complaint.ComplaintID}:`, error.message);
    complaint.targets = [];
  }
}
```

**الميزات:**
- جلب بيانات من جدول `complaint_targets`
- ربط البيانات بالبلاغ الأصلي
- معالجة الأخطاء
- لوجات تشخيصية

## تدفق العمل

### 1. فتح صفحة تفاصيل البلاغ
1. المستخدم يفتح صفحة تفاصيل البلاغ
2. JavaScript يستدعي `/api/complaints/track`
3. Backend يجلب بيانات البلاغ من قاعدة المستشفى
4. Backend يجلب بيانات الموظف المُبلّغ عليه من `complaint_targets`
5. البيانات تُرسل للـ Frontend

### 2. عرض البيانات
1. Frontend يتحقق من وجود `c.targets`
2. إذا وُجدت بيانات:
   - يظهر قسم "بيانات الموظف المُبلّغ عليه"
   - يملأ الحقول بالبيانات
3. إذا لم توجد بيانات:
   - يخفي القسم

## البيانات المُرسلة

### من API إلى Frontend:
```json
{
  "items": [
    {
      "ComplaintID": 5,
      "TicketNumber": "C-2025-000004",
      "PatientFullName": "سموره",
      "Description": "وصف البلاغ",
      "targets": [
        {
          "TargetID": 1,
          "TargetEmployeeID": 1,
          "TargetEmployeeName": "أحمد محمد",
          "TargetDepartmentID": 1,
          "TargetDepartmentName": "قسم التمريض",
          "CreatedAt": "2025-01-21T10:30:00.000Z"
        }
      ]
    }
  ]
}
```

## الملفات المحدثة

1. **`NewProjectMecca/public/complaints/history/complaint-details.html`**
   - إضافة قسم بيانات الموظف المُبلّغ عليه

2. **`NewProjectMecca/public/complaints/history/complaint-details.js`**
   - إضافة منطق عرض بيانات الموظف

3. **`backend/routes/complaints.js`**
   - إضافة جلب بيانات من `complaint_targets`

## النتيجة

### ✅ **عند وجود بلاغ على موظف:**
- يظهر قسم "بيانات الموظف المُبلّغ عليه"
- يعرض اسم الموظف، رقمه، القسم، ورقم القسم
- تصميم متسق مع باقي الصفحة

### ✅ **عند عدم وجود بلاغ على موظف:**
- يختفي القسم تلقائياً
- لا يؤثر على باقي الصفحة

### ✅ **الأمان:**
- البيانات تأتي من قاعدة المستشفى الصحيحة
- يتم التحقق من وجود البيانات قبل العرض
- معالجة الأخطاء بشكل آمن

## الاختبار

### 1. اختبار مع بلاغ على موظف:
1. أنشئ بلاغ جديد مع تحديد موظف
2. افتح صفحة تفاصيل البلاغ
3. تأكد من ظهور قسم "بيانات الموظف المُبلّغ عليه"
4. تحقق من صحة البيانات المعروضة

### 2. اختبار مع بلاغ عادي:
1. افتح صفحة تفاصيل بلاغ عادي (بدون موظف)
2. تأكد من عدم ظهور قسم "بيانات الموظف المُبلّغ عليه"

### 3. اختبار Console:
- افتح Developer Tools
- تحقق من اللوجات التشخيصية
- تأكد من عدم وجود أخطاء JavaScript
