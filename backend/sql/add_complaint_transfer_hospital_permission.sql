-- إضافة صلاحية تحويل البلاغ بين المستشفيات
-- Run this on the central database (hospitals_mecca3)

INSERT IGNORE INTO permissions (PermissionKey, NameAr, Category)
VALUES ('COMPLAINT_TRANSFER_HOSPITAL', 'تحويل البلاغ بين المستشفيات', 'complaints');

