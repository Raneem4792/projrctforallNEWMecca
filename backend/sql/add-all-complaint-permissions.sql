-- إضافة جميع صلاحيات البلاغات في قاعدة بيانات المستشفى
-- قم بتشغيل هذا السكريبت في قاعدة بيانات كل مستشفى

-- صلاحية تصدير البلاغات
INSERT IGNORE INTO permissions (PermissionKey, NameAr, Category)
VALUES ('COMPLAINTS_EXPORT', 'تصدير بلاغات', 'complaints');

-- صلاحيات إدارة التصنيفات الرئيسية
INSERT IGNORE INTO permissions (PermissionKey, NameAr, Category)
VALUES 
('COMPLAINT_TYPE_CREATE', 'إضافة تصنيف بلاغ جديد', 'complaints'),
('COMPLAINT_TYPE_EDIT', 'تعديل تصنيف بلاغ', 'complaints'),
('COMPLAINT_TYPE_DELETE', 'حذف تصنيف بلاغ', 'complaints');

-- صلاحيات إدارة التصنيفات الفرعية
INSERT IGNORE INTO permissions (PermissionKey, NameAr, Category)
VALUES 
('COMPLAINT_SUBTYPE_CREATE', 'إضافة تصنيف فرعي جديد', 'complaints'),
('COMPLAINT_SUBTYPE_EDIT', 'تعديل تصنيف فرعي', 'complaints'),
('COMPLAINT_SUBTYPE_DELETE', 'حذف تصنيف فرعي', 'complaints');

