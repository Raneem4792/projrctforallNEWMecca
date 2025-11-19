-- حذف صلاحية CLUSTER_REPORTS_MODULE من قاعدة البيانات المركزية
-- يتم تنفيذها في قاعدة البيانات المركزية (hospitals_mecca3)

DELETE FROM permissions WHERE PermissionKey = 'CLUSTER_REPORTS_MODULE';

