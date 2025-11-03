-- فحص صلاحية لوحة الإدارة
-- نفّذ هذا السكربت في قاعدة المستشفى للتحقق من الصلاحية

-- 1. فحص وجود الصلاحية في جدول permissions
SELECT * FROM permissions WHERE PermissionKey = 'ADMIN_PANEL_ACCESS';

-- 2. فحص صلاحيات مستخدم معين
-- استبدل USER_ID و HOSPITAL_ID بالقيم الصحيحة
SELECT 
    up.UserID,
    up.HospitalID,
    up.PermissionKey,
    up.ViewScope,
    up.GrantedAt
FROM user_permissions up
WHERE up.UserID = ? 
  AND up.HospitalID = ? 
  AND up.PermissionKey = 'ADMIN_PANEL_ACCESS';

-- 3. فحص جميع صلاحيات مستخدم معين
SELECT 
    up.PermissionKey,
    up.ViewScope,
    up.GrantedAt
FROM user_permissions up
WHERE up.UserID = ? 
  AND up.HospitalID = ?;

-- 4. إضافة الصلاحية لمستخدم معين (إذا لم تكن موجودة)
-- استبدل القيم بالقيم الصحيحة
INSERT IGNORE INTO user_permissions (UserID, HospitalID, PermissionKey, ViewScope)
VALUES (?, ?, 'ADMIN_PANEL_ACCESS', NULL);
