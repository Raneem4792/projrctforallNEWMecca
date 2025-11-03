-- إنشاء جداول ردود الزائر السري
-- تقييمات الزائر السري (موجود غالباً)
-- mystery_complaints (MysteryID PK, HospitalID, Status, Priority, ...)

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

-- إنشاء مجلد المرفقات
-- سيتم إنشاء المجلد تلقائياً عند رفع الملفات
-- /uploads/mystery-responses/

-- ملاحظات:
-- 1. نستخدم نفس جداول reply_types و complaint_statuses الموجودة
-- 2. لا نحتاج لإنشاء جداول جديدة لأنواع الردود أو الحالات
-- 3. المرفقات تُحفظ في مجلد منفصل: /uploads/mystery-responses/
-- 4. نفس منطق البلاغات العادية تماماً
