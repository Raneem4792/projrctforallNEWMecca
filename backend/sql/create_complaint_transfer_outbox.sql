-- جدول outbox لتحويل البلاغات بين المستشفيات
-- نفّذي هذا السكربت في كل قاعدة مستشفى (tenant)

CREATE TABLE IF NOT EXISTS complaint_transfer_outbox (
  TransferID       BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ComplaintID      BIGINT UNSIGNED NOT NULL,
  TargetHospitalID INT UNSIGNED   NOT NULL,
  Payload          JSON           NOT NULL,
  Status           ENUM('PENDING','SENT','FAILED') DEFAULT 'PENDING',
  ErrorMessage     VARCHAR(255)   NULL,
  CreatedAt        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  SentAt           TIMESTAMP NULL,
  
  INDEX idx_status (Status),
  INDEX idx_complaint (ComplaintID),
  INDEX idx_target (TargetHospitalID)
);

