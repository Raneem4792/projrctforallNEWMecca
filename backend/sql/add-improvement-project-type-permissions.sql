-- =====================================================
-- إضافة صلاحيات أنواع المشاريع التحسينية
-- =====================================================
-- هذا السكريبت يضيف 3 صلاحيات جديدة لاختيار نوع المشروع:
-- 1. IMPROVEMENT_937 - مشروع 937
-- 2. IMPROVEMENT_PG - مشروع PressGaney
-- 3. IMPROVEMENT_OPEN - مشروع مفتوح / أخرى
-- =====================================================

-- إضافة الصلاحيات في جدول permissions
INSERT IGNORE INTO permissions (PermissionKey, NameAr, Category) VALUES
('IMPROVEMENT_937',  'مشروع 937', 'improvement'),
('IMPROVEMENT_PG',   'مشروع PressGaney', 'improvement'),
('IMPROVEMENT_OPEN', 'مشروع مفتوح / أخرى', 'improvement');

-- التحقق من إضافة الصلاحيات
SELECT * FROM permissions WHERE PermissionKey IN ('IMPROVEMENT_937', 'IMPROVEMENT_PG', 'IMPROVEMENT_OPEN') ORDER BY PermissionKey;

