// routes/imports937.routes.js
import express from 'express';
import multer from 'multer';
import xlsx from 'xlsx';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissionGuard.js';
import { getCentralPool } from '../db/centralPool.js';
import { getTenantPoolByHospitalId } from '../db/tenantManager.js';

// دالة لكشف النصوص المكسورة UTF-8
function looksBrokenUTF8(s) {
  if (!s) return false;
  // وجود محارف الاستبدال أو أنماط UTF-8 التالفة
  return s.includes('�') || s.includes('Ã') || s.includes('Â');
}

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// --- أدوات مساعدة -------------------------------------------------

// قسم افتراضي للصفوف التي لا تحتوي على قسم
const UNCATEGORIZED_DEPT_NAME = 'غير مصنف';

// اعثر أو أنشئ قسم "غير مصنف" للمنشأة المحددة
async function getOrCreateUncategorizedDept(pool, hospitalId) {
  try {
    // البحث عن القسم أولاً (بأي من الاسمين العربي/الإنجليزي)
    const [existing] = await pool.query(
      `SELECT DepartmentID FROM departments
       WHERE HospitalID = ? AND IsActive = 1
         AND (NameAr = ? OR NameEn = ?)
       LIMIT 1`,
      [hospitalId, UNCATEGORIZED_DEPT_NAME, 'Uncategorized']
    );
    
    if (existing.length > 0) {
      return existing[0].DepartmentID;
    }
    
    // إنشاء القسم إذا لم يوجد
    const [result] = await pool.query(
      `INSERT INTO departments
        (HospitalID, ParentDepartmentID, Code, NameAr, NameEn, IsActive, SortOrder, CreatedAt, UpdatedAt)
       VALUES (?, NULL, 'UNCAT', ?, ?, 1, 999, NOW(), NOW())`,
      [hospitalId, UNCATEGORIZED_DEPT_NAME, 'Uncategorized']
    );
    
    return result.insertId;
  } catch (error) {
    console.error('Error creating uncategorized department:', error);
    return null;
  }
}

// تطبيع نص عربي (يشيل تطويل، مسافات زايدة، توحيد الياء/الألف/الهاء... إلخ)
function normalizeAr(str = '') {
  let s = String(str || '').trim();
  
  // إزالة علامات الاقتباس والترقيم
  s = s.replace(/[«»"""'`´،؛:()\[\]{}<>\/\\\-\–\—\.‏٫٬!؟?*_]/g, ' ');
  
  // محارف الاتجاه والكنترول (LRM/RLM و…)
  s = s.replace(/[\u200E\u200F\u202A-\u202E]/g, '');
  
  // تطويل والكشيدة
  s = s.replace(/[\u0640ـ]/g, '');
  
  // حذف التشكيل
  s = s.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, '');
  
  // توحيد أشكال الألف والهمزات
  s = s.replace(/[إأٱآ]/g, 'ا');
  s = s.replace(/ؤ/g, 'و');
  s = s.replace(/ئ/g, 'ي');
  s = s.replace(/ء/g, '');
  
  // توحيد ياء/ألف مقصورة
  s = s.replace(/ى/g, 'ي');
  
  // توحيد تاء مربوطة/هاء
  s = s.replace(/ة/g, 'ه');
  
  // حذف التكرارات غير المقصودة (الملكك -> الملك، العواالي -> العوالي)
  s = s.replace(/([اأإآبتثجحخدذرزسشصضطظعغفقكلمنهوي])\1+/g, '$1');
  
  // استبدال كل ما عدا الحروف/الأرقام بمسافة
  s = s.replace(/[^\p{L}\p{N}]+/gu, ' ');
  
  // مسافة واحدة
  s = s.replace(/\s+/g, ' ');
  
  return s.trim().toLowerCase();
}

// قاموس الأسماء البديلة الشائعة
const FACILITY_ALIASES = {
  'المدينة الطبية للملك عبدالله': 'مدينة الملك عبدالله الطبية',
  'مدينة الملك عبدالله الطبيه': 'مدينة الملك عبدالله الطبية',
  'مستشفي النور التخصصي': 'مستشفى النور التخصصي',
  'مستشفي الملك فيصل': 'مستشفى الملك فيصل',
  'مستشفي حراء العام': 'مستشفى حراء العام',
  'مستشفي اجياد العام': 'مستشفى أجياد العام',
  'مستشفي الولاده والاطفال بمكه المكرمه': 'مستشفى الولادة والأطفال',
  'مستشفي القنفذه العام': 'مستشفى القنفذة العام',
  'مستشفي المظيلف العام': 'مستشفى المظيلف العام',
  'مستشفي جنوب القنفذه': 'مستشفى جنوب القنفذة',
  'مستشفي خليص': 'مستشفى خليص',
  'مستشفي ثريبان': 'مستشفى ثريبان',
  'مستشفي نمره العام': 'مستشفى نمرة العام',
  'مستشفي الكامل العام': 'مستشفى الكامل العام',
};

// تطبيق الأسماء البديلة
function aliasOrRaw(name) {
  const norm = normalizeAr(name);
  for (const [alias, canonical] of Object.entries(FACILITY_ALIASES)) {
    if (normalizeAr(alias) === norm) return canonical;
  }
  return name;
}

// تجاهل الكلمات العامة (مستشفى/مركز صحي/مدينة طبية…)
function stripGenericFacilityWords(s = '') {
  // كلمات عامة لا تؤثر على التطابق
  const stopWords = [
    'مستشفي', 'مستشفى', 'مركز صحي', 'مركز', 'مدينة طبيه', 'مدينة طبية',
    'مستوصف', 'مؤسسه', 'الخدمه', 'الخدمة', 'قطاع', 'مجمع', 'مستشفيات',
    'بمكة المكرمة', 'بمكه المكرمه', 'بمكة', 'بمكه'
  ];
  let out = s;
  for (const w of stopWords) {
    const wNorm = normalizeAr(w);
    out = out.replace(new RegExp(`\\b${wNorm}\\b`, 'g'), ' ');
  }
  return normalizeAr(out);
}

function toGenderCode(val) {
  const v = (val || '').toString().trim();
  if (/^(m|male|ذكر)$/i.test(v)) return 'M';
  if (/^(f|female|انثى|أنثى)$/i.test(v)) return 'F';
  return null; // لو مو موجود نخليها NULL
}

function asDate(val) {
  // يقبل Excel serial أو نص تاريخ
  if (val == null || val === '') return null;
  if (typeof val === 'number') {
    // Excel serial base (assuming 1900)
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return isNaN(d) ? null : d.toISOString().slice(0, 10);
  }
  const d = new Date(val);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}

// خريطة أسماء الأعمدة المحتملة من تقرير 937 إلى حقولنا
// (عدّلت الأسماء الأكثر شيوعاً؛ لو عندك تسميات مختلفة أضيفيها في aliases)
const HEADER_MAP = {
  // في الإكسل:
  ticketNumber: ['رقم البلاغ', 'رقم التذكرة', 'رقم الطلب', 'Ticket No', 'Ticket Number'],
  hospitalName: [
    'المنشأة/ الخدمة',
    'المنشأة/الخدمة',
    'المنشأة/ الإدارة',
    'المنشأة/الادارة',
    'اسم المنشأة',
    'المنشأة',
    'المستشفى',
    'Facility',
    'Hospital'
  ],
  patientFullName: ['اسم المريض/المتصل', 'اسم المتصل', 'اسم المريض', 'Caller Name', 'Patient Name'],
  patientIDNumber: ['رقم هوية المتصل', 'رقم الهوية', 'هوية المتصل', 'National ID', 'Caller ID'],
  patientMobile: ['رقم الجوال للمتصل', 'رقم الجوال', 'جوال', 'Mobile', 'Caller Phone'],
  gender: ['الجنس', 'Gender'],
  visitDate: ['تاريخ الزيارة', 'تاريخ البلاغ', 'Visit Date', 'Date'],
  complaintTypeName: ['التصنيف الرئيسي', 'نوع البلاغ', 'Main Type'],
  subTypeName: ['التصنيف الفرعي للتذكرة', 'التصنيف الفرعي', 'Sub Type', 'Subtype'],
  description: ['الوصف', 'وصف البلاغ', 'Description'],
  priority: ['الأولوية', 'Priority'],
  status: ['الحالة', 'Status'],
};

function detectHeaderRow(aoa) {
  // نبني قائمة الأسماء المحتملة لكل حقل بعد التطبيع
  const wanted = new Set();
  for (const aliases of Object.values(HEADER_MAP)) {
    for (const a of aliases) wanted.add(normalizeAr(a));
  }

  let bestRow = -1, bestHits = 0;
  const MAX_SCAN = Math.min(aoa.length, 30); // نفحص أول 30 صف كفاية

  for (let r = 0; r < MAX_SCAN; r++) {
    const row = aoa[r] || [];
    let hits = 0;
    for (const cell of row) {
      const v = normalizeAr(String(cell || ''));
      if (wanted.has(v)) hits++;
    }
    if (hits > bestHits) { bestHits = hits; bestRow = r; }
  }
  return (bestHits >= 2) ? bestRow : -1; // لازم نلاقي على الأقل حقلين
}

function buildHeaderIndex(firstRow) {
  // يبني قاموس: المفتاح الداخلي -> اسم العمود الموجود فعلاً
  const map = {};
  const normCols = {};
  Object.keys(firstRow).forEach((k) => {
    normCols[normalizeAr(k)] = k;
  });
  for (const [ourKey, aliases] of Object.entries(HEADER_MAP)) {
    const found = aliases.find(a => normalizeAr(a) in normCols);
    if (found) map[ourKey] = normCols[normalizeAr(found)];
  }
  return map;
}

function buildHeaderIndexFromHeaders(headersArr) {
  const map = {};
  const normCols = {};
  headersArr.forEach((h) => { normCols[normalizeAr(h)] = h; });
  for (const [ourKey, aliases] of Object.entries(HEADER_MAP)) {
    const found = aliases.find(a => normalizeAr(a) in normCols);
    if (found) map[ourKey] = normCols[normalizeAr(found)];
  }
  return map;
}

// --- استعلامات -----------------------------------------------------

async function findHospitalIdByName(centralPool, nameRaw) {
  if (!nameRaw) return null;

  // تطبيق الأسماء البديلة أولاً
  const preparedName = aliasOrRaw(nameRaw);
  
  // تطبيع الاسم الوارد من الإكسل
  const normFull = normalizeAr(preparedName);
  const normCore = stripGenericFacilityWords(normFull); // بدون كلمات عامة

  // نجيب كل المستشفيات الفعالة
  const [rows] = await centralPool.query(
    `SELECT HospitalID, NameAr, NameEn, Code
     FROM hospitals
     WHERE IsActive = 1`
  );
  
  // Debug: عرض المستشفيات المتاحة (مرة واحدة فقط)
  if (!findHospitalIdByName._logged) {
    console.log('🏥 Available hospitals in DB:', rows.map(r => ({
      id: r.HospitalID,
      nameAr: r.NameAr,
      normalized: normalizeAr(r.NameAr || ''),
      core: stripGenericFacilityWords(normalizeAr(r.NameAr || ''))
    })));
    findHospitalIdByName._logged = true;
  }

  // 1) تطابق تام على أي عمود
  for (const r of rows) {
    const ar = normalizeAr(r.NameAr || '');
    const en = normalizeAr(r.NameEn || '');
    const code = normalizeAr(r.Code || '');
    if (normFull === ar || normFull === en || normFull === code ||
        normCore === stripGenericFacilityWords(ar)) {
      return r.HospitalID;
    }
  }

  // 2) احتواء (سواء الملف يحتوي اسم القاعدة أو العكس) مع النسخة المنزوعة الكلمات العامة
  for (const r of rows) {
    const ar = normalizeAr(r.NameAr || '');
    const en = normalizeAr(r.NameEn || '');
    const code = normalizeAr(r.Code || '');
    const arCore = stripGenericFacilityWords(ar);
    const enCore = stripGenericFacilityWords(en);

    if (
      // تطابق مرن
      normFull.includes(ar) || ar.includes(normFull) ||
      normFull.includes(en) || en.includes(normFull) ||
      normCore && (normCore.includes(arCore) || arCore.includes(normCore)) ||
      enCore && (normCore.includes(enCore) || enCore.includes(normCore)) ||
      (code && (code === normFull || code === normCore))
    ) {
      return r.HospitalID;
    }
  }

  // 3) جدول الأسماء البديلة (إن وجد)
  try {
    const [a] = await centralPool.query(
      `SELECT HospitalID
       FROM hospital_aliases
       WHERE REPLACE(LOWER(Alias), ' ', '') = ? LIMIT 1`,
      [normFull.replace(/\s+/g, '')]
    );
    if (a.length) return a[0].HospitalID;
  } catch { /* اختياري */ }

  return null;
}

async function findTypeIdByName(pool, name) {
  if (!name) return null;
  const [rows] = await pool.query(
    'SELECT ComplaintTypeID FROM complaint_types WHERE TypeName = ? OR TypeNameEn = ? LIMIT 1',
    [name, name]
  );
  return rows?.[0]?.ComplaintTypeID || null;
}

async function findSubTypeIdByName(pool, name, complaintTypeID = null) {
  if (!name) return null;
  const [rows] = await pool.query(
    'SELECT SubTypeID FROM complaint_subtypes WHERE SubTypeName = ? OR SubTypeNameEn = ? LIMIT 1',
    [name, name]
  );
  if (rows?.[0]?.SubTypeID) {
    return rows[0].SubTypeID;
  }
  
  // إذا لم يكن موجوداً وكان لدينا ComplaintTypeID، ننشئه تلقائياً
  if (complaintTypeID) {
    try {
      const [insertResult] = await pool.query(
        'INSERT INTO complaint_subtypes (ComplaintTypeID, SubTypeName) VALUES (?, ?)',
        [complaintTypeID, name]
      );
      console.log(`✅ تم إنشاء التصنيف الفرعي تلقائياً: "${name}" للتصنيف الرئيسي ID: ${complaintTypeID}`);
      return insertResult.insertId;
    } catch (error) {
      console.error(`❌ خطأ في إنشاء التصنيف الفرعي "${name}":`, error.message);
      return null;
    }
  }
  
  return null;
}

// --- الراوت --------------------------------------------------------

router.post('/imports/937', requireAuth, requirePermission('IMPORTS_937'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'ملف مفقود' });

    const wb = xlsx.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws || !ws['!ref']) return res.status(400).json({ message: 'تعذر قراءة الورقة' });

    // 1) نقرأ الملف كـ Array-of-Arrays لاكتشاف صف العناوين
    const aoa = xlsx.utils.sheet_to_json(ws, { header: 1, blankrows: false });

    // 2) نحدد صف العناوين الحقيقي
    const hdrRow = detectHeaderRow(aoa);
    if (hdrRow < 0) {
      return res.status(400).json({ message: 'تعذر اكتشاف صف العناوين. تأكد أن الملف يحتوي على صف عناوين واضح.' });
    }

    // 3) نأخذ عناوين الأعمدة كما هي ونحوّل بقية الصفوف إلى كائنات
    const headers = (aoa[hdrRow] || []).map(v => (v == null ? '' : String(v)));
    const range = xlsx.utils.decode_range(ws['!ref']);
    
    // نقرأ البيانات من الصف التالي بعد العناوين (hdrRow + 1)
    const dataRows = aoa.slice(hdrRow + 1).filter(row => row && row.some(cell => cell != null && cell !== ''));
    
    // نحوّل الصفوف إلى كائنات باستخدام العناوين
    const jsonRows = dataRows.map(row => {
      const obj = {};
      headers.forEach((header, idx) => {
        obj[header] = (row[idx] == null || row[idx] === '') ? '' : row[idx];
      });
      return obj;
    });

    // 4) `jsonRows` الآن تمثل الصفوف الفعلية بعد العناوين
    if (!jsonRows.length) return res.status(400).json({ message: 'لا توجد بيانات بعد العناوين' });

    // 5) نبني فهرس العناوين من مصفوفة العناوين نفسها (أدقّ من أول صف بيانات)
    const headerIndex = buildHeaderIndexFromHeaders(headers);

    const central = await getCentralPool();

    // Debug: عرض الأعمدة المكتشفة وعينة من أسماء المستشفيات
    console.log('📋 Header Row Detected at:', hdrRow);
    console.log('📋 HEADER INDEX:', headerIndex);
    console.log('📋 Headers found:', headers);
    console.log('🔍 SubType column found:', headerIndex.subTypeName ? 'YES' : 'NO');
    if (headerIndex.subTypeName) {
      console.log('🔍 SubType column name:', headers[headerIndex.subTypeName] || 'unknown');
      console.log('🔍 Sample SubType values (first 5):', jsonRows.slice(0, 5).map((r, i) => {
        const v = r[headerIndex.subTypeName];
        return { row: hdrRow + 2 + i, subType: v };
      }));
    }
    console.log('🏥 SAMPLE HOSPITAL CELLS (first 5 rows):',
      jsonRows.slice(0, 5).map((r, i) => {
        const v = headerIndex.hospitalName ? r[headerIndex.hospitalName] : undefined;
        return { 
          row: hdrRow + 2 + i, 
          value: v, 
          normalized: normalizeAr(v || ''), 
          core: stripGenericFacilityWords(normalizeAr(v || '')) 
        };
      })
    );

    // لاحقًا في الكود بدّلي "rows" بـ "jsonRows"
    const rows = jsonRows;

    const result = {
      total: rows.length,
      inserted: 0,
      skipped: 0,
      skippedNoHospital: 0, // صفوف متجاوزة لعدم وجود منشأة
      duplicates: 0,
      errors: 0,
      skippedRows: [], // {rowNumber, reason, hospitalName, ticket}
      errorRows: [],
    };

    // نجمع الصفوف لكل مستشفى لتقليل فتح الاتصالات
    const byHospital = new Map(); // HospitalID -> array of { row, idx }

    // 1) توزيع حسب المستشفى + تجهيز المابات
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const get = (k) => headerIndex[k] ? r[headerIndex[k]] : '';

      const hospitalName = get('hospitalName');
      const hospitalId = await findHospitalIdByName(central, hospitalName);

      if (!hospitalId) {
        result.skippedNoHospital++;
        result.skippedRows.push({ 
          rowNumber: i + 2, 
          reason: 'المستشفى غير موجود', 
          hospitalName, 
          hospitalNameNormalized: normalizeAr(hospitalName || ''),
          hospitalNameCore: stripGenericFacilityWords(normalizeAr(hospitalName || '')),
          ticket: get('ticketNumber') 
        });
        console.log(`⚠️ Row ${i + 2}: Hospital not found - "${hospitalName}" (normalized: "${normalizeAr(hospitalName || '')}", core: "${stripGenericFacilityWords(normalizeAr(hospitalName || ''))}")`);
        continue; // تخطي هذا الصف تماماً
      }

      if (!byHospital.has(hospitalId)) byHospital.set(hospitalId, []);
      byHospital.get(hospitalId).push({ row: r, idx: i + 2 }); // +2 لأن العناوين تبدأ من 1 والصف التالي 2
    }

    // 2) لكل مستشفى: افتحي التينانت DB وادخلي
    for (const [hospitalId, items] of byHospital.entries()) {
      const pool = await getTenantPoolByHospitalId(hospitalId);

      // نستخدم transaction خفيفة
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        // الحصول على أو إنشاء القسم الافتراضي "غير مصنف" لهذه المنشأة
        const defaultDepartmentId = await getOrCreateUncategorizedDept(conn, hospitalId);

        for (const { row, idx } of items) {
          const get = (k) => headerIndex[k] ? row[headerIndex[k]] : '';

          const ticketNumber = (get('ticketNumber') || '').toString().trim();

          // منع تكرار نفس رقم التذكرة داخل نفس مستشفى
          if (ticketNumber) {
            const [ex] = await conn.query('SELECT ComplaintID FROM complaints WHERE TicketNumber = ? LIMIT 1', [ticketNumber]);
            if (ex.length) { result.duplicates++; continue; }
          }

          // --- استخراج الحقول ---
          const VisitDate = asDate(get('visitDate'));
          const PatientFullName = (get('patientFullName') || '').toString().trim() || null;
          const PatientIDNumber = (get('patientIDNumber') || '').toString().trim() || null;
          const PatientMobile = (get('patientMobile') || '').toString().trim() || null;
          const GenderCode = toGenderCode(get('gender'));
          const Description = (get('description') || '').toString().trim() || null;

          // --- التصنيفات ---
          const complaintTypeName = (get('complaintTypeName') || '').toString().trim() || null;
          const subTypeName = (get('subTypeName') || '').toString().trim() || null;
          const ComplaintTypeID = complaintTypeName ? await findTypeIdByName(conn, complaintTypeName) : null;
          // نمرر ComplaintTypeID لإنشاء التصنيف الفرعي تلقائياً إذا لم يكن موجوداً
          const SubTypeID = subTypeName ? await findSubTypeIdByName(conn, subTypeName, ComplaintTypeID) : null;
          
          // Debug: طباعة معلومات التصنيفات
          if (subTypeName && idx <= 3) {
            console.log(`📝 Row ${idx}: SubTypeName="${subTypeName}", SubTypeID=${SubTypeID}, ComplaintTypeID=${ComplaintTypeID}`);
          }

          // --- تحديد الأولوية: إذا كان التصنيف "الأدوية" (ComplaintTypeID = 6) أو "سوء معاملة" (ComplaintTypeID = 17) → URGENT
          let PriorityCode = 'MEDIUM';
          if (ComplaintTypeID === 6) {
            // الأدوية → حرج/عاجل
            PriorityCode = 'URGENT';
            console.log('🚨 تم تعيين الأولوية إلى URGENT لأن التصنيف هو "الأدوية"');
          } else if (ComplaintTypeID === 17) {
            // سوء معاملة → حرج/عاجل
            PriorityCode = 'URGENT';
            console.log('🚨 تم تعيين الأولوية إلى URGENT لأن التصنيف هو "سوء معاملة"');
          } else {
            // --- تحديد الأولوية من جدول priority_keywords ---
            try {
              if (Description || complaintTypeName || subTypeName) {
                const text = `${Description || ''} ${complaintTypeName || ''} ${subTypeName || ''}`;
                const [keywords] = await conn.query('SELECT Keyword, PriorityCode FROM priority_keywords');
                for (const k of keywords) {
                  if (text.includes(k.Keyword)) {
                    PriorityCode = k.PriorityCode;
                    break;
                  }
                }
              }
            } catch {
              PriorityCode = 'MEDIUM';
            }
          }

          const StatusCode = (get('status') || '').toString().trim() || 'OPEN';

          // استخدام القسم الافتراضي إذا لم يتم تحديد قسم
          const departmentId = defaultDepartmentId; // دائماً نستخدم القسم الافتراضي "غير مصنف"
          
          const insertSql = `
            INSERT INTO complaints
            (GlobalID, TicketNumber, HospitalID, DepartmentID, AssignedToUserID, AssignedAt, AssignedByUserID,
             SubmissionType, VisitDate, PatientFullName, PatientIDNumber, PatientMobile, GenderCode, FileNumber,
             ComplaintTypeID, SubTypeID, Description, PriorityCode, StatusCode, CreatedByUserID, CreatedAt,
             UpdatedAt, PatientID, IsDeleted)
            VALUES (UUID(), ?, ?, ?, NULL, NULL, NULL,
                    '937', ?, ?, ?, ?, ?, NULL,
                    ?, ?, ?, ?, ?, NULL, NOW(),
                    NOW(), NULL, 0)
          `;
          try {
            await conn.query(insertSql, [
              ticketNumber || null,
              hospitalId,
              departmentId, // القسم الافتراضي "غير مصنف"
              VisitDate,
              PatientFullName,
              PatientIDNumber,
              PatientMobile,
              GenderCode,
              ComplaintTypeID,
              SubTypeID,
              Description,
              PriorityCode || 'LOW',
              StatusCode || 'OPEN',
            ]);
            result.inserted++;
          } catch (e) {
            result.errors++;
            result.errorRows.push({ rowNumber: idx, reason: e.message });
          }
        }

        await conn.commit();
      } catch (e) {
        await conn.rollback();
        // نحسب كل صفوف هذا المستشفى كأخطاء عامة
        result.errors += items.length;
        result.errorRows.push({ rowNumber: items[0]?.idx || 2, reason: `DB Error (HospitalID=${hospitalId}): ${e.message}` });
      } finally {
        conn.release();
      }
    }

    return res.json(result);

  } catch (err) {
    console.error('Import 937 error:', err);
    return res.status(500).json({ message: 'خطأ داخلي أثناء الاستيراد', details: err.message });
  }
});

// ---- Mystery Shopper Imports ----
import crypto from 'crypto';
import { resolveHospitalId } from '../middleware/resolveHospitalId.js';
import { attachHospitalPool } from '../middleware/hospitalPool.js';

// ---- Helpers for Mystery Imports ----
function pick(obj, keys){ const o={}; keys.forEach(k=>o[k]=obj?.[k]); return o; }

function normStr(v){
  if (v===undefined || v===null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function toNum(v){
  if (v===undefined || v===null || v==='') return null;
  const n = Number(String(v).replace(/[^\d.\-]/g,''));
  return Number.isFinite(n) ? n : null;
}

function scoreToPriority(mean){
  if (mean===null || mean===undefined) return 'LOW';   // ما عندي قيمة، اعتبرها منخفضة الأولوية
  if (mean < 70) return 'CRITICAL';
  if (mean < 85) return 'HIGH';
  if (mean < 95) return 'MEDIUM';
  return 'LOW';
}

function makeUniqueKey(row, hospitalId){
  // ابنِ بصمة لتفادي التكرار (يناسب نفس الصف داخل نفس المستشفى)
  const raw = [
    hospitalId,
    row.VisitDate || '',
    row.DomainAr || '',
    row.DomainEn || '',
    row.QuestionAr || '',
    row.Question || '',
    row.Meanscore ?? row.MeanScore ?? row.Score ?? ''
  ].join('|');
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// الكشف التلقائي عن وجود عمود UniqueKey
async function hasUniqueKeyColumn(pool){
  try {
    const [cols] = await pool.query("SHOW COLUMNS FROM mystery_complaints LIKE 'UniqueKey'");
    return cols.length > 0;
  } catch (error) {
    console.log('🔍 [mystery-import] Could not check UniqueKey column:', error.message);
    return false;
  }
}

// إنشاء UniqueKey محدث مع الحقول الجديدة
function makeUniqueKeyUpdated(rec){
  const raw = [
    rec.HospitalID,
    rec.PeriodFrom || '',
    rec.PeriodTo   || '',
    rec.DomainAr   || '',
    rec.DomainEn   || '',
    rec.QuestionAr || '',
    rec.QuestionEn || '',
    rec.MeanScore  ?? '',
    rec.TicketNumber || ''
  ].join('|');
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// خريطة عناوين الزائر السري (عربي) -> مفاتيحنا
const MYSTERY_HEADER_ALIASES = {
  location:     ['موقع الملاحظة','موقع الملحوظة','الموقع'],
  answer:       ['الإجابة','الاجابة'],
  notes:        ['الملاحظات','ملاحظة'],
  dept:         ['الإدارة المسؤولة','الادارة المسؤولة','الإدارة','الادارة'],
  execStatus:   ['حالة التنفيذ','الحالة','الغير منفذة','غير منفذة'],
  visitDate:    ['تاريخ الزيارة','التاريخ','تاريخ'] // اختياري لو موجود
};

// يبني خريطة (location/answer/...) => رقم العمود في صف العناوين
function mapMysteryHeaders(headerRow){
  const m = {};
  const H = headerRow.map(h => String(h||'')).map(normalizeAr);
  for (const [key, aliases] of Object.entries(MYSTERY_HEADER_ALIASES)){
    for (const a of aliases){
      const idx = H.indexOf(normalizeAr(a));
      if (idx !== -1){ m[key] = idx; break; }
    }
  }
  return m;
}

// تحويل حالة التنفيذ إلى حالة النظام
function mapExecStatusToSystem(v){
  const s = normalizeAr(v||'');
  // "منفذ" => CLOSED
  if (s.includes('منفذ')) return 'CLOSED';
  // "جارٍ" أو "قيد" => IN_PROGRESS
  if (s.includes('جاري') || s.includes('قيد') || s.includes('جار')) return 'IN_PROGRESS';
  // غير ذلك (الغير منفذة، مفتوح، إلخ) => OPEN
  return 'OPEN';
}

const CATEGORY_MAIN_HEADERS = [
  'التصنيف الرئيسي',
  'الرئيسي',
  'Main Category',
  'Main',
  'Category',
  'TypeName',
  'Type'
];

const CATEGORY_SUB_HEADERS = [
  'التصنيف الفرعي',
  'الفرعي',
  'Sub Category',
  'Subcategory',
  'Subtype',
  'SubTypeName',
  'Sub'
];

function pickColumnValue(row, headers) {
  for (const key of headers) {
    if (row[key] === undefined || row[key] === null) continue;
    const value = String(row[key]).trim();
    if (value.length) return value;
  }
  return '';
}

const DEPT_NAME_HEADERS = [
  'اسم القسم',
  'القسم',
  'اسم القسم (عربي)',
  'القسم/الإدارة',
  'القسم / الإدارة',
  'القسم‏/الإدارة',
  'القسم‏ / ‏الإدارة',
  'Department',
  'Department Name',
  'NameAr'
];

const DEPT_NAME_EN_HEADERS = [
  'اسم القسم بالإنجليزية',
  'NameEn',
  'Department Name (English)',
  'Department Name En',
  'Department (English)'
];

const DEPT_CODE_HEADERS = [
  'كود القسم',
  'Code',
  'الكود',
  'Department Code'
];

function pickField(row, headers, fallback = '') {
  const val = pickColumnValue(row, headers);
  return val || fallback;
}

function normalizeHeaderKey(key = '') {
  return String(key)
    .replace(/\ufeff/g, '')
    .replace(/[\u200f\u202a\u202b\u202c\u202d\u202e]/g, '')
    .replace(/[\/\u2044\u2215\u02F8]/g, '/')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanRowKeys(row = {}) {
  const cleaned = {};
  for (const [key, value] of Object.entries(row)) {
    cleaned[normalizeHeaderKey(key)] = value;
  }
  return cleaned;
}

// ---- Route: import Departments Excel ----
router.post(
  '/imports/departments',
  requireAuth,
  requirePermission('IMPORTS_DEPARTMENTS'),
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: 'لم يتم إرفاق ملف.' });

      // تحديد HospitalID
      const isCluster = (req.user?.RoleID === 1 || req.user?.IsClusterManager === true);
      let hospitalId = null;

      if (isCluster) {
        const hospitalIdFromBody = req.body.hospitalId;
        if (!hospitalIdFromBody) return res.status(400).json({ message: 'يرجى اختيار المستشفى (لأنك مدير التجمع).' });
        hospitalId = Number(hospitalIdFromBody);
        if (!hospitalId) return res.status(400).json({ message: 'معرف المستشفى غير صحيح.' });
      } else {
        hospitalId = req.user?.HospitalID || req.hospitalId;
        if (!hospitalId) return res.status(400).json({ message: 'HospitalID غير محدد للموظف.' });
      }

      const { getHospitalPool } = await import('../middleware/hospitalPool.js');
      const pool = await getHospitalPool(hospitalId);

      const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const ws = workbook.Sheets[sheetName];
      if (!ws) return res.status(400).json({ message: 'لا يمكن قراءة ورقة الإكسل.' });

      const dataRaw = xlsx.utils.sheet_to_json(ws, { header: 1, raw: true });
      const rows = dataRaw.filter(r => Array.isArray(r) && r.some(cell => cell != null && cell !== ''));
      if (!rows.length) return res.status(400).json({ message: 'لا توجد بيانات في الملف.' });

      const headerArr = rows[0].map((cell) => normalizeHeaderKey(cell || ''));
      const data = rows.slice(1).map((row) => {
        const obj = {};
        headerArr.forEach((header, idx) => {
          if (!header) return;
          obj[header] = row[idx];
        });
        return obj;
      });
      if (!data.length) return res.status(400).json({ message: 'لا توجد بيانات في الملف.' });

      let inserted = 0;
      let skipped = 0;
      let errors = 0;

      for (const row of data) {
        try {
          const nameAr = pickField(row, DEPT_NAME_HEADERS).trim();
          const nameEn = pickField(row, DEPT_NAME_EN_HEADERS, nameAr).trim();
          const code = pickField(row, DEPT_CODE_HEADERS).trim();
          
          if (!nameAr.trim()) {
            skipped++;
            continue;
          }

          const [exists] = await pool.query(
            `SELECT DepartmentID FROM departments WHERE HospitalID = ? AND NameAr = ? LIMIT 1`,
            [hospitalId, nameAr]
          );

          if (exists.length > 0) {
            skipped++;
            continue;
          }

          await pool.query(
            `INSERT INTO departments (HospitalID, NameAr, NameEn, Code, IsActive, SortOrder, CreatedAt, UpdatedAt)
             VALUES (?, ?, ?, ?, 1, 999, NOW(), NOW())`,
            [hospitalId, nameAr.trim(), nameEn.trim() || nameAr.trim(), code.trim() || null]
          );

          inserted++;
        } catch (error) {
          errors++;
          console.error('خطأ في صف الأقسام:', error.message, row);
        }
      }

      res.json({
        inserted,
        updated: 0,
        skipped,
        errors,
        total: inserted + skipped + errors
      });
    } catch (error) {
      console.error('خطأ في استيراد الأقسام:', error);
      res.status(500).json({ message: 'خطأ في استيراد الأقسام: ' + error.message });
    }
  }
);

// ---- Route: import Categories Excel ----
router.post(
  '/imports/categories',
  requireAuth,
  requirePermission('IMPORTS_CATEGORIES'),
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: 'لم يتم رفع ملف.' });

      const isCluster = req.user?.RoleID === 1 || req.user?.IsClusterManager === true || req.user?.RoleKey === 'CLUSTER_MANAGER';
      if (req.query.hospitalId && !isCluster) {
        return res.status(403).json({ message: 'غير مصرح بتمرير HospitalID.' });
      }

      let hospitalId = null;
      if (isCluster) {
        hospitalId = Number(req.query.hospitalId);
        if (!hospitalId) {
          return res.status(400).json({ message: 'يرجى اختيار المستشفى.' });
        }
      } else {
        hospitalId = Number(req.user?.HospitalID || req.hospitalId);
        if (!hospitalId) {
          return res.status(400).json({ message: 'HospitalID غير محدد للمستخدم.' });
        }
      }

      const tenantPool = await getTenantPoolByHospitalId(hospitalId);
      const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) return res.status(400).json({ message: 'تعذّر قراءة ورقة الإكسل.' });

      const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });
      if (!rows.length) return res.status(400).json({ message: 'لا توجد بيانات في الملف.' });

      let inserted = 0;
      let updated = 0;
      let skipped = 0;
      let duplicates = 0;
      let errors = 0;
      const duplicateDetails = [];

      const mainCache = new Map();
      const subCache = new Map();
      const timestampSupport = {
        complaint_types: null,
        complaint_subtypes: null
      };

      const touchTimestamp = async (table, idKey, idValue) => {
        if (timestampSupport[table] === false) return;
        try {
          await tenantPool.query(`UPDATE ${table} SET UpdatedAt = NOW() WHERE ${idKey} = ?`, [idValue]);
          timestampSupport[table] = true;
        } catch (error) {
          if (error?.code === 'ER_BAD_FIELD_ERROR' || error?.code === 'ER_BAD_COLUMN_ERROR') {
            timestampSupport[table] = false;
            console.warn(`[imports/categories] Timestamp column missing on ${table}; skipping updates.`);
            return;
          }
          throw error;
        }
      };

      for (const row of rows) {
        const mainName = pickColumnValue(row, CATEGORY_MAIN_HEADERS);
        const subName = pickColumnValue(row, CATEGORY_SUB_HEADERS);

        if (!mainName || !subName) {
          skipped++;
          continue;
        }

        const mainKey = mainName.toLowerCase();
        const subKey = `${mainKey}::${subName.toLowerCase()}`;
        if (subCache.has(subKey)) {
          skipped++;
          continue;
        }

        try {
          let mainId = mainCache.get(mainKey);
          if (!mainId) {
            const [existingMain] = await tenantPool.query(
              'SELECT ComplaintTypeID FROM complaint_types WHERE TypeName = ? LIMIT 1',
              [mainName]
            );

            if (existingMain.length) {
              mainId = existingMain[0].ComplaintTypeID;
              await touchTimestamp('complaint_types', 'ComplaintTypeID', mainId);
            } else {
              const [insertMain] = await tenantPool.query(
                'INSERT INTO complaint_types (TypeName) VALUES (?)',
                [mainName]
              );
              mainId = insertMain.insertId;
              inserted++;
            }
            mainCache.set(mainKey, mainId);
          }

          const [existingSub] = await tenantPool.query(
            `SELECT SubTypeID FROM complaint_subtypes WHERE ComplaintTypeID = ? AND SubTypeName = ? LIMIT 1`,
            [mainId, subName]
          );

          if (existingSub.length) {
            duplicates++;
            duplicateDetails.push({ main: mainName, sub: subName });
            subCache.set(subKey, true);
            continue;
          } else {
            await tenantPool.query(
              `INSERT INTO complaint_subtypes (ComplaintTypeID, SubTypeName) VALUES (?, ?)`,
              [mainId, subName]
            );
            inserted++;
          }

          subCache.set(subKey, true);
        } catch (error) {
          errors++;
          console.error('Import categories row failed:', { error: error.message, row });
        }
      }

      res.json({ inserted, updated, skipped, duplicates, errors, duplicateDetails });
    } catch (err) {
      console.error('POST /api/imports/categories failed:', err);
      res.status(500).json({ message: 'خطأ أثناء استيراد التصنيفات', details: err.message });
    }
  }
);

// ---- Route: import Mystery Excel ----
router.post(
  '/imports/mystery',
  requireAuth,
  requirePermission('IMPORTS_MYSTERY'),
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: 'لم يتم إرفاق ملف.' });

      // التحقق العام للجميع
      const ticketNumber = normStr(req.body.ticketNumber);
      const periodFrom   = normStr(req.body.dateFrom);
      const periodTo     = normStr(req.body.dateTo);
      if (!ticketNumber || !periodFrom || !periodTo) {
        return res.status(400).json({ message: 'رقم التذكرة والفترة (من/إلى) إلزامية.' });
      }

      // تحديد HospitalID
      const isCluster = (req.user?.RoleID === 1 || req.user?.IsClusterManager === true);
      let hospitalId = null;

      if (isCluster) {
        const hospitalIdFromBody = req.body.hospitalId;
        if (!hospitalIdFromBody) return res.status(400).json({ message: 'يرجى اختيار المستشفى (لأنك مدير التجمع).' });
        hospitalId = Number(hospitalIdFromBody);
        if (!hospitalId) return res.status(400).json({ message: 'معرف المستشفى غير صحيح.' });
      } else {
        // موظف مستشفى: خذه من التوكن/السياق
        hospitalId = req.user?.HospitalID || req.hospitalId;
        if (!hospitalId) return res.status(400).json({ message: 'HospitalID غير محدد للموظف.' });
      }

      // الحصول على pool المستشفى
      const { getHospitalPool } = await import('../middleware/hospitalPool.js');
      const pool = await getHospitalPool(hospitalId);

      const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const ws = workbook.Sheets[sheetName];
      if (!ws) return res.status(400).json({ message: 'لا يمكن قراءة ورقة الإكسل.' });

      // 1) نقرأ كمصفوفة صفوف (بدون اعتبار أول صف رؤوس)
      const rows2d = xlsx.utils.sheet_to_json(ws, { header: 1, blankrows: false });

      // 2) ابحث عن صف يحوي على الأقل عمودين من: (موقع الملاحظة/الملاحظات/الإدارة/حالة التنفيذ)
      let headerRowIndex = -1, colMap = {};
      for (let i=0; i<Math.min(rows2d.length, 40); i++){
        const r = rows2d[i]; 
        if (!Array.isArray(r)) continue;
        const tmp = mapMysteryHeaders(r);
        const hits = Object.keys(tmp).length;
        if (hits >= 2){ 
          headerRowIndex = i; 
          colMap = tmp; 
          break; 
        }
      }
      
      if (headerRowIndex === -1){
        return res.status(400).json({ message: 'لم يتم العثور على صف العناوين (تأكد من وجود: موقع الملاحظة/الملاحظات/الإدارة/حالة التنفيذ).' });
      }
      
      console.log('🔍 [mystery-import] headerIndex=', headerRowIndex, 'colMap=', colMap);

      // 3) نقرأ البيانات من الصف التالي لصف العناوين
      const dataRows = rows2d.slice(headerRowIndex + 1);

      const inserted = [];
      const skipped = [];
      const errors = [];

      const creatorId = req.user?.UserID || null;
      const haveUniqueKeyCol = await hasUniqueKeyColumn(pool);
      console.log('🔍 [mystery-import] UniqueKey column exists:', haveUniqueKeyCol);
      
      const cols = [
        'HospitalID','VisitDate','DepartmentID','DepartmentName',
        'DomainAr','DomainEn','QuestionAr','QuestionEn',
        'MeanScore','Score','Comment','Priority','Status',
        'SourceFile','CreatedByUserID','TicketNumber','PeriodFrom','PeriodTo'
      ];
      if (haveUniqueKeyCol) cols.push('UniqueKey');

      const placeholders = '(' + cols.map(_=>'?').join(',') + ')';
      const values = [];

      // نقرأ الصفوف
      for (let i=0; i<dataRows.length; i++){
        const row = dataRows[i];
        if (!Array.isArray(row)) continue;

        const location   = colMap.location   != null ? row[colMap.location]   : '';
        const notes      = colMap.notes      != null ? row[colMap.notes]      : '';
        const deptName   = colMap.dept       != null ? row[colMap.dept]       : '';
        const execStatus = colMap.execStatus != null ? row[colMap.execStatus] : '';
        const visitDate  = colMap.visitDate  != null ? row[colMap.visitDate]  : '';

        // سطر فارغ؟
        const hasData = [location,notes,deptName,execStatus].some(v => (v!=null && String(v).trim()!==''));
        if (!hasData){ 
          skipped.push({rowNumber: headerRowIndex+i+2, reason:'سطر فارغ'}); 
          continue; 
        }

        const rec = {
          HospitalID: hospitalId,
          VisitDate: asDate(visitDate) || null,
          DepartmentID: null,
          DepartmentName: deptName ? String(deptName).trim() : null,
          DomainAr: location ? String(location).trim() : null,   // موقع الملاحظة
          DomainEn: null,
          QuestionAr: notes ? String(notes).trim() : null,       // نص الملاحظة
          QuestionEn: null,
          MeanScore: null,
          Score: null,
          Comment: null,
          Priority: 'LOW',                                      // مبدئيًا
          Status: mapExecStatusToSystem(execStatus),            // من حالة التنفيذ
          SourceFile: req.file.originalname,
          CreatedByUserID: creatorId,
          TicketNumber: ticketNumber,
          PeriodFrom: periodFrom,
          PeriodTo: periodTo
        };

        if (haveUniqueKeyCol){
          const raw = [
            rec.HospitalID, rec.PeriodFrom, rec.PeriodTo,
            rec.DepartmentName || '', rec.DomainAr || '', rec.QuestionAr || ''
          ].join('|');
          rec.UniqueKey = crypto.createHash('sha256').update(raw).digest('hex');
        }

        cols.forEach(c => values.push(rec[c] ?? null));
        inserted.push({ rowNumber: headerRowIndex+i+2 });
      }

      if (!inserted.length){
        return res.status(400).json({ message: 'لا توجد صفوف صالحة للاستيراد.' });
      }

      const sql = `
        INSERT INTO mystery_complaints
        (${cols.join(',')})
        VALUES ${inserted.map(()=>placeholders).join(',')}
        ${haveUniqueKeyCol ? 'ON DUPLICATE KEY UPDATE UpdatedAt = CURRENT_TIMESTAMP' : ''}
      `;

      await pool.query(sql, values);

      res.json({
        total: inserted.length + skipped.length,
        inserted: inserted.length,
        skipped: skipped.length,
        ticketNumber: ticketNumber,
        period: `${periodFrom} - ${periodTo}`,
        hospitalId: hospitalId
      });
    } catch (err) {
      console.error('POST /api/imports/mystery failed:', err);
      res.status(500).json({ message: 'خطأ داخلي أثناء الاستيراد.' });
    }
  }
);

// ---- Route: import Departments Excel ----
router.post(
  '/imports/departments',
  requireAuth,
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: 'لم يتم رفع ملف' });

      // helper: فحص إذا كان مدير تجمع
      function isClusterManager(req) {
        return req.user?.RoleKey === 'CLUSTER_MANAGER' || req.user?.RoleID === 1 || req.user?.IsClusterManager === 1;
      }

      // helper: استخرج HospitalID فعال حسب الدور
      function getEffectiveHospitalId(req) {
        const requested = req.query.hospitalId ? Number(req.query.hospitalId) : null;

        if (isClusterManager(req)) {
          if (!requested) throw new Error('اختر مستشفى للرفع (missing ?hospitalId)');
          return requested;
        }

        // مستخدم عادي
        if (!req.user?.HospitalID) {
          throw new Error('Hospital ID مفقود في التوكن');
        }
        return Number(req.user.HospitalID);
      }

      // منع أي مستخدم غير مدير تجمع من تمرير hospitalId
      if (req.query.hospitalId && !isClusterManager(req)) {
        return res.status(403).json({ message: 'غير مصرح' });
      }

      const effectiveHospitalId = getEffectiveHospitalId(req);

      const { getTenantPoolByHospitalId } = await import('../db/tenantManager.js');
      const tenantPool = await getTenantPoolByHospitalId(effectiveHospitalId);
      
      // --- قراءة الملف مع كشف الترميز/النوع ---
      const ext = (req.file.originalname.split('.').pop() || '').toLowerCase();
      const isXlsx = ['xlsx', 'xlsm', 'xlsb', 'xls'].includes(ext);

      let wb;

      if (isXlsx) {
        // ملفات Excel الحقيقية: اقرأ مباشرة بدون أي تحويل ترميز
        wb = xlsx.read(req.file.buffer, { type: 'buffer' });
        console.log('تم قراءة ملف Excel مباشرة');
      } else {
        // CSV/TSV: جرّب UTF-8 أولاً
        let buf = req.file.buffer;
        let textUtf8 = buf.toString('utf8');

        if (looksBrokenUTF8(textUtf8)) {
          // جرّب Windows-1256
          try {
            const iconv = await import('iconv-lite');
            const decoded = iconv.default.decode(buf, 'windows-1256');
            // لو الناتج بالعربي ومختلف عن UTF-8 المكسور، استخدمه
            if (!looksBrokenUTF8(decoded)) {
              textUtf8 = decoded;
              console.log('تم تحويل الترميز من Windows-1256 إلى UTF-8');
            }
          } catch (e) {
            console.warn('Encoding fallback failed:', e.message);
          }
        }

        // حوّل الـ CSV إلى ورقة (يدعم BOM تلقائياً)
        wb = xlsx.read(textUtf8, { type: 'string' });
        console.log('تم قراءة CSV مع دعم BOM تلقائي');
      }

      const ws = wb.Sheets['departments'] || wb.Sheets[wb.SheetNames[0]];
      if (!ws) return res.status(400).json({ message: 'تعذّر قراءة الورقة' });

      const rows = xlsx.utils.sheet_to_json(ws, { defval: '' });

      // تنظيف مفاتيح الصفوف (يشيل BOM وأي مسافات)
      const cleanKey = (k) => k.replace(/^\uFEFF/, '').trim();
      const rowsClean = rows.map(r => {
        const o = {};
        for (const [k, v] of Object.entries(r)) o[cleanKey(k)] = v;
        return o;
      });
      const rowsToUse = rowsClean;

      // القالب المبسّط: HospitalID, NameAr, NameEn, ParentNameAr, ParentNameEn
      // يدعم أيضًا القالب الكامل إن تم استخدامه بالغلط (نقرأ NameAr/NameEn على الأقل)
      const conn = await tenantPool.getConnection();
      try {
        await conn.beginTransaction();

        // حمل الأقسام الحالية لبناء ماب سريع بالاسم (ar/en)
        const [existing] = await conn.query(
          'SELECT DepartmentID, NameAr, NameEn, Code FROM departments WHERE HospitalID=?',
          [effectiveHospitalId]
        );
        const byNameAr = new Map(existing.map(d => [String(d.NameAr||'').trim(), d]));
        const byNameEn = new Map(existing.map(d => [String(d.NameEn||'').trim().toLowerCase(), d]));

        // دالة توليد كود فريد داخل المستشفى
        function slugBase(ar, en) {
          const base = (en || ar || '').toString().trim();
          return base
            .normalize('NFKD')
            .replace(/[^\w\s-]/g, '')
            .replace(/\s+/g, '-')
            .toUpperCase()
            .slice(0, 12) || 'DEPT';
        }
        async function ensureUniqueCode(base) {
          let code = base, i = 1;
          // تفادي التعارض مع الموجود
          while (existing.some(d => d.Code === code)) {
            code = `${base}-${++i}`;
          }
          return code;
        }

        // دالة احصل/أنشئ قسم أب بالاسم
        async function getOrCreateParent({ ar, en }) {
          let parent = (ar && byNameAr.get(ar.trim())) || (en && byNameEn.get(en.trim().toLowerCase()));
          if (parent) return parent.DepartmentID;

          // أنشئ أب جديد باسم معطى
          const codeBase = slugBase(ar, en);
          const code = await ensureUniqueCode(codeBase);
          const [ins] = await conn.query(
            `INSERT INTO departments (HospitalID, NameAr, NameEn, Code, IsActive, CreatedAt, UpdatedAt)
             VALUES (?,?,?,?,1,NOW(),NOW())`,
            [effectiveHospitalId, ar || en || 'قسم', en || null, code]
          );
          const newDept = { DepartmentID: ins.insertId, NameAr: ar, NameEn: en, Code: code };
          existing.push(newDept);
          if (ar) byNameAr.set(ar.trim(), newDept);
          if (en) byNameEn.set(en.trim().toLowerCase(), newDept);
          return newDept.DepartmentID;
        }

        // دالة للبحث عن القيم مع قبول أخطاء الهيدر الشائعة ومعالجة BOM
        function val(row, keys) {
          // مفتاح موحّد: يشيل BOM ويصغّر ويقص المسافات
          const normKey = (h) => h.replace(/^\uFEFF/, '').trim().toLowerCase();

          for (const k of keys) {
            const target = k.toLowerCase();
            // ابحث عن أي مفتاح في الصف يطابق بعد التطبيع
            const hit = Object.keys(row).find((h) => normKey(h) === target);
            if (hit) return row[hit] ?? '';
          }
          return '';
        }

        let inserted = 0, updated = 0;
        for (const r of rowsToUse) {
          const NameAr = val(r, ['namear','الاسم العربي','name_ar']).trim();
          const NameEn = val(r, ['nameen','englishname','name_en']).trim();
          if (!NameAr) throw new Error('NameAr إلزامي');

          const ParentNameAr = val(r, ['parentnamear','parentar','parentnan','parentdep','parentdept','parent','parent_name_ar']).trim();
          const ParentNameEn = val(r, ['parentnameen','parenten','parent_name_en']).trim();

          // هل القسم موجود بالاسم؟
          let current = byNameAr.get(NameAr) || (NameEn && byNameEn.get(NameEn.toLowerCase()));

          // احسب ParentDepartmentID إن وُجد اسم أب
          let ParentDepartmentID = null;
          if (ParentNameAr || ParentNameEn) {
            ParentDepartmentID = await getOrCreateParent({ ar: ParentNameAr || null, en: ParentNameEn || null });
          }

          if (current) {
            // تحديث
            await conn.query(
              `UPDATE departments
               SET NameAr=?, NameEn=?, ParentDepartmentID=?, UpdatedAt=NOW()
               WHERE DepartmentID=?`,
              [NameAr, NameEn || null, ParentDepartmentID, current.DepartmentID]
            );
            updated++;
          } else {
            // إدراج جديد مع توليد Code
            const code = await ensureUniqueCode(slugBase(NameAr, NameEn));
            const [ins] = await conn.query(
              `INSERT INTO departments
                (HospitalID, ParentDepartmentID, Code, NameAr, NameEn, IsActive, CreatedAt, UpdatedAt)
               VALUES (?,?,?,?,?,1,NOW(),NOW())`,
              [effectiveHospitalId, ParentDepartmentID, code, NameAr, NameEn || null]
            );
            const rec = { DepartmentID: ins.insertId, NameAr, NameEn, Code: code };
            existing.push(rec);
            byNameAr.set(NameAr, rec);
            if (NameEn) byNameEn.set(NameEn.toLowerCase(), rec);
            inserted++;
          }
        }

        await conn.commit();
        res.json({ success: true, hospitalId: effectiveHospitalId, inserted, updated });
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    } catch (err) {
      console.error(err);
      res.status(400).json({ success: false, message: err.message });
    }
  }
);

export default router;

