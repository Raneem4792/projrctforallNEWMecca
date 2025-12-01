/* =========================================================
   جدول تقارير الرضا الأسبوعي
   Satisfaction Weeks Reports Table
   
   Purpose: تخزين بيانات تقارير الرضا الأسبوعية من الإكسل
            (المستشفى – عدد التذاكر – الرضا – التواصل – التاريخ – الأسبوع)
   
   Database: hospitals_mecca3 (القاعدة المركزية)
   MySQL Version: 8.0+
   Charset: utf8mb4
   ========================================================= */

SET NAMES utf8mb4;
SET time_zone = '+03:00';
SET sql_mode = 'STRICT_ALL_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

-- إنشاء جدول تقارير الرضا الأسبوعي
CREATE TABLE IF NOT EXISTS satisfaction_weeks (
    ID BIGINT AUTO_INCREMENT PRIMARY KEY,
    HospitalID INT,
    HospitalName VARCHAR(200),
    TicketsCount INT,
    SatisfactionGeneral DECIMAL(5,2),
    SatisfactionCommunication DECIMAL(5,2),
    SatisfactionService DECIMAL(5,2),
    WeekNumber INT,
    WeekLabel VARCHAR(50),   -- الاسبوع الأول – الثاني … إلخ
    StartDate DATE,
    EndDate DATE,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_hospital (HospitalID),
    INDEX idx_hospital_name (HospitalName),
    INDEX idx_week_number (WeekNumber),
    INDEX idx_dates (StartDate, EndDate),
    INDEX idx_created (CreatedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

