/* =========================================================
   سكربت المزامنة للقاعدة المركزية
   Central Database Sync Setup
   
   Purpose: إعداد القاعدة المركزية لاستقبال ومعالجة أحداث المزامنة
            من قواعد بيانات المستشفيات
   
   Database: hospitals_mecca4 (المركزية)
   MySQL Version: 8.0+
   Charset: utf8mb4
   
   What it does:
   1. إضافة GlobalID لجدول البلاغات المركزي
   2. إنشاء جدول sync_inbox لاستقبال الأحداث
   3. إنشاء إجراءات المعالجة (upsert_complaint_from_json)
   4. إنشاء معالج الأحداث (process_inbox_row)
   
   ⚠️ ملاحظة: يُفترض أن جدول complaints موجود بالفعل في المركز
               إذا لم يكن موجودًا، راجع hospital_template.sql أولاً
   ========================================================= */

SET NAMES utf8mb4;
SET time_zone = '+03:00';
SET sql_mode = 'STRICT_ALL_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

-- =========================================================
-- 1) إضافة GlobalID للبلاغات + فهرس فريد
-- =========================================================
-- نضيف GlobalID كمفتاح عالمي فريد للمزامنة بين القواعد
-- القيم الحالية ستكون NULL، ستتعبأ تدريجياً من المستشفيات

ALTER TABLE complaints
  ADD COLUMN IF NOT EXISTS GlobalID CHAR(36) NULL AFTER ComplaintID,
  ADD UNIQUE KEY IF NOT EXISTS uq_complaints_globalid (GlobalID);

-- نضيف GlobalID للردود أيضاً
ALTER TABLE complaint_responses
  ADD COLUMN IF NOT EXISTS GlobalID CHAR(36) NULL AFTER ResponseID,
  ADD UNIQUE KEY IF NOT EXISTS uq_responses_globalid (GlobalID);

-- =========================================================
-- 2) جدول استقبال أحداث المستشفيات (Inbox)
-- =========================================================
-- هذا الجدول يستقبل الأحداث من Worker المزامنة
-- ويعمل كـ Queue للمعالجة

CREATE TABLE IF NOT EXISTS sync_inbox (
  InboxID        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  SourceHospitalID INT UNSIGNED NOT NULL,           -- HospitalID من جدول hospitals
  EntityType     ENUM('COMPLAINT','RESPONSE','ATTACHMENT') NOT NULL,
  Operation      ENUM('INSERT','UPDATE','DELETE') NOT NULL,
  GlobalID       CHAR(36) NULL,                     -- المفتاح العالمي للكيان
  EntityID       BIGINT UNSIGNED NULL,              -- المفتاح المحلي في المستشفى (للمرجعية)
  Payload        JSON NOT NULL,                     -- البيانات الكاملة للكيان
  CreatedAt      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ProcessedAt    DATETIME NULL,                     -- وقت المعالجة (NULL = لم يُعالج بعد)
  RetryCount     INT UNSIGNED NOT NULL DEFAULT 0,   -- عدد محاولات المعالجة
  ErrorMessage   TEXT NULL,                         -- رسالة الخطأ إن حدث
  PRIMARY KEY (InboxID),
  KEY idx_inbox_process (ProcessedAt, CreatedAt),   -- للبحث عن الأحداث غير المعالجة
  KEY idx_inbox_global (GlobalID),                  -- للبحث بالـ GlobalID
  KEY idx_inbox_hospital (SourceHospitalID),
  CONSTRAINT fk_inbox_hospital FOREIGN KEY (SourceHospitalID) 
    REFERENCES hospitals(HospitalID) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Inbox للأحداث الواردة من المستشفيات للمزامنة';

-- =========================================================
-- 3) دالة UPSERT للبلاغات من JSON
-- =========================================================
-- تستقبل Payload من الحدث وتُدخله أو تُحدثه بالمركز
-- تستخدم GlobalID كمفتاح للتطابق

DROP PROCEDURE IF EXISTS upsert_complaint_from_json;

DELIMITER $$
CREATE PROCEDURE upsert_complaint_from_json(
  IN p_payload JSON, 
  IN p_hospital_id INT
)
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    -- في حالة خطأ، نرجع رسالة الخطأ
    GET DIAGNOSTICS CONDITION 1
      @sqlstate = RETURNED_SQLSTATE,
      @errno = MYSQL_ERRNO,
      @text = MESSAGE_TEXT;
    SIGNAL SQLSTATE '45000' 
      SET MESSAGE_TEXT = CONCAT('upsert_complaint error: ', @text);
  END;

  /* استخراج الحقول الأساسية من JSON */
  SET @g  = JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.GlobalID'));
  SET @id = JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.ComplaintID'));   /* ID المحلي في المستشفى */
  SET @tk = JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.TicketNumber'));
  SET @h  = COALESCE(JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.HospitalID')), p_hospital_id);
  SET @d  = JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.DepartmentID'));
  SET @subm = JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.SubmissionType'));
  SET @vdate= JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.VisitDate'));
  SET @pname= JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.PatientFullName'));
  SET @pid  = JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.PatientIDNumber'));
  SET @pmob = JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.PatientMobile'));
  SET @gen  = JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.GenderCode'));
  SET @fnum = JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.FileNumber'));
  SET @ctype= JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.ComplaintTypeID'));
  SET @subt = JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.SubTypeID'));
  SET @desc = JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.Description'));
  SET @prio = JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.PriorityCode'));
  SET @stat = JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.StatusCode'));
  SET @cby  = JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.CreatedByUserID'));
  SET @cat  = JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.CreatedAt'));
  SET @uat  = JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.UpdatedAt'));
  SET @isdel= JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.IsDeleted'));
  SET @delat= JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.DeletedAt'));
  SET @delby= JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.DeletedByUserID'));
  SET @delrs= JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.DeleteReason'));

  /* التحقق من وجود GlobalID */
  IF @g IS NULL OR @g = '' OR @g = 'null' THEN
    SIGNAL SQLSTATE '45000' 
      SET MESSAGE_TEXT = 'Missing or invalid GlobalID in payload';
  END IF;

  /* UPSERT بناءً على GlobalID */
  INSERT INTO complaints (
    GlobalID, TicketNumber, HospitalID, DepartmentID, SubmissionType, VisitDate,
    PatientFullName, PatientIDNumber, PatientMobile, GenderCode, FileNumber,
    ComplaintTypeID, SubTypeID, Description, PriorityCode, StatusCode,
    CreatedByUserID, CreatedAt, UpdatedAt, IsDeleted, DeletedAt, DeletedByUserID, DeleteReason
  )
  VALUES (
    @g, 
    @tk, 
    @h, 
    NULLIF(@d,''), 
    NULLIF(@subm,''), 
    NULLIF(@vdate,''), 
    @pname, 
    NULLIF(@pid,''), 
    @pmob, 
    NULLIF(@gen,''), 
    NULLIF(@fnum,''),
    NULLIF(@ctype,''), 
    NULLIF(@subt,''), 
    @desc, 
    @prio, 
    @stat,
    NULLIF(@cby,''), 
    NULLIF(@cat,''), 
    NULLIF(@uat,''), 
    IFNULL(@isdel,0), 
    NULLIF(@delat,''), 
    NULLIF(@delby,''), 
    NULLIF(@delrs,'')
  )
  ON DUPLICATE KEY UPDATE
    TicketNumber = VALUES(TicketNumber),
    HospitalID   = VALUES(HospitalID),
    DepartmentID = VALUES(DepartmentID),
    SubmissionType = VALUES(SubmissionType),
    VisitDate    = VALUES(VisitDate),
    PatientFullName = VALUES(PatientFullName),
    PatientIDNumber = VALUES(PatientIDNumber),
    PatientMobile = VALUES(PatientMobile),
    GenderCode   = VALUES(GenderCode),
    FileNumber   = VALUES(FileNumber),
    ComplaintTypeID = VALUES(ComplaintTypeID),
    SubTypeID    = VALUES(SubTypeID),
    Description  = VALUES(Description),
    PriorityCode = VALUES(PriorityCode),
    StatusCode   = VALUES(StatusCode),
    CreatedByUserID = VALUES(CreatedByUserID),
    CreatedAt    = VALUES(CreatedAt),
    UpdatedAt    = VALUES(UpdatedAt),
    IsDeleted    = VALUES(IsDeleted),
    DeletedAt    = VALUES(DeletedAt),
    DeletedByUserID = VALUES(DeletedByUserID),
    DeleteReason = VALUES(DeleteReason);
END$$
DELIMITER ;

-- =========================================================
-- 4) دالة UPSERT للردود من JSON
-- =========================================================
DROP PROCEDURE IF EXISTS upsert_response_from_json;

DELIMITER $$
CREATE PROCEDURE upsert_response_from_json(
  IN p_payload JSON, 
  IN p_hospital_id INT
)
BEGIN
  DECLARE v_complaint_gid CHAR(36);
  DECLARE v_complaint_id BIGINT UNSIGNED;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    GET DIAGNOSTICS CONDITION 1
      @sqlstate = RETURNED_SQLSTATE,
      @text = MESSAGE_TEXT;
    SIGNAL SQLSTATE '45000' 
      SET MESSAGE_TEXT = CONCAT('upsert_response error: ', @text);
  END;

  /* استخراج الحقول */
  SET @g_resp = JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.GlobalID'));
  SET @g_comp = JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.ComplaintGlobalID'));
  SET @respuser = JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.ResponderUserID'));
  SET @replytype = JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.ReplyTypeID'));
  SET @targetstat = JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.TargetStatusCode'));
  SET @msg = JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.Message'));
  SET @isint = JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.IsInternal'));
  SET @cat = JSON_UNQUOTE(JSON_EXTRACT(p_payload, '$.CreatedAt'));

  /* التحقق من GlobalID للرد */
  IF @g_resp IS NULL OR @g_resp = '' OR @g_resp = 'null' THEN
    SIGNAL SQLSTATE '45000' 
      SET MESSAGE_TEXT = 'Missing response GlobalID';
  END IF;

  /* البحث عن ComplaintID المركزي من GlobalID */
  SELECT ComplaintID INTO v_complaint_id
  FROM complaints
  WHERE GlobalID = @g_comp
  LIMIT 1;

  IF v_complaint_id IS NULL THEN
    SIGNAL SQLSTATE '45000' 
      SET MESSAGE_TEXT = CONCAT('Complaint not found for GlobalID: ', @g_comp);
  END IF;

  /* UPSERT للرد */
  INSERT INTO complaint_responses (
    GlobalID, ComplaintID, ResponderUserID, ReplyTypeID, 
    TargetStatusCode, Message, IsInternal, CreatedAt
  )
  VALUES (
    @g_resp,
    v_complaint_id,
    NULLIF(@respuser,''),
    NULLIF(@replytype,''),
    NULLIF(@targetstat,''),
    @msg,
    IFNULL(@isint, 0),
    NULLIF(@cat,'')
  )
  ON DUPLICATE KEY UPDATE
    Message = VALUES(Message),
    TargetStatusCode = VALUES(TargetStatusCode),
    IsInternal = VALUES(IsInternal);
END$$
DELIMITER ;

-- =========================================================
-- 5) إجراء معالجة صف من Inbox
-- =========================================================
-- يقرأ حدث واحد من sync_inbox ويعالجه حسب نوعه

DROP PROCEDURE IF EXISTS process_inbox_row;

DELIMITER $$
CREATE PROCEDURE process_inbox_row(IN p_inbox_id BIGINT UNSIGNED)
BEGIN
  DECLARE v_op ENUM('INSERT','UPDATE','DELETE');
  DECLARE v_type ENUM('COMPLAINT','RESPONSE','ATTACHMENT');
  DECLARE v_hid INT;
  DECLARE v_payload JSON;
  DECLARE v_global_id CHAR(36);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    -- في حالة خطأ، نسجل الخطأ ونزيد عداد المحاولات
    GET DIAGNOSTICS CONDITION 1
      @text = MESSAGE_TEXT;
    
    UPDATE sync_inbox 
    SET RetryCount = RetryCount + 1,
        ErrorMessage = @text
    WHERE InboxID = p_inbox_id;
    
    SIGNAL SQLSTATE '45000' 
      SET MESSAGE_TEXT = @text;
  END;

  -- قفل الصف للمعالجة (تجنب المعالجة المزدوجة)
  SELECT Operation, EntityType, SourceHospitalID, Payload, GlobalID
    INTO v_op, v_type, v_hid, v_payload, v_global_id
  FROM sync_inbox 
  WHERE InboxID = p_inbox_id 
    AND ProcessedAt IS NULL
  FOR UPDATE;

  -- إذا كان الصف قد عُولج بالفعل، نتوقف
  IF v_payload IS NULL THEN
    SIGNAL SQLSTATE '01000' 
      SET MESSAGE_TEXT = 'Event already processed or not found';
  END IF;

  -- معالجة حسب نوع الكيان
  IF v_type = 'COMPLAINT' THEN
    IF v_op IN ('INSERT','UPDATE') THEN
      CALL upsert_complaint_from_json(v_payload, v_hid);
    ELSEIF v_op = 'DELETE' THEN
      -- حذف منطقي في المركز
      UPDATE complaints 
      SET IsDeleted = 1, 
          DeletedAt = NOW()
      WHERE GlobalID = v_global_id;
    END IF;
  
  ELSEIF v_type = 'RESPONSE' THEN
    IF v_op IN ('INSERT','UPDATE') THEN
      CALL upsert_response_from_json(v_payload, v_hid);
    END IF;
  
  -- يمكن إضافة ATTACHMENT لاحقاً
  END IF;

  -- تعليم الحدث كمعالج
  UPDATE sync_inbox 
  SET ProcessedAt = NOW(),
      ErrorMessage = NULL
  WHERE InboxID = p_inbox_id;
END$$
DELIMITER ;

-- =========================================================
-- 6) View لعرض الأحداث غير المعالجة
-- =========================================================
CREATE OR REPLACE VIEW v_pending_sync_events AS
SELECT 
  i.InboxID,
  i.SourceHospitalID,
  h.NameAr as HospitalName,
  h.Code as HospitalCode,
  i.EntityType,
  i.Operation,
  i.GlobalID,
  i.CreatedAt,
  i.RetryCount,
  i.ErrorMessage,
  TIMESTAMPDIFF(MINUTE, i.CreatedAt, NOW()) as AgeMinutes
FROM sync_inbox i
JOIN hospitals h ON h.HospitalID = i.SourceHospitalID
WHERE i.ProcessedAt IS NULL
ORDER BY i.CreatedAt ASC;

-- =========================================================
-- 7) إجراء لمعالجة دفعة من الأحداث
-- =========================================================
-- يعالج أقدم N حدث غير معالج

DROP PROCEDURE IF EXISTS process_inbox_batch;

DELIMITER $$
CREATE PROCEDURE process_inbox_batch(IN p_batch_size INT)
BEGIN
  DECLARE v_inbox_id BIGINT UNSIGNED;
  DECLARE v_done INT DEFAULT 0;
  DECLARE cur CURSOR FOR 
    SELECT InboxID 
    FROM sync_inbox 
    WHERE ProcessedAt IS NULL
      AND (RetryCount < 3 OR ErrorMessage IS NULL)  -- تجنب الأحداث الفاشلة المتكررة
    ORDER BY CreatedAt ASC
    LIMIT p_batch_size;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;

  OPEN cur;

  read_loop: LOOP
    FETCH cur INTO v_inbox_id;
    IF v_done THEN
      LEAVE read_loop;
    END IF;
    
    -- معالجة الحدث (نتجاهل الأخطاء لنكمل الدفعة)
    BEGIN
      DECLARE CONTINUE HANDLER FOR SQLEXCEPTION
      BEGIN
        -- الخطأ سيُسجل في process_inbox_row
      END;
      
      CALL process_inbox_row(v_inbox_id);
    END;
  END LOOP;

  CLOSE cur;
END$$
DELIMITER ;

-- =========================================================
-- 8) فهرس إضافي للأداء
-- =========================================================
CREATE INDEX IF NOT EXISTS ix_complaints_hospital_created 
  ON complaints (HospitalID, CreatedAt);

CREATE INDEX IF NOT EXISTS ix_complaints_ticket 
  ON complaints (TicketNumber);

-- =========================================================
-- النهاية - تقرير الحالة
-- =========================================================
SELECT 
  'تم إعداد المزامنة المركزية بنجاح ✓' as Status,
  (SELECT COUNT(*) FROM sync_inbox) as TotalInboxEvents,
  (SELECT COUNT(*) FROM sync_inbox WHERE ProcessedAt IS NULL) as PendingEvents,
  (SELECT COUNT(*) FROM complaints WHERE GlobalID IS NOT NULL) as SyncedComplaints;


