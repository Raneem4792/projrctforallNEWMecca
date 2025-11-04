-- إضافة عمود نسبة التقدم للمشاريع التحسينية
-- يجب تنفيذه على كل قاعدة بيانات مستشفى

ALTER TABLE improvement_projects 
ADD COLUMN ProgressPercent DECIMAL(5,2) NULL DEFAULT 0 COMMENT 'نسبة التقدم (%)'
AFTER ProgressNotes;

