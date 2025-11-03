# نظام بلاغات الموظفين

## نظرة عامة
نظام يسمح بتقديم بلاغات موجهة لموظفين محددين في المستشفى، مع تخزين هذه البلاغات في جدول منفصل `complaint_targets`.

## هيكل قاعدة البيانات

### جدول `complaint_targets`
```sql
CREATE TABLE complaint_targets (
  TargetID BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  ComplaintID BIGINT UNSIGNED NOT NULL,
  TargetEmployeeID INT NULL,
  TargetEmployeeName VARCHAR(150) NULL,
  TargetDepartmentID INT NULL,
  TargetDepartmentName VARCHAR(150) NULL,
  CreatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  KEY fk_ct_complaint (ComplaintID),
  CONSTRAINT fk_ct_complaint FOREIGN KEY (ComplaintID)
    REFERENCES complaints(ComplaintID) ON DELETE CASCADE,
    
  KEY idx_target_employee (TargetEmployeeID),
  KEY idx_target_department (TargetDepartmentID),
  KEY idx_created_at (CreatedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## API Endpoints

### 1. البحث عن موظفين
```
GET /api/complaint-targets/search-employees?q=اسم_الموظف
```

**Headers:**
- `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "UserID": 1,
      "FullName": "أحمد محمد",
      "DepartmentID": 1,
      "DepartmentName": "قسم التمريض"
    }
  ]
}
```

### 2. إنشاء بلاغ على موظف
```
POST /api/complaint-targets
```

**Headers:**
- `Authorization: Bearer <token>`
- `Content-Type: application/json`

**Body:**
```json
{
  "complaintId": 5,
  "targetEmployeeId": 1,
  "targetEmployeeName": "أحمد محمد",
  "targetDepartmentId": 1,
  "targetDepartmentName": "قسم التمريض"
}
```

**Response:**
```json
{
  "success": true,
  "message": "تم إنشاء بلاغ على موظف بنجاح",
  "data": {
    "targetId": 1,
    "complaintId": 5
  }
}
```

### 3. جلب جميع البلاغات على الموظفين
```
GET /api/complaint-targets?page=1&pageSize=20&employeeSearch=أحمد&status=OPEN&priority=HIGH
```

**Headers:**
- `Authorization: Bearer <token>`

**Query Parameters:**
- `page`: رقم الصفحة (افتراضي: 1)
- `pageSize`: عدد العناصر في الصفحة (افتراضي: 20)
- `employeeSearch`: البحث في اسم الموظف
- `status`: فلتر حسب حالة البلاغ
- `priority`: فلتر حسب الأولوية

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "TargetID": 1,
      "ComplaintID": 5,
      "TargetEmployeeID": 1,
      "TargetEmployeeName": "أحمد محمد",
      "TargetDepartmentID": 1,
      "TargetDepartmentName": "قسم التمريض",
      "CreatedAt": "2025-01-21T10:30:00.000Z",
      "ticket": "C-2025-000001",
      "fullName": "سموره",
      "status": "OPEN",
      "priority": "MEDIUM",
      "Description": "وصف البلاغ",
      "DepartmentName": "قسم التمريض"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "pages": 1
  }
}
```

### 4. حذف بلاغ على موظف
```
DELETE /api/complaint-targets/:targetId
```

**Headers:**
- `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "message": "تم حذف البلاغ على الموظف بنجاح"
}
```

## الواجهة الأمامية

### 1. نموذج تقديم البلاغ
- **الملف:** `submit-complaint.html`
- **الميزات:**
  - خيار "بلاغ على موظف؟ (اختياري)"
  - بحث عن الموظفين
  - اختيار الموظف المستهدف
  - إرسال البلاغ مع بيانات الموظف

### 2. صفحة عرض بلاغات الموظفين
- **الملف:** `employee-complaints.html`
- **الميزات:**
  - عرض قائمة البلاغات على الموظفين
  - فلاتر البحث (اسم الموظف، الحالة، الأولوية)
  - الترقيم
  - عرض التفاصيل وحذف البلاغات

## تدفق العمل

### 1. تقديم بلاغ على موظف
1. المستخدم يملأ نموذج البلاغ العادي
2. يختار "بلاغ على موظف؟ (اختياري)"
3. يبحث عن الموظف ويختاره
4. يرسل البلاغ
5. النظام ينشئ البلاغ العادي أولاً
6. ثم ينشئ سجل في `complaint_targets` مع ربطه بالبلاغ

### 2. عرض بلاغات الموظفين
1. المستخدم يفتح صفحة "بلاغات الموظفين"
2. النظام يجلب البلاغات من `complaint_targets`
3. يعرضها مع تفاصيل البلاغ الأصلي
4. يمكن فلترة البحث حسب الموظف أو الحالة

## الأمان والصلاحيات

### 1. المصادقة
- جميع endpoints تتطلب JWT token صحيح
- يتم التحقق من `HospitalID` في التوكن

### 2. الصلاحيات
- المستخدمون يمكنهم رؤية بلاغات مستشفاهم فقط
- مديرو التجمع يمكنهم رؤية جميع البلاغات

### 3. التحقق من البيانات
- التحقق من وجود البلاغ الأصلي قبل إنشاء بلاغ على موظف
- التحقق من صحة بيانات الموظف
- منع إنشاء بلاغات مكررة

## الملفات المطلوبة

### Backend
- `backend/sql/create_complaint_targets_table.sql` - إنشاء الجدول
- `backend/controllers/complaintTargetsController.js` - منطق العمل
- `backend/routes/complaintTargets.js` - تعريف المسارات
- `backend/app.js` - تسجيل المسارات

### Frontend
- `NewProjectMecca/public/complaints/submit/submit-complaint.js` - تحديث النموذج
- `NewProjectMecca/public/complaints/employee-complaints.html` - صفحة العرض
- `NewProjectMecca/public/complaints/employee-complaints.js` - منطق الصفحة

### الاختبار
- `backend/test-complaint-targets.js` - اختبار النظام

## التثبيت والتشغيل

### 1. إنشاء الجدول
```bash
# تشغيل SQL script في كل قاعدة بيانات مستشفى
mysql -u root -p hosp_kbh < backend/sql/create_complaint_targets_table.sql
mysql -u root -p hosp_aaaa < backend/sql/create_complaint_targets_table.sql
```

### 2. تشغيل الخادم
```bash
cd backend
npm start
```

### 3. اختبار النظام
```bash
cd backend
node test-complaint-targets.js
```

## الاستخدام

### 1. تقديم بلاغ على موظف
1. افتح صفحة تقديم البلاغ
2. املأ بيانات البلاغ
3. فعّل خيار "بلاغ على موظف؟ (اختياري)"
4. ابحث عن الموظف واختره
5. أرسل البلاغ

### 2. عرض بلاغات الموظفين
1. افتح صفحة "بلاغات الموظفين"
2. استخدم الفلاتر للبحث
3. اضغط على "عرض التفاصيل" لرؤية البلاغ الكامل
4. يمكن حذف البلاغات إذا لزم الأمر

## الميزات المستقبلية

1. **إشعارات الموظفين:** إرسال إشعارات للموظفين عند استهدافهم ببلاغ
2. **تقارير إحصائية:** إحصائيات عن البلاغات الموجهة للموظفين
3. **متابعة الحالة:** تتبع حالة البلاغات على الموظفين
4. **التقييم:** إضافة نظام تقييم للموظفين بناءً على البلاغات
