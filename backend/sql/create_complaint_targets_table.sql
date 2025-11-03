-- إنشاء جدول complaint_targets لتخزين البلاغات الموجهة للموظفين
-- يتم إنشاؤه في كل قاعدة بيانات مستشفى

CREATE TABLE IF NOT EXISTS complaint_targets (
  TargetID BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  ComplaintID BIGINT UNSIGNED NOT NULL,
  TargetEmployeeID INT NULL,
  TargetEmployeeName VARCHAR(150) NULL,
  TargetDepartmentID INT NULL,
  TargetDepartmentName VARCHAR(150) NULL,
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
  MODIFY COLUMN ComplaintID BIGINT UNSIGNED NOT NULL COMMENT 'معرف البلاغ الأصلي',
  MODIFY COLUMN TargetEmployeeID INT NULL COMMENT 'معرف الموظف المستهدف',
  MODIFY COLUMN TargetEmployeeName VARCHAR(150) NULL COMMENT 'اسم الموظف المستهدف',
  MODIFY COLUMN TargetDepartmentID INT NULL COMMENT 'معرف القسم المستهدف',
  MODIFY COLUMN TargetDepartmentName VARCHAR(150) NULL COMMENT 'اسم القسم المستهدف',
  MODIFY COLUMN CreatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'تاريخ الإنشاء';
