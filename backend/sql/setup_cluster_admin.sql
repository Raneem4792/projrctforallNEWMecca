/* =========================================================
   إعداد حساب مدير التجمع (Cluster Admin)
   يُطبّق على القاعدة المركزية: hospitals_mecca4
   ========================================================= */

-- 1) تعديل user_directory ليقبل NULL في HospitalID
ALTER TABLE user_directory 
MODIFY COLUMN HospitalID INT UNSIGNED NULL;

-- 2) إضافة مدير التجمع في user_directory
INSERT INTO user_directory (Username, HospitalID, RoleID, IsActive, CreatedAt)
VALUES ('cluster.admin', NULL, 1, 1, NOW())
ON DUPLICATE KEY UPDATE 
  RoleID = 1, 
  HospitalID = NULL,
  IsActive = 1,
  UpdatedAt = NOW();

-- 3) تأكد من وجود جدول users في القاعدة المركزية
--    (إذا لم يكن موجوداً، أنشئه)
CREATE TABLE IF NOT EXISTS users (
  UserID          INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  RoleID          TINYINT UNSIGNED NOT NULL,
  HospitalID      INT UNSIGNED NULL,         -- ✅ يقبل NULL للحسابات المركزية
  DepartmentID    INT UNSIGNED NULL,
  FullName        VARCHAR(150) NOT NULL,
  Username        VARCHAR(80)  NOT NULL UNIQUE,
  Email           VARCHAR(150) NULL,
  Mobile          VARCHAR(20)  NULL,
  NationalID      VARCHAR(20)  NULL,
  PasswordHash    VARCHAR(255) NOT NULL,
  IsActive        TINYINT(1) NOT NULL DEFAULT 1,
  CreatedAt       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX ix_users_username (Username),
  INDEX ix_users_role (RoleID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4) إضافة مدير التجمع في جدول users
--    كلمة المرور: 123456 (غيّرها في الإنتاج!)
INSERT INTO users (
  RoleID, HospitalID, DepartmentID, 
  FullName, Username, Email, Mobile,
  PasswordHash, IsActive
)
VALUES (
  1,                                                              -- RoleID: CLUSTER_ADMIN
  NULL,                                                           -- HospitalID: NULL (مركزي)
  NULL,                                                           -- DepartmentID: NULL
  'مدير التجمع',                                                 -- FullName
  'cluster.admin',                                                -- Username
  'cluster@makkahhealth.gov.sa',                                 -- Email
  '0559735137',                                                   -- Mobile
  '$2a$10$K7mD6zA2ZDy6Z8f4aYF8veK7pU2TRujzI6dX0F3c98C3yWznH5OeK', -- Password: 123456
  1                                                               -- IsActive
)
ON DUPLICATE KEY UPDATE 
  RoleID = 1,
  HospitalID = NULL,
  DepartmentID = NULL,
  IsActive = 1;

-- 5) التحقق من النتائج
SELECT '✅ تم إعداد حساب مدير التجمع بنجاح' AS Status;

SELECT 
  'user_directory' AS الجدول,
  Username,
  HospitalID,
  RoleID,
  IsActive
FROM user_directory 
WHERE Username = 'cluster.admin';

SELECT 
  'users' AS الجدول,
  UserID,
  Username,
  RoleID,
  HospitalID,
  FullName,
  IsActive
FROM users 
WHERE Username = 'cluster.admin';

/* =========================================================
   معلومات تسجيل الدخول:
   
   Username: cluster.admin
   Password: 123456
   
   ⚠️ تحذير أمني: غيّر كلمة المرور في الإنتاج!
   
   لتوليد كلمة مرور جديدة:
   const bcrypt = require('bcryptjs');
   const hash = await bcrypt.hash('كلمة_المرور_الجديدة', 10);
   console.log(hash);
   
   ثم:
   UPDATE users SET PasswordHash = 'الهاش_الجديد' WHERE Username = 'cluster.admin';
   ========================================================= */

