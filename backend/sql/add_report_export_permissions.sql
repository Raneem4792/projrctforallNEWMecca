-- إضافة صلاحيات تصدير التقارير (PDF / Excel)
-- Add Report Export Permissions

INSERT IGNORE INTO permissions (PermissionKey, NameAr, Category) VALUES
('REPORT_SUMMARY_EXPORT',     'تصدير تقرير ملخص التجمع',       'reports'),
('REPORT_DETAILS_EXPORT',     'تصدير تقرير البلاغات التفصيلية', 'reports'),
('REPORT_DEPARTMENTS_EXPORT', 'تصدير تقرير أداء الأقسام',        'reports'),
('REPORT_EMPLOYEES_EXPORT',   'تصدير تقرير أداء الموظفين',       'reports'),
('REPORT_CRITICAL_EXPORT',    'تصدير تقرير البلاغات الحرجة',     'reports');

