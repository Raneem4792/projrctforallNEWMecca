-- =====================================================
-- إضافة صلاحيات إدارة المستشفى (الأيقونات الأربعة)
-- =====================================================
-- هذا السكريبت يضيف 4 صلاحيات للتحكم في أيقونات صفحة "إدارة المستشفى"
-- كل أيقونة لها صلاحية مستقلة تُدار من صفحة الصلاحيات
-- =====================================================

USE makkah_central;

-- إضافة الصلاحيات الأربعة في جدول permissions المركزي
INSERT IGNORE INTO permissions (PermissionKey, NameAr, NameEn, Category, Description) VALUES
('HOSPITAL_TRASH',      'إدارة المحذوفات',   'Manage Trash',       'hospital', 'الوصول إلى سلة المحذوفات واستعادة أو حذف العناصر نهائياً'),
('HOSPITAL_LOGS',       'عرض السجلات',       'View Logs',          'hospital', 'عرض سجلات النشاطات والعمليات داخل المستشفى'),
('HOSPITAL_PERMISSIONS','إدارة الصلاحيات',   'Manage Permissions', 'hospital', 'منح وإدارة صلاحيات المستخدمين'),
('HOSPITAL_USERS',      'إدارة المستخدمين',  'Manage Users',       'hospital', 'إضافة وتعديل وحذف المستخدمين');

-- =====================================================
-- ملاحظات:
-- =====================================================
-- 1. هذه الصلاحيات تُحفظ في جدول user_permissions لكل مستشفى
-- 2. مدير التجمع (Central Admin) له جميع الصلاحيات تلقائياً
-- 3. باقي المستخدمين يحتاجون منحها من صفحة الصلاحيات
-- 4. كل صلاحية تتحكم في إظهار/إخفاء الأيقونة المقابلة
-- 
-- الأيقونات المتأثرة:
-- HOSPITAL_TRASH       → أيقونة "إدارة المحذوفات"
-- HOSPITAL_LOGS        → أيقونة "عرض السجلات"
-- HOSPITAL_PERMISSIONS → أيقونة "إدارة الصلاحيات"
-- HOSPITAL_USERS       → أيقونة "إدارة المستخدمين"
-- 
-- مثال لمنح الصلاحيات يدوياً:
-- 
-- USE hosp_ABC;  -- قاعدة المستشفى
-- INSERT INTO user_permissions (UserID, HospitalID, PermissionKey) VALUES
-- (123, 1, 'HOSPITAL_TRASH'),
-- (123, 1, 'HOSPITAL_LOGS'),
-- (123, 1, 'HOSPITAL_PERMISSIONS'),
-- (123, 1, 'HOSPITAL_USERS');
-- 
-- =====================================================

-- التحقق من إضافة الصلاحيات
SELECT PermissionKey, NameAr, Category 
FROM permissions 
WHERE PermissionKey IN ('HOSPITAL_TRASH', 'HOSPITAL_LOGS', 'HOSPITAL_PERMISSIONS', 'HOSPITAL_USERS')
ORDER BY PermissionKey;

