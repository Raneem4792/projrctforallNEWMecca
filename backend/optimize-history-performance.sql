-- تحسينات الأداء لسجل البلاغات
-- تشغيل هذا الملف على القاعدة المركزية hospitals_mecca3

-- 1. فهارس أساسية للبحث السريع
CREATE INDEX IF NOT EXISTS idx_complaints_ticket ON complaints (TicketNumber);
CREATE INDEX IF NOT EXISTS idx_complaints_mobile ON complaints (PatientMobile);
CREATE INDEX IF NOT EXISTS idx_complaints_nid ON complaints (PatientIDNumber);
CREATE INDEX IF NOT EXISTS idx_complaints_file ON complaints (FileNumber);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints (StatusCode);
CREATE INDEX IF NOT EXISTS idx_complaints_hosp ON complaints (HospitalID);
CREATE INDEX IF NOT EXISTS idx_complaints_created ON complaints (CreatedAt);

-- 2. فهارس مركبة للبحث المتقدم
CREATE INDEX IF NOT EXISTS idx_complaints_hosp_status ON complaints (HospitalID, StatusCode);
CREATE INDEX IF NOT EXISTS idx_complaints_hosp_created ON complaints (HospitalID, CreatedAt);
CREATE INDEX IF NOT EXISTS idx_complaints_status_created ON complaints (StatusCode, CreatedAt);

-- 3. فهارس للبحث النصي
CREATE INDEX IF NOT EXISTS idx_complaints_name ON complaints (PatientFullName(50));

-- 4. تحسين الترميز
ALTER TABLE complaints CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- 5. إحصائيات الجداول
ANALYZE TABLE complaints;
ANALYZE TABLE hospitals;
ANALYZE TABLE complaint_types;

-- 6. عرض الفهارس المضافة
SHOW INDEX FROM complaints;

-- 7. اختبار الأداء
SELECT COUNT(*) as total_complaints FROM complaints;
SELECT COUNT(*) as complaints_hospital_11 FROM complaints WHERE HospitalID = 11;
SELECT COUNT(*) as open_complaints FROM complaints WHERE StatusCode = 'OPEN';
SELECT COUNT(*) as recent_complaints FROM complaints WHERE CreatedAt >= DATE_SUB(NOW(), INTERVAL 30 DAY);

-- 8. فحص استخدام الفهارس
EXPLAIN SELECT * FROM complaints WHERE HospitalID = 11 AND StatusCode = 'OPEN' ORDER BY CreatedAt DESC LIMIT 10;
