-- بيانات أولية للأقسام في قواعد المستشفيات
-- يجب تشغيل هذا الملف في كل قاعدة بيانات مستشفى منفصلة

-- إضافة أقسام أولية للمستشفى (تغيير HospitalID حسب المستشفى)
INSERT INTO departments (HospitalID, NameAr, NameEn, SortOrder, IsActive) VALUES
(1, 'الطوارئ', 'Emergency', 1, 1),
(1, 'التمريض', 'Nursing', 2, 1),
(1, 'الجراحة', 'Surgery', 3, 1),
(1, 'الباطنية', 'Internal Medicine', 4, 1),
(1, 'الأطفال', 'Pediatrics', 5, 1),
(1, 'النساء والولادة', 'Obstetrics & Gynecology', 6, 1),
(1, 'العظام', 'Orthopedics', 7, 1),
(1, 'العيون', 'Ophthalmology', 8, 1),
(1, 'الأنف والأذن والحنجرة', 'ENT', 9, 1),
(1, 'الجلدية', 'Dermatology', 10, 1);

-- إضافة أقسام فرعية للطوارئ
INSERT INTO departments (HospitalID, ParentDepartmentID, NameAr, NameEn, SortOrder, IsActive) VALUES
(1, 1, 'طوارئ البالغين', 'Adult Emergency', 1, 1),
(1, 1, 'طوارئ الأطفال', 'Pediatric Emergency', 2, 1),
(1, 1, 'طوارئ الحوادث', 'Trauma Emergency', 3, 1);

-- إضافة أقسام فرعية للتمريض
INSERT INTO departments (HospitalID, ParentDepartmentID, NameAr, NameEn, SortOrder, IsActive) VALUES
(1, 2, 'تمريض الجراحة', 'Surgical Nursing', 1, 1),
(1, 2, 'تمريض الباطنية', 'Medical Nursing', 2, 1),
(1, 2, 'تمريض العناية المركزة', 'ICU Nursing', 3, 1),
(1, 2, 'تمريض الأطفال', 'Pediatric Nursing', 4, 1);

-- إضافة أقسام فرعية للجراحة
INSERT INTO departments (HospitalID, ParentDepartmentID, NameAr, NameEn, SortOrder, IsActive) VALUES
(1, 3, 'جراحة عامة', 'General Surgery', 1, 1),
(1, 3, 'جراحة القلب', 'Cardiac Surgery', 2, 1),
(1, 3, 'جراحة المخ والأعصاب', 'Neurosurgery', 3, 1),
(1, 3, 'جراحة التجميل', 'Plastic Surgery', 4, 1);

-- عرض النتائج
SELECT 'تم إضافة بيانات الأقسام بنجاح' as Status;
SELECT COUNT(*) as 'عدد الأقسام الرئيسية' FROM departments WHERE HospitalID = 1 AND (ParentDepartmentID IS NULL OR ParentDepartmentID = 0);
SELECT COUNT(*) as 'عدد الأقسام الفرعية' FROM departments WHERE HospitalID = 1 AND ParentDepartmentID IS NOT NULL AND ParentDepartmentID > 0;
