/* =========================================================
   Hospital DB Template (MySQL 8+)
   - UTF8MB4, InnoDB
   - Multi-tenant hospital schema (single tenant DB)
   ========================================================= */

-- 0) خيارات عامة
SET NAMES utf8mb4;
SET time_zone = '+03:00';
SET sql_mode = 'STRICT_ALL_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

-- =========================================================
-- 1) الجداول المرجعية الأساسية
-- =========================================================
DROP TABLE IF EXISTS complaint_statuses;
CREATE TABLE complaint_statuses (
  StatusCode   VARCHAR(20)  PRIMARY KEY,
  LabelAr      VARCHAR(50)  NOT NULL,
  LabelEn      VARCHAR(50)  NOT NULL,
  SortOrder    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  IsActive     TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS complaint_priorities;
CREATE TABLE complaint_priorities (
  PriorityCode VARCHAR(20)  PRIMARY KEY,
  LabelAr      VARCHAR(50)  NOT NULL,
  LabelEn      VARCHAR(50)  NOT NULL,
  ColorHex     CHAR(7)      NOT NULL DEFAULT '#999999',
  SortOrder    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  IsActive     TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS reply_types;
CREATE TABLE reply_types (
  ReplyTypeID  SMALLINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  NameAr       VARCHAR(150) NOT NULL,
  NameEn       VARCHAR(150) NOT NULL,
  IsActive     TINYINT(1) NOT NULL DEFAULT 1,
  SortOrder    SMALLINT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- عداد التذاكر (لتوليد TicketNumber إن رغبتِ)
DROP TABLE IF EXISTS ticket_counters;
CREATE TABLE ticket_counters (
  YearSmall  SMALLINT UNSIGNED PRIMARY KEY,
  LastSeq    INT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================================
-- 2) الهيكل التنظيمي والمستخدمين
-- =========================================================
DROP TABLE IF EXISTS departments;
CREATE TABLE departments (
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
  UNIQUE KEY uq_dept_hosp_ar (HospitalID, NameAr),
  UNIQUE KEY uq_dept_hosp_en (HospitalID, NameEn),
  INDEX ix_dept_parent (ParentDepartmentID),
  CONSTRAINT fk_dept_parent FOREIGN KEY (ParentDepartmentID)
    REFERENCES departments(DepartmentID) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS users;
CREATE TABLE users (
  UserID          INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  RoleID          TINYINT UNSIGNED NOT NULL,
  HospitalID      INT UNSIGNED NOT NULL,
  DepartmentID    INT UNSIGNED NULL,
  SubDepartmentID INT UNSIGNED NULL,
  FullName        VARCHAR(150) NOT NULL,
  Username        VARCHAR(80)  NOT NULL UNIQUE,
  Email           VARCHAR(150) NULL,
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
  INDEX ix_users_subdept (SubDepartmentID),
  CONSTRAINT fk_users_dept     FOREIGN KEY (DepartmentID)    REFERENCES departments(DepartmentID) ON DELETE SET NULL,
  CONSTRAINT fk_users_subdept  FOREIGN KEY (SubDepartmentID) REFERENCES departments(DepartmentID) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================================
-- 3) الشكاوى والملحقات والردود
-- =========================================================
DROP TABLE IF EXISTS complaints;
CREATE TABLE complaints (
  ComplaintID      BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  GlobalID         CHAR(36) NOT NULL DEFAULT (UUID()),
  TicketNumber     VARCHAR(20) UNIQUE,
  HospitalID       INT UNSIGNED NOT NULL,
  DepartmentID     INT UNSIGNED NOT NULL,
  SubmissionType   ENUM('حضوري','937') NOT NULL DEFAULT 'حضوري',
  VisitDate        DATE NULL,
  PatientFullName  VARCHAR(150) NULL,
  PatientIDNumber  VARCHAR(20)  NULL,
  PatientMobile    VARCHAR(20)  NULL,
  GenderCode       CHAR(1)      NULL,
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
  -- الحذف المنطقي
  IsDeleted        TINYINT(1) NOT NULL DEFAULT 0,
  DeletedAt        DATETIME NULL,
  DeletedByUserID  INT UNSIGNED NULL,
  DeleteReason     VARCHAR(255) NULL,
  -- بلاغ على موظف (اختياري)
  ReportedEmployeeName     VARCHAR(150) NULL,
  ReportedEmployeeIDNumber VARCHAR(20)  NULL,
  ReportedEmployeeDeptID   INT UNSIGNED NULL,
  
  -- إسناد البلاغ لموظف
  AssignedToUserID         INT UNSIGNED NULL,
  AssignedAt               TIMESTAMP NULL,
  AssignedByUserID         INT UNSIGNED NULL,

  INDEX ix_c_hosp_created (HospitalID, CreatedAt),
  INDEX ix_c_status_priority (StatusCode, PriorityCode),
  INDEX ix_c_dept (DepartmentID),
  INDEX idx_complaints_assignee (AssignedToUserID),
  UNIQUE KEY uq_complaints_global (GlobalID),

  CONSTRAINT fk_c_dept     FOREIGN KEY (DepartmentID)   REFERENCES departments(DepartmentID)     ON DELETE RESTRICT,
  CONSTRAINT fk_c_priority FOREIGN KEY (PriorityCode)   REFERENCES complaint_priorities(PriorityCode),
  CONSTRAINT fk_c_status   FOREIGN KEY (StatusCode)     REFERENCES complaint_statuses(StatusCode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS attachments;
CREATE TABLE attachments (
  AttachmentID         BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  ComplaintID          BIGINT UNSIGNED NOT NULL,
  FileName             VARCHAR(255) NOT NULL,
  FilePath             VARCHAR(512) NOT NULL,
  FileSize             INT UNSIGNED NULL,
  UploadedByUserID     INT UNSIGNED NULL,
  UploadDate           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  Description          VARCHAR(255) NULL,
  INDEX ix_att_cid (ComplaintID, UploadDate),
  CONSTRAINT fk_att_c FOREIGN KEY (ComplaintID) REFERENCES complaints(ComplaintID) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS complaint_assignee_history (
  HistoryID        BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ComplaintID      BIGINT UNSIGNED NOT NULL,
  FromUserID       INT UNSIGNED NULL,
  ToUserID         INT UNSIGNED NOT NULL,
  Note             VARCHAR(500) NULL,
  ChangedByUserID  INT UNSIGNED NOT NULL,
  ChangedAt        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_cah_complaint (ComplaintID),
  INDEX idx_cah_to_user (ToUserID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4) إضافة تعليق توضيحي
ALTER TABLE complaints COMMENT = 'جدول البلاغات مع دعم إسناد الموظفين';


DROP TABLE IF EXISTS complaint_responses;
CREATE TABLE complaint_responses (
  ResponseID       BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  GlobalID         CHAR(36) NOT NULL DEFAULT (UUID()),
  ComplaintID      BIGINT UNSIGNED NOT NULL,
  ResponderUserID  INT UNSIGNED NOT NULL,
  ReplyTypeID      SMALLINT UNSIGNED NOT NULL,
  TargetStatusCode VARCHAR(20) NULL,
  Message          TEXT NOT NULL,
  IsInternal       TINYINT(1) NOT NULL DEFAULT 0,
  CreatedAt        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_r_cid (ComplaintID, CreatedAt),
  INDEX ix_r_user (ResponderUserID),
  UNIQUE KEY uq_responses_global (GlobalID),
  CONSTRAINT fk_r_c             FOREIGN KEY (ComplaintID)     REFERENCES complaints(ComplaintID)    ON DELETE CASCADE,
  CONSTRAINT fk_r_user          FOREIGN KEY (ResponderUserID) REFERENCES users(UserID)              ON DELETE RESTRICT,
  CONSTRAINT fk_r_replytype     FOREIGN KEY (ReplyTypeID)     REFERENCES reply_types(ReplyTypeID),
  CONSTRAINT fk_r_target_status FOREIGN KEY (TargetStatusCode) REFERENCES complaint_statuses(StatusCode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS response_attachments;
CREATE TABLE response_attachments (
  RespAttachmentID   BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  ResponseID         BIGINT UNSIGNED NOT NULL,
  FileName           VARCHAR(255) NOT NULL,
  FilePath           VARCHAR(512) NOT NULL,
  FileSize           INT UNSIGNED NULL,
  UploadedByUserID   INT UNSIGNED NULL,
  UploadDate         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  Description        VARCHAR(255) NULL,
  INDEX ix_ratt_rid (ResponseID, UploadDate),
  CONSTRAINT fk_ratt_r FOREIGN KEY (ResponseID) REFERENCES complaint_responses(ResponseID) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================================
-- 4) جداول تشغيلية إضافية
-- =========================================================
DROP TABLE IF EXISTS complaint_status_history;
CREATE TABLE complaint_status_history (
  HistoryID       BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  ComplaintID     BIGINT UNSIGNED NOT NULL,
  OldStatusCode   VARCHAR(20) NULL,
  NewStatusCode   VARCHAR(20) NOT NULL,
  Note            VARCHAR(500) NULL,
  ChangedByUserID INT UNSIGNED NULL,
  ChangedAt       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_hist_cid (ComplaintID, ChangedAt),
  CONSTRAINT fk_hist_c    FOREIGN KEY (ComplaintID)  REFERENCES complaints(ComplaintID)    ON DELETE CASCADE,
  CONSTRAINT fk_hist_old  FOREIGN KEY (OldStatusCode) REFERENCES complaint_statuses(StatusCode),
  CONSTRAINT fk_hist_new  FOREIGN KEY (NewStatusCode) REFERENCES complaint_statuses(StatusCode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TABLE IF EXISTS complaint_targets;
CREATE TABLE complaint_targets (
  TargetID BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  ComplaintID BIGINT UNSIGNED NOT NULL,
  TargetEmployeeID INT NULL,
  TargetEmployeeName VARCHAR(150) NULL,
  TargetDepartmentID INT NULL,
  TargetDepartmentName VARCHAR(150) NULL,
  CreatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY fk_ct_complaint (ComplaintID),
  CONSTRAINT fk_ct_c FOREIGN KEY (ComplaintID)
    REFERENCES complaints(ComplaintID) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- كلمات تحديد الأولوية
DROP TABLE IF EXISTS priority_keywords;
CREATE TABLE IF NOT EXISTS priority_keywords (
  KeywordID     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  Keyword       VARCHAR(100) NOT NULL,                   -- الكلمة/العبارة المرصودة
  PriorityCode  VARCHAR(20)  NOT NULL,                   -- يطابق complaint_priorities.PriorityCode
  Category      VARCHAR(100) NULL,                       -- مثل: 'سوء معاملة/تحرش'
  CreatedAt     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uq_keyword_cat (Keyword, Category),
  INDEX ix_keyword (Keyword),
  INDEX ix_priority (PriorityCode),

  CONSTRAINT fk_pk_priority
    FOREIGN KEY (PriorityCode)
    REFERENCES complaint_priorities (PriorityCode)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- =========================================================
-- 5) Outbox للأحداث (للمزامنة مع المركزي)
-- =========================================================
DROP TABLE IF EXISTS outbox_events;
CREATE TABLE outbox_events (
  EventID           BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  EventType         VARCHAR(50) NOT NULL,
  AggregateType     VARCHAR(50) NOT NULL,       -- 'complaint','response','attachment'
  AggregateGlobalID CHAR(36) NOT NULL,          -- GlobalID للكيان
  HospitalID        INT UNSIGNED NOT NULL,
  Payload           JSON NOT NULL,
  OccurredAt        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  Processed         TINYINT(1) NOT NULL DEFAULT 0,
  ProcessedAt       DATETIME NULL,
  INDEX ix_outbox_p (Processed, OccurredAt),
  INDEX ix_outbox_gid (AggregateGlobalID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================================
-- 6) التريجرات
-- =========================================================
DELIMITER $$

-- تطبيع الأكواد (StatusCode/PriorityCode) إلى lowercase قبل INSERT/UPDATE
DROP TRIGGER IF EXISTS trg_complaints_before_ins_norm $$
CREATE TRIGGER trg_complaints_before_ins_norm
BEFORE INSERT ON complaints
FOR EACH ROW
BEGIN
  IF NEW.StatusCode   IS NOT NULL THEN SET NEW.StatusCode   = LOWER(NEW.StatusCode); END IF;
  IF NEW.PriorityCode IS NOT NULL THEN SET NEW.PriorityCode = LOWER(NEW.PriorityCode); END IF;
END $$

DROP TRIGGER IF EXISTS trg_complaints_before_upd_norm $$
CREATE TRIGGER trg_complaints_before_upd_norm
BEFORE UPDATE ON complaints
FOR EACH ROW
BEGIN
  IF NEW.StatusCode   IS NOT NULL THEN SET NEW.StatusCode   = LOWER(NEW.StatusCode); END IF;
  IF NEW.PriorityCode IS NOT NULL THEN SET NEW.PriorityCode = LOWER(NEW.PriorityCode); END IF;
END $$

-- عند إنشاء شكوى → Outbox + (تقدرون تستعملونه للمركزية)
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

-- عند تعديل شكوى → History + Outbox
DROP TRIGGER IF EXISTS trg_complaints_au $$
CREATE TRIGGER trg_complaints_au
AFTER UPDATE ON complaints
FOR EACH ROW
BEGIN
  IF (OLD.StatusCode <> NEW.StatusCode) THEN
    INSERT INTO complaint_status_history(ComplaintID, OldStatusCode, NewStatusCode, ChangedByUserID, Note)
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

-- عند إضافة رد → Outbox
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

-- =========================================================
-- 7) SEEDS (idempotent قدر الإمكان)
-- =========================================================

/* حالات البلاغ (lowercase) */
DELETE FROM complaint_statuses;
INSERT INTO complaint_statuses (StatusCode, LabelAr, LabelEn, SortOrder, IsActive) VALUES
('open','مفتوح','Open',1,1),
('in_progress','قيد المعالجة','In Progress',2,1),
('waiting','بانتظار رد القسم','Waiting',3,1),
('on_hold','معلّق','On Hold',4,1),
('escalated','مُصعّد','Escalated',5,1),
('resolved','محلول','Resolved',6,1),
('closed','مغلق','Closed',7,1),
('cancelled','ملغي','Cancelled',8,1);

/* أولويات البلاغ (lowercase) */
DELETE FROM complaint_priorities;
INSERT INTO complaint_priorities (PriorityCode, LabelAr, LabelEn, ColorHex, SortOrder, IsActive) VALUES
('low','منخفضة','Low','#3b82f6',1,1),
('medium','متوسطة','Medium','#f59e0b',2,1),
('urgent','عاجلة/حرجة','Urgent','#ef4444',3,1);

/* reply_types مطابق للمركزية */
INSERT INTO reply_types (ReplyTypeID, NameAr, NameEn, IsActive, SortOrder) VALUES
(1, 'الإغلاق وانتظار التواصل',               'Closed – awaiting contact',                        1, 1),
(2, 'تم إحالته إلى جهة الإختصاص برقم و تاريخ', 'Referred to competent entity with ref & date',      1, 2),
(3, 'تم تنفيذ الطلب',                          'Request fulfilled',                                  1, 3),
(4, 'تم رفض الطلب',                            'Request rejected',                                   1, 4),
(5, 'طلب تصعيد',                               'Escalation requested',                               1, 5),
(6, 'طلب تعديل',                               'Amendment requested',                                1, 6)
ON DUPLICATE KEY UPDATE
  NameAr=VALUES(NameAr), NameEn=VALUES(NameEn),
  IsActive=VALUES(IsActive), SortOrder=VALUES(SortOrder);

/* complaint_types (28 نوع) */
DROP TABLE IF EXISTS complaint_types;
CREATE TABLE complaint_types (
  ComplaintTypeID INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  TypeName   VARCHAR(100) NOT NULL,
  TypeCode   VARCHAR(50)  NULL,
  TypeNameEn VARCHAR(100) NULL,
  UNIQUE KEY uq_typecode (TypeCode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO complaint_types (ComplaintTypeID, TypeName, TypeCode, TypeNameEn) VALUES
(1 , 'طلب خدمة', 'SERVICE_REQUEST', 'Service Request'),
(2 , 'المواعيد', 'APPOINTMENTS', 'Appointments'),
(3 , 'إجراءات متعلقة بدخول المريض', 'PATIENT_ADMISSION', 'Patient Admission'),
(4 , 'الوثائق والسجلات', 'DOCUMENTS', 'Documents & Records'),
(5 , 'الوصفات الطبية', 'PRESCRIPTIONS', 'Prescriptions'),
(6 , 'الأدوية', 'MEDICATIONS', 'Medications'),
(7 , 'إجراءات متعلقة بالتعامل مع المريض', 'PATIENT_CARE', 'Patient Care'),
(8 , 'الخطة العلاجية', 'TREATMENT_PLAN', 'Treatment Plan'),
(9 , 'طلب استعلام', 'INQUIRY', 'Inquiry'),
(10, 'الإجازات المرضية', 'SICK_LEAVE', 'Sick Leave'),
(11, 'طلب علاج / نقل', 'TREATMENT_TRANSFER', 'Treatment/Transfer'),
(12, 'التطعيمات', 'VACCINATIONS', 'Vaccinations'),
(13, 'عدم الإلتزام بمواعيد الدوام', 'ATTENDANCE', 'Attendance'),
(14, 'رعاية دون المستوى', 'SUBSTANDARD_CARE', 'Substandard Care'),
(15, 'إحالة مريض', 'PATIENT_REFERRAL', 'Patient Referral'),
(16, 'إجراءات متعلقة بالتحاليل المخبرية', 'LAB_PROCEDURES', 'Lab Procedures'),
(17, 'سوء معاملة', 'MISCONDUCT', 'Misconduct'),
(18, 'المستلزمات', 'SUPPLIES', 'Supplies'),
(19, 'مرافق المنشأة', 'FACILITIES', 'Facilities'),
(20, 'معاملات وزارة الصحة', 'MOH_TRANSACTIONS', 'MOH Transactions'),
(21, 'عطل في النظام', 'SYSTEM_OUTAGE', 'System Outage'),
(22, 'إجراءات متعلقة بالنتائج والفحوصات والأشعة', 'RESULTS_IMAGING', 'Results & Imaging'),
(23, 'طب المنزلي', 'HOME_HEALTHCARE', 'Home Healthcare'),
(24, 'خدمات نظام موعد', 'MAWID_SERVICES', 'Mawid Services'),
(25, 'تذاكر تطبيق موعد للمديريات', 'MAWID_TICKETS', 'Mawid Tickets'),
(26, 'الأمن والسلامة', 'SAFETY_SECURITY', 'Safety & Security'),
(27, 'الإجراءات العلاجية', 'CLINICAL_PROCEDURES', 'Clinical Procedures'),
(28, 'القوانين', 'REGULATIONS', 'Regulations')
ON DUPLICATE KEY UPDATE
  TypeName=VALUES(TypeName), TypeCode=VALUES(TypeCode), TypeNameEn=VALUES(TypeNameEn);

/* complaint_subtypes (فارغ الآن — عبّيه لاحقًا حسب حاجتك) */
DROP TABLE IF EXISTS complaint_subtypes;
CREATE TABLE complaint_subtypes (
  SubTypeID INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  ComplaintTypeID INT UNSIGNED NOT NULL,
  SubTypeName   VARCHAR(150) NOT NULL,
  SubTypeNameEn VARCHAR(150) NULL,
  KEY idx_subtype_type (ComplaintTypeID),
  CONSTRAINT fk_subtype_type FOREIGN KEY (ComplaintTypeID)
    REFERENCES complaint_types(ComplaintTypeID)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- priority_keywords (القائمة التي أرسلتيها) — Unique(Keyword) يمنع التكرار
INSERT IGNORE INTO priority_keywords (KeywordID, Keyword, PriorityCode, Category, CreatedAt) VALUES
(1,'سوء معاملة','urgent','سوء معاملة / تحرش','2025-10-12 12:29:50'),
(2,'تحرش','urgent','سوء معاملة / تحرش','2025-10-12 12:29:50'),
(3,'اعتداء','urgent','سوء معاملة / تحرش','2025-10-12 12:29:50'),
(4,'تهديد','urgent','سوء معاملة / تحرش','2025-10-12 12:29:50'),
(5,'إساءة','urgent','سوء معاملة / تحرش','2025-10-12 12:29:50'),
(6,'عنف','urgent','سوء معاملة / تحرش','2025-10-12 12:29:50'),
(7,'تعطل جهاز','urgent','الأجهزة','2025-10-12 12:29:50'),
(8,'تعطل أجهزة','urgent','الأجهزة','2025-10-12 12:29:50'),
(9,'MRI','urgent','الأجهزة','2025-10-12 12:29:50'),
(10,'CT','urgent','الأجهزة','2025-10-12 12:29:50'),
(11,'Cath-Lab','urgent','الأجهزة','2025-10-12 12:29:50'),
(12,'Angiography','urgent','الأجهزة','2025-10-12 12:29:50'),
(13,'نقص دواء','urgent','نقص الأدوية','2025-10-12 12:29:50'),
(14,'نفاد دواء','urgent','نقص الأدوية','2025-10-12 12:29:50'),
(15,'عدم توفر دواء','urgent','نقص الأدوية','2025-10-12 12:29:50'),
(16,'عدم توفر أدوية','urgent','نقص الأدوية','2025-10-12 12:29:50'),
(17,'دواء مفقود','urgent','نقص الأدوية','2025-10-12 12:29:50'),
(18,'تأخر استقبال','urgent','الطوارئ','2025-10-12 12:29:50'),
(19,'تحويل طارئ','urgent','الطوارئ','2025-10-12 12:29:50'),
(20,'تأخر إسعاف','urgent','الطوارئ','2025-10-12 12:29:50'),
(21,'طوارئ','urgent','الطوارئ','2025-10-12 12:29:50'),
(22,'حالة حرجة','urgent','الطوارئ','2025-10-12 12:29:50'),
(23,'ملاحظات عامة','low','ملاحظات عامة','2025-10-12 12:30:34'),
(24,'ملاخظات عامة','low','ملاحظات عامة','2025-10-12 12:30:34'),
(25,'ابغى اغير موعد','low','المواعيد','2025-10-12 12:30:34'),
(26,'أبغى أغير موعد','low','المواعيد','2025-10-12 12:30:34'),
(27,'تغيير موعد','low','المواعيد','2025-10-12 12:30:34'),
(28,'ابغى المكان يكون افضل','low','تحسين بيئة المكان','2025-10-12 12:30:34'),
(29,'أبغى المكان يكون أفضل','low','تحسين بيئة المكان','2025-10-12 12:30:34'),
(30,'ابغى غرفة خاصة','low','إقامة/غرف','2025-10-12 12:30:34'),
(31,'أبغى غرفة خاصة','low','إقامة/غرف','2025-10-12 12:30:34'),
(32,'غرفة خاصة','low','إقامة/غرف','2025-10-12 12:30:34'),
(33,'تأخر موعد','medium','المواعيد','2025-10-12 12:30:55'),
(34,'تأخير موعد','medium','المواعيد','2025-10-12 12:30:55'),
(35,'ازدحام','medium','الانتظار','2025-10-12 12:30:55'),
(36,'انتظار طويل','medium','الانتظار','2025-10-12 12:30:55'),
(37,'سوء نظافة بسيط','medium','النظافة','2025-10-12 12:30:55'),
(38,'طلب متابعة','medium','متابعة بلاغ','2025-10-12 12:30:55'),
(39,'تأخر موعد','medium','المواعيد','2025-10-12 12:32:43'),
(40,'تأخير موعد','medium','المواعيد','2025-10-12 12:32:43'),
(41,'ازدحام','medium','الانتظار','2025-10-12 12:32:43'),
(42,'انتظار طويل','medium','الانتظار','2025-10-12 12:32:43'),
(43,'سوء نظافة بسيط','medium','النظافة','2025-10-12 12:32:43'),
(44,'طلب متابعة','medium','متابعة بلاغ','2025-10-12 12:32:43'),
(45,'ملاحظات عامة','low','ملاحظات عامة','2025-10-12 12:32:52'),
(46,'ملاخظات عامة','low','ملاحظات عامة','2025-10-12 12:32:52'),
(47,'ابغى اغير موعد','low','المواعيد','2025-10-12 12:32:52'),
(48,'أبغى أغير موعد','low','المواعيد','2025-10-12 12:32:52'),
(49,'تغيير موعد','low','المواعيد','2025-10-12 12:32:52'),
(50,'ابغى المكان يكون افضل','low','تحسين بيئة المكان','2025-10-12 12:32:52'),
(51,'أبغى المكان يكون أفضل','low','تحسين بيئة المكان','2025-10-12 12:32:52'),
(52,'ابغى غرفة خاصة','low','إقامة/غرف','2025-10-12 12:32:52'),
(53,'أبغى غرفة خاصة','low','إقامة/غرف','2025-10-12 12:32:52'),
(54,'غرفة خاصة','low','إقامة/غرف','2025-10-12 12:32:52'),
(55,'تحرش','urgent','سوء معاملة/تحرش','2025-10-12 15:10:00'),
(56,'اعتداء','urgent','سوء معاملة/تحرش','2025-10-12 15:10:00'),
(57,'تعطل أجهزة','urgent','الأجهزة','2025-10-12 15:10:00'),
(58,'MRI','urgent','الأجهزة','2025-10-12 15:10:00'),
(59,'CT','urgent','الأجهزة','2025-10-12 15:10:00'),
(60,'Cath-Lab','urgent','الأجهزة','2025-10-12 15:10:00'),
(61,'نقص دواء','urgent','نقص الأدوية','2025-10-12 15:10:00'),
(62,'عدم توفر أدوية','urgent','نقص الأدوية','2025-10-12 15:10:00'),
(63,'طوارئ','urgent','الطوارئ','2025-10-12 15:10:00'),
(64,'حالة حرجة','urgent','الطوارئ','2025-10-12 15:10:00'),
(65,'عطل','urgent','الأجهزة','2025-10-12 15:10:00'),
(66,'توقف','urgent','الأجهزة','2025-10-12 15:10:00'),
(67,'وفاة','urgent','الوفاة','2025-10-12 15:10:00'),
(68,'حادث','urgent','الحوادث','2025-10-12 15:10:00'),
(69,'إصابات','urgent','الإصابات','2025-10-12 15:10:00'),
(70,'تأخير موعد','medium','المواعيد','2025-10-12 15:10:00'),
(71,'انتظار طويل','medium','الانتظار','2025-10-12 15:10:00'),
(72,'تأخير','medium','التأخير','2025-10-12 15:10:00'),
(73,'مشكلة','medium','المشاكل','2025-10-12 15:10:00'),
(74,'شكوى','medium','الشكاوى','2025-10-12 15:10:00'),
(75,'ملاحظات عامة','low','ملاحظات عامة','2025-10-12 15:10:00'),
(76,'غرفة خاصة','low','إقامة/غرف','2025-10-12 15:10:00'),
(77,'اقتراح','low','الاقتراحات','2025-10-12 15:10:00'),
(78,'استفسار','low','الاستفسارات','2025-10-12 15:10:00');
INSERT IGNORE INTO priority_keywords (Keyword, PriorityCode, Category) VALUES
('سوء معاملة','urgent','سوء معاملة/تحرش'),
('سلوك مسيء','urgent','سوء معاملة/تحرش'),
('إساءة','urgent','سوء معاملة/تحرش'),
('إهانة','urgent','سوء معاملة/تحرش'),
('إهانات','urgent','سوء معاملة/تحرش'),
('قلة أدب','urgent','سوء معاملة/تحرش'),
('قلة احترام','urgent','سوء معاملة/تحرش'),
('تهكم','urgent','سوء معاملة/تحرش'),
('سخرية','urgent','سوء معاملة/تحرش'),
('تنمّر','urgent','سوء معاملة/تحرش'),
('شتم','urgent','سوء معاملة/تحرش'),
('شتمني','urgent','سوء معاملة/تحرش'),
('سب','urgent','سوء معاملة/تحرش'),
('سبني','urgent','سوء معاملة/تحرش'),
('كلام جارح','urgent','سوء معاملة/تحرش'),
('كلام بذيء','urgent','سوء معاملة/تحرش'),
('صراخ','urgent','سوء معاملة/تحرش'),
('تعنيف','urgent','سوء معاملة/تحرش'),
('تهديد','urgent','سوء معاملة/تحرش'),
('تهديد بالقتل','urgent','سوء معاملة/تحرش'),
('تهديد بالعنف','urgent','سوء معاملة/تحرش'),
('ابتزاز','urgent','سوء معاملة/تحرش'),
('إجبار','urgent','سوء معاملة/تحرش'),
('تحرش','urgent','سوء معاملة/تحرش'),
('تحرش لفظي','urgent','سوء معاملة/تحرش'),
('تحرش جسدي','urgent','سوء معاملة/تحرش'),
('تحرش جنسي','urgent','سوء معاملة/تحرش'),
('لامسني','urgent','سوء معاملة/تحرش'),
('لمس غير لائق','urgent','سوء معاملة/تحرش'),
('مسكتي','urgent','سوء معاملة/تحرش'),
('تحكم جسدي','urgent','سوء معاملة/تحرش'),
('تحرش بالموظف','urgent','سوء معاملة/تحرش'),
('تحرش بالعميل','urgent','سوء معاملة/تحرش'),
('تمييز','urgent','سوء معاملة/تحرش'),
('عنصرية','urgent','سوء معاملة/تحرش'),
('طردني','urgent','سوء معاملة/تحرش'),
('رماني برا','urgent','سوء معاملة/تحرش'),
('رفض خدمتي بسبب شكلي','urgent','سوء معاملة/تحرش'),
('استغلال','urgent','سوء معاملة/تحرش'),
('استفزاز','urgent','سوء معاملة/تحرش'),
('تطاول','urgent','سوء معاملة/تحرش'),
('دفعني','urgent','سوء معاملة/تحرش'),
('ضربني','urgent','سوء معاملة/تحرش'),
('ركلني','urgent','سوء معاملة/تحرش'),
('بصق علي','urgent','سوء معاملة/تحرش');


-- =========================================================
-- 8) بيانات تجريبية بسيطة (اختياري) — احذفيها في الإنتاج
-- =========================================================
-- ✅ إدخال بيانات complaint_subtypes
INSERT INTO complaint_subtypes (SubTypeID, ComplaintTypeID, SubTypeName, SubTypeNameEn)
VALUES
(1, 2, 'تأخير موعد', 'Appointment Delay'),
(2, 2, 'إلغاء موعد', 'Appointment Cancellation'),
(3, 2, 'تغيير موعد', 'Reschedule'),
(4, 2, 'عدم تأكيد الموعد', 'No Confirmation'),
(8, 2, 'تأخير موعد', 'Appointment Delay'),
(9, 2, 'إلغاء موعد', 'Appointment Cancellation'),
(10, 2, 'تغيير موعد', 'Reschedule'),
(11, 2, 'عدم تأكيد الموعد', 'No Confirmation'),
(15, 1, 'طلب تقرير طبي', 'Medical Report Request'),
(16, 1, 'فتح ملف', 'Open File'),
(17, 1, 'تسهيل خدمة', 'Service Facilitation'),
(18, 3, 'تأخر إنهاء إجراءات الدخول', 'Admission Delay'),
(19, 3, 'نقص مستندات', 'Missing Documents'),
(20, 3, 'إلغاء دخول', 'Admission Cancellation'),
(21, 4, 'تقرير طبي', 'Medical Report'),
(22, 4, 'إفادة', 'Certification'),
(23, 4, 'تصديق', 'Attestation'),
(24, 4, 'بيان مراجعات', 'Visit Statement'),
(28, 5, 'تأخر صرف وصفة', 'Prescription Delay'),
(29, 5, 'أخطاء وصفة', 'Prescription Error'),
(30, 5, 'رفض صرف', 'Refusal to Dispense'),
(31, 6, 'نقص دواء', 'Drug Shortage'),
(32, 6, 'دواء بديل', 'Alternative Drug'),
(33, 6, 'دواء منقطع', 'Drug Out of Stock'),
(34, 7, 'سوء معاملة', 'Misconduct'),
(35, 7, 'تأخر استجابة', 'Delayed Response'),
(36, 7, 'عدم تجاوب', 'No Response'),
(37, 8, 'تعديل خطة', 'Plan Amendment'),
(38, 8, 'توضيح خطة', 'Plan Clarification'),
(39, 8, 'اعتراض على خطة', 'Plan Objection'),
(40, 9, 'حالة الطلب', 'Request Status'),
(41, 9, 'معلومة عامة', 'General Info'),
(42, 9, 'تحديث بيانات', 'Data Update'),
(43, 10, 'إصدار إجازة', 'Issue Sick Leave'),
(44, 10, 'تمديد إجازة', 'Extend Sick Leave'),
(45, 10, 'اعتماد إجازة', 'Approve Sick Leave'),
(46, 22, 'تأخر نتيجة', 'Result Delay'),
(47, 22, 'تصحيح نتيجة', 'Result Correction'),
(48, 22, 'تسليم تقرير أشعة', 'Imaging Report Delivery'),
(49, 22, 'تأخر نتيجة', 'Result Delay'),
(50, 22, 'تصحيح نتيجة', 'Result Correction'),
(51, 22, 'تسليم تقرير أشعة', 'Imaging Report Delivery'),
(52, 22, 'تأخر نتيجة', 'Result Delay'),
(53, 22, 'تصحيح نتيجة', 'Result Correction'),
(54, 22, 'تسليم تقرير أشعة', 'Imaging Report Delivery'),
(55, 21, 'انقطاع نظام', 'System Down'),
(56, 21, 'بطء النظام', 'System Slowness'),
(57, 21, 'فشل إدخال بيانات', 'Data Entry Failure'),
(58, 26, 'مخالفة سلامة', 'Safety Violation'),
(59, 26, 'حادث', 'Incident'),
(60, 26, 'ملاحظة وقائية', 'Preventive Note'),
(61, 19, 'نظافة', 'Cleaning'),
(62, 19, 'صيانة', 'Maintenance'),
(63, 19, 'تكييف', 'Air Conditioning'),
(64, 19, 'مصاعد', 'Elevators'),
(68, 18, 'نقص مستلزمات', 'Supplies Shortage'),
(69, 18, 'تأخر توريد', 'Delayed Supply'),
(70, 18, 'جودة منخفضة', 'Low Quality');
 


 -- =========================================================
-- Table: logs
-- وصف: لتخزين سجل العمليات (Logs) في النظام
-- =========================================================

CREATE TABLE `logs` (
  `LogID` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `HospitalID` INT UNSIGNED NOT NULL,
  `ActorUserID` INT UNSIGNED NOT NULL,
  `ActionCode` VARCHAR(50) NOT NULL,
  `ActionAr` VARCHAR(150) NOT NULL,
  `Details` TEXT NULL,
  `CreatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- ✅ الفهارس لتحسين الأداء
  INDEX `idx_logs_hospital` (`HospitalID`),
  INDEX `idx_logs_actor` (`ActorUserID`),
  INDEX `idx_logs_action` (`ActionCode`),

  -- (اختياري) مفاتيح خارجية لو كان عندك جداول hospitals و users
  CONSTRAINT `fk_logs_hospital`
    FOREIGN KEY (`HospitalID`) REFERENCES `hospitals` (`HospitalID`)
    ON DELETE CASCADE ON UPDATE CASCADE,
    
  CONSTRAINT `fk_logs_user`
    FOREIGN KEY (`ActorUserID`) REFERENCES `users` (`UserID`)
    ON DELETE SET NULL ON UPDATE CASCADE
) 
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;



-- =========================================================
-- Table: trash_bin
-- وصف: سلة المحذوفات لتتبع الكيانات المحذوفة واستعادتها أو تنظيفها
-- =========================================================
CREATE TABLE `trash_bin` (
  `TrashID` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `HospitalID` INT UNSIGNED NOT NULL,
  `SourceDB` VARCHAR(100) NOT NULL,
  `EntityType` ENUM('HOSPITAL','DEPARTMENT','COMPLAINT','USER','ATTACHMENT','OTHER') NOT NULL,
  `EntityTable` VARCHAR(100) NOT NULL,
  `EntityID` BIGINT UNSIGNED NOT NULL,
  `EntityTitle` VARCHAR(255) NULL,
  `EntitySnapshot` JSON NULL,
  `DeleteReason` VARCHAR(255) NULL,
  `DeletedByUserID` INT UNSIGNED NULL,
  `DeletedAt` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `RestoredAt` DATETIME NULL,
  `RestoredByUserID` INT UNSIGNED NULL,
  `PurgedAt` DATETIME NULL,
  `PurgedByUserID` INT UNSIGNED NULL,
  `Notes` VARCHAR(255) NULL,

  -- فهارس
  INDEX `idx_trash_hospital` (`HospitalID`),
  INDEX `idx_trash_entity` (`EntityType`),
  INDEX `idx_trash_table_id` (`EntityTable`, `EntityID`),
  INDEX `idx_trash_deletedat` (`DeletedAt`)
)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;

-- جدول تاريخ تحويلات الموظفين
CREATE TABLE IF NOT EXISTS complaint_assignee_history (
  HistoryID        BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ComplaintID      BIGINT UNSIGNED NOT NULL,
  FromUserID       INT UNSIGNED NULL,
  ToUserID         INT UNSIGNED NOT NULL,
  Note             VARCHAR(500) NULL,
  ChangedByUserID  INT UNSIGNED NOT NULL,
  ChangedAt        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_cah_complaint (ComplaintID),
  INDEX idx_cah_to_user (ToUserID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- تأكد من وجود جدول permissions
CREATE TABLE IF NOT EXISTS permissions (
  PermissionKey VARCHAR(64) PRIMARY KEY,
  NameAr        VARCHAR(150) NOT NULL,
  Category      VARCHAR(50)  NOT NULL
);

-- أضف/ثبّت كل مفاتيح نظام البلاغات الحديثة
INSERT IGNORE INTO permissions (PermissionKey, NameAr, Category) VALUES
('COMPLAINT_SUBMIT',         'تقديم بلاغ',                    'complaints'),
('COMPLAINT_VIEW',           'عرض/متابعة البلاغات',            'complaints'),
('COMPLAINT_HISTORY_SCOPE',  'نطاق سجل البلاغات',              'complaints'),
('COMPLAINT_REPLY',          'الرد على البلاغ',                'complaints'),
('COMPLAINT_STATUS_UPDATE',  'تغيير حالة البلاغ',              'complaints'),
('COMPLAINT_DELETE',         'حذف البلاغ',                     'complaints'),
('COMPLAINT_TRANSFER',       'تحويل البلاغ (عام)',             'complaints'),
('COMPLAINT_TRANSFER_DEPT',  'تحويل بين الأقسام',              'complaints'),
('COMPLAINT_TRANSFER_USER',  'تحويل بين الموظفين',             'complaints'),
('ADMIN_PANEL_ACCESS',       'لوحة الإدارة',                   'system');


-- 2) جدول user_permissions (القلب)
CREATE TABLE IF NOT EXISTS user_permissions (
  UserID          INT UNSIGNED NOT NULL,
  HospitalID      INT UNSIGNED NOT NULL,
  PermissionKey   VARCHAR(64)  NOT NULL,
  ViewScope       ENUM('HOSPITAL','DEPARTMENT','ASSIGNED') NULL,
  GrantedByUserID INT UNSIGNED NULL,
  GrantedAt       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (UserID, HospitalID, PermissionKey),
  FOREIGN KEY (PermissionKey) REFERENCES permissions(PermissionKey) ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX idx_user_hospital (UserID, HospitalID),
  INDEX idx_permission (PermissionKey)
);

-- 3) جدول role_default_permissions (اختياري لكن مفيد لاحقًا)
CREATE TABLE IF NOT EXISTS role_default_permissions (
  RoleID              TINYINT UNSIGNED NOT NULL,
  PermissionKey       VARCHAR(64) NOT NULL,
  DefaultViewScope    ENUM('HOSPITAL','DEPARTMENT','ASSIGNED') NULL,
  PRIMARY KEY (RoleID, PermissionKey),
  FOREIGN KEY (PermissionKey) REFERENCES permissions(PermissionKey) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE mystery_complaints (
  MysteryID BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  HospitalID INT UNSIGNED NOT NULL,
  VisitDate DATE DEFAULT NULL,                -- تاريخ الزيارة
  DepartmentID INT UNSIGNED DEFAULT NULL,     -- القسم المرتبط (اختياري)
  DepartmentName VARCHAR(200) DEFAULT NULL,   -- اسم القسم / الموقع
  DomainAr VARCHAR(200) DEFAULT NULL,         -- المجال بالعربية (مثلاً: النظافة، التعامل...)
  DomainEn VARCHAR(200) DEFAULT NULL,         -- المجال بالإنجليزية
  QuestionAr TEXT DEFAULT NULL,               -- السؤال بالعربية
  QuestionEn TEXT DEFAULT NULL,               -- السؤال بالإنجليزية
  MeanScore DECIMAL(5,2) DEFAULT NULL,        -- متوسط التقييم (من الإكسل)
  Score DECIMAL(5,2) DEFAULT NULL,            -- في حال كان رقم واحد فقط
  Comment TEXT DEFAULT NULL,                  -- ملاحظات المقيّم / الزائر السري
  Priority ENUM('LOW','MEDIUM','HIGH','CRITICAL') DEFAULT 'LOW', -- أولوية
  Status ENUM('OPEN','IN_PROGRESS','CLOSED') DEFAULT 'OPEN',      -- حالة المتابعة
  SourceFile VARCHAR(255) DEFAULT NULL,       -- اسم ملف الإكسل الذي أُخذت منه البيانات
  CreatedByUserID INT UNSIGNED DEFAULT NULL,  -- من رفع الإكسل
  CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_hospital (HospitalID),
  INDEX idx_visit_date (VisitDate),
  INDEX idx_status (Status),
  INDEX idx_priority (Priority)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
ALTER TABLE mystery_complaints
  ADD COLUMN TicketNumber VARCHAR(50) DEFAULT NULL AFTER Score,
  ADD COLUMN PeriodFrom DATE DEFAULT NULL AFTER VisitDate,
  ADD COLUMN PeriodTo   DATE DEFAULT NULL AFTER PeriodFrom,
  ADD INDEX idx_ticket (TicketNumber),
  ADD INDEX idx_period_from (PeriodFrom),
  ADD INDEX idx_period_to (PeriodTo);


INSERT IGNORE INTO permissions (PermissionKey, NameAr, Category) VALUES
('ADMIN_DEPARTMENTS', 'إدارة الأقسام', 'system'),
('ADMIN_HOSPITAL',    'إدارة المستشفى', 'system'),
('ADMIN_CLUSTERS',    'إدارة المستشفيات (التجمع)', 'system');


INSERT IGNORE INTO permissions (PermissionKey, NameAr,  Category)
VALUES (
  'HOSPITAL_CREATE',
  'إضافة مستشفى',
  'cluster'
);

INSERT IGNORE INTO permissions (PermissionKey, NameAr, Category) VALUES
('HOSPITAL_TRASH',      'إدارة المحذوفات',         'hospital'),
('HOSPITAL_LOGS',       'عرض السجلات',                 'hospital'),
('HOSPITAL_PERMISSIONS','إدارة الصلاحيات',   'hospital'),
('HOSPITAL_USERS',      'إدارة المستخدمين',      'hospital');

INSERT IGNORE INTO permissions (PermissionKey, NameAr, Category) VALUES
('IMPROVEMENT_CREATE', 'إنشاء مشاريع تحسينية', 'improvement');

INSERT IGNORE INTO permissions (PermissionKey, NameAr,  Category)
VALUES (
  'HOSPITAL_USER_CREATE',
  'إضافة مستخدم جديد',
  'hospital'
);

INSERT IGNORE INTO permissions (PermissionKey, NameAr, Category)
VALUES (
  'HOSPITAL_USER_DELETE',
  'حذف المستخدم',
  'hospital'
);

INSERT IGNORE INTO permissions (PermissionKey, NameAr, Category)
VALUES (
  'HOSPITAL_USER_EDIT',
  'تعديل المستخدم',
  'hospital'
);
INSERT IGNORE INTO permissions (PermissionKey, NameAr, Category) VALUES
('IMPORTS_PAGE',             'عرض صفحة إرفاق الإكسل',           'imports'),
('IMPORTS_DEPARTMENTS',      'استيراد إكسل الأقسام',            'imports'),
('IMPORTS_MYSTERY',          'استيراد إكسل الزائر السري',       'imports'),
('IMPORTS_937',              'استيراد إكسل بلاغات 937',         'imports');


-- إضافة مفاتيح لوحة التحكم في قاعدة المستشفى
-- Dashboard permissions seed for tenant databases

INSERT IGNORE INTO permissions (PermissionKey, NameAr, Category) VALUES
('DASH_PAGE',                  'عرض لوحة التحكم',                'dashboard'),
('DASH_CARD_TOTALS',           'بطاقة إجمالي البلاغات',          'dashboard'),
('DASH_CARD_OPEN',             'بطاقة البلاغات المفتوحة',        'dashboard'),
('DASH_CARD_CLOSED',           'بطاقة البلاغات المغلقة',         'dashboard'),
('DASH_CARD_URGENT',           'بطاقة البلاغات الحرجة',          'dashboard'),
('DASH_CARD_CLOSE_RATE',       'بطاقة معدل الإغلاق',             'dashboard'),
('DASH_CARD_HOSPITAL_COUNT',   'بطاقة عدد المستشفيات',           'dashboard'),
('DASH_CHART_MYSTERY_BY_DEPT', 'رسم الزائر السري حسب الأقسام',   'dashboard'),
('DASH_CHART_CLASSIFICATIONS', 'رسم التصنيفات',                  'dashboard'),
('DASH_CHART_TOP_CLINICS',     'رسم أعلى العيادات',              'dashboard'),
('DASH_CHART_DAILY_TREND',     'رسم الشكاوى اليومية',            'dashboard'),
('DASH_URGENT_LIST',           'قائمة البلاغات الحمراء',         'dashboard');

INSERT IGNORE INTO permissions (PermissionKey, NameAr, Category) VALUES
('IMPROVEMENTS_MODULE',     'المشاريع التحسينية - الدخول للصفحة', 'improvements'),
('IMPROVEMENT_CREATE',      'إضافة مشروع تحسيني',                 'improvements'),
('IMPROVEMENT_VIEW',        'عرض مشروع تحسيني',                   'improvements'),
('IMPROVEMENT_EDIT',        'تعديل مشروع تحسيني',                 'improvements'),
('IMPROVEMENT_DELETE',      'حذف مشروع تحسيني',                   'improvements'),
('IMPROVEMENT_REPORT_VIEW', 'عرض تقرير المشروع التحسيني',         'improvements');
INSERT IGNORE INTO permissions (PermissionKey, NameAr, Category) VALUES
('MYSTERY_MODULE',              'الزائر السري - الدخول للصفحة',   'mystery'),
('MYSTERY_VIEW',                'عرض تقييم الزائر السري',         'mystery'),
('MYSTERY_REPLY_ADD',           'إضافة رد/تعليق على التقييم',     'mystery'),
('MYSTERY_STATUS_UPDATE',       'تغيير حالة التقييم',             'mystery'),
('MYSTERY_TRANSFER_DEPT',       'تحويل التقييم بين الأقسام',       'mystery'),
('MYSTERY_TRANSFER_EMP',        'تحويل التقييم بين الموظفين',      'mystery'),
('MYSTERY_DELETE',              'حذف تقييم الزائر السري',          'mystery');

INSERT IGNORE INTO permissions (PermissionKey, NameAr, Category) VALUES
-- صفحة التقارير
('REPORTS_PAGE',                         'عرض صفحة التقارير والإحصائيات',              'reports'),

-- البطاقات KPIs أعلى الصفحة
('REPORTS_CARD_TOTALS',                  'بطاقة إجمالي البلاغات',                       'reports'),
('REPORTS_CARD_OPEN',                    'بطاقة البلاغات المفتوحة',                     'reports'),
('REPORTS_CARD_CLOSED',                  'بطاقة البلاغات المغلقة',                      'reports'),
('REPORTS_CARD_URGENT',                  'بطاقة البلاغات الحرجة',                       'reports'),
('REPORTS_CARD_SLA',                     'بطاقة الالتزام بالـ SLA',                     'reports'),
('REPORTS_CARD_HOSPITALS',               'بطاقة عدد المستشفيات',                         'reports'),

-- الرسومات حسب صورك
('REPORTS_CHART_BY_HOSPITAL_TYPE',       'عدد البلاغات حسب نوعها في كل مستشفى',          'reports'),
('REPORTS_CHART_STATUS_DISTRIBUTION',    'توزيع حالات البلاغات (دونات)',                 'reports'),
('REPORTS_CHART_TREND_6M',               'اتجاه البلاغات (آخر 6 أشهر)',                   'reports'),
('REPORTS_CHART_URGENT_PERCENT',         'نسبة البلاغات الحرجة في كل مستشفى',             'reports'),
('REPORTS_CHART_BY_DEPARTMENT',          'عدد البلاغات لكل قسم (مع فلتر المستشفى)',       'reports'),

('REPORTS_CHART_TOP_EMPLOYEES',          'الموظفون الأكثر تكرّرًا في البلاغات',              'reports');


INSERT IGNORE INTO permissions (PermissionKey, NameAr, Category) VALUES
('CLUSTER_REPORTS_MODULE',  'الدخول لموديول بلاغات إدارة التجمع',   'cluster_reports'),
('CLUSTER_REPORT_CREATE',   'تقديم بلاغ إدارة التجمع',              'cluster_reports'),
('CLUSTER_REPORT_VIEW',     'عرض بلاغات إدارة التجمع',              'cluster_reports'),
('CLUSTER_REPORT_DETAILS',  'عرض تفاصيل بلاغ إدارة التجمع',         'cluster_reports'),
('CLUSTER_REPORT_REPLY',    'الرد على بلاغ إدارة التجمع',           'cluster_reports'),
('CLUSTER_REPORT_STATUS',   'تغيير حالة بلاغ إدارة التجمع',         'cluster_reports');


INSERT IGNORE INTO permissions (PermissionKey, NameAr, Category) VALUES
('ARCHIVE_VIEW',   'عرض الأرشيف',       'archive'),
('ARCHIVE_UPLOAD', 'إضافة مرفقات للأرشيف', 'archive');

CREATE TABLE IF NOT EXISTS improvement_projects (
  ProjectID BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  HospitalID INT UNSIGNED NOT NULL,
  Title VARCHAR(200) NOT NULL,
  ProblemStatement TEXT NULL,
  AimStatement TEXT NULL,
  DepartmentID INT UNSIGNED NULL,
  ComplaintTypeID INT UNSIGNED NULL,
  ComplaintSubTypeID INT UNSIGNED NULL,
  Priority ENUM('LOW','MEDIUM','HIGH','CRITICAL') DEFAULT 'MEDIUM',
  Status ENUM('DRAFT','PROPOSED','APPROVED','IN_PROGRESS','COMPLETED','CANCELLED') DEFAULT 'DRAFT',
  ExpectedImpact VARCHAR(255) NULL,
  StartDate DATE NULL,
  DueDate DATE NULL,
  BudgetEstimate DECIMAL(12,2) NULL,
  OwnerUserID INT UNSIGNED NULL,
  CreatedByUserID INT UNSIGNED NULL,
  CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  IsDeleted TINYINT(1) DEFAULT 0
);



-- جدول ردود تقييمات الزائر السري
CREATE TABLE IF NOT EXISTS mystery_responses (
  ResponseID BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  MysteryID  BIGINT UNSIGNED NOT NULL,
  ResponderUserID INT UNSIGNED NOT NULL,
  ReplyTypeID INT UNSIGNED NULL,
  TargetStatusCode VARCHAR(20) NULL,
  Message TEXT NOT NULL,
  IsInternal TINYINT(1) DEFAULT 0,
  CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (MysteryID),
  CONSTRAINT fk_mr_mystery FOREIGN KEY (MysteryID) REFERENCES mystery_complaints(MysteryID),
  CONSTRAINT fk_mr_user    FOREIGN KEY (ResponderUserID) REFERENCES users(UserID)
);

-- جدول مرفقات ردود تقييمات الزائر السري
CREATE TABLE IF NOT EXISTS mystery_response_attachments (
  RespAttachmentID BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ResponseID BIGINT UNSIGNED NOT NULL,
  FileName   VARCHAR(255) NOT NULL,
  FilePath   VARCHAR(500) NOT NULL,
  FileSize   BIGINT UNSIGNED DEFAULT 0,
  UploadedByUserID INT UNSIGNED NULL,
  UploadDate DATETIME NULL,
  Description VARCHAR(255) NULL,
  INDEX (ResponseID),
  CONSTRAINT fk_mra_resp FOREIGN KEY (ResponseID) REFERENCES mystery_responses(ResponseID)
);

-- 1) إضافة عمود المكلّف الحالي + فهارس
ALTER TABLE mystery_complaints
  ADD COLUMN AssignedToUserID INT UNSIGNED NULL AFTER DepartmentID,
  ADD INDEX idx_mystery_assignee (AssignedToUserID);

-- (اختياري لكن مفضل) FK لو users في نفس قاعدة المستشفى
ALTER TABLE mystery_complaints
  ADD CONSTRAINT fk_mystery_assignee_user
  FOREIGN KEY (AssignedToUserID) REFERENCES users(UserID);

-- 2) سجل تحويل الموظفين
CREATE TABLE IF NOT EXISTS mystery_assignee_history (
  HistoryID BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  MysteryID BIGINT UNSIGNED NOT NULL,
  FromUserID INT UNSIGNED NULL,
  ToUserID   INT UNSIGNED NOT NULL,
  Note VARCHAR(500) NULL,
  ChangedByUserID INT UNSIGNED NOT NULL,
  ChangedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (MysteryID),
  INDEX (ToUserID),
  CONSTRAINT fk_mah_mystery FOREIGN KEY (MysteryID) REFERENCES mystery_complaints(MysteryID),
  CONSTRAINT fk_mah_to_user FOREIGN KEY (ToUserID) REFERENCES users(UserID),
  CONSTRAINT fk_mah_by_user FOREIGN KEY (ChangedByUserID) REFERENCES users(UserID)
);

-- 3) سجل تحويل الأقسام
CREATE TABLE IF NOT EXISTS mystery_department_transfer_history (
  HistoryID BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  MysteryID BIGINT UNSIGNED NOT NULL,
  FromDepartmentID INT UNSIGNED NULL,
  ToDepartmentID   INT UNSIGNED NOT NULL,
  Note VARCHAR(500) NULL,
  ChangedByUserID INT UNSIGNED NOT NULL,
  ChangedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (MysteryID),
  INDEX (ToDepartmentID),
  CONSTRAINT fk_mdth_mystery FOREIGN KEY (MysteryID) REFERENCES mystery_complaints(MysteryID),
  CONSTRAINT fk_mdth_by_user FOREIGN KEY (ChangedByUserID) REFERENCES users(UserID)
);
CREATE TABLE IF NOT EXISTS role_default_permissions (
  RoleID TINYINT UNSIGNED,
  PermissionKey VARCHAR(64),
  DefaultViewScope ENUM('HOSPITAL','DEPARTMENT','ASSIGNED') DEFAULT 'HOSPITAL',
  PRIMARY KEY (RoleID, PermissionKey)
);
INSERT IGNORE INTO role_default_permissions (RoleID, PermissionKey, DefaultViewScope)
VALUES
(2, 'ADMIN_CLUSTERS', 'HOSPITAL'),
(2, 'ADMIN_DEPARTMENTS', 'HOSPITAL'),
(2, 'ADMIN_HOSPITAL', 'HOSPITAL'),
(2, 'ADMIN_PANEL_ACCESS', 'HOSPITAL'),
(2, 'COMPLAINT_DELETE', 'HOSPITAL'),
(2, 'COMPLAINT_HISTORY_SCOPE', 'HOSPITAL'),
(2, 'COMPLAINT_REPLY', 'HOSPITAL'),
(2, 'COMPLAINT_STATUS_UPDATE', 'HOSPITAL'),
(2, 'COMPLAINT_SUBMIT', 'HOSPITAL'),
(2, 'COMPLAINT_TRANSFER', 'HOSPITAL'),
(2, 'COMPLAINT_TRANSFER_DEPT', 'HOSPITAL'),
(2, 'COMPLAINT_TRANSFER_USER', 'HOSPITAL'),
(2, 'COMPLAINT_VIEW', 'HOSPITAL'),
(2, 'DASH_PAGE', 'HOSPITAL'),
(2, 'DASH_CARD_TOTALS', 'HOSPITAL'),
(2, 'DASH_CARD_OPEN', 'HOSPITAL'),
(2, 'DASH_CARD_CLOSED', 'HOSPITAL'),
(2, 'DASH_CARD_URGENT', 'HOSPITAL'),
(2, 'DASH_CARD_CLOSE_RATE', 'HOSPITAL'),
(2, 'DASH_CARD_HOSPITAL_COUNT', 'HOSPITAL'),
(2, 'DASH_CHART_CLASSIFICATIONS', 'HOSPITAL'),
(2, 'DASH_CHART_DAILY_TREND', 'HOSPITAL'),
(2, 'DASH_CHART_MYSTERY_BY_DEPT', 'HOSPITAL'),
(2, 'DASH_CHART_TOP_CLINICS', 'HOSPITAL'),
(2, 'DASH_URGENT_LIST', 'HOSPITAL'),
(2, 'HOSPITAL_CREATE', 'HOSPITAL'),
(2, 'HOSPITAL_LOGS', 'HOSPITAL'),
(2, 'HOSPITAL_PERMISSIONS', 'HOSPITAL'),
(2, 'HOSPITAL_TRASH', 'HOSPITAL'),
(2, 'HOSPITAL_USER_CREATE', 'HOSPITAL'),
(2, 'HOSPITAL_USER_EDIT', 'HOSPITAL'),
(2, 'HOSPITAL_USER_DELETE', 'HOSPITAL'),
(2, 'HOSPITAL_USERS', 'HOSPITAL'),
(2, 'IMPORTS_PAGE', 'HOSPITAL'),
(2, 'IMPORTS_937', 'HOSPITAL'),
(2, 'IMPORTS_DEPARTMENTS', 'HOSPITAL'),
(2, 'IMPORTS_MYSTERY', 'HOSPITAL'),
(2, 'IMPROVEMENTS_MODULE', 'HOSPITAL'),
(2, 'IMPROVEMENT_CREATE', 'HOSPITAL'),
(2, 'IMPROVEMENT_VIEW', 'HOSPITAL'),
(2, 'IMPROVEMENT_EDIT', 'HOSPITAL'),
(2, 'IMPROVEMENT_DELETE', 'HOSPITAL'),
(2, 'IMPROVEMENT_REPORT_VIEW', 'HOSPITAL'),
(2, 'MYSTERY_MODULE', 'HOSPITAL'),
(2, 'MYSTERY_VIEW', 'HOSPITAL'),
(2, 'MYSTERY_REPLY_ADD', 'HOSPITAL'),
(2, 'MYSTERY_STATUS_UPDATE', 'HOSPITAL'),
(2, 'MYSTERY_TRANSFER_DEPT', 'HOSPITAL'),
(2, 'MYSTERY_TRANSFER_EMP', 'HOSPITAL'),
(2, 'MYSTERY_DELETE', 'HOSPITAL'),
(2, 'REPORTS_PAGE', 'HOSPITAL'),
(2, 'REPORTS_CARD_TOTALS', 'HOSPITAL'),
(2, 'REPORTS_CARD_OPEN', 'HOSPITAL'),
(2, 'REPORTS_CARD_CLOSED', 'HOSPITAL'),
(2, 'REPORTS_CARD_URGENT', 'HOSPITAL'),
(2, 'REPORTS_CARD_SLA', 'HOSPITAL'),
(2, 'REPORTS_CARD_HOSPITALS', 'HOSPITAL'),
(2, 'REPORTS_CHART_BY_DEPARTMENT', 'HOSPITAL'),
(2, 'REPORTS_CHART_BY_HOSPITAL_TYPE', 'HOSPITAL'),
(2, 'REPORTS_CHART_STATUS_DISTRIBUTION', 'HOSPITAL'),
(2, 'REPORTS_CHART_TOP_EMPLOYEES', 'HOSPITAL'),
(2, 'REPORTS_CHART_TREND_6M', 'HOSPITAL'),
(2, 'REPORTS_CHART_URGENT_PERCENT', 'HOSPITAL'),
(2, 'SUBMIT_COMPLAINT', 'HOSPITAL'),
(2, 'TRACK_COMPLAINT', 'HOSPITAL'),
(2, 'VIEW_COMPLAINTS', 'HOSPITAL');
-- =========================================================
-- تننت: جداول بلاغات إدارة التجمع داخل قاعدة المستشفى
-- =========================================================
-- نفّذي هذا السكربت في كل قاعدة مستشفى (مثل: hosp_kbh, hosp_aaaa, ...)

CREATE TABLE IF NOT EXISTS cluster_reports (
  ReportID           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  GlobalID           CHAR(36)        NOT NULL,            -- UUID
  Title              VARCHAR(200)    NOT NULL,
  Description        TEXT            NOT NULL,
  LocationName       VARCHAR(200)    DEFAULT NULL,
  LocationType       ENUM('HOSPITAL','CLINIC','DEPARTMENT','OTHER') DEFAULT 'OTHER',
  DepartmentID       INT UNSIGNED    DEFAULT NULL,
  PriorityCode       ENUM('LOW','MEDIUM','HIGH','CRITICAL') DEFAULT 'MEDIUM',
  StatusCode         ENUM('OPEN','IN_PROGRESS','RESOLVED','CLOSED','CANCELLED') DEFAULT 'OPEN',
  ReporterUserID     INT UNSIGNED    NOT NULL,
  AssignedToUserID   INT UNSIGNED    DEFAULT NULL,
  CreatedAt          TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt          TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  IsDeleted          TINYINT(1)      NOT NULL DEFAULT 0,
  DeletedAt          DATETIME        DEFAULT NULL,
  DeleteReason       VARCHAR(255)    DEFAULT NULL,

  INDEX idx_cluster_reports_department (DepartmentID),
  INDEX idx_cluster_reports_status (StatusCode),
  INDEX idx_cluster_reports_priority (PriorityCode),
  UNIQUE KEY uq_cluster_reports_guid (GlobalID)
);

CREATE TABLE IF NOT EXISTS cluster_report_attachments (
  AttachmentID     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ReportID         BIGINT UNSIGNED NOT NULL,
  FileName         VARCHAR(255)    NOT NULL,
  FilePath         VARCHAR(400)    NOT NULL,
  MimeType         VARCHAR(150)    DEFAULT NULL,
  FileSize         BIGINT          DEFAULT NULL,
  UploadedByUserID INT UNSIGNED    NOT NULL,
  UploadedAt       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_cluster_attach_report (ReportID),
  CONSTRAINT fk_cluster_attach_report
    FOREIGN KEY (ReportID) REFERENCES cluster_reports(ReportID)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS cluster_report_responses (
  ResponseID       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ReportID         BIGINT UNSIGNED NOT NULL,
  ResponderUserID INT UNSIGNED    NOT NULL,
  Message          TEXT            NOT NULL,
  CreatedAt        TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_cluster_resp_report (ReportID),
  INDEX idx_cluster_resp_user (ResponderUserID),
  INDEX idx_cluster_resp_date (CreatedAt),
  CONSTRAINT fk_cluster_resp_report
    FOREIGN KEY (ReportID) REFERENCES cluster_reports(ReportID)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS file_archive (
  FileID           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  HospitalID       INT UNSIGNED NOT NULL,
  Category         VARCHAR(50)  DEFAULT NULL,
  SourceModule     VARCHAR(50)  DEFAULT NULL,
  OriginalName     VARCHAR(255) NOT NULL,
  StoredName       VARCHAR(255) NOT NULL,
  MimeType         VARCHAR(150) DEFAULT NULL,
  FileSizeBytes    BIGINT UNSIGNED DEFAULT 0,
  StoragePath      VARCHAR(400) NOT NULL,
  Notes            VARCHAR(255) DEFAULT NULL,
  UploadedByUserID INT UNSIGNED NOT NULL,
  UploadedAt       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  Sha256Hash       CHAR(64)     DEFAULT NULL,
  INDEX ix_filearchive_hosp (HospitalID),
  INDEX ix_filearchive_source (SourceModule),
  INDEX ix_filearchive_time (UploadedAt)
);
