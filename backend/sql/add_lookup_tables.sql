/* =========================================================
   إضافة جداول الأكواد الأساسية لقواعد بيانات المستشفيات
   يجب تطبيقه على جميع قواعد المستشفيات الموجودة
   ========================================================= */

-- 1) حالات الشكاوى (complaint_statuses)
CREATE TABLE IF NOT EXISTS complaint_statuses (
  StatusCode  VARCHAR(20) PRIMARY KEY,
  NameAr      VARCHAR(100),
  NameEn      VARCHAR(100),
  SortOrder   INT DEFAULT 0,
  IsActive    TINYINT(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO complaint_statuses (StatusCode, NameAr, NameEn, SortOrder, IsActive) VALUES
('OPEN',         'مفتوح',         'Open',         10, 1),
('IN_PROGRESS',  'قيد المعالجة',  'In Progress',  20, 1),
('ESCALATED',    'مُصعَّد',       'Escalated',    30, 1),
('RESOLVED',     'محلول',         'Resolved',     40, 1),
('CLOSED',       'مغلق',          'Closed',       50, 1),
('REJECTED',     'مرفوض',         'Rejected',     60, 1),
('ON_HOLD',      'معلّق',         'On Hold',      70, 1)
ON DUPLICATE KEY UPDATE
  NameAr=VALUES(NameAr), NameEn=VALUES(NameEn),
  SortOrder=VALUES(SortOrder), IsActive=VALUES(IsActive);

-- 2) أولويات الشكاوى (priority_codes)
CREATE TABLE IF NOT EXISTS priority_codes (
  PriorityCode VARCHAR(20) PRIMARY KEY,
  NameAr       VARCHAR(100),
  NameEn       VARCHAR(100),
  SortOrder    INT DEFAULT 0,
  IsActive     TINYINT(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO priority_codes (PriorityCode, NameAr, NameEn, SortOrder, IsActive) VALUES
('LOW',      'منخفض',  'Low',      10, 1),
('MEDIUM',   'متوسط',  'Medium',   20, 1),
('HIGH',     'مرتفع',  'High',     30, 1),
('URGENT',   'عاجل',   'Urgent',   40, 1),
('CRITICAL', 'حرج',    'Critical', 50, 1)
ON DUPLICATE KEY UPDATE
  NameAr=VALUES(NameAr), NameEn=VALUES(NameEn),
  SortOrder=VALUES(SortOrder), IsActive=VALUES(IsActive);

-- 3) أكواد الجنس (genders) - اختياري
CREATE TABLE IF NOT EXISTS genders (
  GenderCode CHAR(1) PRIMARY KEY,
  NameAr     VARCHAR(50),
  NameEn     VARCHAR(50)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO genders (GenderCode, NameAr, NameEn) VALUES
('M', 'ذكر', 'Male'),
('F', 'أنثى', 'Female')
ON DUPLICATE KEY UPDATE NameAr=VALUES(NameAr), NameEn=VALUES(NameEn);

-- عرض النتائج
SELECT '✅ تم إنشاء/تحديث جداول الأكواد الأساسية بنجاح' AS Status;
SELECT COUNT(*) AS 'عدد حالات الشكاوى' FROM complaint_statuses;
SELECT COUNT(*) AS 'عدد الأولويات' FROM priority_codes;

/* =========================================================
   ملاحظات:
   
   1. هذا السكربت آمن - يستخدم CREATE IF NOT EXISTS و ON DUPLICATE KEY
   2. يمكن تشغيله عدة مرات بدون مشاكل
   3. طبّقه على جميع قواعد بيانات المستشفيات:
      - hosp_kah
      - hosp_g
      - hospital_king_abdulaziz
      - وجميع القواعد الأخرى
      
   استخدام:
   mysql -u root -p hosp_kah < backend/sql/add_lookup_tables.sql
   mysql -u root -p hosp_g < backend/sql/add_lookup_tables.sql
   ========================================================= */

