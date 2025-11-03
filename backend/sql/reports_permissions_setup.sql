-- إضافة مفاتيح الصلاحيات للتقارير والإحصائيات
-- Reports Permissions Setup

INSERT IGNORE INTO permissions (PermissionKey, NameAr, Category) VALUES
-- صفحة التقارير
('REPORTS_PAGE',                         'عرض صفحة التقارير والإحصائيات',              'reports'),

-- البطاقات KPIs أعلى الصفحة
('REPORTS_CARD_TOTALS',                  'بطاقة إجمالي البلاغات',                       'reports'),
('REPORTS_CARD_OPEN',                    'بطاقة البلاغات المفتوحة',                     'reports'),
('REPORTS_CARD_CLOSED',                  'بطاقة البلاغات المغلقة',                      'reports'),
('REPORTS_CARD_URGENT',                  'بطاقة البلاغات الحرجة',                       'reports'),
('REPORTS_CARD_SLA',                     'بطاقة الالتزام بالـ SLA',                     'reports'),
('REPORTS_CARD_HOSPITALS',               'بطاقة عدد المستشفيات',                         'reports'),

-- الرسومات حسب صورك
('REPORTS_CHART_BY_HOSPITAL_TYPE',       'عدد البلاغات حسب نوعها في كل مستشفى',          'reports'),
('REPORTS_CHART_STATUS_DISTRIBUTION',    'توزيع حالات البلاغات (دونات)',                 'reports'),
('REPORTS_CHART_TREND_6M',               'اتجاه البلاغات (آخر 6 أشهر)',                   'reports'),
('REPORTS_CHART_URGENT_PERCENT',         'نسبة البلاغات الحرجة في كل مستشفى',             'reports'),
('REPORTS_CHART_BY_DEPARTMENT',          'عدد البلاغات لكل قسم (مع فلتر المستشفى)',       'reports'),
('REPORTS_CHART_TOP_EMPLOYEES',          'الموظفون الأكثر تكرّرًا في البلاغات',              'reports');
