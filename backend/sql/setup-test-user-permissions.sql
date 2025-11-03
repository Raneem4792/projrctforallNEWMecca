-- إعداد صلاحيات المستخدم التجريبية
-- نفّذ هذا السكربت في قاعدة المستشفى بعد إنشاء الجداول

-- 1) تحديث DepartmentID للمستخدم (UserID = 20)
-- غيّر القيمة 5 إلى قسم حقيقي موجود في قاعدة المستشفى
UPDATE users
SET DepartmentID = 5   -- << غيّر 5 إلى قسم حقيقي عندك
WHERE UserID = 20 AND HospitalID = 11;

-- تحقق من التحديث
SELECT UserID, FullName, DepartmentID, HospitalID 
FROM users 
WHERE UserID = 20 AND HospitalID = 11;

-- 2) إعطاء صلاحيات العرض + نطاق "القسم"
INSERT INTO user_permissions (UserID, HospitalID, PermissionKey, ViewScope, GrantedByUserID)
VALUES
(20, 11, 'COMPLAINT_VIEW', NULL, 1)
ON DUPLICATE KEY UPDATE ViewScope=VALUES(ViewScope), GrantedAt=NOW();

INSERT INTO user_permissions (UserID, HospitalID, PermissionKey, ViewScope, GrantedByUserID)
VALUES
(20, 11, 'COMPLAINT_HISTORY_SCOPE', 'DEPARTMENT', 1)
ON DUPLICATE KEY UPDATE ViewScope=VALUES(ViewScope), GrantedAt=NOW();

-- 3) إعطاء صلاحيات إضافية (اختياري)
INSERT INTO user_permissions (UserID, HospitalID, PermissionKey, ViewScope, GrantedByUserID)
VALUES
(20, 11, 'COMPLAINT_SUBMIT', NULL, 1),
(20, 11, 'COMPLAINT_REPLY', NULL, 1)
ON DUPLICATE KEY UPDATE ViewScope=VALUES(ViewScope), GrantedAt=NOW();

-- 4) عرض الصلاحيات الممنوحة للمستخدم
SELECT 
    up.UserID,
    up.HospitalID,
    p.NameAr AS PermissionName,
    up.PermissionKey,
    up.ViewScope,
    up.GrantedAt
FROM user_permissions up
JOIN permissions p ON up.PermissionKey = p.PermissionKey
WHERE up.UserID = 20 AND up.HospitalID = 11
ORDER BY p.Category, p.PermissionKey;

-- 5) اختبار: عرض المستخدم مع قسمه وصلاحياته
SELECT 
    u.UserID,
    u.FullName,
    u.DepartmentID,
    u.HospitalID,
    d.NameAr AS DepartmentName
FROM users u
LEFT JOIN departments d ON u.DepartmentID = d.DepartmentID
WHERE u.UserID = 20 AND u.HospitalID = 11;

-- 6) اختبار: عرض بلاغات القسم (للتأكد من وجود بيانات للاختبار)
SELECT 
    c.ComplaintID,
    c.TicketNumber,
    c.PatientFullName,
    c.DepartmentID,
    d.NameAr AS DepartmentName,
    c.StatusCode
FROM complaints c
LEFT JOIN departments d ON c.DepartmentID = d.DepartmentID
WHERE c.HospitalID = 11 
  AND c.DepartmentID = 5  -- نفس القسم المحدد للمستخدم
  AND (c.IsDeleted IS NULL OR c.IsDeleted = 0)
ORDER BY c.CreatedAt DESC
LIMIT 10;
