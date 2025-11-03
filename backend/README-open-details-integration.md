# تكامل صفحة تفاصيل البلاغ مع قاعدة البيانات

## ✅ التحديثات المنجزة

تم تحديث صفحة `open-details.html` لتحميل تفاصيل البلاغ من قاعدة البيانات بدلاً من البيانات الوهمية.

## 🔧 التحديثات المطبقة

### أ) الباك-إند - راوتر `/api/complaints/:id`

#### 1. إنشاء ملف `backend/routes/complaints.js`:
```javascript
// GET /api/complaints/:id
// يُعيد تفاصيل البلاغ + المرفقات + السجل
router.get('/:id', async (req, res) => {
  // 1) البلاغ الأساسي + الأسماء
  // 2) المرفقات (اختياري)
  // 3) السجل الزمني
  // 4) تركيب الاستجابة بواجهة موحّدة
});
```

#### 2. ربط الراوتر في `app.js`:
```javascript
import complaintsRouter from './routes/complaints.js';
app.use('/api/complaints', complaintsRouter);
```

### ب) الفرونت-إند - تحديث `open-details.js`

#### 1. إضافة API_BASE:
```javascript
const API_BASE = (location.port === '3001') ? '' : 'http://localhost:3001';
```

#### 2. تحديث دالة `getOpenById()`:
```javascript
async function getOpenById(id) {
  try {
    const r = await fetch(`${API_BASE}/api/complaints/${encodeURIComponent(id)}`);
    if (!r.ok) throw new Error('HTTP '+r.status);
    return await r.json();
  } catch (e) {
    console.error('getOpenById error', e);
    return null;
  }
}
```

#### 3. إضافة دالة `statusToChip()`:
```javascript
function statusToChip(status) {
  const s = (status || '').toLowerCase();
  if (s.includes('closed') || s.includes('مغل')) return { cls:'pill bg-gray-100 text-gray-700', text:'مغلق' };
  if (s.includes('in_progress') || s.includes('جاري')) return { cls:'pill bg-blue-50 text-blue-700 border border-blue-200', text:'قيد المعالجة' };
  return { cls:'pill pill-orange', text:'مفتوح' };
}
```

## 📊 هيكل البيانات المُرجعة

### API Response Structure:
```json
{
  "id": "C-11",
  "complaintId": 11,
  "hospitalId": 1,
  "hospital": "مستشفى الملك عبدالعزيز",
  "dept": "الطوارئ",
  "category": "critical",
  "status": "OPEN",
  "createdAt": "2025-01-16T10:30:00.000Z",
  "updatedAt": "2025-01-16T10:30:00.000Z",
  "reporter": "أحمد محمد",
  "assignee": null,
  "source": "منظومة 937",
  "description": "وصف البلاغ...",
  "attachments": [
    { "name": "صورة.png", "url": "/uploads/..." }
  ],
  "history": [
    { "at": "2025-01-16T10:30:00.000Z", "action": "تم فتح البلاغ", "by": "النظام" }
  ]
}
```

## 🎯 الميزات الجديدة

### 1. تصنيف تلقائي للبلاغات
- **حرج (Critical)**: أولوية عالية/حرجة/عاجلة
- **بلاغ (Complaint)**: البلاغات العادية  
- **اقتراح (Suggestion)**: الاقتراحات والتطويرات

### 2. عرض الحالات بالعربي
- **مفتوح**: البلاغات الجديدة
- **قيد المعالجة**: البلاغات قيد المتابعة
- **مغلق**: البلاغات المكتملة

### 3. السجل الزمني الذكي
- **من جدول logs**: إذا كان موجود
- **من complaint_responses**: كخيار بديل
- **عرض بواسطة**: اسم المستخدم أو "النظام"

### 4. المرفقات الديناميكية
- **من جدول attachments**: إذا كان موجود
- **عرض آمن**: مع روابط صحيحة
- **رسالة واضحة**: عند عدم وجود مرفقات

## 🔍 الاستعلامات المستخدمة

### 1. البلاغ الأساسي:
```sql
SELECT
  c.ComplaintID,
  COALESCE(NULLIF(c.TicketNumber,''), CONCAT('C-', c.ComplaintID)) AS TicketNo,
  c.HospitalID, h.NameAr AS HospitalName,
  c.DepartmentID, d.NameAr AS DepartmentName,
  c.SubmissionType, c.StatusCode, c.PriorityCode,
  c.Description, c.CreatedAt, c.UpdatedAt,
  c.CreatedByUserID, u.FullName AS ReporterName,
  CASE
    WHEN UPPER(c.PriorityCode) IN ('CRITICAL','URGENT','HIGH')
         OR c.PriorityCode IN ('حرجة','عاجلة','عالية','حرج')
      THEN 'critical'
    WHEN (ct.TypeCode = 'SUGGESTION') OR (ct.TypeName LIKE '%اقتراح%')
      THEN 'suggestion'
    ELSE 'complaint'
  END AS Category
FROM complaints c
LEFT JOIN hospitals h ON h.HospitalID = c.HospitalID
LEFT JOIN departments d ON d.DepartmentID = c.DepartmentID
LEFT JOIN users u ON u.UserID = c.CreatedByUserID
LEFT JOIN complaint_types ct ON ct.ComplaintTypeID = c.ComplaintTypeID
WHERE c.ComplaintID = ?
```

### 2. المرفقات:
```sql
SELECT AttachmentID, FileName, FilePath, Description
FROM attachments
WHERE ComplaintID = ?
ORDER BY AttachmentID DESC
```

### 3. السجل الزمني:
```sql
SELECT CreatedAt AS at, COALESCE(ActionAr, ActionCode) AS action,
       COALESCE(u.FullName, 'النظام') AS by
FROM logs l
LEFT JOIN users u ON u.UserID = l.ActorUserID
WHERE l.HospitalID = ? AND (l.Details LIKE CONCAT('%', ?, '%') OR l.Details LIKE CONCAT('%ComplaintID=', ?, '%'))
ORDER BY l.CreatedAt ASC
```

## 🚀 كيفية الاستخدام

### 1. اختبار API مباشرة:
```bash
curl "http://localhost:3001/api/complaints/11"
```

### 2. فتح الصفحة:
```
http://localhost:3001/dashboard/open-details.html?id=11
```

### 3. النتيجة المتوقعة:
- **عرض تفاصيل البلاغ** من قاعدة البيانات
- **تصنيف صحيح** حسب الأولوية والنوع
- **حالة واضحة** باللغة العربية
- **سجل زمني** إذا كان موجود
- **مرفقات** إذا كانت متوفرة

## 🐛 استكشاف الأخطاء

### مشاكل شائعة:

1. **404 - Complaint not found**:
   - تأكد من وجود البلاغ في قاعدة البيانات
   - تحقق من صحة ID المرسل

2. **500 - Database error**:
   - تحقق من اتصال قاعدة البيانات
   - راجع logs الخادم للأخطاء

3. **لا تظهر البيانات**:
   - تحقق من أن الخادم يعمل على المنفذ 3001
   - راجع console المتصفح للأخطاء

### رسائل Console:
- `getOpenById error: HTTP 404`
- `getOpenById error: HTTP 500`
- `GET /complaints/:id error: ...`

## 📝 ملاحظات مهمة

1. **الأداء**: الاستعلامات محسنة للأداء
2. **الأمان**: استخدام prepared statements
3. **المرونة**: دعم جداول اختيارية (attachments, logs)
4. **التوافق**: يعمل مع البنية الحالية للصفحة

الآن صفحة تفاصيل البلاغ تعمل مع قاعدة البيانات الحقيقية! 🎉📋✨
