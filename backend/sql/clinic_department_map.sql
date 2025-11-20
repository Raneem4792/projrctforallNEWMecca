-- Table: clinic_department_map
-- This table lives in the central database and maps external clinic names (from Excel)
-- to actual DepartmentID values for a given hospital.

CREATE TABLE IF NOT EXISTS `clinic_department_map` (
  `MapID` INT UNSIGNED NOT NULL AUTO INCREMENT,
  `HospitalID` INT UNSIGNED NOT NULL,
  `ClinicName` VARCHAR(255) NOT NULL,
  `DepartmentID` INT UNSIGNED NOT NULL,
  `CreatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`MapID`),
  UNIQUE KEY `uq_clinic` (`HospitalID`, `ClinicName`),
  KEY `idx_department` (`DepartmentID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

