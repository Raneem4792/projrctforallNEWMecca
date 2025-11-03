-- إضافة صلاحيات الزائر السري لجميع المستشفيات
-- هذا السكريبت يضيف مفاتيح الصلاحيات الجديدة لجدول permissions في كل مستشفى

-- إدراج الصلاحيات في جدول permissions لكل مستشفى
INSERT IGNORE INTO permissions (PermissionKey, NameAr, Category) VALUES
('MYSTERY_MODULE',              'الزائر السري - الدخول للصفحة',   'mystery'),
('MYSTERY_VIEW',                'عرض تقييم الزائر السري',         'mystery'),
('MYSTERY_REPLY_ADD',           'إضافة رد/تعليق على التقييم',     'mystery'),
('MYSTERY_STATUS_UPDATE',       'تغيير حالة التقييم',             'mystery'),
('MYSTERY_TRANSFER_DEPT',       'تحويل التقييم بين الأقسام',       'mystery'),
('MYSTERY_TRANSFER_EMP',        'تحويل التقييم بين الموظفين',      'mystery'),
('MYSTERY_DELETE',              'حذف تقييم الزائر السري',          'mystery');

-- التحقق من إضافة الصلاحيات
SELECT * FROM permissions WHERE Category='mystery' ORDER BY PermissionKey;
