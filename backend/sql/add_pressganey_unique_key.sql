-- إضافة مفتاح فريد لجدول pressganey_data لتفعيل ON DUPLICATE KEY UPDATE
-- يجب تشغيل هذا الملف على كل قاعدة بيانات مستشفى

-- إضافة مفتاح فريد مركب لمنع التكرار
-- السجل الفريد = (HospitalID, department_key, question_code, quarter, year)
ALTER TABLE pressganey_data
  ADD UNIQUE KEY IF NOT EXISTS uq_pressganey_unique (
    HospitalID, 
    department_key, 
    question_code, 
    quarter, 
    year
  );

-- إضافة فهارس لتحسين الأداء
CREATE INDEX IF NOT EXISTS idx_pressganey_hospital ON pressganey_data (HospitalID);
CREATE INDEX IF NOT EXISTS idx_pressganey_dept ON pressganey_data (department_key);
CREATE INDEX IF NOT EXISTS idx_pressganey_quarter_year ON pressganey_data (quarter, year);
CREATE INDEX IF NOT EXISTS idx_pressganey_hosp_quarter ON pressganey_data (HospitalID, quarter, year);
