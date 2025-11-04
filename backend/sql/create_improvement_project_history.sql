-- إنشاء جدول سجل التعديلات للمشاريع التحسينية
-- يجب تنفيذه على كل قاعدة بيانات مستشفى

CREATE TABLE IF NOT EXISTS improvement_project_history (
  HistoryID      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ProjectID      BIGINT UNSIGNED NOT NULL,
  HospitalID     INT UNSIGNED NOT NULL,
  ChangedByUserID INT UNSIGNED NOT NULL,
  ChangedAt      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ChangeSummary  TEXT NULL COMMENT 'ملخص التغييرات',
  OldStatus      ENUM('DRAFT','PROPOSED','APPROVED','IN_PROGRESS','COMPLETED','CANCELLED') NULL,
  NewStatus      ENUM('DRAFT','PROPOSED','APPROVED','IN_PROGRESS','COMPLETED','CANCELLED') NULL,
  OldPriority    ENUM('LOW','MEDIUM','HIGH','CRITICAL') NULL,
  NewPriority    ENUM('LOW','MEDIUM','HIGH','CRITICAL') NULL,
  
  INDEX idx_proj (ProjectID),
  INDEX idx_hospital (HospitalID),
  INDEX idx_changed_at (ChangedAt),
  
  CONSTRAINT fk_history_project
    FOREIGN KEY (ProjectID) REFERENCES improvement_projects(ProjectID)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='سجل تعديلات المشاريع التحسينية';

-- ملاحظة: إذا كنت لا تريد قيود المفاتيح الخارجية، احذف السطر CONSTRAINT ... ON DELETE CASCADE

