# حل مشكلة تغيير حالة البلاغ - الحل الكامل

## 🎯 المشكلة الأساسية
كانت الواجهة تظهر خطأ 404 عند محاولة جلب الحالات لأن الـ API endpoint `/api/complaint-statuses` غير موجود.

## 🔧 الحل المطبق

### 1. قاعدة البيانات (SQL)

#### إنشاء جدول الحالات
```sql
-- إنشاء جدول حالات البلاغات
CREATE TABLE IF NOT EXISTS complaint_statuses (
  StatusCode VARCHAR(20) PRIMARY KEY,
  LabelAr    VARCHAR(50) NOT NULL,
  LabelEn    VARCHAR(50) NOT NULL,
  SortOrder  TINYINT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- فهرس للترتيب
CREATE INDEX idx_cs_sort ON complaint_statuses (SortOrder);

-- إدراج البيانات الافتراضية
INSERT INTO complaint_statuses (StatusCode, LabelAr, LabelEn, SortOrder) VALUES
('OPEN',        'مفتوحة',        'Open',        1),
('IN_PROGRESS', 'جارٍ المعالجة', 'In progress', 2),
('ESCALATED',   'مُصعّدة',       'Escalated',   3),
('ON_HOLD',     'معلقة',         'On Hold',     4),
('CLOSED',      'مغلقة',         'Closed',      5)
ON DUPLICATE KEY UPDATE
  LabelAr=VALUES(LabelAr), 
  LabelEn=VALUES(LabelEn), 
  SortOrder=VALUES(SortOrder);
```

### 2. Backend API

#### Routes (complaintStatuses.js)
```javascript
import express from 'express';
import {
  listComplaintStatuses,
  updateComplaintStatus
} from '../controllers/complaintStatusesController.js';

const router = express.Router();

// المسارات
router.get('/complaint-statuses', listComplaintStatuses);
router.put('/complaints/:id/status', updateComplaintStatus);

export default router;
```

#### Controller (complaintStatusesController.js)
```javascript
// جلب حالات البلاغات
export const listComplaintStatuses = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT StatusCode, LabelAr, LabelEn, SortOrder
       FROM complaint_statuses
       ORDER BY SortOrder ASC, StatusCode ASC`
    );
    res.json(rows);
  } catch (e) {
    console.error('listComplaintStatuses error:', e);
    res.status(500).json({ message: 'Server error' });
  }
};

// تغيير حالة البلاغ
export const updateComplaintStatus = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const complaintId = Number(req.params.id);
    const { statusCode, note } = req.body || {};
    const userId = Number(req.user?.UserID);

    if (!complaintId || !statusCode) {
      return res.status(400).json({ message: 'statusCode مطلوب' });
    }

    if (!userId) {
      return res.status(401).json({ message: 'المستخدم غير مسجل دخول' });
    }

    // تأكد أن الحالة موجودة
    const [[st]] = await conn.query(
      `SELECT StatusCode FROM complaint_statuses WHERE StatusCode = ?`, 
      [statusCode]
    );
    if (!st) {
      return res.status(400).json({ message: 'حالة غير صالحة' });
    }

    // تحقق من وجود البلاغ
    const [[complaint]] = await conn.query(
      `SELECT ComplaintID FROM complaints WHERE ComplaintID = ?`, 
      [complaintId]
    );
    if (!complaint) {
      return res.status(404).json({ message: 'البلاغ غير موجود' });
    }

    await conn.beginTransaction();

    // تحديث حالة البلاغ
    await conn.query(
      `UPDATE complaints
       SET StatusCode = ?, UpdatedAt = CURRENT_TIMESTAMP
       WHERE ComplaintID = ?`,
      [statusCode, complaintId]
    );

    // إضافة رد داخلي يوثق التغيير (إذا تم إرسال note)
    if (note && note.trim() !== '') {
      await conn.query(
        `INSERT INTO complaint_responses
          (ComplaintID, ResponderUserID, ReplyTypeID, TargetStatusCode, Message, IsInternal)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          complaintId,
          userId,
          1, // ReplyTypeID افتراضي
          statusCode,
          `تغيير حالة البلاغ: ${statusCode} — ${note}`,
          1  // داخلي
        ]
      );
    }

    await conn.commit();
    
    res.json({ 
      ok: true, 
      complaintId, 
      statusCode,
      message: 'تم تحديث حالة البلاغ بنجاح'
    });
  } catch (e) {
    await conn.rollback();
    console.error('updateComplaintStatus error:', e);
    res.status(500).json({ message: 'خطأ في تحديث حالة البلاغ' });
  } finally {
    conn.release();
  }
};
```

#### إضافة المسارات إلى app.js
```javascript
import complaintStatusesRoutes from './routes/complaintStatuses.js';

// في قسم المسارات
app.use('/api', complaintStatusesRoutes); // مسارات الحالات
```

### 3. Frontend Integration

#### تحميل الحالات
```javascript
async function loadStatuses() {
  const statusSelect = document.querySelector('#statusSelect');
  if (!statusSelect) return;

  try {
    console.log('🔍 جلب حالات البلاغات...');
    const res = await fetch(`${API_BASE_URL}/api/complaint-statuses`, {
      credentials: 'include'
    });
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    
    const data = await res.json();
    console.log('📊 API Response:', data);

    // تحقّق من النوع
    if (!Array.isArray(data)) {
      throw new Error('Unexpected payload (not an array)');
    }

    // حددي اللغة الحالية (افتراضي: عربي)
    const lang = (localStorage.getItem('lang') || 'ar').toLowerCase();

    // املئي القائمة
    statusSelect.innerHTML = '<option value="">اختر من قائمة الحالات</option>';
    
    if (data.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'لا توجد حالات متاحة';
      statusSelect.appendChild(opt);
      console.warn('⚠️ لا توجد حالات في قاعدة البيانات');
    } else {
      data.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.StatusCode;
        // السيرفر يرجّع: StatusCode, LabelAr, LabelEn
        const text = (lang === 'ar' ? s.LabelAr : (s.LabelEn || s.LabelAr)) || s.StatusCode;
        opt.textContent = text;
        statusSelect.appendChild(opt);
      });
      console.log('✅ تم تحميل', data.length, 'حالة');
    }

    // عيّني القيمة الحالية من بيانات البلاغ الموجودة
    if (currentComplaint?.status) {
      statusSelect.value = currentComplaint.status;
    }

  } catch (error) {
    console.error('❌ خطأ في تحميل الحالات:', error);
    statusSelect.innerHTML = '<option value="">خطأ في تحميل الحالات</option>';
  }
}
```

#### تطبيق تغيير الحالة
```javascript
async function applyStatusChange() {
  const statusSelect = document.querySelector('#statusSelect');
  const noteInput = document.querySelector('#statusNote');
  const applyBtn = document.querySelector('#applyStatusBtn');
  const complaintId = window.currentComplaintId || document.body.dataset.complaintId;

  if (!statusSelect || !noteInput || !applyBtn || !complaintId) {
    console.error('❌ عناصر تغيير الحالة غير موجودة');
    alert('خطأ: عناصر النموذج غير موجودة');
    return;
  }

  const statusCode = statusSelect.value;
  const note = noteInput.value.trim();

  if (!statusCode) {
    alert('اختر الحالة الجديدة.');
    return;
  }

  // تعطيل الزر أثناء التحميل
  applyBtn.disabled = true;
  applyBtn.textContent = 'جاري التطبيق...';

  try {
    const body = {
      statusCode: statusCode,
      note: note
    };

    console.log('📤 إرسال تغيير الحالة:', body);

    const res = await fetch(`${API_BASE_URL}/api/complaints/${complaintId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body)
    });

    const data = await res.json();
    
    if (!res.ok || !data.ok) {
      throw new Error(data.message || `HTTP ${res.status}`);
    }
    
    console.log('✅ تم تحديث الحالة بنجاح!');
    
    // حدّثي الشارة في أعلى الصفحة حسب الحالة الجديدة
    updateStatusBadge(statusCode);
    
    // إغلاق المودال
    const modal = document.querySelector('#changeStatusModal');
    if (modal) {
      modal.classList.add('hidden');
    }
    
    // مسح الحقول
    noteInput.value = '';
    
    // إعادة تحميل الردود (لإظهار الرد الداخلي إن أرسل note)
    await refreshReplies();
    
    // إعادة تحميل تفاصيل البلاغ
    await loadDetails();
    
    showToast('تم تحديث حالة البلاغ بنجاح ✅', 'success');
  } catch (error) {
    console.error('❌ خطأ في تحديث الحالة:', error);
    showToast('حدث خطأ أثناء تحديث الحالة', 'error');
  } finally {
    // إعادة تفعيل الزر
    applyBtn.disabled = false;
    applyBtn.textContent = 'تطبيق';
  }
}
```

## 🧪 اختبار النظام

### 1. تشغيل SQL Scripts
```bash
mysql -u username -p database_name < backend/sql/create-complaint-statuses.sql
```

### 2. تشغيل الاختبار
```bash
node backend/test-status-change.js
```

### 3. تشغيل الخادم
```bash
cd backend
npm start
```

### 4. اختبار الواجهة
```
http://localhost:3001/complaints/history/complaint-details.html?ticket=C-2025-000008
```

## 🎉 النتيجة النهائية

### ✅ **الميزات المكتملة**
- **جلب الحالات**: API endpoint يعيد قائمة الحالات
- **تغيير الحالة**: تحديث حالة البلاغ مع التحقق من الصحة
- **توثيق التغيير**: إضافة رد داخلي يوثق سبب التغيير
- **الواجهة التفاعلية**: تحميل الحالات وعرضها بالعربية
- **الأمان**: التحقق من المستخدم المسجل دخول

### ✅ **المسارات النهائية**
```
GET  /api/complaint-statuses                    # جلب حالات البلاغات
PUT  /api/complaints/:id/status                 # تغيير حالة البلاغ
```

### ✅ **هيكل البيانات**
- **complaint_statuses**: جدول الحالات مع التسميات العربية والإنجليزية
- **complaint_responses**: ردود داخلية توثق تغيير الحالة
- **العلاقات الصحيحة**: ربط الحالات بالبلاغات والردود

## 📋 ملاحظات مهمة

1. **لا ترسل IDs من الواجهة**: الخادم يأخذ `UserID` من `req.user.UserID`
2. **توثيق التغيير اختياري**: إذا أرسلت `note` سيتم إضافة رد داخلي
3. **التحقق من الصحة**: التأكد من وجود الحالة والبلاغ قبل التحديث
4. **دعم اللغات**: عرض الحالات بالعربية أو الإنجليزية حسب الإعداد
5. **معالجة الأخطاء**: رسائل خطأ واضحة للمستخدم

النظام الآن يعمل بشكل مثالي مع إمكانية تغيير حالة البلاغ! 🚀
