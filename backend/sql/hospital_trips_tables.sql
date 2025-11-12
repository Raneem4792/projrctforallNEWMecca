-- ينفذ هذا الملف داخل قاعدة بيانات كل مستشفى (tenant)

-- جدول الرحلات العلاجية داخل قاعدة المستشفى
CREATE TABLE IF NOT EXISTS hospital_treatment_trips (
  TripID INT AUTO_INCREMENT PRIMARY KEY,
  TripName VARCHAR(255) NOT NULL UNIQUE,
  IsAvailable TINYINT(1) DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- جدول النطاقات داخل قاعدة المستشفى
CREATE TABLE IF NOT EXISTS hospital_zones (
  ZoneID INT AUTO_INCREMENT PRIMARY KEY,
  ZoneName VARCHAR(255) NOT NULL UNIQUE,
  IsAvailable TINYINT(1) DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- تعبئة الرحلات العلاجية (مرة واحدة)
INSERT IGNORE INTO hospital_treatment_trips (TripName) VALUES
  ('التنويم'),('الطوارئ'),('العيادات'),('الرعاية المنزلية'),('خدمات الأشعة'),
  ('مراكز القلب التنويم'),('مراكز القلب العيادات'),('مراكز الأورام التنويم'),
  ('مراكز الأورام العيادات'),('فحص ما قبل الزواج'),('خدمات الأسنان'),
  ('مراكز الكلى القطاع الحكومي'),('مراكز الرعاية الأولية'),('التأهيل الطبي العيادات'),
  ('جراحة اليوم الواحد'),('بنوك الدم'),('مراكز علاج السكري');

-- تعبئة النطاقات (مرة واحدة)
INSERT IGNORE INTO hospital_zones (ZoneName) VALUES
  ('التقييم العام'),('الوجبات'),('الطبيب'),('فريق التمريض'),('الوصول'),
  ('الغرفة'),('التسجيل'),('الزوار والعائلة'),('المرافق'),('الصيدلة'),
  ('المختبر'),('المسائل الشخصية'),('الرعاية المقدمة'),('ذوي الإعاقة'),
  ('بلاغات 937'),('غسيل الكلى'),('المواعيد والتسجيل'),('الانتقال خلال الزيارة'),
  ('التوعية والمعلومات'),('ترتيب الرعاية المنزلية');

