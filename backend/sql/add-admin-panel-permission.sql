-- إضافة صلاحية لوحة الإدارة
-- نفّذ هذا السكربت في كل قاعدة مستشفى منفصلة

-- إضافة الصلاحية الجديدة
INSERT IGNORE INTO permissions (PermissionKey, NameAr, Category) 
VALUES ('ADMIN_PANEL_ACCESS', 'لوحة الإدارة', 'system');

-- عرض الصلاحيات المضافة
SELECT * FROM permissions WHERE PermissionKey = 'ADMIN_PANEL_ACCESS';

-- ملاحظة: لتفعيل الصلاحية لمستخدم معين، استخدم:
-- INSERT INTO user_permissions (UserID, HospitalID, PermissionKey, ViewScope)
-- VALUES (USER_ID, HOSPITAL_ID, 'ADMIN_PANEL_ACCESS', NULL);
