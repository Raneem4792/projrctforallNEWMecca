-- إضافة عمودين جديدين في جدول file_archive
-- CustomFileName: اسم الملف الذي يدخله المستخدم يدوياً
-- SourceName: جهة الرفع (اسم المستشفى أو "إدارة التجمع")

ALTER TABLE file_archive
ADD COLUMN CustomFileName VARCHAR(255) NULL AFTER SourceModule,
ADD COLUMN SourceName VARCHAR(255) NULL AFTER CustomFileName;

