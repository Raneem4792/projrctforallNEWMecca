-- إضافة أعمدة معايير SMART لجدول improvement_projects
-- هذا السكريبت يضيف حقول معايير SMART للهدف التحسيني

ALTER TABLE improvement_projects
  ADD COLUMN IF NOT EXISTS SmartSpecific TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'محدد (Specific)',
  ADD COLUMN IF NOT EXISTS SmartMeasurable TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'قابل للقياس (Measurable)',
  ADD COLUMN IF NOT EXISTS SmartAchievable TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'قابل للتحقق (Achievable)',
  ADD COLUMN IF NOT EXISTS SmartRealistic TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'واقعي (Realistic)',
  ADD COLUMN IF NOT EXISTS SmartTimebound TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'بزمن محدد (Time-bound)';

-- ملاحظة: إذا كان MySQL لا يدعم IF NOT EXISTS في ALTER TABLE ADD COLUMN،
-- يمكن استخدام البديل التالي:
-- 
-- ALTER TABLE improvement_projects
--   ADD COLUMN SmartSpecific TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'محدد (Specific)',
--   ADD COLUMN SmartMeasurable TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'قابل للقياس (Measurable)',
--   ADD COLUMN SmartAchievable TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'قابل للتحقق (Achievable)',
--   ADD COLUMN SmartRealistic TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'واقعي (Realistic)',
--   ADD COLUMN SmartTimebound TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'بزمن محدد (Time-bound)';

