-- إضافة أعمدة Domain لجدول pressganey_data
-- يجب تشغيل هذا الملف على كل قاعدة بيانات مستشفى

-- إضافة أعمدة Domain (المجال)
ALTER TABLE pressganey_data
  ADD COLUMN IF NOT EXISTS domain VARCHAR(255) NULL AFTER department_name_en,
  ADD COLUMN IF NOT EXISTS domain_ar VARCHAR(255) NULL AFTER domain;

-- إضافة فهرس للمجال لتحسين الأداء
CREATE INDEX IF NOT EXISTS idx_pressganey_domain ON pressganey_data (domain);

