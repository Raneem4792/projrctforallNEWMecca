-- إضافة صلاحيات المشاريع التحسينية لجميع المستشفيات
-- هذا السكريبت يضيف مفاتيح الصلاحيات الجديدة لجدول permissions في كل مستشفى

-- إدراج الصلاحيات في جدول permissions لكل مستشفى
INSERT IGNORE INTO permissions (PermissionKey, NameAr, Category) VALUES
('IMPROVEMENTS_MODULE',     'المشاريع التحسينية - الدخول للصفحة', 'improvements'),
('IMPROVEMENT_CREATE',      'إضافة مشروع تحسيني',                 'improvements'),
('IMPROVEMENT_VIEW',        'عرض مشروع تحسيني',                   'improvements'),
('IMPROVEMENT_EDIT',        'تعديل مشروع تحسيني',                 'improvements'),
('IMPROVEMENT_DELETE',      'حذف مشروع تحسيني',                   'improvements'),
('IMPROVEMENT_REPORT_VIEW', 'عرض تقرير المشروع التحسيني',         'improvements'),
('IMPROVEMENT_APPROVE',     'اعتماد مشروع تحسيني',                'improvements');

-- التحقق من إضافة الصلاحيات
SELECT * FROM permissions WHERE Category='improvements' ORDER BY PermissionKey;
