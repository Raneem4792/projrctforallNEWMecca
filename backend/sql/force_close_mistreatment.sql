-- =========================================================
-- سكريبت تجريبي: إغلاق بعض بلاغات سوء التعامل لإظهار المتوسط
-- =========================================================

-- 1. تحديث 3 بلاغات سوء تعامل عشوائية لتكون مغلقة
UPDATE complaints
SET 
  StatusCode = 'CLOSED',
  ActualClosingHours = FLOOR(5 + (RAND() * 40)), -- رقم عشوائي بين 5 و 45
  UpdatedAt = NOW()
WHERE (ComplaintTypeID = 3 OR SubTypeID = 15) -- شرط سوء التعامل
  AND StatusCode = 'open' -- نختار من المفتوح
LIMIT 3; -- فقط 3 بلاغات للتجربة

-- 2. التحقق من النتيجة
SELECT ComplaintID, StatusCode, ActualClosingHours 
FROM complaints 
WHERE (ComplaintTypeID = 3 OR SubTypeID = 15) 
  AND StatusCode = 'CLOSED';

