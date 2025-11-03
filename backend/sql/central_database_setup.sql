-- إنشاء جداول القاعدة المركزية لنظام Multi-Tenant
-- يجب تشغيل هذا الملف على القاعدة المركزية

-- تحديث جدول المستشفيات لإضافة مفاتيح وفهارس
ALTER TABLE hospitals 
  ADD UNIQUE KEY uq_code (Code),
  ADD KEY idx_active (IsActive),
  ADD KEY idx_sort (SortOrder);

-- إنشاء جدول المستخدمين المركزي (لحسابات مدير التجمّع فقط)
CREATE TABLE IF NOT EXISTS users_central (
  UserID        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  RoleID        TINYINT UNSIGNED NOT NULL,   -- 1 = Cluster Manager
  FullName      VARCHAR(150) NOT NULL,
  Username      VARCHAR(80)  NOT NULL UNIQUE,
  Email         VARCHAR(150),
  Mobile        VARCHAR(20),
  PasswordHash  VARCHAR(255) NOT NULL,
  IsActive      TINYINT(1)   NOT NULL DEFAULT 1,
  CreatedAt     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_username (Username),
  INDEX idx_email (Email),
  INDEX idx_active (IsActive)
);

-- إضافة حقول اتصال قواعد البيانات للمستشفيات (إذا لم تكن موجودة)
-- هذه الحقول ستُستخدم للاتصال بقواعد بيانات المستشفيات المنفصلة
ALTER TABLE hospitals 
ADD COLUMN IF NOT EXISTS DbHost VARCHAR(255) DEFAULT 'localhost',
ADD COLUMN IF NOT EXISTS DbUser VARCHAR(100) DEFAULT 'root',
ADD COLUMN IF NOT EXISTS DbPass VARCHAR(255) DEFAULT '',
ADD COLUMN IF NOT EXISTS DbName VARCHAR(100) DEFAULT '';

-- إنشاء فهرس مركب للبحث السريع
CREATE INDEX IF NOT EXISTS idx_hospital_active_sort ON hospitals (IsActive, SortOrder, NameAr);

-- إنشاء جدول فهرس مركزي للمستخدمين
CREATE TABLE IF NOT EXISTS user_directory (
  Username   VARCHAR(80) PRIMARY KEY,
  HospitalID INT UNSIGNED NOT NULL,
  RoleID     TINYINT UNSIGNED NOT NULL,     -- 2=HospitalAdmin, 3=Employee
  IsActive   TINYINT(1) NOT NULL DEFAULT 1,
  CreatedAt  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY ix_hosp (HospitalID),
  KEY ix_role (RoleID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- إدراج مستشفى تجريبي للاختبار (إذا لم يكن موجوداً)
INSERT IGNORE INTO hospitals (
  NameAr, NameEn, Code, CityAr, CityEn, RegionAr, RegionEn, 
  IsActive, SortOrder, DbHost, DbUser, DbPass, DbName
) VALUES (
  'مستشفى الملك عبدالعزيز', 
  'King Abdulaziz Hospital', 
  'KAH', 
  'مكة المكرمة', 
  'Makkah', 
  'منطقة مكة المكرمة', 
  'Makkah Region', 
  1, 
  1,
  'localhost',
  'root',
  '@',
  'hospital_kah'
);

-- إدراج مستشفى تجريبي آخر
INSERT IGNORE INTO hospitals (
  NameAr, NameEn, Code, CityAr, CityEn, RegionAr, RegionEn, 
  IsActive, SortOrder, DbHost, DbUser, DbPass, DbName
) VALUES (
  'مستشفى الملك فهد', 
  'King Fahd Hospital', 
  'KFH', 
  'مكة المكرمة', 
  'Makkah', 
  'منطقة مكة المكرمة', 
  'Makkah Region', 
  1, 
  2,
  'localhost',
  'root',
  '@',
  'hospital_kfh'
);

-- إنشاء حساب مدير التجمّع الافتراضي (كلمة المرور: admin123)
INSERT IGNORE INTO users_central (
  RoleID, FullName, Username, Email, Mobile, PasswordHash, IsActive
) VALUES (
  1, 
  'مدير التجمّع', 
  'cluster_admin', 
  'admin@makkahhealth.gov.sa', 
  '0559735137', 
  '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 
  1
);

-- عرض النتائج
SELECT 'تم إنشاء جداول القاعدة المركزية بنجاح' as Status;
SELECT COUNT(*) as 'عدد المستشفيات' FROM hospitals WHERE IsActive = 1;
SELECT COUNT(*) as 'عدد مديري التجمّع' FROM users_central WHERE IsActive = 1;
