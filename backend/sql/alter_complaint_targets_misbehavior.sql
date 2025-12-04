-- توسيع جدول complaint_targets لدعم بيانات إكسل سوء المعاملة
-- ALTER TABLE complaint_targets

-- ملاحظة: قبل تنفيذ هذا السكريبت، تأكد من عدم وجود الأعمدة بالفعل
-- إذا كانت موجودة، يمكنك تخطي الأخطاء أو حذف الأعمدة أولاً

-- إضافة الأعمدة المطلوبة لبيانات سوء المعاملة
-- (MySQL لا يدعم IF NOT EXISTS في ALTER TABLE، لذا تأكد من عدم وجود الأعمدة أولاً)

ALTER TABLE complaint_targets
ADD COLUMN RepeatCount VARCHAR(20) NULL COMMENT 'عدد مرات التكرار',
ADD COLUMN DidGuidanceSession TINYINT(1) DEFAULT 0 COMMENT 'هل تم عمل جلسة استرشادية',
ADD COLUMN DidDirectorAction TINYINT(1) DEFAULT 0 COMMENT 'هل تم توجيهها من مدير المنشأة',
ADD COLUMN DidLegalReferral TINYINT(1) DEFAULT 0 COMMENT 'هل تم إحالة الموظف للتدوين القانوني',
ADD COLUMN DidAnnualEvaluation TINYINT(1) DEFAULT 0 COMMENT 'هل تم ربطها بتقييم الموظف السنوي',
ADD COLUMN CaseStatus VARCHAR(50) NULL COMMENT 'حالة البلاغ (مكتمل، غير مكتمل، 25%، 50%، 75%)';

-- ملاحظة: ComplaintID يمكن أن يكون NULL للبلاغات القادمة من الإكسل فقط
-- (بدون ربط ببلاغ محدد)
-- إذا كان العمود ComplaintID غير قابل للـ NULL حالياً، قم بتعديله:
ALTER TABLE complaint_targets
MODIFY COLUMN ComplaintID BIGINT UNSIGNED NULL;

