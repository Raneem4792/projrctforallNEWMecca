-- إضافة صلاحيات إدارة تصنيفات البلاغات الفرعية
-- قم بتشغيل هذا السكريبت في قاعدة بيانات كل مستشفى

INSERT IGNORE INTO permissions (PermissionKey, NameAr, Category)
VALUES 
('COMPLAINT_SUBTYPE_CREATE', 'إضافة تصنيف فرعي جديد', 'complaints'),
('COMPLAINT_SUBTYPE_EDIT', 'تعديل تصنيف فرعي', 'complaints'),
('COMPLAINT_SUBTYPE_DELETE', 'حذف تصنيف فرعي', 'complaints');

