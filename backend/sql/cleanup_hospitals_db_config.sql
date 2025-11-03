/* =========================================================
   تنظيف سجلات المستشفيات القديمة في القاعدة المركزية
   هذا السكربت يضمن أن جميع المستشفيات لديها قيم اتصال صحيحة
   ========================================================= */

-- 1) التأكد من وجود الأعمدة (إذا لم تكن موجودة بعد)
ALTER TABLE hospitals 
  ADD COLUMN IF NOT EXISTS DbHost VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS DbUser VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS DbPass VARCHAR(200) NULL,
  ADD COLUMN IF NOT EXISTS DbName VARCHAR(100) NULL;

-- 2) تنظيف قيم DbHost (استبدال القيم الفارغة أو المسافات بـ 127.0.0.1)
UPDATE hospitals
   SET DbHost = COALESCE(NULLIF(TRIM(DbHost), ''), '127.0.0.1')
 WHERE DbHost IS NULL 
    OR TRIM(DbHost) = '';

-- 3) تنظيف قيم DbUser (استبدال القيم الفارغة بـ 'root')
UPDATE hospitals
   SET DbUser = COALESCE(NULLIF(TRIM(DbUser), ''), 'root')
 WHERE DbUser IS NULL 
    OR TRIM(DbUser) = '';

-- 4) تنظيف قيم DbPass (استبدال القيم الفارغة بـ '' - كلمة مرور فارغة)
-- ملاحظة: يمكنك تغيير هذه القيمة الافتراضية حسب إعداداتك
UPDATE hospitals
   SET DbPass = COALESCE(NULLIF(TRIM(DbPass), ''), '')
 WHERE DbPass IS NULL 
    OR TRIM(DbPass) = '';

-- 5) التأكد من وجود DbName (إنشاء من Code إذا كان فارغًا)
UPDATE hospitals
   SET DbName = CONCAT('hosp_', UPPER(TRIM(Code)))
 WHERE (DbName IS NULL OR TRIM(DbName) = '')
   AND Code IS NOT NULL 
   AND TRIM(Code) <> '';

-- 6) عرض النتائج للتحقق
SELECT 
  HospitalID,
  NameAr,
  Code,
  DbHost,
  DbUser,
  CASE 
    WHEN DbPass IS NULL OR TRIM(DbPass) = '' THEN '(empty)'
    ELSE '***'
  END AS DbPassStatus,
  DbName,
  IsActive
FROM hospitals
ORDER BY HospitalID;

-- 7) التحقق من عدم وجود قيم فارغة بعد التنظيف
SELECT 
  COUNT(*) as total_hospitals,
  SUM(CASE WHEN DbHost IS NULL OR TRIM(DbHost) = '' THEN 1 ELSE 0 END) as missing_host,
  SUM(CASE WHEN DbUser IS NULL OR TRIM(DbUser) = '' THEN 1 ELSE 0 END) as missing_user,
  SUM(CASE WHEN DbName IS NULL OR TRIM(DbName) = '' THEN 1 ELSE 0 END) as missing_dbname
FROM hospitals
WHERE IsActive = 1;
