-- =====================================================
-- إضافة أعمدة مدة معالجة البلاغ
-- =====================================================
-- هذا السكريبت يضيف عمودين في جدول complaints:
-- 1. ProcessingDurationHours: المدة بالساعات
-- 2. ProcessingDeadline: الموعد النهائي المحسوب تلقائياً
-- =====================================================

-- ✅ تطبيق على كل قاعدة بيانات مستشفى
-- استبدل hosp_XXX باسم قاعدة بيانات المستشفى

-- مثال: USE hosp_1;
-- أو استخدم في سكريبت يطبق على جميع قواعد البيانات

-- إضافة العمود الأول: المدة بالساعات
ALTER TABLE complaints 
ADD COLUMN ProcessingDurationHours INT NULL 
COMMENT 'مدة معالجة البلاغ بالساعات' 
AFTER VisitDate;

-- إضافة العمود الثاني: الموعد النهائي (محسوب تلقائياً)
ALTER TABLE complaints 
ADD COLUMN ProcessingDeadline DATETIME NULL 
COMMENT 'الموعد النهائي لمعالجة البلاغ (محسوب تلقائياً)' 
AFTER ProcessingDurationHours;

-- ✅ ملاحظة: في MySQL 5.7+ يمكن استخدام GENERATED COLUMN
-- لكن لتوافق أفضل، سنحسبه في Backend أو نستخدم Trigger

-- =====================================================
-- بديل: استخدام Trigger لحساب ProcessingDeadline تلقائياً
-- =====================================================

DELIMITER $$

CREATE TRIGGER calculate_processing_deadline
BEFORE INSERT ON complaints
FOR EACH ROW
BEGIN
  IF NEW.ProcessingDurationHours IS NOT NULL AND NEW.ProcessingDurationHours > 0 THEN
    SET NEW.ProcessingDeadline = DATE_ADD(NEW.CreatedAt, INTERVAL NEW.ProcessingDurationHours HOUR);
  END IF;
END$$

CREATE TRIGGER update_processing_deadline
BEFORE UPDATE ON complaints
FOR EACH ROW
BEGIN
  IF NEW.ProcessingDurationHours IS NOT NULL AND NEW.ProcessingDurationHours > 0 THEN
    -- إذا تم تحديث المدة، احسب الموعد النهائي من تاريخ الإنشاء
    SET NEW.ProcessingDeadline = DATE_ADD(NEW.CreatedAt, INTERVAL NEW.ProcessingDurationHours HOUR);
  ELSEIF NEW.ProcessingDurationHours IS NULL OR NEW.ProcessingDurationHours = 0 THEN
    SET NEW.ProcessingDeadline = NULL;
  END IF;
END$$

DELIMITER ;

-- =====================================================
-- التحقق من إضافة الأعمدة
-- =====================================================
-- SELECT 
--   COLUMN_NAME, 
--   DATA_TYPE, 
--   IS_NULLABLE, 
--   COLUMN_COMMENT
-- FROM INFORMATION_SCHEMA.COLUMNS
-- WHERE TABLE_SCHEMA = DATABASE()
--   AND TABLE_NAME = 'complaints'
--   AND COLUMN_NAME IN ('ProcessingDurationHours', 'ProcessingDeadline');

