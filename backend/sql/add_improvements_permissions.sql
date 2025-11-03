-- إضافة صلاحيات المشاريع التحسينية إلى النظام
-- هذا السكريبت يضيف الصلاحيات المطلوبة للمشاريع التحسينية

-- إضافة صلاحيات المشاريع التحسينية
INSERT IGNORE INTO permissions (PermissionKey, PermissionName, Description, Category) VALUES
('IMPROVEMENTS_VIEW', 'عرض المشاريع التحسينية', 'إمكانية عرض قائمة المشاريع التحسينية', 'IMPROVEMENTS'),
('IMPROVEMENTS_CREATE', 'إنشاء مشروع تحسيني', 'إمكانية إنشاء مشروع تحسيني جديد', 'IMPROVEMENTS'),
('IMPROVEMENTS_EDIT', 'تعديل المشاريع التحسينية', 'إمكانية تعديل المشاريع التحسينية الموجودة', 'IMPROVEMENTS'),
('IMPROVEMENTS_DELETE', 'حذف المشاريع التحسينية', 'إمكانية حذف المشاريع التحسينية', 'IMPROVEMENTS');

-- إعطاء صلاحيات المشاريع التحسينية لمديري المستشفيات (RoleID = 2)
INSERT IGNORE INTO user_permissions (UserID, HospitalID, PermissionKey, ViewScope)
SELECT 
    u.UserID,
    u.HospitalID,
    p.PermissionKey,
    'HOSPITAL'
FROM users u
CROSS JOIN permissions p
WHERE u.RoleID = 2 
  AND u.IsActive = 1
  AND p.PermissionKey IN ('IMPROVEMENTS_VIEW', 'IMPROVEMENTS_CREATE', 'IMPROVEMENTS_EDIT', 'IMPROVEMENTS_DELETE')
  AND NOT EXISTS (
    SELECT 1 FROM user_permissions up 
    WHERE up.UserID = u.UserID 
      AND up.HospitalID = u.HospitalID 
      AND up.PermissionKey = p.PermissionKey
  );

-- إعطاء صلاحيات العرض والإنشاء للموظفين العاديين (RoleID = 3)
INSERT IGNORE INTO user_permissions (UserID, HospitalID, PermissionKey, ViewScope)
SELECT 
    u.UserID,
    u.HospitalID,
    p.PermissionKey,
    'HOSPITAL'
FROM users u
CROSS JOIN permissions p
WHERE u.RoleID = 3 
  AND u.IsActive = 1
  AND p.PermissionKey IN ('IMPROVEMENTS_VIEW', 'IMPROVEMENTS_CREATE')
  AND NOT EXISTS (
    SELECT 1 FROM user_permissions up 
    WHERE up.UserID = u.UserID 
      AND up.HospitalID = u.HospitalID 
      AND up.PermissionKey = p.PermissionKey
  );

-- إعطاء جميع صلاحيات المشاريع التحسينية لمديري التجمع (RoleID = 1)
INSERT IGNORE INTO user_permissions (UserID, HospitalID, PermissionKey, ViewScope)
SELECT 
    u.UserID,
    NULL as HospitalID, -- مدير التجمع ليس له مستشفى محدد
    p.PermissionKey,
    'CLUSTER'
FROM users u
CROSS JOIN permissions p
WHERE u.RoleID = 1 
  AND u.IsActive = 1
  AND p.PermissionKey IN ('IMPROVEMENTS_VIEW', 'IMPROVEMENTS_CREATE', 'IMPROVEMENTS_EDIT', 'IMPROVEMENTS_DELETE')
  AND NOT EXISTS (
    SELECT 1 FROM user_permissions up 
    WHERE up.UserID = u.UserID 
      AND up.HospitalID IS NULL
      AND up.PermissionKey = p.PermissionKey
  );
