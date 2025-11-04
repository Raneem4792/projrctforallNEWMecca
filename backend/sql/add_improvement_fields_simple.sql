-- إضافة الحقول المفقودة لجدول improvement_projects
-- نسخة بسيطة - تنفذ مباشرة (إذا كان العمود موجود سيظهر خطأ لكن يمكن تجاهله)

-- إضافة SuccessCriteria
ALTER TABLE improvement_projects 
ADD COLUMN SuccessCriteria TEXT NULL COMMENT 'معايير النجاح';

-- إضافة TeamMembers  
ALTER TABLE improvement_projects 
ADD COLUMN TeamMembers TEXT NULL COMMENT 'فريق العمل';

-- إضافة ProgressNotes
ALTER TABLE improvement_projects 
ADD COLUMN ProgressNotes TEXT NULL COMMENT 'ملاحظات التقدم';

-- إضافة معايير SMART (إذا لم تكن موجودة)
ALTER TABLE improvement_projects 
ADD COLUMN SmartSpecific TINYINT(1) DEFAULT 0 COMMENT 'معيار SMART: محدد';

ALTER TABLE improvement_projects 
ADD COLUMN SmartMeasurable TINYINT(1) DEFAULT 0 COMMENT 'معيار SMART: قابل للقياس';

ALTER TABLE improvement_projects 
ADD COLUMN SmartAchievable TINYINT(1) DEFAULT 0 COMMENT 'معيار SMART: قابل للتحقق';

ALTER TABLE improvement_projects 
ADD COLUMN SmartRealistic TINYINT(1) DEFAULT 0 COMMENT 'معيار SMART: واقعي';

ALTER TABLE improvement_projects 
ADD COLUMN SmartTimebound TINYINT(1) DEFAULT 0 COMMENT 'معيار SMART: بزمن محدد';

