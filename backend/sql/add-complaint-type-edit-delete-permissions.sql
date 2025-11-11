-- إضافة صلاحيات تعديل وحذف تصنيفات البلاغات
-- قم بتشغيل هذا السكريبت في قاعدة بيانات كل مستشفى

INSERT IGNORE INTO permissions (PermissionKey, NameAr, Category)
VALUES 
('COMPLAINT_TYPE_EDIT', 'تعديل تصنيف بلاغ', 'complaints'),
('COMPLAINT_TYPE_DELETE', 'حذف تصنيف بلاغ', 'complaints');

