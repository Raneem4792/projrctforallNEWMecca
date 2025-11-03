-- التحقق من وجود جدول departments والعمود NameAr
-- هذا السكريبت يتحقق من بنية جدول departments

-- 1. التحقق من وجود الجدول
SELECT 
  TABLE_NAME,
  TABLE_COMMENT
FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'departments';

-- 2. التحقق من وجود العمود NameAr
SELECT 
  COLUMN_NAME,
  DATA_TYPE,
  IS_NULLABLE,
  COLUMN_DEFAULT,
  COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'departments'
  AND COLUMN_NAME IN ('DepartmentID', 'NameAr', 'NameEn', 'HospitalID');

-- 3. إضافة العمود NameAr إذا لم يكن موجوداً
ALTER TABLE departments 
ADD COLUMN IF NOT EXISTS NameAr VARCHAR(255) NULL COMMENT 'الاسم العربي للقسم';

-- 4. إضافة العمود NameEn إذا لم يكن موجوداً
ALTER TABLE departments 
ADD COLUMN IF NOT EXISTS NameEn VARCHAR(255) NULL COMMENT 'الاسم الإنجليزي للقسم';

-- 5. تحديث البيانات التجريبية إذا كانت فارغة
UPDATE departments 
SET NameAr = CASE 
  WHEN DepartmentID = 1 THEN 'قسم الطوارئ'
  WHEN DepartmentID = 2 THEN 'قسم الصيدلة'
  WHEN DepartmentID = 3 THEN 'قسم التمريض'
  WHEN DepartmentID = 4 THEN 'قسم الأشعة'
  WHEN DepartmentID = 5 THEN 'قسم المختبر'
  ELSE CONCAT('قسم ', DepartmentID)
END
WHERE NameAr IS NULL OR NameAr = '';

-- 6. عرض البيانات النهائية
SELECT 
  DepartmentID,
  NameAr,
  NameEn,
  HospitalID
FROM departments 
WHERE HospitalID = 15
ORDER BY DepartmentID;
