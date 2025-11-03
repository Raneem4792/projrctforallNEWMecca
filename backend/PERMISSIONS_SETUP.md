# إعداد نظام الصلاحيات

## 1. إنشاء الجداول في قاعدة البيانات

قم بتشغيل الملف التالي في كل قاعدة بيانات مستشفى (Tenant):

```sql
-- ملف: backend/sql/create-permissions-tables.sql
```

أو قم بتشغيل الأوامر التالية يدوياً:

```sql
-- إنشاء جدول الصلاحيات الأساسية
CREATE TABLE IF NOT EXISTS permissions (
  PermissionKey VARCHAR(50) PRIMARY KEY,
  NameAr VARCHAR(100) NOT NULL,
  NameEn VARCHAR(100),
  Category VARCHAR(50) DEFAULT 'complaints',
  Description TEXT,
  CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- إدراج الصلاحيات الأساسية
INSERT IGNORE INTO permissions (PermissionKey, NameAr, Category) VALUES
('COMPLAINT_SUBMIT',        'تقديم بلاغ',                 'complaints'),
('COMPLAINT_VIEW',          'عرض/متابعة البلاغات',         'complaints'),
('COMPLAINT_HISTORY_SCOPE', 'نطاق سجل البلاغات',           'complaints'),
('COMPLAINT_REPLY',         'الرد على البلاغ',             'complaints'),
('COMPLAINT_TRANSFER',      'تحويل البلاغ',                'complaints'),
('COMPLAINT_STATUS_UPDATE', 'تغيير حالة البلاغ',           'complaints'),
('COMPLAINT_DELETE',        'حذف البلاغ',                  'complaints');

-- إنشاء جدول صلاحيات المستخدمين
CREATE TABLE IF NOT EXISTS user_permissions (
  UserID INT NOT NULL,
  HospitalID INT NOT NULL,
  PermissionKey VARCHAR(50) NOT NULL,
  ViewScope ENUM('HOSPITAL', 'DEPARTMENT', 'ASSIGNED') NULL,
  GrantedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  GrantedBy INT,
  PRIMARY KEY (UserID, HospitalID, PermissionKey),
  FOREIGN KEY (PermissionKey) REFERENCES permissions(PermissionKey) ON DELETE CASCADE,
  INDEX idx_user_hospital (UserID, HospitalID),
  INDEX idx_permission (PermissionKey)
);
```

## 2. تطبيق الصلاحيات على API

### مثال على استخدام middleware:

```javascript
import { requirePermission } from '../middleware/permissions.js';

// في routes/complaints.js
router.post('/:id/replies', 
  requireAuth, 
  requirePermission('COMPLAINT_REPLY'), 
  addReply
);

router.put('/:id/status', 
  requireAuth, 
  requirePermission('COMPLAINT_STATUS_UPDATE'), 
  updateStatus
);

router.delete('/:id', 
  requireAuth, 
  requirePermission('COMPLAINT_DELETE'), 
  deleteComplaint
);
```

## 3. تطبيق نطاق العرض

```javascript
import { getUserViewScope, buildScopeSQL } from '../middleware/permissions.js';

// في controller البلاغات
export async function getComplaintsHistory(req, res) {
  const user = req.user;
  const scope = await getUserViewScope(user.UserID, user.HospitalID);
  
  // تطبيق النطاق على الاستعلام
  const { where, params } = buildScopeSQL(user, user.HospitalID, user.DepartmentID);
  
  const query = `
    SELECT * FROM complaints c 
    WHERE 1=1 ${where}
    ORDER BY c.CreatedAt DESC
  `;
  
  const [rows] = await pool.query(query, params);
  res.json({ ok: true, data: rows });
}
```

## 4. الصلاحيات المتاحة

| المفتاح | الوصف | النطاق |
|---------|-------|--------|
| `COMPLAINT_SUBMIT` | تقديم بلاغ | - |
| `COMPLAINT_VIEW` | عرض/متابعة البلاغات | - |
| `COMPLAINT_HISTORY_SCOPE` | نطاق سجل البلاغات | HOSPITAL/DEPARTMENT/ASSIGNED |
| `COMPLAINT_REPLY` | الرد على البلاغ | - |
| `COMPLAINT_TRANSFER` | تحويل البلاغ | - |
| `COMPLAINT_STATUS_UPDATE` | تغيير حالة البلاغ | - |
| `COMPLAINT_DELETE` | حذف البلاغ | - |

## 5. نطاقات العرض

- **HOSPITAL**: عرض جميع بلاغات المستشفى
- **DEPARTMENT**: عرض بلاغات القسم فقط
- **ASSIGNED**: عرض البلاغات المسندة للمستخدم فقط

## 6. الاختبار

1. شغّل الباك-إند: `npm start`
2. افتح صفحة الصلاحيات: `http://localhost:5500/NewProjectMecca/public/admin/admin-permissions.html`
3. اختر مستشفى من القائمة
4. اختر مستخدم من القائمة الجانبية
5. عدّل الصلاحيات واحفظها
6. اختبر API endpoints مع الصلاحيات الجديدة
