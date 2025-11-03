/* =========================================================
   إضافة جدول ticket_counters لقواعد بيانات المستشفيات الموجودة
   يُستخدم لتوليد TicketNumber تسلسلي لكل سنة
   ========================================================= */

-- إنشاء جدول عداد التذاكر
CREATE TABLE IF NOT EXISTS ticket_counters (
  YearSmall  SMALLINT UNSIGNED PRIMARY KEY,  -- السنة (مثل 2025)
  LastSeq    INT UNSIGNED NOT NULL DEFAULT 0  -- آخر رقم تسلسلي
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- إدراج سجل للسنة الحالية (إذا لم يكن موجوداً)
INSERT IGNORE INTO ticket_counters (YearSmall, LastSeq)
VALUES (YEAR(CURDATE()), 0);

-- عرض النتيجة
SELECT 
  YearSmall AS 'السنة',
  LastSeq AS 'آخر رقم تسلسلي',
  'جاهز لتوليد التذاكر' AS 'الحالة'
FROM ticket_counters;

/* =========================================================
   ملاحظات:
   
   1. هذا الجدول يُستخدم لتوليد أرقام تذاكر فريدة بالصيغة:
      C-2025-000001, C-2025-000002, ...
      
   2. كل سنة لها عداد منفصل يبدأ من 1
   
   3. الباك-إند يستخدم ON DUPLICATE KEY UPDATE لزيادة العداد
   
   4. طبّق هذا السكربت على جميع قواعد بيانات المستشفيات الموجودة
   
   استخدام:
   mysql -u root -p hosp_kah < backend/sql/add_ticket_counters.sql
   ========================================================= */

