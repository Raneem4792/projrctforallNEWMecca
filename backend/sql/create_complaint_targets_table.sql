-- إنشاء جدول complaint_targets لتخزين البلاغات الموجهة للموظفين
-- يتم إنشاؤه في كل قاعدة بيانات مستشفى

CREATE TABLE IF NOT EXISTS complaint_targets (
  TargetID BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  ComplaintID BIGINT UNSIGNED NULL, -- تم تعديله ليقبل NULL
  TargetEmployeeID INT NULL,
  TargetEmployeeName VARCHAR(150) NULL,
  TargetDepartmentID INT NULL,
  TargetDepartmentName VARCHAR(150) NULL,
  RepeatCount VARCHAR(20) NULL,
  DidGuidanceSession TINYINT(1) DEFAULT 0,
  DidDirectorAction TINYINT(1) DEFAULT 0,
  DidLegalReferral TINYINT(1) DEFAULT 0,
  DidAnnualEvaluation TINYINT(1) DEFAULT 0,
  CaseStatus VARCHAR(50) NULL,
  CreatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- مفاتيح خارجية
  KEY fk_ct_complaint (ComplaintID),
  CONSTRAINT fk_ct_complaint FOREIGN KEY (ComplaintID)
    REFERENCES complaints(ComplaintID) ON DELETE CASCADE,
    
  -- فهارس للبحث السريع
  KEY idx_target_employee (TargetEmployeeID),
  KEY idx_target_department (TargetDepartmentID),
  KEY idx_created_at (CreatedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- إضافة تعليق على الجدول
ALTER TABLE complaint_targets COMMENT = 'جدول البلاغات الموجهة للموظفين';

-- إضافة تعليقات على الأعمدة
ALTER TABLE complaint_targets 
  MODIFY COLUMN TargetID BIGINT UNSIGNED AUTO_INCREMENT COMMENT 'معرف البلاغ على الموظف',
  MODIFY COLUMN ComplaintID BIGINT UNSIGNED NULL COMMENT 'معرف البلاغ الأصلي (اختياري)',
  MODIFY COLUMN TargetEmployeeID INT NULL COMMENT 'معرف الموظف المستهدف',
  MODIFY COLUMN TargetEmployeeName VARCHAR(150) NULL COMMENT 'اسم الموظف المستهدف',
  MODIFY COLUMN TargetDepartmentID INT NULL COMMENT 'معرف القسم المستهدف',
  MODIFY COLUMN TargetDepartmentName VARCHAR(150) NULL COMMENT 'اسم القسم المستهدف',
  MODIFY COLUMN RepeatCount VARCHAR(20) NULL COMMENT 'عدد مرات التكرار',
  MODIFY COLUMN DidGuidanceSession TINYINT(1) DEFAULT 0 COMMENT 'هل تم عمل جلسة استرشادية',
  MODIFY COLUMN DidDirectorAction TINYINT(1) DEFAULT 0 COMMENT 'هل تم توقيعها من مدير المنشأة',
  MODIFY COLUMN DidLegalReferral TINYINT(1) DEFAULT 0 COMMENT 'هل تم إحالة الموظف للتدوين القانونية',
  MODIFY COLUMN DidAnnualEvaluation TINYINT(1) DEFAULT 0 COMMENT 'هل تم ربطها بتقييم الموظف السنوي',
  MODIFY COLUMN CaseStatus VARCHAR(50) NULL COMMENT 'حالة البلاغ',
  MODIFY COLUMN CreatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'تاريخ الإنشاء';
