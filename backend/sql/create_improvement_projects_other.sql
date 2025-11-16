-- إنشاء جدول مشاريع التحسين العامة/الأخرى في كل قاعدة مستشفى
CREATE TABLE IF NOT EXISTS improvement_projects_other (
  ProjectID         BIGINT AUTO_INCREMENT PRIMARY KEY,
  HospitalID        INT NOT NULL,
  ProjectType       VARCHAR(50) NOT NULL DEFAULT 'OTHER',

  Title             VARCHAR(255) NOT NULL,
  DepartmentID      INT NOT NULL,
  ImprovementArea   VARCHAR(100) NOT NULL,
  ProjectCategory   VARCHAR(100) NULL,

  ProblemStatement  TEXT NOT NULL,
  AimStatement      TEXT NOT NULL,
  CurrentState      TEXT NULL,

  ProposedSolution  TEXT NOT NULL,
  KPIs              TEXT NULL,
  RequiredResources TEXT NULL,

  Priority          VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
  ProjectOwner      VARCHAR(255) NULL,
  StartDate         DATE NULL,
  DueDate           DATE NULL,
  DurationMonths    INT NULL,

  TeamMembers       TEXT NULL,
  Notes             TEXT NULL,

  Status            VARCHAR(50) NOT NULL DEFAULT 'DRAFT',

  CreatedBy         INT NULL,
  CreatedAt         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt         TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_hospital (HospitalID),
  INDEX idx_status (Status),
  INDEX idx_department (DepartmentID),
  INDEX idx_priority (Priority),
  INDEX idx_created (CreatedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


