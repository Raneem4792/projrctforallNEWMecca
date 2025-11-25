-- إضافة صلاحيات بلاغات إدارة التجمع
-- يتم تنفيذها في قاعدة البيانات المركزية (hospitals_mecca4)

INSERT IGNORE INTO permissions (PermissionKey, NameAr, Category) VALUES
('CLUSTER_REPORT_CREATE',   'تقديم بلاغ إدارة التجمع',              'cluster_reports'),
('CLUSTER_REPORT_VIEW',     'عرض بلاغات إدارة التجمع',              'cluster_reports'),
('CLUSTER_REPORT_DETAILS',  'عرض تفاصيل بلاغ إدارة التجمع',         'cluster_reports'),
('CLUSTER_REPORT_REPLY',    'الرد على بلاغ إدارة التجمع',           'cluster_reports'),
('CLUSTER_REPORT_STATUS',   'تغيير حالة بلاغ إدارة التجمع',         'cluster_reports');

