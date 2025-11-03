-- ملف تحديث قاعدة البيانات لدعم تحويل البلاغات بين الموظفين
-- يجب تشغيل هذا الملف على كل قاعدة بيانات مستشفى

-- 1) إضافة أعمدة الإسناد لجدول complaints
ALTER TABLE complaints
  ADD COLUMN IF NOT EXISTS AssignedToUserID INT UNSIGNED NULL AFTER DepartmentID,
  ADD COLUMN IF NOT EXISTS AssignedAt        TIMESTAMP NULL AFTER AssignedToUserID,
  ADD COLUMN IF NOT EXISTS AssignedByUserID  INT UNSIGNED NULL AFTER AssignedAt;

-- 2) إضافة فهرس للموظف المُسند إليه
CREATE INDEX IF NOT EXISTS idx_complaints_assignee ON complaints (AssignedToUserID);

-- 3) فهرس مفيد للموظفين
CREATE INDEX IF NOT EXISTS idx_users_hosp_dept_active ON users (HospitalID, DepartmentID, IsActive);

-- 4) إنشاء جدول تاريخ تحويلات الموظفين
CREATE TABLE IF NOT EXISTS complaint_assignee_history (
  HistoryID        BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ComplaintID      BIGINT UNSIGNED NOT NULL,
  FromUserID       INT UNSIGNED NULL,
  ToUserID         INT UNSIGNED NOT NULL,
  Note             VARCHAR(500) NULL,
  ChangedByUserID  INT UNSIGNED NOT NULL,
  ChangedAt        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_cah_complaint (ComplaintID),
  INDEX idx_cah_to_user (ToUserID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5) إضافة تعليق توضيحي
ALTER TABLE complaints COMMENT = 'جدول البلاغات مع دعم إسناد الموظفين';

-- 6) التحقق من التطبيق
SELECT 
  'complaints' as table_name,
  COUNT(*) as total_complaints,
  COUNT(AssignedToUserID) as assigned_complaints,
  COUNT(AssignedToUserID) / COUNT(*) * 100 as assignment_percentage
FROM complaints;

SELECT 
  'complaint_assignee_history' as table_name,
  COUNT(*) as total_transfers
FROM complaint_assignee_history;
