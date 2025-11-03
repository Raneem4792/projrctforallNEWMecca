/* =========================================================
   سكربت تحسين المزامنة لقاعدة المستشفى
   Hospital Database Sync Patch
   
   Purpose: تحديث Triggers وإضافة أحداث الحذف + توسيع Payload
            ليحتوي كل الحقول المطلوبة للمزامنة مع المركز
   
   Database: hosp_XXX (أي قاعدة مستشفى)
   MySQL Version: 8.0+
   Charset: utf8mb4
   
   What it does:
   1. توسيع Payload في trigger الإنشاء ليشمل كل حقول البلاغ
   2. توسيع Payload في trigger التحديث
   3. إضافة trigger للحذف (COMPLAINT_DELETED)
   4. تحسين trigger الردود
   5. إضافة فهارس للأداء
   
   ⚠️ ملاحظات:
   - يُشغّل على كل قاعدة مستشفى على حدة
   - لا يحذف أو يغيّر الجداول الموجودة
   - يعيد إنشاء الـ Triggers فقط
   - متوافق مع hospital_template.sql الموجود
   ========================================================= */

SET NAMES utf8mb4;
SET time_zone = '+03:00';
SET sql_mode = 'STRICT_ALL_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

-- =========================================================
-- 1) تحديث Trigger: إنشاء شكوى (COMPLAINT_CREATED)
-- =========================================================
-- نوسّع الـ Payload ليحتوي كل الحقول المطلوبة بالمركز

DROP TRIGGER IF EXISTS trg_complaints_ai;

DELIMITER $$
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
      'ComplaintID', NEW.ComplaintID,
      'GlobalID', NEW.GlobalID,
      'TicketNumber', NEW.TicketNumber,
      'HospitalID', NEW.HospitalID,
      'DepartmentID', NEW.DepartmentID,
      'SubmissionType', NEW.SubmissionType,
      'VisitDate', NEW.VisitDate,
      'PatientFullName', NEW.PatientFullName,
      'PatientIDNumber', NEW.PatientIDNumber,
      'PatientMobile', NEW.PatientMobile,
      'GenderCode', NEW.GenderCode,
      'FileNumber', NEW.FileNumber,
      'ComplaintTypeID', NEW.ComplaintTypeID,
      'SubTypeID', NEW.SubTypeID,
      'Description', NEW.Description,
      'PriorityCode', NEW.PriorityCode,
      'StatusCode', NEW.StatusCode,
      'CreatedByUserID', NEW.CreatedByUserID,
      'CreatedAt', DATE_FORMAT(NEW.CreatedAt, '%Y-%m-%d %H:%i:%s'),
      'UpdatedAt', DATE_FORMAT(NEW.UpdatedAt, '%Y-%m-%d %H:%i:%s'),
      'IsDeleted', NEW.IsDeleted,
      'DeletedAt', NEW.DeletedAt,
      'DeletedByUserID', NEW.DeletedByUserID,
      'DeleteReason', NEW.DeleteReason
    )
  );
END$$
DELIMITER ;

-- =========================================================
-- 2) تحديث Trigger: تعديل شكوى (COMPLAINT_UPDATED)
-- =========================================================
-- يسجل في complaint_status_history إذا تغيّرت الحالة
-- ويرسل كل الحقول للمركز

DROP TRIGGER IF EXISTS trg_complaints_au;

DELIMITER $$
CREATE TRIGGER trg_complaints_au
AFTER UPDATE ON complaints
FOR EACH ROW
BEGIN
  -- تسجيل تغيير الحالة (إن حدث)
  IF (OLD.StatusCode <> NEW.StatusCode) THEN
    INSERT INTO complaint_status_history(ComplaintID, OldStatusCode, NewStatusCode, ChangedByUserID, Notes)
    VALUES (NEW.ComplaintID, OLD.StatusCode, NEW.StatusCode, NEW.CreatedByUserID, 'Auto via trigger');
  END IF;

  -- إرسال حدث التحديث للمركز
  INSERT INTO outbox_events(EventType, AggregateType, AggregateGlobalID, HospitalID, Payload)
  VALUES(
    'COMPLAINT_UPDATED',
    'complaint',
    NEW.GlobalID,
    NEW.HospitalID,
    JSON_OBJECT(
      'ComplaintID', NEW.ComplaintID,
      'GlobalID', NEW.GlobalID,
      'TicketNumber', NEW.TicketNumber,
      'HospitalID', NEW.HospitalID,
      'DepartmentID', NEW.DepartmentID,
      'SubmissionType', NEW.SubmissionType,
      'VisitDate', NEW.VisitDate,
      'PatientFullName', NEW.PatientFullName,
      'PatientIDNumber', NEW.PatientIDNumber,
      'PatientMobile', NEW.PatientMobile,
      'GenderCode', NEW.GenderCode,
      'FileNumber', NEW.FileNumber,
      'ComplaintTypeID', NEW.ComplaintTypeID,
      'SubTypeID', NEW.SubTypeID,
      'Description', NEW.Description,
      'PriorityCode', NEW.PriorityCode,
      'StatusCode', NEW.StatusCode,
      'CreatedByUserID', NEW.CreatedByUserID,
      'CreatedAt', DATE_FORMAT(NEW.CreatedAt, '%Y-%m-%d %H:%i:%s'),
      'UpdatedAt', DATE_FORMAT(NEW.UpdatedAt, '%Y-%m-%d %H:%i:%s'),
      'IsDeleted', NEW.IsDeleted,
      'DeletedAt', NEW.DeletedAt,
      'DeletedByUserID', NEW.DeletedByUserID,
      'DeleteReason', NEW.DeleteReason
    )
  );
END$$
DELIMITER ;

-- =========================================================
-- 3) إضافة Trigger جديد: حذف شكوى (COMPLAINT_DELETED)
-- =========================================================
-- يُشغّل عند DELETE فعلي (نادر) أو يمكن استخدامه للحذف المنطقي

DROP TRIGGER IF EXISTS trg_complaints_ad;

DELIMITER $$
CREATE TRIGGER trg_complaints_ad
AFTER DELETE ON complaints
FOR EACH ROW
BEGIN
  INSERT INTO outbox_events(EventType, AggregateType, AggregateGlobalID, HospitalID, Payload)
  VALUES(
    'COMPLAINT_DELETED',
    'complaint',
    OLD.GlobalID,
    OLD.HospitalID,
    JSON_OBJECT(
      'GlobalID', OLD.GlobalID,
      'ComplaintID', OLD.ComplaintID,
      'TicketNumber', OLD.TicketNumber,
      'DeletedAt', DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s')
    )
  );
END$$
DELIMITER ;

-- =========================================================
-- 4) تحديث Trigger: إضافة رد (RESPONSE_ADDED)
-- =========================================================
-- نضيف ComplaintID و ResponderUserID لتسهيل العرض بالمركز

DROP TRIGGER IF EXISTS trg_responses_ai;

DELIMITER $$
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
      'ComplaintID', NEW.ComplaintID,
      'ResponseID', NEW.ResponseID,
      'ResponderUserID', NEW.ResponderUserID,
      'ReplyTypeID', NEW.ReplyTypeID,
      'TargetStatusCode', NEW.TargetStatusCode,
      'Message', NEW.Message,
      'IsInternal', NEW.IsInternal,
      'CreatedAt', DATE_FORMAT(NEW.CreatedAt, '%Y-%m-%d %H:%i:%s')
    )
  FROM complaints c WHERE c.ComplaintID = NEW.ComplaintID;
END$$
DELIMITER ;

-- =========================================================
-- 5) فهارس إضافية للأداء
-- =========================================================

-- فهرس لتسريع قراءة الأحداث غير المعالجة
CREATE INDEX IF NOT EXISTS ix_outbox_processed 
  ON outbox_events(Processed, OccurredAt);

-- فهرس لتسريع البحث بـ GlobalID
CREATE INDEX IF NOT EXISTS ix_outbox_global 
  ON outbox_events(AggregateGlobalID);

-- فهرس لتسريع البحث حسب نوع الحدث
CREATE INDEX IF NOT EXISTS ix_outbox_type 
  ON outbox_events(EventType, Processed);

-- =========================================================
-- 6) View لمراقبة الأحداث غير المرسلة
-- =========================================================

CREATE OR REPLACE VIEW v_pending_outbox AS
SELECT 
  EventID,
  EventType,
  AggregateType,
  AggregateGlobalID,
  HospitalID,
  OccurredAt,
  TIMESTAMPDIFF(MINUTE, OccurredAt, NOW()) as AgeMinutes,
  Processed,
  ProcessedAt,
  LEFT(CAST(Payload AS CHAR), 200) as PayloadPreview
FROM outbox_events
WHERE Processed = 0
ORDER BY OccurredAt ASC
LIMIT 100;

-- =========================================================
-- 7) إجراء لتنظيف الأحداث القديمة (اختياري)
-- =========================================================
-- يحذف الأحداث المعالجة الأقدم من X أيام

DROP PROCEDURE IF EXISTS cleanup_old_outbox_events;

DELIMITER $$
CREATE PROCEDURE cleanup_old_outbox_events(IN p_days_old INT)
BEGIN
  DELETE FROM outbox_events
  WHERE Processed = 1
    AND ProcessedAt < DATE_SUB(NOW(), INTERVAL p_days_old DAY);
  
  SELECT ROW_COUNT() as DeletedRows, 
         CONCAT('تم حذف الأحداث الأقدم من ', p_days_old, ' يوم') as Message;
END$$
DELIMITER ;

-- =========================================================
-- 8) إجراء لإعادة معالجة حدث فاشل
-- =========================================================
-- يعيد تعليم حدث كـ "غير معالج" ليعاد إرساله

DROP PROCEDURE IF EXISTS retry_outbox_event;

DELIMITER $$
CREATE PROCEDURE retry_outbox_event(IN p_event_id BIGINT UNSIGNED)
BEGIN
  UPDATE outbox_events
  SET Processed = 0,
      ProcessedAt = NULL
  WHERE EventID = p_event_id;
  
  SELECT 'تم إعادة تعيين الحدث للمعالجة' as Status,
         EventID, EventType, AggregateGlobalID
  FROM outbox_events
  WHERE EventID = p_event_id;
END$$
DELIMITER ;

-- =========================================================
-- 9) إحصائيات سريعة للمزامنة
-- =========================================================

DROP PROCEDURE IF EXISTS sync_stats;

DELIMITER $$
CREATE PROCEDURE sync_stats()
BEGIN
  SELECT 
    'إحصائيات المزامنة' as Title;
  
  SELECT 
    EventType,
    COUNT(*) as Total,
    SUM(CASE WHEN Processed = 0 THEN 1 ELSE 0 END) as Pending,
    SUM(CASE WHEN Processed = 1 THEN 1 ELSE 0 END) as Sent,
    MIN(OccurredAt) as OldestEvent,
    MAX(OccurredAt) as LatestEvent
  FROM outbox_events
  GROUP BY EventType;
  
  SELECT 
    DATE(OccurredAt) as EventDate,
    COUNT(*) as TotalEvents,
    SUM(CASE WHEN Processed = 1 THEN 1 ELSE 0 END) as ProcessedEvents
  FROM outbox_events
  WHERE OccurredAt >= DATE_SUB(NOW(), INTERVAL 7 DAY)
  GROUP BY DATE(OccurredAt)
  ORDER BY EventDate DESC;
END$$
DELIMITER ;

-- =========================================================
-- النهاية - تقرير الحالة
-- =========================================================

SELECT 
  'تم تحديث triggers المزامنة بنجاح ✓' as Status,
  DATABASE() as CurrentDatabase,
  (SELECT COUNT(*) FROM outbox_events) as TotalOutboxEvents,
  (SELECT COUNT(*) FROM outbox_events WHERE Processed = 0) as PendingEvents,
  (SELECT COUNT(*) FROM complaints WHERE GlobalID IS NOT NULL) as ComplaintsWithGlobalID;

-- عرض View الأحداث المعلقة
SELECT '--- الأحداث المعلقة (أحدث 10) ---' as Info;
SELECT * FROM v_pending_outbox LIMIT 10;


