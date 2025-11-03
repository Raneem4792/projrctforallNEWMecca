-- إضافة صلاحيات البطاقات الإدارية الثلاثة
-- يتم تشغيل هذا الملف مرة واحدة في القاعدة المركزية

-- إدراج الصلاحيات الثلاثة في جدول permissions
INSERT IGNORE INTO permissions (PermissionKey, NameAr, Category) VALUES
('ADMIN_DEPARTMENTS', 'إدارة الأقسام', 'system'),
('ADMIN_HOSPITAL',    'إدارة المستشفى', 'system'),
('ADMIN_CLUSTERS',    'إدارة المستشفيات (التجمع)', 'system');

-- ملاحظات:
-- 1. الحفظ الفعلي يكون في جدول user_permissions بقاعدة المستشفى (مثل باقي الصلاحيات)
-- 2. مدير التجمع (scope='central') يشاهد الثلاثة دائماً
-- 3. هذه الصلاحيات تتحكم في ظهور البطاقات في صفحة مركز الإدارة

