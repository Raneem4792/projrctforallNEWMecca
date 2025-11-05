-- فحص صلاحية COMPLAINTS_EXPORT للمستخدم
-- استبدل UserID و HospitalID بالقيم الصحيحة

-- 1. التحقق من وجود الصلاحية في جدول permissions
SELECT * FROM permissions WHERE PermissionKey = 'COMPLAINTS_EXPORT';

-- 2. التحقق من صلاحيات المستخدم
SELECT 
    up.UserID,
    up.HospitalID,
    up.PermissionKey,
    up.ViewScope,
    p.NameAr,
    p.Category
FROM user_permissions up
LEFT JOIN permissions p ON p.PermissionKey = up.PermissionKey
WHERE up.UserID = ?  -- استبدل بـ UserID
  AND up.HospitalID = ?  -- استبدل بـ HospitalID
  AND up.PermissionKey = 'COMPLAINTS_EXPORT';

-- 3. عرض جميع صلاحيات المستخدم في هذا المستشفى
SELECT 
    up.UserID,
    up.HospitalID,
    up.PermissionKey,
    p.NameAr
FROM user_permissions up
LEFT JOIN permissions p ON p.PermissionKey = up.PermissionKey
WHERE up.UserID = ?  -- استبدل بـ UserID
  AND up.HospitalID = ?;  -- استبدل بـ HospitalID

