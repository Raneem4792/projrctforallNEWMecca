/* =========================================================
   تحديث إعدادات الاتصال بقواعد بيانات المستشفيات
   يجب تشغيل هذا السكربت على القاعدة المركزية (hospitals_mecca4)
   ========================================================= */

-- 1) التأكد من وجود الأعمدة (إذا لم تكن موجودة بعد)
ALTER TABLE hospitals 
  ADD COLUMN IF NOT EXISTS DbHost VARCHAR(255) DEFAULT 'localhost',
  ADD COLUMN IF NOT EXISTS DbUser VARCHAR(100) DEFAULT 'root',
  ADD COLUMN IF NOT EXISTS DbPass VARCHAR(255) DEFAULT '',
  ADD COLUMN IF NOT EXISTS DbName VARCHAR(100) DEFAULT '';

-- 2) تحديث بيانات الاتصال لجميع المستشفيات الموجودة
--    ملاحظة: عدّل القيم حسب قواعد البيانات الفعلية لديك

-- مثال: مستشفى الملك عبدالله
UPDATE hospitals 
SET DbHost = '127.0.0.1',
    DbUser = 'root',
    DbPass = '@',
    DbName = 'hospital_king_abdulaziz'
WHERE HospitalID = 1 OR NameEn LIKE '%King Abdulaziz%' OR NameAr LIKE '%الملك عبدالله%';

-- مثال: مستشفى النور
UPDATE hospitals 
SET DbHost = '127.0.0.1',
    DbUser = 'root',
    DbPass = '@',
    DbName = 'hospital_noor'
WHERE HospitalID = 2 OR NameEn LIKE '%Noor%' OR NameAr LIKE '%النور%';

-- مثال: مستشفى أجياد
UPDATE hospitals 
SET DbHost = '127.0.0.1',
    DbUser = 'root',
    DbPass = '@',
    DbName = 'hospital_ajyad'
WHERE HospitalID = 3 OR NameEn LIKE '%Ajyad%' OR NameAr LIKE '%أجياد%';

-- مثال: مستشفى حراء
UPDATE hospitals 
SET DbHost = '127.0.0.1',
    DbUser = 'root',
    DbPass = '@',
    DbName = 'hospital_hera'
WHERE HospitalID = 4 OR NameEn LIKE '%Hera%' OR NameAr LIKE '%حراء%';

-- 3) عرض النتائج للتحقق
SELECT 
  HospitalID,
  NameAr,
  NameEn,
  DbHost,
  DbUser,
  DbName,
  CASE 
    WHEN DbPass IS NULL OR DbPass = '' THEN '❌ فارغ'
    ELSE '✅ محدد'
  END AS PasswordStatus,
  IsActive
FROM hospitals
ORDER BY HospitalID;

-- 4) التحقق من المستشفيات التي لم تُحدث
SELECT 
  HospitalID,
  NameAr,
  '⚠️ بيانات الاتصال ناقصة' AS Warning
FROM hospitals
WHERE (DbName IS NULL OR DbName = '' OR 
       DbUser IS NULL OR DbUser = '' OR
       DbHost IS NULL OR DbHost = '')
  AND IsActive = 1;

/* =========================================================
   ملاحظات مهمة:
   
   1. كلمة المرور: استخدم نفس كلمة مرور MySQL الموجودة في .env
   
   2. أسماء القواعد (DbName): يجب أن تطابق أسماء قواعد البيانات الفعلية
      مثال: hospital_king_abdulaziz, hospital_noor, إلخ
   
   3. للمستشفيات الإضافية: أضف UPDATE statements حسب الحاجة
   
   4. للتحقق من قواعد البيانات الموجودة:
      SHOW DATABASES LIKE 'hospital_%';
      
   5. بعد التنفيذ، تحقق من النتائج وتأكد من عدم وجود
      مستشفيات بحالة "بيانات الاتصال ناقصة"
   ========================================================= */

