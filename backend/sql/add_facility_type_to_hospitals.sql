-- =========================================================
-- إضافة حقل النوع (Type) من central_facilities إلى جدول hospitals
-- Add FacilityType column to hospitals table
-- =========================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS=0;

-- الخطوة 1: التحقق من وجود حقل Type في central_facilities
-- (يمكنك تشغيل هذا يدوياً للتحقق)
-- SELECT COLUMN_NAME, DATA_TYPE 
-- FROM INFORMATION_SCHEMA.COLUMNS 
-- WHERE TABLE_SCHEMA = DATABASE() 
--   AND TABLE_NAME = 'central_facilities' 
--   AND COLUMN_NAME LIKE '%Type%';

-- الخطوة 2: إضافة حقل FacilityType إلى جدول hospitals
-- نضيف حقل FacilityType VARCHAR في hospitals (حفظ النوع كنص)
-- يمكن تعديل الحجم حسب احتياجاتك

-- التحقق من وجود الحقل أولاً
SET @col_exists = 0;
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'hospitals'
  AND COLUMN_NAME = 'FacilityType';

-- إضافة الحقل فقط إذا لم يكن موجوداً
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE hospitals ADD COLUMN FacilityType VARCHAR(100) NULL COMMENT ''نوع المنشأة من central_facilities'' AFTER RegionEn',
  'SELECT ''Column FacilityType already exists'' AS message');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- الخطوة 3: إضافة فهرس للبحث السريع (إذا لم يكن موجوداً)
SET @idx_exists = 0;
SELECT COUNT(*) INTO @idx_exists
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'hospitals'
  AND INDEX_NAME = 'idx_hospitals_facility_type';

SET @sql_idx = IF(@idx_exists = 0,
  'CREATE INDEX idx_hospitals_facility_type ON hospitals(FacilityType)',
  'SELECT ''Index idx_hospitals_facility_type already exists'' AS message');
PREPARE stmt_idx FROM @sql_idx;
EXECUTE stmt_idx;
DEALLOCATE PREPARE stmt_idx;

SET FOREIGN_KEY_CHECKS=1;

-- التحقق من التعديلات
DESCRIBE hospitals;

-- عرض عينة من البيانات
SELECT HospitalID, NameAr, Code, FacilityType 
FROM hospitals 
LIMIT 5;

