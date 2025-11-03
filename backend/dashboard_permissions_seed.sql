-- إضافة مفاتيح لوحة التحكم في قاعدة المستشفى
-- Dashboard permissions seed for tenant databases

INSERT IGNORE INTO permissions (PermissionKey, NameAr, Category) VALUES
('DASH_PAGE',                  'عرض لوحة التحكم',                'dashboard'),
('DASH_CARD_TOTALS',           'بطاقة إجمالي البلاغات',          'dashboard'),
('DASH_CARD_OPEN',             'بطاقة البلاغات المفتوحة',        'dashboard'),
('DASH_CARD_CLOSED',           'بطاقة البلاغات المغلقة',         'dashboard'),
('DASH_CARD_URGENT',           'بطاقة البلاغات الحرجة',          'dashboard'),
('DASH_CARD_CLOSE_RATE',       'بطاقة معدل الإغلاق',             'dashboard'),
('DASH_CARD_HOSPITAL_COUNT',   'بطاقة عدد المستشفيات',           'dashboard'),
('DASH_CHART_MYSTERY_BY_DEPT', 'رسم الزائر السري حسب الأقسام',   'dashboard'),
('DASH_CHART_CLASSIFICATIONS', 'رسم التصنيفات',                  'dashboard'),
('DASH_CHART_TOP_CLINICS',     'رسم أعلى العيادات',              'dashboard'),
('DASH_CHART_DAILY_TREND',     'رسم الشكاوى اليومية',            'dashboard'),
('DASH_URGENT_LIST',           'قائمة البلاغات الحمراء',         'dashboard');
