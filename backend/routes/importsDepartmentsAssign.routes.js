// routes/importsDepartmentsAssign.routes.js
import express from 'express';
import multer from 'multer';
import xlsx from 'xlsx';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissionGuard.js';
import { getHospitalPool } from '../config/db.js';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

const NATIONAL_ID_HEADERS = [
  'pat_id_crd_no',
  'patidcrdno',
  'nationalid',
  'national_id',
  'national id',
  'رقمالهوية',
  'رقم الهوية',
  'الهوية',
  'identitynumber',
  'civilid'
];

const CLINIC_NAME_HEADERS = [
  'clinicname',
  'clinic_name',
  'clinic name',
  'clinic',
  'clinicnamear',
  'clinicnameen',
  'clinicnamearabic',
  'clinicnameenglish',
  'clinicnamepm',
  'clinicnameam',
  'clinic',
  'clinicnamepm',
  'clinicnameam',
  'clinicname_en',
  'clinicname_ar',
  'clinicname(ar)',
  'clinicname(en)',
  'العيادة',
  'اسم العيادة',
  'clinicname.'
];

function normalizeKey(key = '') {
  return String(key)
    .toLowerCase()
    .replace(/[\u200f\u200e\u202a-\u202e]/g, '')
    .replace(/[\s_\-./\\]+/g, '')
    .trim();
}

function extractValue(row, headerList) {
  for (const [key, value] of Object.entries(row)) {
    if (!value && value !== 0) continue;
    if (headerList.includes(normalizeKey(key))) {
      return typeof value === 'string' ? value : value?.toString?.() ?? '';
    }
  }
  return '';
}

function parseExcelRows(buffer) {
  const workbook = xlsx.read(buffer, { type: 'buffer', cellDates: false });
  const [firstSheet] = workbook.Sheets ? workbook.Sheets[workbook.SheetNames[0]] ? [workbook.Sheets[workbook.SheetNames[0]]] : [] : [];
  if (!firstSheet) {
    throw new Error('ملف الإكسل لا يحتوي على أوراق عمل.');
  }
  return xlsx.utils.sheet_to_json(firstSheet, { defval: '' });
}

function normalizeClinicName(name = '') {
  return name.trim().toLowerCase();
}

async function ensureClinicMapTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clinic_department_map (
      MapID INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      HospitalID INT UNSIGNED NOT NULL,
      ClinicName VARCHAR(255) NOT NULL,
      DepartmentID INT UNSIGNED NOT NULL,
      CreatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_clinic (HospitalID, ClinicName),
      KEY idx_department (DepartmentID)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

router.post(
  '/departments-assign',
  requireAuth,
  requirePermission('IMPORTS_DEPARTMENTS'),
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'لم يتم إرفاق ملف.' });
      }

      let hospitalId = Number(
        req.body?.hospitalId ||
        req.query?.hospitalId ||
        req.user?.HospitalID ||
        req.user?.hospitalId ||
        req.hospitalId
      );

      if (!hospitalId || Number.isNaN(hospitalId)) {
        return res.status(400).json({ message: 'يجب تحديد المستشفى.' });
      }

      const rows = parseExcelRows(req.file.buffer);
      if (!rows.length) {
        return res.status(400).json({ message: 'ملف الإكسل لا يحتوي على بيانات.' });
      }

      const hospitalPool = await getHospitalPool(hospitalId);
      await ensureClinicMapTable(hospitalPool);

      const [mappings] = await hospitalPool.query(
        'SELECT ClinicName, DepartmentID FROM clinic_department_map WHERE HospitalID = ?',
        [hospitalId]
      );

      const clinicMap = new Map();
      for (const mapRow of mappings) {
        if (!mapRow.ClinicName || !mapRow.DepartmentID) continue;
        clinicMap.set(normalizeClinicName(mapRow.ClinicName), mapRow.DepartmentID);
      }

      let updated = 0;
      let notFound = 0;
      const missingClinics = new Set();

      for (const row of rows) {
        const nationalId = extractValue(row, NATIONAL_ID_HEADERS).trim();
        const clinicName = extractValue(row, CLINIC_NAME_HEADERS).trim();

        if (!nationalId || !clinicName) {
          continue;
        }

        const normalizedClinic = normalizeClinicName(clinicName);
        const departmentId = clinicMap.get(normalizedClinic);

        if (!departmentId) {
          missingClinics.add(clinicName);
          continue;
        }

        try {
          const [result] = await hospitalPool.query(
            'UPDATE complaints SET DepartmentID = ? WHERE NationalID = ?',
            [departmentId, nationalId]
          );

          if (result.affectedRows > 0) {
            updated += result.affectedRows;
          } else {
            notFound++;
          }
        } catch (err) {
          console.error('Failed to update complaint for NationalID:', nationalId, err.message);
          notFound++;
        }
      }

      res.json({
        success: true,
        updated,
        notFound,
        missingClinics: Array.from(missingClinics),
        message: missingClinics.size
          ? `تم تحديث ${updated} بلاغ. يوجد ${missingClinics.size} عيادات غير مربوطة.`
          : `تم تحديث ${updated} بلاغ بنجاح.`
      });
    } catch (error) {
      console.error('Error handling departments assign import:', error);
      res.status(500).json({ message: 'حدث خطأ أثناء معالجة الملف', details: error.message });
    }
  }
);

export default router;

