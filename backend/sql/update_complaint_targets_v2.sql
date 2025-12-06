-- تحديث جدول complaint_targets لإضافة الأعمدة الجديدة ودعم القيم الفارغة
-- هذا الملف يقوم بتعديل الجدول الحالي

-- 1. تعديل ComplaintID ليقبل NULL (لأن البيانات المستوردة من الإكسل قد لا تكون مرتبطة ببلاغ في النظام)
ALTER TABLE complaint_targets MODIFY COLUMN ComplaintID BIGINT UNSIGNED NULL COMMENT 'معرف البلاغ الأصلي (اختياري)';

-- 2. إضافة الأعمدة الجديدة
ALTER TABLE complaint_targets
ADD COLUMN IF NOT EXISTS RepeatCount VARCHAR(20) NULL COMMENT 'عدد مرات التكرار',
ADD COLUMN IF NOT EXISTS DidGuidanceSession TINYINT(1) DEFAULT 0 COMMENT 'هل تم عمل جلسة استرشادية',
ADD COLUMN IF NOT EXISTS DidDirectorAction TINYINT(1) DEFAULT 0 COMMENT 'هل تم توقيعها من مدير المنشأة',
ADD COLUMN IF NOT EXISTS DidLegalReferral TINYINT(1) DEFAULT 0 COMMENT 'هل تم إحالة الموظف للتدوين القانونية',
ADD COLUMN IF NOT EXISTS DidAnnualEvaluation TINYINT(1) DEFAULT 0 COMMENT 'هل تم ربطها بتقييم الموظف السنوي',
ADD COLUMN IF NOT EXISTS CaseStatus VARCHAR(50) NULL COMMENT 'حالة البلاغ';

