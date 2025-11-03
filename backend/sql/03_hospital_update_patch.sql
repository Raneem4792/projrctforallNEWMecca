/* =========================================================
   Hospital Database Complete Setup & Update Patch
   إعداد وتحديث قاعدة بيانات المستشفى الكامل
   - يعمل على قواعد بيانات جديدة أو موجودة
   - آمن 100%: يستخدم IF NOT EXISTS و ADD COLUMN IF NOT EXISTS
   - مأخوذ من hospital_template.sql مع تحسينات
   ========================================================= */

-- 0) خيارات عامة
SET NAMES utf8mb4;
SET time_zone = '+03:00';
SET sql_mode = 'STRICT_ALL_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET FOREIGN_KEY_CHECKS=0;

/* ========================================================
   SECTION 1: الجداول المرجعية (Lookup Tables)
   ======================================================== */

-- 1.1) جدول حالات البلاغات
CREATE TABLE IF NOT EXISTS complaint_statuses (
  StatusCode     VARCHAR(20)  PRIMARY KEY,
  LabelAr        VARCHAR(50)  NOT NULL,
  LabelEn        VARCHAR(50)  NOT NULL,
  SortOrder      TINYINT UNSIGNED NOT NULL DEFAULT 0,
  IsActive       TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 1.2) جدول أولويات البلاغات
CREATE TABLE IF NOT EXISTS complaint_priorities (
  PriorityCode   VARCHAR(20)  PRIMARY KEY,
  LabelAr        VARCHAR(50)  NOT NULL,
  LabelEn        VARCHAR(50)  NOT NULL,
  ColorHex       CHAR(7)      NOT NULL DEFAULT '#999999',
  SortOrder      TINYINT UNSIGNED NOT NULL DEFAULT 0,
  IsActive       TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 1.3) جدول أنواع الردود
CREATE TABLE IF NOT EXISTS reply_types (
  ReplyTypeID    SMALLINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  NameAr         VARCHAR(150) NOT NULL,
  NameEn         VARCHAR(150) NOT NULL,
  IsActive       TINYINT(1) NOT NULL DEFAULT 1,
  SortOrder      SMALLINT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 1.4) عداد التذاكر (لتوليد TicketNumber تسلسلي)
CREATE TABLE IF NOT EXISTS ticket_counters (
  YearSmall  SMALLINT UNSIGNED PRIMARY KEY,  -- السنة (مثل 2025)
  LastSeq    INT UNSIGNED NOT NULL DEFAULT 0  -- آخر رقم تسلسلي
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* ========================================================
   SECTION 2: الهيكل التنظيمي والمستخدمين
   ======================================================== */

-- 2.1) جدول الأقسام
CREATE TABLE IF NOT EXISTS departments (
  DepartmentID         INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  HospitalID           INT UNSIGNED NOT NULL,
  ParentDepartmentID   INT UNSIGNED NULL,
  Code                 VARCHAR(30) NULL,
  NameAr               VARCHAR(150) NOT NULL,
  NameEn               VARCHAR(150) NOT NULL,
  IsActive             TINYINT(1) NOT NULL DEFAULT 1,
  SortOrder            SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  CreatedAt            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX ix_dept_hosp (HospitalID),
  INDEX ix_dept_parent (ParentDepartmentID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- تحديث جدول الأقسام إن كان موجوداً
ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS Code VARCHAR(30) NULL AFTER ParentDepartmentID,
  ADD COLUMN IF NOT EXISTS IsActive TINYINT(1) NOT NULL DEFAULT 1 AFTER NameEn,
  ADD COLUMN IF NOT EXISTS SortOrder SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER IsActive,
  ADD COLUMN IF NOT EXISTS CreatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER SortOrder,
  ADD COLUMN IF NOT EXISTS UpdatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER CreatedAt;

-- 2.2) جدول المستخدمين
CREATE TABLE IF NOT EXISTS users (
  UserID          INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  RoleID          TINYINT UNSIGNED NOT NULL,        -- 1: SuperAdmin, 2: Admin/Employee, 3: DeptAdmin, 4: Director
  HospitalID      INT UNSIGNED NOT NULL,
  DepartmentID    INT UNSIGNED NULL,
  SubDepartmentID INT UNSIGNED NULL,                -- قسم فرعي (اختياري)
  FullName        VARCHAR(150) NOT NULL,
  Username        VARCHAR(80)  NOT NULL UNIQUE,
  Email           VARCHAR(150) NULL,                -- اختياري (NULL)
  Mobile          VARCHAR(20)  NULL,
  NationalID      VARCHAR(20)  NULL,
  PasswordHash    VARCHAR(255) NOT NULL,
  IsActive        TINYINT(1) NOT NULL DEFAULT 1,
  CreatedAt       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  IsDeleted       TINYINT(1) NOT NULL DEFAULT 0,
  DeletedAt       DATETIME NULL,
  DeletedByUserID INT UNSIGNED NULL,
  DeleteReason    VARCHAR(255) NULL,
  INDEX ix_users_hosp (HospitalID),
  INDEX ix_users_dept (DepartmentID),
  INDEX ix_users_subdept (SubDepartmentID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- تحديث جدول المستخدمين إن كان موجوداً
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS SubDepartmentID INT UNSIGNED NULL AFTER DepartmentID,
  ADD COLUMN IF NOT EXISTS Email VARCHAR(150) NULL AFTER Username,
  ADD COLUMN IF NOT EXISTS Mobile VARCHAR(20) NULL AFTER Email,
  ADD COLUMN IF NOT EXISTS NationalID VARCHAR(20) NULL AFTER Mobile,
  ADD COLUMN IF NOT EXISTS IsDeleted TINYINT(1) NOT NULL DEFAULT 0 AFTER UpdatedAt,
  ADD COLUMN IF NOT EXISTS DeletedAt DATETIME NULL AFTER IsDeleted,
  ADD COLUMN IF NOT EXISTS DeletedByUserID INT UNSIGNED NULL AFTER DeletedAt,
  ADD COLUMN IF NOT EXISTS DeleteReason VARCHAR(255) NULL AFTER DeletedByUserID;

CREATE INDEX IF NOT EXISTS ix_users_subdept ON users (SubDepartmentID);

/* ========================================================
   SECTION 3: الشكاوى والملحقات
   ======================================================== */

-- 3.1) جدول البلاغات
CREATE TABLE IF NOT EXISTS complaints (
  ComplaintID      BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  GlobalID         CHAR(36) NOT NULL DEFAULT (UUID()),         -- ثابت عالمي للمزامنة
  TicketNumber     VARCHAR(20) UNIQUE,                          -- يُولّد بتنسيق موحّد
  HospitalID       INT UNSIGNED NOT NULL,
  DepartmentID     INT UNSIGNED NOT NULL,
  SubmissionType   ENUM('حضوري','937') NOT NULL DEFAULT 'حضوري',
  VisitDate        DATE NULL,
  PatientFullName  VARCHAR(150) NULL,
  PatientIDNumber  VARCHAR(20)  NULL,
  PatientMobile    VARCHAR(20)  NULL,
  GenderCode       CHAR(1)      NULL,                          -- 'M','F'
  FileNumber       VARCHAR(50)  NULL,
  ComplaintTypeID  INT UNSIGNED NULL,
  SubTypeID        INT UNSIGNED NULL,
  Description      TEXT NOT NULL,
  PriorityCode     VARCHAR(20) NOT NULL,
  StatusCode       VARCHAR(20) NOT NULL,
  CreatedByUserID  INT UNSIGNED NULL,
  CreatedAt        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PatientID        BIGINT UNSIGNED NULL,
  IsDeleted        TINYINT(1) NOT NULL DEFAULT 0,
  DeletedAt        DATETIME NULL,
  DeletedByUserID  INT UNSIGNED NULL,
  DeleteReason     VARCHAR(255) NULL,
  INDEX ix_c_hosp_created (HospitalID, CreatedAt),
  INDEX ix_c_status_priority (StatusCode, PriorityCode),
  INDEX ix_c_dept (DepartmentID),
  INDEX ix_c_global (GlobalID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- تحديث جدول البلاغات إن كان موجوداً
ALTER TABLE complaints
  ADD COLUMN IF NOT EXISTS GlobalID CHAR(36) NULL AFTER ComplaintID,
  ADD COLUMN IF NOT EXISTS TicketNumber VARCHAR(20) NULL AFTER GlobalID,
  ADD COLUMN IF NOT EXISTS SubmissionType ENUM('حضوري','937') NOT NULL DEFAULT 'حضوري' AFTER DepartmentID,
  ADD COLUMN IF NOT EXISTS VisitDate DATE NULL AFTER SubmissionType,
  ADD COLUMN IF NOT EXISTS PatientFullName VARCHAR(150) NULL AFTER VisitDate,
  ADD COLUMN IF NOT EXISTS PatientIDNumber VARCHAR(20) NULL AFTER PatientFullName,
  ADD COLUMN IF NOT EXISTS PatientMobile VARCHAR(20) NULL AFTER PatientIDNumber,
  ADD COLUMN IF NOT EXISTS GenderCode CHAR(1) NULL AFTER PatientMobile,
  ADD COLUMN IF NOT EXISTS FileNumber VARCHAR(50) NULL AFTER GenderCode,
  ADD COLUMN IF NOT EXISTS ComplaintTypeID INT UNSIGNED NULL AFTER FileNumber,
  ADD COLUMN IF NOT EXISTS SubTypeID INT UNSIGNED NULL AFTER ComplaintTypeID,
  ADD COLUMN IF NOT EXISTS PriorityCode VARCHAR(20) NULL AFTER Description,
  ADD COLUMN IF NOT EXISTS StatusCode VARCHAR(20) NULL AFTER PriorityCode,
  ADD COLUMN IF NOT EXISTS CreatedByUserID INT UNSIGNED NULL AFTER StatusCode,
  ADD COLUMN IF NOT EXISTS UpdatedAt TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER CreatedAt,
  ADD COLUMN IF NOT EXISTS PatientID BIGINT UNSIGNED NULL AFTER UpdatedAt,
  ADD COLUMN IF NOT EXISTS IsDeleted TINYINT(1) NOT NULL DEFAULT 0 AFTER PatientID,
  ADD COLUMN IF NOT EXISTS DeletedAt DATETIME NULL AFTER IsDeleted,
  ADD COLUMN IF NOT EXISTS DeletedByUserID INT UNSIGNED NULL AFTER DeletedAt,
  ADD COLUMN IF NOT EXISTS DeleteReason VARCHAR(255) NULL AFTER DeletedByUserID;

-- إضافة فهارس للبلاغات
CREATE INDEX IF NOT EXISTS ix_c_global ON complaints (GlobalID);
CREATE INDEX IF NOT EXISTS ix_c_ticket ON complaints (TicketNumber);
CREATE INDEX IF NOT EXISTS ix_c_hosp_created ON complaints (HospitalID, CreatedAt);
CREATE INDEX IF NOT EXISTS ix_c_status_priority ON complaints (StatusCode, PriorityCode);
CREATE INDEX IF NOT EXISTS ix_c_dept ON complaints (DepartmentID);
CREATE INDEX IF NOT EXISTS ix_c_priority_created ON complaints (PriorityCode, CreatedAt);
CREATE INDEX IF NOT EXISTS ix_c_status_created ON complaints (StatusCode, CreatedAt);

-- 3.2) جدول مرفقات البلاغات
CREATE TABLE IF NOT EXISTS attachments (
  AttachmentID         BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  ComplaintID          BIGINT UNSIGNED NOT NULL,
  FileName             VARCHAR(255) NOT NULL,
  FilePath             VARCHAR(512) NOT NULL,
  FileSize             INT UNSIGNED NULL,
  UploadedByUserID     INT UNSIGNED NULL,
  UploadDate           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  Description          VARCHAR(255) NULL,
  INDEX ix_att_cid (ComplaintID, UploadDate)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- تحديث جدول المرفقات إن كان موجوداً
ALTER TABLE attachments
  ADD COLUMN IF NOT EXISTS FileSize INT UNSIGNED NULL AFTER FilePath,
  ADD COLUMN IF NOT EXISTS UploadedByUserID INT UNSIGNED NULL AFTER FileSize,
  ADD COLUMN IF NOT EXISTS Description VARCHAR(255) NULL AFTER UploadDate;

CREATE INDEX IF NOT EXISTS ix_att_cid ON attachments (ComplaintID, UploadDate);

/* ========================================================
   SECTION 4: الردود والتعليقات
   ======================================================== */

-- 4.1) جدول الردود
CREATE TABLE IF NOT EXISTS complaint_responses (
  ResponseID       BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  GlobalID         CHAR(36) NOT NULL DEFAULT (UUID()),           -- ثابت عالمي للمزامنة
  ComplaintID      BIGINT UNSIGNED NOT NULL,
  ResponderUserID  INT UNSIGNED NOT NULL,
  ReplyTypeID      SMALLINT UNSIGNED NOT NULL,
  TargetStatusCode VARCHAR(20) NULL,                             -- الحالة التي ستصبح بعد هذا الرد
  Message          TEXT NOT NULL,
  IsInternal       TINYINT(1) NOT NULL DEFAULT 0,                -- 0: ظاهر لصاحب البلاغ، 1: داخلي
  CreatedAt        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_r_cid (ComplaintID, CreatedAt),
  INDEX ix_r_user (ResponderUserID),
  INDEX ix_r_global (GlobalID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- تحديث جدول الردود إن كان موجوداً
ALTER TABLE complaint_responses
  ADD COLUMN IF NOT EXISTS GlobalID CHAR(36) NULL AFTER ResponseID,
  ADD COLUMN IF NOT EXISTS ResponderUserID INT UNSIGNED NULL AFTER ComplaintID,
  ADD COLUMN IF NOT EXISTS ReplyTypeID SMALLINT UNSIGNED NULL AFTER ResponderUserID,
  ADD COLUMN IF NOT EXISTS TargetStatusCode VARCHAR(20) NULL AFTER ReplyTypeID,
  ADD COLUMN IF NOT EXISTS IsInternal TINYINT(1) NOT NULL DEFAULT 0 AFTER Message,
  ADD COLUMN IF NOT EXISTS CreatedAt TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP AFTER IsInternal;

CREATE INDEX IF NOT EXISTS ix_r_cid ON complaint_responses (ComplaintID, CreatedAt);
CREATE INDEX IF NOT EXISTS ix_r_user ON complaint_responses (ResponderUserID);
CREATE INDEX IF NOT EXISTS ix_r_global ON complaint_responses (GlobalID);

-- 4.2) جدول مرفقات الردود
CREATE TABLE IF NOT EXISTS response_attachments (
  RespAttachmentID   BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  ResponseID         BIGINT UNSIGNED NOT NULL,
  FileName           VARCHAR(255) NOT NULL,
  FilePath           VARCHAR(512) NOT NULL,
  FileSize           INT UNSIGNED NULL,
  UploadedByUserID   INT UNSIGNED NULL,
  UploadDate         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  Description        VARCHAR(255) NULL,
  INDEX ix_ratt_rid (ResponseID, UploadDate)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- تحديث جدول مرفقات الردود إن كان موجوداً
ALTER TABLE response_attachments
  ADD COLUMN IF NOT EXISTS FileSize INT UNSIGNED NULL AFTER FilePath,
  ADD COLUMN IF NOT EXISTS UploadedByUserID INT UNSIGNED NULL AFTER FileSize,
  ADD COLUMN IF NOT EXISTS Description VARCHAR(255) NULL AFTER UploadDate;

CREATE INDEX IF NOT EXISTS ix_ratt_rid ON response_attachments (ResponseID, UploadDate);

/* ========================================================
   SECTION 5: سجل الحالات والأحداث
   ======================================================== */

-- 5.1) سجل تغيّر الحالة
CREATE TABLE IF NOT EXISTS complaint_status_history (
  HistoryID       BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  ComplaintID     BIGINT UNSIGNED NOT NULL,
  OldStatusCode   VARCHAR(20) NULL,
  NewStatusCode   VARCHAR(20) NOT NULL,
  ChangedByUserID INT UNSIGNED NULL,
  ChangedAt       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  Notes           VARCHAR(255) NULL,
  INDEX ix_hist_cid (ComplaintID, ChangedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX IF NOT EXISTS ix_hist_cid ON complaint_status_history (ComplaintID, ChangedAt);

-- 5.2) Outbox للأحداث (للمزامنة مع المركزي)
CREATE TABLE IF NOT EXISTS outbox_events (
  EventID           BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  EventType         VARCHAR(50) NOT NULL,              -- e.g., 'COMPLAINT_CREATED','COMPLAINT_UPDATED','RESPONSE_ADDED'
  AggregateType     VARCHAR(50) NOT NULL,              -- 'complaint','response','attachment'
  AggregateGlobalID CHAR(36) NOT NULL,                 -- GlobalID للكيان
  HospitalID        INT UNSIGNED NOT NULL,
  Payload           JSON NOT NULL,                     -- صورة الكيان كما ستُرسل للمركزي
  OccurredAt        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  Processed         TINYINT(1) NOT NULL DEFAULT 0,
  ProcessedAt       DATETIME NULL,
  INDEX ix_outbox_p (Processed, OccurredAt),
  INDEX ix_outbox_gid (AggregateGlobalID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX IF NOT EXISTS ix_outbox_p ON outbox_events (Processed, OccurredAt);
CREATE INDEX IF NOT EXISTS ix_outbox_gid ON outbox_events (AggregateGlobalID);

/* ========================================================
   SECTION 6: البيانات الأولية (Seeds)
   ======================================================== */

-- 6.1) حالات البلاغات
INSERT IGNORE INTO complaint_statuses (StatusCode, LabelAr, LabelEn, SortOrder) VALUES
('OPEN',        'مفتوح',           'Open',         1),
('IN_PROGRESS', 'قيد المعالجة',     'In Progress',  2),
('ON_HOLD',     'معلّق',           'On Hold',      3),
('ESCALATED',   'مُصعّد',          'Escalated',    4),
('RESOLVED',    'محلول',           'Resolved',     5),
('CLOSED',      'مغلق',            'Closed',       6),
('CANCELLED',   'ملغي',            'Cancelled',    7);

-- 6.2) أولويات البلاغات
INSERT IGNORE INTO complaint_priorities (PriorityCode, LabelAr, LabelEn, ColorHex, SortOrder) VALUES
('LOW',     'منخفضة',    'Low',     '#3b82f6', 1),
('MEDIUM',  'متوسطة',    'Medium',  '#f59e0b', 2),
('HIGH',    'عالية',     'High',    '#ef4444', 3),
('CRITICAL','حرجة',      'Critical','#dc2626', 4);

-- 6.3) أنواع الردود
INSERT IGNORE INTO reply_types (NameAr, NameEn, SortOrder) VALUES
('رد عام',                'General Reply',         1),
('تحويل إلى قسم',        'Forward to Department', 2),
('طلب معلومات إضافية',   'Request More Info',     3),
('تحديث الحالة',         'Status Update',         4),
('إغلاق مع الحل',        'Close with Resolution', 5);

/* ========================================================
   SECTION 7: الإجراءات المخزنة (Stored Procedures)
   ======================================================== */

-- 7.1) مولد التذاكر
DROP PROCEDURE IF EXISTS sp_next_ticket;
DELIMITER $$
CREATE PROCEDURE sp_next_ticket(IN p_hospital_id INT, OUT p_ticket VARCHAR(20))
BEGIN
  DECLARE v_year SMALLINT UNSIGNED;
  DECLARE v_seq  INT UNSIGNED;
  SET v_year = YEAR(CURDATE());
  INSERT INTO ticket_counters (YearSmall, LastSeq)
    VALUES (v_year, 0)
    ON DUPLICATE KEY UPDATE LastSeq = LastSeq;
  UPDATE ticket_counters SET LastSeq = LastSeq + 1 WHERE YearSmall = v_year;
  SELECT LastSeq INTO v_seq FROM ticket_counters WHERE YearSmall = v_year;
  SET p_ticket = CONCAT('KA-', RIGHT(v_year,2), 'H', LPAD(p_hospital_id,2,'0'), '-', LPAD(v_seq,4,'0'));
END $$
DELIMITER ;

/* ========================================================
   SECTION 8: Views (واجهات العرض)
   ======================================================== */

-- 8.1) View لتوافق اسم ملحقات البلاغ
CREATE OR REPLACE VIEW complaint_attachments AS
SELECT 
  AttachmentID      AS ComplaintAttachmentID,
  ComplaintID,
  FileName,
  FilePath,
  FileSize,
  UploadedByUserID,
  UploadDate,
  Description
FROM attachments;

-- 8.2) View الردود مع أسماء عربية للحالات وأنواع الردود
CREATE OR REPLACE VIEW complaint_responses_view AS
SELECT 
  r.ResponseID,
  r.ComplaintID,
  r.ReplyTypeID,
  rt.NameAr  AS ReplyTypeNameAr,
  rt.NameEn  AS ReplyTypeNameEn,
  r.TargetStatusCode,
  cs.LabelAr AS TargetStatusNameAr,
  cs.LabelEn AS TargetStatusNameEn,
  r.Message,
  r.IsInternal,
  r.CreatedAt,
  u.UserID   AS ResponderUserID,
  u.FullName AS ResponderFullName
FROM complaint_responses r
JOIN reply_types rt         ON rt.ReplyTypeID = r.ReplyTypeID
LEFT JOIN complaint_statuses cs ON cs.StatusCode = r.TargetStatusCode
JOIN users u                ON u.UserID = r.ResponderUserID;

/* ========================================================
   SECTION 9: Triggers (المحفزات)
   ======================================================== */

-- تريجرز: تضيف أحداث Outbox تلقائيًا عند الإنشاء/التحديث
DELIMITER $$

-- 9.1) عند إنشاء شكوى
DROP TRIGGER IF EXISTS trg_complaints_ai $$
CREATE TRIGGER trg_complaints_ai
AFTER INSERT ON complaints
FOR EACH ROW
BEGIN
  INSERT INTO outbox_events(EventType, AggregateType, AggregateGlobalID, HospitalID, Payload)
  VALUES(
    'COMPLAINT_CREATED',
    'complaint',
    NEW.GlobalID,
    NEW.HospitalID,
    JSON_OBJECT(
      'GlobalID', NEW.GlobalID,
      'TicketNumber', NEW.TicketNumber,
      'HospitalID', NEW.HospitalID,
      'DepartmentID', NEW.DepartmentID,
      'PriorityCode', NEW.PriorityCode,
      'StatusCode', NEW.StatusCode,
      'CreatedAt', DATE_FORMAT(NEW.CreatedAt, '%Y-%m-%d %H:%i:%s'),
      'UpdatedAt', DATE_FORMAT(NEW.UpdatedAt, '%Y-%m-%d %H:%i:%s')
    )
  );
END $$

-- 9.2) عند تعديل شكوى
DROP TRIGGER IF EXISTS trg_complaints_au $$
CREATE TRIGGER trg_complaints_au
AFTER UPDATE ON complaints
FOR EACH ROW
BEGIN
  IF (OLD.StatusCode <> NEW.StatusCode) THEN
    INSERT INTO complaint_status_history(ComplaintID, OldStatusCode, NewStatusCode, ChangedByUserID, Notes)
    VALUES (NEW.ComplaintID, OLD.StatusCode, NEW.StatusCode, NEW.CreatedByUserID, 'Auto via trigger');
  END IF;

  INSERT INTO outbox_events(EventType, AggregateType, AggregateGlobalID, HospitalID, Payload)
  VALUES(
    'COMPLAINT_UPDATED',
    'complaint',
    NEW.GlobalID,
    NEW.HospitalID,
    JSON_OBJECT(
      'GlobalID', NEW.GlobalID,
      'TicketNumber', NEW.TicketNumber,
      'HospitalID', NEW.HospitalID,
      'DepartmentID', NEW.DepartmentID,
      'PriorityCode', NEW.PriorityCode,
      'StatusCode', NEW.StatusCode,
      'UpdatedAt', DATE_FORMAT(NEW.UpdatedAt, '%Y-%m-%d %H:%i:%s')
    )
  );
END $$

-- 9.3) عند إضافة رد
DROP TRIGGER IF EXISTS trg_responses_ai $$
CREATE TRIGGER trg_responses_ai
AFTER INSERT ON complaint_responses
FOR EACH ROW
BEGIN
  INSERT INTO outbox_events(EventType, AggregateType, AggregateGlobalID, HospitalID, Payload)
  SELECT
    'RESPONSE_ADDED',
    'response',
    NEW.GlobalID,
    c.HospitalID,
    JSON_OBJECT(
      'GlobalID', NEW.GlobalID,
      'ComplaintGlobalID', c.GlobalID,
      'ReplyTypeID', NEW.ReplyTypeID,
      'TargetStatusCode', NEW.TargetStatusCode,
      'Message', NEW.Message,
      'IsInternal', NEW.IsInternal,
      'CreatedAt', DATE_FORMAT(NEW.CreatedAt, '%Y-%m-%d %H:%i:%s')
    )
  FROM complaints c WHERE c.ComplaintID = NEW.ComplaintID;
END $$

DELIMITER ;

/* ========================================================
   إعادة تفعيل فحوصات المفاتيح الخارجية
   ======================================================== */
SET FOREIGN_KEY_CHECKS=1;

/* ========================================================
   تم بنجاح! 
   السكربت آمن للتشغيل على قواعد بيانات جديدة أو موجودة
   ======================================================== */
