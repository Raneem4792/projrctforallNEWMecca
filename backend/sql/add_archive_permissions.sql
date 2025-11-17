-- إضافة صلاحيات الأرشيف
-- يتم تنفيذها في قاعدة البيانات المركزية (hospitals_mecca3)

INSERT IGNORE INTO permissions (PermissionKey, NameAr, Category) VALUES
('ARCHIVE_VIEW',   'عرض الأرشيف',       'archive'),
('ARCHIVE_UPLOAD', 'إضافة مرفقات للأرشيف', 'archive');

