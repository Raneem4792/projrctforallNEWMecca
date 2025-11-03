-- إنشاء جداول الصلاحيات في قاعدة المستشفى (Tenant DB)
-- نفّذ هذا السكربت في كل قاعدة مستشفى منفصلة

-- 1) جدول permissions (مرجعي)
CREATE TABLE IF NOT EXISTS permissions (
  PermissionKey VARCHAR(64) PRIMARY KEY,
  NameAr        VARCHAR(150) NOT NULL,
  NameEn        VARCHAR(150) NULL,
  Category      VARCHAR(50)  NOT NULL DEFAULT 'complaints',
  DescriptionAr TEXT NULL,
  DescriptionEn TEXT NULL,
  CreatedAt     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- إدراج الصلاحيات الأساسية
INSERT IGNORE INTO permissions (PermissionKey, NameAr, Category) VALUES
('COMPLAINT_SUBMIT',        'تقديم بلاغ',                 'complaints'),
('COMPLAINT_VIEW',          'عرض/متابعة البلاغات',         'complaints'),
('COMPLAINT_HISTORY_SCOPE', 'نطاق سجل البلاغات',           'complaints'),
('COMPLAINT_REPLY',         'الرد على البلاغ',             'complaints'),
('COMPLAINT_TRANSFER',      'تحويل البلاغ',                'complaints'),
('COMPLAINT_STATUS_UPDATE', 'تغيير حالة البلاغ',           'complaints'),
('COMPLAINT_DELETE',        'حذف البلاغ',                  'complaints'),
('ADMIN_PANEL_ACCESS',      'لوحة الإدارة',                'system');

-- 2) جدول user_permissions (القلب)
CREATE TABLE IF NOT EXISTS user_permissions (
  UserID          INT UNSIGNED NOT NULL,
  HospitalID      INT UNSIGNED NOT NULL,
  PermissionKey   VARCHAR(64)  NOT NULL,
  ViewScope       ENUM('HOSPITAL','DEPARTMENT','ASSIGNED') NULL,
  GrantedByUserID INT UNSIGNED NULL,
  GrantedAt       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (UserID, HospitalID, PermissionKey),
  FOREIGN KEY (PermissionKey) REFERENCES permissions(PermissionKey) ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX idx_user_hospital (UserID, HospitalID),
  INDEX idx_permission (PermissionKey)
);

-- 3) جدول role_default_permissions (اختياري لكن مفيد لاحقًا)
CREATE TABLE IF NOT EXISTS role_default_permissions (
  RoleID              TINYINT UNSIGNED NOT NULL,
  PermissionKey       VARCHAR(64) NOT NULL,
  DefaultViewScope    ENUM('HOSPITAL','DEPARTMENT','ASSIGNED') NULL,
  PRIMARY KEY (RoleID, PermissionKey),
  FOREIGN KEY (PermissionKey) REFERENCES permissions(PermissionKey) ON DELETE CASCADE ON UPDATE CASCADE
);

-- إدراج الصلاحيات الافتراضية للأدوار
INSERT IGNORE INTO role_default_permissions (RoleID, PermissionKey, DefaultViewScope) VALUES
-- مدير المستشفى (RoleID = 2) - جميع الصلاحيات
(2, 'COMPLAINT_SUBMIT', 'HOSPITAL'),
(2, 'COMPLAINT_VIEW', 'HOSPITAL'),
(2, 'COMPLAINT_HISTORY_SCOPE', 'HOSPITAL'),
(2, 'COMPLAINT_REPLY', 'HOSPITAL'),
(2, 'COMPLAINT_TRANSFER', 'HOSPITAL'),
(2, 'COMPLAINT_STATUS_UPDATE', 'HOSPITAL'),
(2, 'COMPLAINT_DELETE', 'HOSPITAL'),

-- الموظف العادي (RoleID = 3) - صلاحيات محدودة
(3, 'COMPLAINT_SUBMIT', NULL),
(3, 'COMPLAINT_VIEW', 'DEPARTMENT'),
(3, 'COMPLAINT_HISTORY_SCOPE', 'DEPARTMENT'),
(3, 'COMPLAINT_REPLY', NULL);

-- عرض الجداول المنشأة
SHOW TABLES LIKE '%permission%';

-- عرض الصلاحيات المنشأة
SELECT * FROM permissions ORDER BY Category, PermissionKey;

-- عرض الصلاحيات الافتراضية للأدوار
SELECT r.RoleID, p.NameAr, r.DefaultViewScope 
FROM role_default_permissions r
JOIN permissions p ON r.PermissionKey = p.PermissionKey
ORDER BY r.RoleID, p.Category, p.PermissionKey;
