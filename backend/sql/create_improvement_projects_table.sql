-- إنشاء جدول المشاريع التحسينية
-- هذا السكريبت ينشئ جدول improvement_projects في قاعدة المستشفى

CREATE TABLE IF NOT EXISTS improvement_projects (
  ProjectID BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  HospitalID INT UNSIGNED NOT NULL,
  Title VARCHAR(200) NOT NULL COMMENT 'عنوان المشروع',
  ProblemStatement TEXT NULL COMMENT 'وصف المشكلة',
  AimStatement TEXT NULL COMMENT 'الهدف من المشروع',
  DepartmentID INT UNSIGNED NULL COMMENT 'معرف القسم',
  ComplaintTypeID INT UNSIGNED NULL COMMENT 'نوع البلاغ المرتبط',
  ComplaintSubTypeID INT UNSIGNED NULL COMMENT 'نوع البلاغ الفرعي',
  Priority ENUM('LOW','MEDIUM','HIGH','CRITICAL') DEFAULT 'MEDIUM' COMMENT 'الأولوية',
  Status ENUM('DRAFT','PROPOSED','APPROVED','IN_PROGRESS','COMPLETED','CANCELLED') DEFAULT 'DRAFT' COMMENT 'الحالة',
  ExpectedImpact VARCHAR(255) NULL COMMENT 'التأثير المتوقع',
  StartDate DATE NULL COMMENT 'تاريخ البداية',
  DueDate DATE NULL COMMENT 'تاريخ الانتهاء المتوقع',
  BudgetEstimate DECIMAL(12,2) NULL COMMENT 'التقدير المالي',
  OwnerUserID INT UNSIGNED NULL COMMENT 'معرف مالك المشروع',
  CreatedByUserID INT UNSIGNED NULL COMMENT 'معرف منشئ المشروع',
  CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'تاريخ الإنشاء',
  UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'تاريخ آخر تحديث',
  IsDeleted TINYINT(1) DEFAULT 0 COMMENT 'محذوف',
  
  -- فهارس لتحسين الأداء
  INDEX idx_hospital_status (HospitalID, Status),
  INDEX idx_hospital_dept (HospitalID, DepartmentID),
  INDEX idx_hospital_priority (HospitalID, Priority),
  INDEX idx_hospital_created (HospitalID, CreatedAt),
  INDEX idx_owner (OwnerUserID),
  INDEX idx_creator (CreatedByUserID),
  INDEX idx_deleted (IsDeleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='جدول المشاريع التحسينية';

-- إضافة الحقول الإضافية إذا لم تكن موجودة
ALTER TABLE improvement_projects 
ADD COLUMN IF NOT EXISTS SuccessCriteria TEXT NULL COMMENT 'معايير النجاح',
ADD COLUMN IF NOT EXISTS TeamMembers TEXT NULL COMMENT 'فريق العمل',
ADD COLUMN IF NOT EXISTS ProgressNotes TEXT NULL COMMENT 'ملاحظات التقدم';

-- إضافة قيود المفاتيح الخارجية (اختياري - يمكن تعطيلها إذا لم تكن الجداول المرتبطة موجودة)
-- ALTER TABLE improvement_projects 
-- ADD CONSTRAINT fk_improvement_projects_department 
-- FOREIGN KEY (DepartmentID) REFERENCES departments(DepartmentID) ON DELETE SET NULL;

-- ALTER TABLE improvement_projects 
-- ADD CONSTRAINT fk_improvement_projects_owner 
-- FOREIGN KEY (OwnerUserID) REFERENCES users(UserID) ON DELETE SET NULL;

-- ALTER TABLE improvement_projects 
-- ADD CONSTRAINT fk_improvement_projects_creator 
-- FOREIGN KEY (CreatedByUserID) REFERENCES users(UserID) ON DELETE SET NULL;

-- إدراج بيانات تجريبية (اختياري)
INSERT IGNORE INTO improvement_projects (
  HospitalID, Title, ProblemStatement, AimStatement, DepartmentID, 
  Priority, Status, StartDate, DueDate, OwnerUserID, CreatedByUserID
) VALUES 
(
  15, 
  'تحسين وقت الانتظار في الطوارئ', 
  'يبلغ متوسط وقت الانتظار في قسم الطوارئ 45 دقيقة، مما يؤثر على رضا المرضى وجودة الخدمة.',
  'تقليل متوسط وقت الانتظار في قسم الطوارئ إلى 20 دقيقة خلال 3 أشهر.',
  1,
  'HIGH',
  'IN_PROGRESS',
  CURDATE(),
  DATE_ADD(CURDATE(), INTERVAL 3 MONTH),
  1,
  1
),
(
  15,
  'تحسين نظام إدارة الأدوية',
  'يوجد تأخير في صرف الأدوية للمرضى الداخليين بسبب عدم توفر نظام إلكتروني متكامل.',
  'تطبيق نظام إلكتروني لإدارة الأدوية يقلل وقت الصرف بنسبة 50%.',
  2,
  'MEDIUM',
  'PROPOSED',
  NULL,
  DATE_ADD(CURDATE(), INTERVAL 2 MONTH),
  1,
  1
),
(
  15,
  'تحسين نظافة البيئة',
  'تتكرر شكاوى المرضى حول نظافة الغرف والمرافق العامة.',
  'رفع مستوى نظافة البيئة إلى 95% خلال شهرين.',
  3,
  'CRITICAL',
  'APPROVED',
  CURDATE(),
  DATE_ADD(CURDATE(), INTERVAL 2 MONTH),
  1,
  1
);
