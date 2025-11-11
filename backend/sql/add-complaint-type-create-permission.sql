-- إضافة صلاحية إنشاء تصنيف جديد للبلاغات
-- قم بتشغيل هذا السكريبت في قاعدة بيانات كل مستشفى

INSERT IGNORE INTO permissions (PermissionKey, NameAr, Category)
VALUES ('COMPLAINT_TYPE_CREATE', 'إضافة تصنيف بلاغ جديد', 'complaints');

