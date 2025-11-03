-- إضافة الحقول المفقودة لجدول improvement_projects
-- هذا السكريبت يضيف الحقول التي تحتاجها الصفحات الأمامية

-- إضافة حقول جديدة إذا لم تكن موجودة
ALTER TABLE improvement_projects 
ADD COLUMN IF NOT EXISTS SuccessCriteria TEXT COMMENT 'معايير النجاح',
ADD COLUMN IF NOT EXISTS TeamMembers TEXT COMMENT 'فريق العمل',
ADD COLUMN IF NOT EXISTS ProgressNotes TEXT COMMENT 'ملاحظات التقدم';

-- تحديث التعليقات للحقول الموجودة
ALTER TABLE improvement_projects 
MODIFY COLUMN ProblemStatement TEXT COMMENT 'وصف المشكلة',
MODIFY COLUMN AimStatement TEXT COMMENT 'الهدف من المشروع',
MODIFY COLUMN ExpectedImpact VARCHAR(255) COMMENT 'التأثير المتوقع',
MODIFY COLUMN Priority ENUM('LOW','MEDIUM','HIGH','CRITICAL') COMMENT 'الأولوية',
MODIFY COLUMN Status ENUM('DRAFT','PROPOSED','APPROVED','IN_PROGRESS','COMPLETED','CANCELLED') COMMENT 'الحالة',
MODIFY COLUMN StartDate DATE COMMENT 'تاريخ البداية',
MODIFY COLUMN DueDate DATE COMMENT 'تاريخ الانتهاء المتوقع',
MODIFY COLUMN BudgetEstimate DECIMAL(12,2) COMMENT 'التقدير المالي',
MODIFY COLUMN OwnerUserID INT COMMENT 'معرف مالك المشروع',
MODIFY COLUMN CreatedByUserID INT COMMENT 'معرف منشئ المشروع',
MODIFY COLUMN IsDeleted TINYINT(1) DEFAULT 0 COMMENT 'محذوف';

-- إضافة فهارس لتحسين الأداء
CREATE INDEX IF NOT EXISTS idx_improvement_projects_hospital_status 
ON improvement_projects (HospitalID, Status);

CREATE INDEX IF NOT EXISTS idx_improvement_projects_hospital_dept 
ON improvement_projects (HospitalID, DepartmentID);

CREATE INDEX IF NOT EXISTS idx_improvement_projects_hospital_priority 
ON improvement_projects (HospitalID, Priority);

-- إضافة قيود المفاتيح الخارجية إذا لم تكن موجودة
-- ALTER TABLE improvement_projects 
-- ADD CONSTRAINT fk_improvement_projects_department 
-- FOREIGN KEY (DepartmentID) REFERENCES departments(DepartmentID) ON DELETE SET NULL;

-- ALTER TABLE improvement_projects 
-- ADD CONSTRAINT fk_improvement_projects_owner 
-- FOREIGN KEY (OwnerUserID) REFERENCES users(UserID) ON DELETE SET NULL;

-- ALTER TABLE improvement_projects 
-- ADD CONSTRAINT fk_improvement_projects_creator 
-- FOREIGN KEY (CreatedByUserID) REFERENCES users(UserID) ON DELETE SET NULL;
