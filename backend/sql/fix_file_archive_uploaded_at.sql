-- تعديل جدول file_archive لضمان حفظ التاريخ تلقائياً
-- يطبق على كل قواعد بيانات المستشفيات (Tenant Databases)

ALTER TABLE file_archive
  MODIFY UploadedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

