-- إنشاء جدول الصلاحيات الأساسية
CREATE TABLE IF NOT EXISTS permissions (
  PermissionKey VARCHAR(50) PRIMARY KEY,
  NameAr VARCHAR(100) NOT NULL,
  NameEn VARCHAR(100),
  Category VARCHAR(50) DEFAULT 'complaints',
  Description TEXT,
  CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

-- إنشاء جدول صلاحيات المستخدمين
CREATE TABLE IF NOT EXISTS user_permissions (
  UserID INT NOT NULL,
  HospitalID INT NOT NULL,
  PermissionKey VARCHAR(50) NOT NULL,
  ViewScope ENUM('HOSPITAL', 'DEPARTMENT', 'ASSIGNED') NULL,
  GrantedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  GrantedBy INT,
  PRIMARY KEY (UserID, HospitalID, PermissionKey),
  FOREIGN KEY (PermissionKey) REFERENCES permissions(PermissionKey) ON DELETE CASCADE,
  INDEX idx_user_hospital (UserID, HospitalID),
  INDEX idx_permission (PermissionKey)
);
