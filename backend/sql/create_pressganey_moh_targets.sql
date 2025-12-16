-- إنشاء جدول المؤشر الوزاري الموحد لـ PressGaney
-- يتم حفظه في القاعدة المركزية (hospitals_mecca3)

CREATE TABLE IF NOT EXISTS pressganey_moh_targets (
  TargetID     BIGINT AUTO_INCREMENT PRIMARY KEY,
  TripName     VARCHAR(150) NOT NULL COMMENT 'اسم الرحلة',
  Year         INT NOT NULL COMMENT 'السنة',
  Quarter      ENUM('Q1','Q2','Q3','Q4') NOT NULL COMMENT 'الربع',
  TargetScore  DECIMAL(5,2) NOT NULL COMMENT 'المؤشر الوزاري',
  CreatedBy    INT NULL COMMENT 'معرف المستخدم الذي أنشأ السجل',
  CreatedAt    TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'تاريخ الإنشاء',
  UpdatedAt    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
               ON UPDATE CURRENT_TIMESTAMP COMMENT 'تاريخ آخر تحديث',

  UNIQUE KEY uq_moh_target (TripName, Year, Quarter),
  INDEX idx_trip_year (TripName, Year),
  INDEX idx_year_quarter (Year, Quarter)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='المؤشرات الوزارية الموحدة لكل رحلة وسنة وربع';

