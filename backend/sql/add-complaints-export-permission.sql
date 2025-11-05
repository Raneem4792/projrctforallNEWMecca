-- إضافة صلاحية تصدير البلاغات
-- قم بتشغيل هذا السكريبت في قاعدة بيانات كل مستشفى

INSERT IGNORE INTO permissions (PermissionKey, NameAr, Category)
VALUES ('COMPLAINTS_EXPORT', 'تصدير بلاغات', 'complaints');

