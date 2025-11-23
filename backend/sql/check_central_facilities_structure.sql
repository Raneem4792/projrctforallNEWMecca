-- التحقق من بنية جدول central_facilities
DESCRIBE central_facilities;

-- التحقق من وجود حقل Type أو FacilityType
SHOW COLUMNS FROM central_facilities LIKE '%Type%';

-- عرض جميع الأعمدة
SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'central_facilities'
ORDER BY ORDINAL_POSITION;

