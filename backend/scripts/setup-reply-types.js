// setup-reply-types.js - إعداد أنواع الردود في جميع قواعد المستشفيات
import { getCentralPool, getActiveHospitals } from '../middleware/hospitalPool.js';

async function setupReplyTypes() {
  try {
    console.log('🔧 بدء إعداد أنواع الردود...');
    
    // جلب قائمة المستشفيات النشطة
    const hospitals = await getActiveHospitals();
    console.log(`📋 تم العثور على ${hospitals.length} مستشفى نشط`);
    
    for (const hospital of hospitals) {
      try {
        console.log(`\n🏥 معالجة المستشفى ${hospital.HospitalID}...`);
        
        // إنشاء اتصال بقاعدة المستشفى
        const { getHospitalPool } = await import('../middleware/hospitalPool.js');
        const pool = await getHospitalPool(hospital.HospitalID);
        
        // التحقق من وجود الجدول
        const [tableExists] = await pool.query(
          `SELECT COUNT(*) as count FROM information_schema.tables 
           WHERE table_schema = DATABASE() AND table_name = 'reply_types'`
        );
        
        if (tableExists[0].count === 0) {
          console.log(`📝 إنشاء جدول reply_types في المستشفى ${hospital.HospitalID}...`);
          
          // إنشاء الجدول
          await pool.query(`
            CREATE TABLE reply_types (
              ReplyTypeID INT AUTO_INCREMENT PRIMARY KEY,
              NameAr VARCHAR(255) NOT NULL COMMENT 'الاسم بالعربية',
              NameEn VARCHAR(255) NOT NULL COMMENT 'الاسم بالإنجليزية',
              IsActive TINYINT(1) DEFAULT 1 COMMENT 'نشط',
              SortOrder INT DEFAULT 0 COMMENT 'ترتيب العرض',
              CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              INDEX idx_active (IsActive),
              INDEX idx_sort (SortOrder)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='أنواع الردود على البلاغات'
          `);
          
          // إدراج البيانات الافتراضية
          await pool.query(`
            INSERT INTO reply_types (NameAr, NameEn, IsActive, SortOrder) VALUES
            ('تحديث الحالة', 'Status Update', 1, 1),
            ('متابعة', 'Follow-up', 1, 2),
            ('حل المشكلة', 'Resolution', 1, 3),
            ('معلومات إضافية', 'Additional Information', 1, 4),
            ('طلب توضيح', 'Clarification Request', 1, 5),
            ('تصعيد', 'Escalation', 1, 6),
            ('رد داخلي', 'Internal Response', 1, 7),
            ('رد عام', 'Public Response', 1, 8)
          `);
          
          console.log(`✅ تم إنشاء جدول reply_types في المستشفى ${hospital.HospitalID}`);
        } else {
          console.log(`✅ جدول reply_types موجود بالفعل في المستشفى ${hospital.HospitalID}`);
        }
        
      } catch (error) {
        console.error(`❌ خطأ في المستشفى ${hospital.HospitalID}:`, error.message);
      }
    }
    
    console.log('\n🎉 تم الانتهاء من إعداد أنواع الردود');
    
  } catch (error) {
    console.error('❌ خطأ عام:', error.message);
  }
  
  process.exit(0);
}

setupReplyTypes();
