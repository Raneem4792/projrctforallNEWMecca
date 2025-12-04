-- تحسينات قاعدة البيانات المركزية لتحسين أداء البحث
-- تشغيل هذا الملف على القاعدة المركزية hospitals_mecca3

-- 1. فهارس للبحث السريع
CREATE INDEX IF NOT EXISTS idx_complaints_ticket ON complaints (TicketNumber);
CREATE INDEX IF NOT EXISTS idx_complaints_name ON complaints (PatientFullName);
CREATE INDEX IF NOT EXISTS idx_complaints_mobile ON complaints (PatientMobile);
CREATE INDEX IF NOT EXISTS idx_complaints_nid ON complaints (PatientIDNumber);
CREATE INDEX IF NOT EXISTS idx_complaints_hid ON complaints (HospitalID);
CREATE INDEX IF NOT EXISTS idx_complaints_file ON complaints (FileNumber);

-- 2. فهرس مركب للبحث المتقدم
CREATE INDEX IF NOT EXISTS idx_complaints_search ON complaints (HospitalID, PatientFullName, TicketNumber);

-- 3. تحسين الترميز
ALTER TABLE complaints CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- 4. إحصائيات الجداول
ANALYZE TABLE complaints;

-- 5. عرض الفهارس المضافة
SHOW INDEX FROM complaints;

-- 6. اختبار البحث
SELECT COUNT(*) as total_complaints FROM complaints;
SELECT COUNT(*) as complaints_hospital_11 FROM complaints WHERE HospitalID = 11;
SELECT COUNT(*) as complaints_with_name FROM complaints WHERE PatientFullName LIKE '%رنيم%';
