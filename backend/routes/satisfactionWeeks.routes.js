// routes/satisfactionWeeks.routes.js
import express from 'express';
import multer from 'multer';
import xlsx from 'xlsx';
import { requireAuth } from '../middleware/auth.js';
import { getCentralPool } from '../db/centralPool.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// =========================================================
// 🔥 نظام التعرف الذكي على المستشفيات (Smart Name Matching)
// يعتمد فقط على قاعدة البيانات - بدون Mapping ثابت
// =========================================================

/**
 * دالة ذكية لربط اسم المستشفى بـ HospitalID
 * تبحث مباشرة في جدول hospitals مع دعم مطابقة ذكية
 */
async function resolveHospitalId(rawName, db) {
  if (!rawName) return null;

  // 1) Normalize (تنظيف الاسم)
  let norm = String(rawName)
    .replace(/مستشفى|مركز|مجمع|مدينة|صحي|العام|التخصصي|الطبية|الطبي/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  // 2) جلب جميع أسماء المستشفيات من قاعدة البيانات
  const [hospitals] = await db.query(`
    SELECT HospitalID, NameAr, NameEn
    FROM hospitals 
    WHERE IsActive = 1
  `);

  if (!hospitals || hospitals.length === 0) {
    console.warn(`⚠️ [resolveHospitalId] لا توجد مستشفيات نشطة في قاعدة البيانات`);
    return null;
  }

  // 3) أفضل تطابق باستخدام LIKE + contains
  for (const h of hospitals) {
    const name = h.NameAr || h.NameEn || "";
    const normDB = name
      .replace(/مستشفى|مركز|مجمع|مدينة|صحي|العام|التخصصي|الطبية|الطبي/gi, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

    // exact match after normalize  
    if (norm === normDB) {
      console.log(`✅ [resolveHospitalId] تطابق تام: "${rawName}" -> ${h.HospitalID} (${name})`);
      return h.HospitalID;
    }

    // partial match  
    if (normDB.includes(norm) || norm.includes(normDB)) {
      console.log(`✅ [resolveHospitalId] تطابق جزئي: "${rawName}" -> ${h.HospitalID} (${name})`);
      return h.HospitalID;
    }
  }

  // 4) محاولات مطابقة أخف (كلمة من الاسم)
  for (const h of hospitals) {
    const name = h.NameAr || h.NameEn || "";
    const dbWords = name
      .replace(/مستشفى|مركز|مجمع|مدينة|صحي|العام|التخصصي|الطبية|الطبي/gi, "")
      .split(" ")
      .map(w => w.trim().toLowerCase())
      .filter(w => w.length > 2); // تجاهل الكلمات القصيرة جداً
    
    const excelWords = norm.split(" ")
      .map(w => w.trim().toLowerCase())
      .filter(w => w.length > 2);

    // التحقق من وجود كلمة مشتركة مهمة
    const commonWords = excelWords.filter(w => dbWords.includes(w));
    if (commonWords.length > 0 && commonWords.some(w => w.length > 3)) {
      console.log(`✅ [resolveHospitalId] تطابق بكلمة مشتركة: "${rawName}" -> ${h.HospitalID} (${name}) - كلمات: ${commonWords.join(', ')}`);
      return h.HospitalID;
    }
  }

  console.warn(`⚠️ [resolveHospitalId] لم يتم العثور على HospitalID للاسم: "${rawName}"`);
  return null;
}

// =========================================================
// دالة لتحويل تواريخ Excel إلى صيغة DATE
// =========================================================
function asDate(val) {
  // يقبل Excel serial أو نص تاريخ
  if (val == null || val === '' || val === '-') return null;
  
  // 🔥 دعم Excel serial number مباشرة (حتى لو كان string)
  // Excel serial numbers عادة تكون أكبر من 30000 (للتواريخ بعد 1982)
  const numVal = Number(val);
  if (!isNaN(numVal) && numVal > 30000 && numVal < 1000000) {
    // Excel serial base (1900-01-01 = 1, لكن Excel يستخدم 1900-01-00 = 0)
    // لذلك نستخدم 25569 كـ epoch (1900-01-01 00:00:00 UTC)
    const d = new Date(Math.round((numVal - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) {
      const result = d.toISOString().slice(0, 10);
      console.log(`✅ تم تحويل Excel Serial Number ${numVal} إلى تاريخ: ${result}`);
      return result;
    }
  }
  
  if (typeof val === 'number') {
    // Excel serial base (1900-01-01 = 1)
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  
  if (typeof val === 'string') {
    let str = String(val).trim();
    if (!str || str === '-' || str === '') return null;
    
    // إزالة مسافات إضافية وتنظيف النص
    str = str.replace(/\s+/g, ' ').trim();
    
    // محاولة تحويل صيغة D/M/YYYY أو M/D/YYYY (مثل 2/10/2025 أو 10/2/2025)
    const dmyMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmyMatch) {
      const part1 = parseInt(dmyMatch[1], 10);
      const part2 = parseInt(dmyMatch[2], 10);
      const year = parseInt(dmyMatch[3], 10);
      
      // محاولة تحديد ما إذا كان D/M أو M/D بناءً على القيم
      let day, month;
      if (part1 > 12) {
        // إذا كان الجزء الأول أكبر من 12، فهو بالتأكيد يوم (D/M)
        day = part1;
        month = part2 - 1;
      } else if (part2 > 12) {
        // إذا كان الجزء الثاني أكبر من 12، فهو بالتأكيد يوم (M/D)
        day = part2;
        month = part1 - 1;
      } else {
        // إذا كان كلاهما <= 12، نحاول كـ D/M أولاً (الصيغة العربية)
        day = part1;
        month = part2 - 1;
        // التحقق من أن التاريخ منطقي
        const testDate = new Date(year, month, day);
        if (testDate.getDate() !== day || testDate.getMonth() !== month) {
          // إذا فشل، نجرب M/D
          day = part2;
          month = part1 - 1;
        }
      }
      
      const d = new Date(year, month, day);
      if (!isNaN(d.getTime()) && d.getDate() === day && d.getMonth() === month && d.getFullYear() === year) {
        return d.toISOString().slice(0, 10);
      }
    }
    
    // محاولة تحويل صيغة D/M/YY (مثل 2/10/25) -> نحوله إلى YYYY
    const dmy2Match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
    if (dmy2Match) {
      const part1 = parseInt(dmy2Match[1], 10);
      const part2 = parseInt(dmy2Match[2], 10);
      const yearShort = parseInt(dmy2Match[3], 10);
      const year = yearShort < 50 ? 2000 + yearShort : 1900 + yearShort;
      
      let day, month;
      if (part1 > 12) {
        day = part1;
        month = part2 - 1;
      } else if (part2 > 12) {
        day = part2;
        month = part1 - 1;
      } else {
        day = part1;
        month = part2 - 1;
        const testDate = new Date(year, month, day);
        if (testDate.getDate() !== day || testDate.getMonth() !== month) {
          day = part2;
          month = part1 - 1;
        }
      }
      
      const d = new Date(year, month, day);
      if (!isNaN(d.getTime()) && d.getDate() === day && d.getMonth() === month && d.getFullYear() === year) {
        return d.toISOString().slice(0, 10);
      }
    }
    
    // محاولة تحويل صيغة YYYY-MM-DD
    const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (isoMatch) {
      const year = parseInt(isoMatch[1], 10);
      const month = parseInt(isoMatch[2], 10) - 1;
      const day = parseInt(isoMatch[3], 10);
      const d = new Date(year, month, day);
      if (!isNaN(d.getTime()) && d.getDate() === day && d.getMonth() === month && d.getFullYear() === year) {
        return d.toISOString().slice(0, 10);
      }
    }
    
    // محاولة تحويل نص التاريخ العام (آخر محاولة)
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      // التحقق من أن التاريخ منطقي (بين 1900 و 2100)
      const year = d.getFullYear();
      if (year >= 1900 && year <= 2100) {
        return d.toISOString().slice(0, 10);
      }
    }
    
    // إذا فشلت كل المحاولات، نعيد null
    console.warn(`⚠️ تعذر تحويل التاريخ: "${str}"`);
    return null;
  }
  
  return null;
}

// دالة لاستخراج رقم الأسبوع من نص (مثل "الأسبوع الأول" -> 1)
function extractWeekNumber(val) {
  if (!val) return 0;
  
  // إذا كان رقم مباشرة
  const num = parseInt(val, 10);
  if (!isNaN(num) && num > 0) return num;
  
  // محاولة استخراج رقم من نص مثل "الأسبوع الأول" أو "الأول"
  const text = String(val).trim();
  const arabicNumbers = {
    'الأول': 1, 'الثاني': 2, 'الثالث': 3, 'الرابع': 4, 'الخامس': 5,
    'السادس': 6, 'السابع': 7, 'الثامن': 8, 'التاسع': 9, 'العاشر': 10,
    'الحادي عشر': 11, 'الثاني عشر': 12, 'الثالث عشر': 13, 'الرابع عشر': 14,
    'الخامس عشر': 15, 'السادس عشر': 16, 'السابع عشر': 17, 'الثامن عشر': 18,
    'التاسع عشر': 19, 'العشرون': 20
  };
  
  for (const [key, num] of Object.entries(arabicNumbers)) {
    if (text.includes(key)) return num;
  }
  
  // محاولة استخراج رقم من النص
  const match = text.match(/(\d+)/);
  if (match) return parseInt(match[1], 10);
  
  return 0;
}

/**
 * توليد WeekLabel بالصيغة الجديدة "Week X – Mon"
 * بناءً على رقم الأسبوع وتاريخ البداية
 */
function generateEnglishWeekLabel(weekNumber, startDate) {
  if (!weekNumber || !startDate) {
    return '';
  }
  
  try {
    const d = new Date(startDate);
    if (isNaN(d.getTime())) {
      console.warn(`⚠️ تاريخ غير صالح لتوليد WeekLabel: "${startDate}"`);
      return '';
    }
    
    // الحصول على اختصار الشهر بالإنجليزية (Oct, Nov, Dec, etc.)
    const monthShort = d.toLocaleString('en-US', { month: 'short' });
    
    return `Week ${weekNumber} – ${monthShort}`;
  } catch (error) {
    console.error(`❌ خطأ في توليد WeekLabel:`, error);
    return '';
  }
}

/**
 * POST /api/imports/satisfaction-weeks
 * رفع ملف إكسل تقرير الرضا الأسبوعي
 */
router.post('/imports/satisfaction-weeks', 
  requireAuth, 
  upload.single('file'), 
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'ملف مفقود' });
      }

      const centralPool = await getCentralPool();
      const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      
      if (!sheet) {
        return res.status(400).json({ message: 'تعذّر قراءة ورقة الإكسل.' });
      }

      const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });
      if (!rows.length) {
        return res.status(400).json({ message: 'لا توجد بيانات في الملف.' });
      }

      // عرض أسماء الأعمدة الموجودة في الملف (للتشخيص)
      const firstRow = rows[0];
      const availableColumns = Object.keys(firstRow || {});
      console.log('📋 أسماء الأعمدة الموجودة في الملف:', availableColumns);

      let inserted = 0;
      const errors = [];
      const skipped = [];
      
      // متغير لتتبع آخر قيمة للأسبوع (لأنها موجودة فقط في الصف الأول من كل مجموعة)
      let currentWeekLabel = '';
      let currentWeekNumber = 0;

      // دالة للبحث عن قيمة في أعمدة متعددة
      const findValue = (row, possibleNames) => {
        for (const name of possibleNames) {
          if (row[name] !== undefined && row[name] !== null && row[name] !== '') {
            const value = String(row[name]).trim();
            if (value !== '' && value !== '-') {
              return value;
            }
          }
        }
        return '';
      };

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        try {
          // أولاً: نتحقق من عمود "الشهر" في كل صف (قبل أي شيء آخر)
          // لأنه قد يحتوي على تسمية الأسبوع حتى لو كان الصف يحتوي على بيانات
          const monthColumnValue = findValue(r, ['الشهر', 'Month']);
          if (monthColumnValue && (monthColumnValue.includes('أسبوع') || monthColumnValue.includes('الأسبوع'))) {
            // وجدنا تسمية أسبوع جديدة في عمود "الشهر"
            currentWeekLabel = monthColumnValue;
            currentWeekNumber = extractWeekNumber(monthColumnValue);
            console.log(`📅 وجدت تسمية أسبوع في صف ${i + 2} (عمود الشهر): "${currentWeekLabel}" (رقم: ${currentWeekNumber})`);
          }
          
          // استخراج البيانات من الصف (دعم أسماء أعمدة متعددة)
          const hospitalName = findValue(r, ['اسم المستشفى', 'المستشفى', 'اسم المنشأة', 'المنشأة', 'Hospital', 'HospitalName']);
          
          // إذا كان اسم المستشفى فارغ، قد يكون هذا صف عنوان أو فارغ
          if (!hospitalName || hospitalName.trim() === '') {
            continue; // تخطي الصفوف الفارغة (لكننا حفظنا تسمية الأسبوع أعلاه)
          }
          
          const ticketsCount = parseInt(findValue(r, ['عدد التذاكر', 'التذاكر', 'عدد', 'Tickets', 'TicketsCount']) || '0', 10);
          const satisfactionGeneral = parseFloat(findValue(r, ['متوسط الرضا', 'الرضا', 'الرضا العام', 'Satisfaction', 'SatisfactionGeneral']) || '0');
          const satisfactionCommunication = parseFloat(findValue(r, ['الرضا عن التواصل', 'التواصل', 'رضا التواصل', 'Communication', 'SatisfactionCommunication']) || '0');
          const satisfactionService = parseFloat(findValue(r, ['الرضا عن الإجراء', 'الإجراء', 'رضا الإجراء', 'Service', 'SatisfactionService']) || '0');
          
          // استخدام آخر قيمة محفوظة للأسبوع (تم تحديثها أعلاه إذا وجدنا قيمة جديدة)
          let weekLabel = currentWeekLabel;
          let weekNumber = currentWeekNumber;
          
          // إذا لم يكن لدينا قيمة محفوظة، نبحث في أعمدة أخرى
          if (!weekLabel || weekLabel === '') {
            const weekNumberRaw = findValue(r, ['الأسبوع', 'الاسبوع', 'رقم الأسبوع', 'Week', 'WeekNumber']);
            weekLabel = findValue(r, ['الاسبوع', 'الأسبوع', 'WeekLabel', 'Week']) || weekNumberRaw;
            weekNumber = extractWeekNumber(weekNumberRaw);
            
            // إذا وجدنا قيمة، نحفظها
            if (weekLabel && weekLabel !== '') {
              currentWeekLabel = weekLabel;
              currentWeekNumber = weekNumber;
            }
          }
          
          // تاريخ البداية: من عمود "التاريخ" أو أي عمود يحتوي على تاريخ
          let startDateRaw = findValue(r, ['التاريخ', 'من', 'من تاريخ', 'تاريخ البداية', 'StartDate', 'From', 'Date']);
          
          // تاريخ النهاية: من عمود محدد أو البحث في جميع الأعمدة
          let endDateRaw = findValue(r, ['إلى', 'إلى تاريخ', 'تاريخ النهاية', 'EndDate', 'To']);
          
          // إذا كان عمود "الشهر" يحتوي على تاريخ (وليس "أسبوع")، نستخدمه كتاريخ نهائي
          if (monthColumnValue && !monthColumnValue.includes('أسبوع') && !monthColumnValue.includes('الأسبوع')) {
            // التحقق من أن القيمة تبدو كتاريخ (تحتوي على / أو -)
            if (monthColumnValue.match(/[\d\/\-]/)) {
              endDateRaw = monthColumnValue;
            }
          }
          
          // البحث الذكي عن التواريخ في جميع الأعمدة (للاستفادة من الأعمدة بدون عناوين)
          // أولاً: البحث في عمود "التاريخ" إذا كان موجوداً
          const dateColumnValue = r['التاريخ'] || r['Date'] || r['تاريخ'];
          if (dateColumnValue) {
            const dateStr = String(dateColumnValue).trim();
            const dateStrAsDate = asDate(dateStr);
            if (dateStrAsDate && (!startDateRaw || !asDate(startDateRaw))) {
              startDateRaw = dateStr;
              console.log(`✅ وجدت تاريخ بداية في عمود "التاريخ": "${startDateRaw}"`);
            }
          }
          
          // ثانياً: البحث في جميع الأعمدة عن أي قيم تبدو كتواريخ
          let foundDates = [];
          
          // 🔥 الحل السحري: التقاط أي عمود بدون عنوان (__EMPTY_X) يحتوي على تاريخ
          const unnamedDateColumns = Object.keys(r).filter(k => k.startsWith('__EMPTY'));
          
          // البحث في الأعمدة بدون عناوين أولاً
          for (const col of unnamedDateColumns) {
            const val = r[col];
            if (val != null && val !== '') {
              // محاولة تحويل القيمة إلى رقم للتحقق من Excel Serial Number
              const numVal = Number(val);
              const strValue = String(val).trim();
              
              // فحص Excel Serial Number (أرقام كبيرة بين 30000 و 1000000)
              if (!isNaN(numVal) && numVal > 30000 && numVal < 1000000) {
                const d = asDate(numVal);
                if (d) {
                  foundDates.push({ key: col, value: strValue, date: d });
                  console.log(`📅 Excel Serial Number بدون عنوان في ${col}: ${numVal} → ${d}`);
                }
              }
              // فحص التواريخ بصيغة نصية (تحتوي على / أو -)
              else if (strValue.includes('/') || strValue.includes('-')) {
                if (strValue.match(/\d/) && strValue.match(/[/-]/)) {
                  const d = asDate(strValue);
                  if (d) {
                    foundDates.push({ key: col, value: strValue, date: d });
                    console.log(`📅 تاريخ بدون عنوان في ${col}: ${strValue} → ${d}`);
                  }
                }
              }
            }
          }
          
          // البحث في جميع الأعمدة الأخرى عن أي قيم تبدو كتواريخ
          for (const [key, value] of Object.entries(r)) {
            // نتخطى الأعمدة بدون عناوين (تم البحث فيها أعلاه)
            if (key.startsWith('__EMPTY')) {
              continue;
            }
            
            // نتخطى عمود "الشهر" إذا كان يحتوي على "أسبوع"
            if (key.includes('الشهر') || key.includes('Month')) {
              if (value && String(value).includes('أسبوع')) {
                continue;
              }
            }
            
            if (value != null && value !== '') {
              // محاولة تحويل القيمة إلى رقم للتحقق من Excel Serial Number
              const numVal = Number(value);
              const strValue = String(value).trim();
              
              // فحص Excel Serial Number أولاً (أرقام كبيرة بين 30000 و 1000000)
              if (!isNaN(numVal) && numVal > 30000 && numVal < 1000000) {
                const testDate = asDate(numVal);
                if (testDate) {
                  foundDates.push({ key, value: strValue, date: testDate });
                  console.log(`✅ تم اكتشاف Excel Serial Number في عمود "${key}": ${numVal} -> "${testDate}"`);
                }
              }
              // فحص التواريخ بصيغة نصية (تحتوي على / أو -)
              else if (strValue.includes('/') || strValue.includes('-')) {
                // نتأكد أن القيمة تحتوي على أرقام وتاريخ
                if (strValue.match(/\d/) && strValue.match(/[/-]/)) {
                  const testDate = asDate(strValue);
                  if (testDate) {
                    foundDates.push({ key, value: strValue, date: testDate });
                    console.log(`✅ تم اكتشاف تاريخ في عمود "${key}": "${strValue}" -> "${testDate}"`);
                  } else {
                    console.warn(`⚠️ فشل تحويل قيمة تبدو كتاريخ في عمود "${key}": "${strValue}"`);
                  }
                }
              }
            }
          }
          
          // ترتيب التواريخ حسب موضع العمود في المصفوفة الأصلية
          // الأعمدة المعروفة (التاريخ) تأتي أولاً
          foundDates.sort((a, b) => {
            const aIsDateCol = a.key.includes('تاريخ') || a.key.toLowerCase().includes('date');
            const bIsDateCol = b.key.includes('تاريخ') || b.key.toLowerCase().includes('date');
            if (aIsDateCol && !bIsDateCol) return -1;
            if (!aIsDateCol && bIsDateCol) return 1;
            // ثم نرتب حسب الاسم (للأعمدة بدون عناوين: __EMPTY_1, __EMPTY_2)
            return a.key.localeCompare(b.key);
          });
          
          // إذا وجدنا تواريخ في الأعمدة، نستخدمها
          if (foundDates.length > 0) {
            console.log(`📅 وجدت ${foundDates.length} تاريخ(ات) في صف ${i + 2}:`, foundDates.map(d => `${d.key}="${d.value}"`).join(', '));
            
            // 🔥 الحل النهائي: استخدام أول تاريخ كـ startDate والثاني كـ endDate
            // تواريخ البداية والنهاية من الإكسل
            if (foundDates.length >= 1 && (!startDateRaw || !asDate(startDateRaw))) {
              startDateRaw = foundDates[0].value;
              console.log(`✅ تم استخدام أول تاريخ كتاريخ بداية: "${startDateRaw}"`);
            }
            
            if (foundDates.length >= 2 && (!endDateRaw || !asDate(endDateRaw))) {
              endDateRaw = foundDates[1].value;
              console.log(`✅ تم استخدام ثاني تاريخ كتاريخ نهاية: "${endDateRaw}"`);
            }
            
            // إذا كان لدينا تاريخ واحد فقط ولم نجد تاريخ نهاية، نستخدم نفس تاريخ البداية
            if (startDateRaw && !endDateRaw && foundDates.length === 1) {
              endDateRaw = startDateRaw;
              console.log(`⚠️ تاريخ واحد فقط، سيتم استخدامه للبداية والنهاية: "${endDateRaw}"`);
            }
            
            // إذا لم نجد تاريخ بداية بعد البحث في عمود "التاريخ"
            if (!startDateRaw || !asDate(startDateRaw)) {
              // البحث عن تاريخ في عمود يحتوي على "تاريخ" في اسمه
              const dateColIndex = foundDates.findIndex(d => 
                d.key.toLowerCase().includes('تاريخ') || 
                d.key.toLowerCase().includes('date')
              );
              if (dateColIndex >= 0) {
                startDateRaw = foundDates[dateColIndex].value;
                console.log(`✅ تم استخدام عمود "${foundDates[dateColIndex].key}" كتاريخ بداية: "${startDateRaw}"`);
              }
            }
            
            // إذا لم نجد تاريخ نهاية من العناوين المعروفة
            if (!endDateRaw || !asDate(endDateRaw)) {
              // البحث عن تاريخ في عمود يحتوي على "إلى" أو "نهاية" في اسمه
              const toColIndex = foundDates.findIndex(d => 
                d.key.toLowerCase().includes('إلى') || 
                d.key.toLowerCase().includes('نهاية') ||
                d.key.toLowerCase().includes('to') ||
                d.key.toLowerCase().includes('end')
              );
              
              if (toColIndex >= 0) {
                endDateRaw = foundDates[toColIndex].value;
                console.log(`✅ تم استخدام عمود "${foundDates[toColIndex].key}" كتاريخ نهاية: "${endDateRaw}"`);
              }
            }
          }
          
          // تحويل التواريخ
          let startDate = asDate(startDateRaw);
          let endDate = asDate(endDateRaw);
          
          // تسجيل تفاصيل التواريخ (للتشخيص) - لكل الصفوف الأولى
          if (i < 5) {
            console.log(`📅 تواريخ صف ${i + 2}:`, {
              startDateRaw: startDateRaw || '(فارغ)',
              startDate: startDate || '(null)',
              endDateRaw: endDateRaw || '(فارغ)',
              endDate: endDate || '(null)',
              monthColumnValue: monthColumnValue || '(فارغ)',
              foundDatesCount: foundDates.length,
              allRowKeys: Object.keys(r),
              allRowValues: r
            });
          }

          // تسجيل تفاصيل الصف الأول للتشخيص
          if (i === 0) {
            console.log('🔍 بيانات الصف الأول:', {
              hospitalName,
              ticketsCount,
              satisfactionGeneral,
              weekNumber,
              weekNumberRaw,
              weekLabel,
              startDateRaw,
              endDateRaw,
              startDate,
              endDate,
              allKeys: Object.keys(r),
              allValues: r
            });
          }

          // التحقق من البيانات الأساسية (تم التحقق مسبقاً قبل استخراج البيانات)
          
          // محاولة استخراج رقم الأسبوع من التاريخ إذا لم يكن موجوداً
          let finalWeekNumber = weekNumber;
          if ((!finalWeekNumber || finalWeekNumber === 0) && startDate) {
            // إذا كان هناك تاريخ بداية، نحسب رقم الأسبوع من بداية السنة
            try {
              const startDateObj = new Date(startDate);
              if (!isNaN(startDateObj.getTime())) {
                const yearStart = new Date(startDateObj.getFullYear(), 0, 1);
                const daysDiff = Math.floor((startDateObj - yearStart) / (1000 * 60 * 60 * 24));
                finalWeekNumber = Math.ceil((daysDiff + 1) / 7);
              }
            } catch (e) {
              // تجاهل الخطأ
            }
          }
          
          // إذا لم نجد رقم أسبوع بعد كل المحاولات، نجعله NULL بدلاً من تخطي الصف
          // (يمكن تعديل هذا حسب المتطلبات - NULL أو 0)
          if (!finalWeekNumber || finalWeekNumber === 0) {
            console.warn(`صف ${i + 2}: رقم الأسبوع غير موجود، سيتم استخدام NULL`);
            finalWeekNumber = null; // NULL بدلاً من 0 للسماح بإدخال البيانات
          }

          // البحث عن HospitalID من اسم المستشفى (باستخدام النظام الذكي)
          let hospitalId = null;
          if (hospitalName) {
            hospitalId = await resolveHospitalId(hospitalName, centralPool);
            
            if (!hospitalId) {
              console.warn(`⚠️ لم يتم العثور على HospitalID لـ "${hospitalName}" بعد التطبيع والبحث`);
            }
          }

          // التحقق من صحة التاريخ قبل الإدراج (يجب أن يكون بصيغة YYYY-MM-DD أو null)
          let validStartDate = null;
          let validEndDate = null;
          
          if (startDate && startDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
            validStartDate = startDate;
          } else {
            if (startDateRaw) {
              console.warn(`⚠️ تاريخ بداية غير صحيح في صف ${i + 2}: "${startDateRaw}" -> "${startDate}"`);
            }
            // إذا كان startDateRaw موجود لكن startDate null، نحاول مرة أخرى
            if (startDateRaw && !startDate) {
              const retryDate = asDate(startDateRaw);
              if (retryDate && retryDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
                validStartDate = retryDate;
                console.log(`✅ تم إصلاح تاريخ البداية: "${startDateRaw}" -> "${retryDate}"`);
              }
            }
          }
          
          if (endDate && endDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
            validEndDate = endDate;
          } else {
            if (endDateRaw) {
              console.warn(`⚠️ تاريخ نهاية غير صحيح في صف ${i + 2}: "${endDateRaw}" -> "${endDate}"`);
            }
            // إذا كان endDateRaw موجود لكن endDate null، نحاول مرة أخرى
            if (endDateRaw && !endDate) {
              const retryDate = asDate(endDateRaw);
              if (retryDate && retryDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
                validEndDate = retryDate;
                console.log(`✅ تم إصلاح تاريخ النهاية: "${endDateRaw}" -> "${retryDate}"`);
              }
            }
          }

          // توليد WeekLabel بالصيغة الجديدة "Week X – Mon" بناءً على تاريخ البداية
          let finalWeekLabel = '';
          
          if (finalWeekNumber && validStartDate) {
            // استخدام الصيغة الجديدة الإنجليزية
            finalWeekLabel = generateEnglishWeekLabel(finalWeekNumber, validStartDate);
            console.log(`✅ تم توليد WeekLabel: "${finalWeekLabel}" للأسبوع ${finalWeekNumber} بتاريخ ${validStartDate}`);
          } else {
            // Fallback: استخدام التسمية القديمة إذا لم يكن هناك تاريخ
            finalWeekLabel = weekLabel || (finalWeekNumber ? `الأسبوع ${finalWeekNumber}` : '') || currentWeekLabel || '';
            if (finalWeekNumber && !validStartDate) {
              console.warn(`⚠️ لم يتم العثور على تاريخ بداية للأسبوع ${finalWeekNumber}، سيتم استخدام التسمية القديمة: "${finalWeekLabel}"`);
            }
          }
          
          // تسجيل تفاصيل الإدراج (للتشخيص)
          if (i < 3) {
            console.log(`💾 إدراج صف ${i + 2}:`, {
              hospitalName,
              weekNumber: finalWeekNumber,
              weekLabel: finalWeekLabel,
              oldWeekLabel: weekLabel || currentWeekLabel,
              startDate: validStartDate,
              endDate: validEndDate
            });
          }

          // إدراج البيانات
          await centralPool.query(
            `INSERT INTO satisfaction_weeks 
            (HospitalID, HospitalName, TicketsCount, SatisfactionGeneral, SatisfactionCommunication, SatisfactionService, WeekNumber, WeekLabel, StartDate, EndDate)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              hospitalId,
              hospitalName,
              ticketsCount || 0,
              satisfactionGeneral || 0,
              satisfactionCommunication || 0,
              satisfactionService || 0,
              finalWeekNumber,
              finalWeekLabel,
              validStartDate,
              validEndDate
            ]
          );

          inserted++;
        } catch (err) {
          errors.push(`صف ${i + 2}: ${err.message}`);
          console.error(`خطأ في صف ${i + 2}:`, err);
        }
      }

      res.json({ 
        inserted,
        total: rows.length,
        skipped: skipped.length,
        errors: errors.length,
        skippedDetails: skipped.slice(0, 10), // أول 10 صفوف متخطاة
        errorDetails: errors.slice(0, 10), // أول 10 أخطاء فقط
        availableColumns: availableColumns // أسماء الأعمدة الموجودة (للتشخيص)
      });

    } catch (e) {
      console.error('خطأ في معالجة ملف الرضا الأسبوعي:', e);
      res.status(500).json({ message: e.message || 'خطأ في معالجة الملف' });
    }
  }
);

/**
 * GET /api/dashboard/satisfaction-weeks
 * جلب بيانات الرضا الأسبوعي للعرض في لوحة التحكم
 */
router.get('/dashboard/satisfaction-weeks', requireAuth, async (req, res) => {
  try {
    const centralPool = await getCentralPool();
    
    // قراءة hospitalId من query parameter (إن وجد)
    let filterHospital = req.query.hospitalId || null;
    
    let sql = `
      SELECT 
        HospitalName, 
        WeekLabel, 
        WeekNumber,
        TicketsCount,
        SatisfactionGeneral, 
        SatisfactionCommunication, 
        SatisfactionService,
        StartDate,
        EndDate
      FROM satisfaction_weeks
      WHERE HospitalName IS NOT NULL 
        AND WeekLabel IS NOT NULL
        AND (SatisfactionGeneral IS NOT NULL 
          OR SatisfactionCommunication IS NOT NULL 
          OR SatisfactionService IS NOT NULL)
    `;
    
    let params = [];
    
    if (filterHospital) {
      sql += ` AND HospitalID = ?`;
      params.push(filterHospital);
      console.log(`🔍 [satisfaction-weeks] تصفية حسب المستشفى: ${filterHospital}`);
    }
    
    sql += ` ORDER BY WeekNumber ASC, HospitalName ASC`;
    
    const [rows] = await centralPool.query(sql, params);
    
    console.log(`📊 [satisfaction-weeks] عدد الصفوف المسترجعة: ${rows.length}`);
    
    if (rows.length === 0) {
      console.warn('⚠️ [satisfaction-weeks] لا توجد بيانات في جدول satisfaction_weeks');
      return res.json({ 
        cluster: {}, 
        hospitals: {},
        weeks: [],
        message: 'لا توجد بيانات متاحة'
      });
    }

    // تجميع البيانات للتجمع (Cluster)
    const cluster = {};
    const hospitals = {};

    rows.forEach(r => {
      const weekKey = r.WeekLabel || `الأسبوع ${r.WeekNumber || ''}`;
      
      // للتجمع - حساب المتوسط
      if (!cluster[weekKey]) {
        cluster[weekKey] = { 
          count: 0, 
          avg: 0, 
          comm: 0, 
          serv: 0,
          tickets: 0,
          weekNumber: r.WeekNumber || 0
        };
      }
      
      // إجبار تحويل القيم إلى أرقام لتجنب مشاكل النصوص من قاعدة البيانات
      cluster[weekKey].count++;
      cluster[weekKey].tickets += Number(r.TicketsCount || 0);
      cluster[weekKey].avg += Number(r.SatisfactionGeneral || 0);
      cluster[weekKey].comm += Number(r.SatisfactionCommunication || 0);
      cluster[weekKey].serv += Number(r.SatisfactionService || 0);

      // للمستشفيات - تجميع حسب اسم المستشفى
      if (!hospitals[r.HospitalName]) {
        hospitals[r.HospitalName] = [];
      }
      
      hospitals[r.HospitalName].push({
        HospitalName: r.HospitalName,
        WeekLabel: weekKey,
        WeekNumber: r.WeekNumber,
        TicketsCount: r.TicketsCount || 0,
        SatisfactionGeneral: r.SatisfactionGeneral || 0,
        SatisfactionCommunication: r.SatisfactionCommunication || 0,
        SatisfactionService: r.SatisfactionService || 0,
        StartDate: r.StartDate,
        EndDate: r.EndDate
      });
    });

    // حساب المتوسطات للتجمع
    Object.keys(cluster).forEach(weekKey => {
      const week = cluster[weekKey];
      if (week.count > 0) {
        week.avg = Number((week.avg / week.count).toFixed(3));
        week.comm = Number((week.comm / week.count).toFixed(3));
        week.serv = Number((week.serv / week.count).toFixed(3));
      } else {
        // إذا لم يكن هناك بيانات، نضع القيم كصفر
        week.avg = 0;
        week.comm = 0;
        week.serv = 0;
      }
    });

    // ترتيب الأسابيع حسب WeekNumber (من الأصغر للأكبر)
    const sortedWeeks = Object.keys(cluster).sort((a, b) => {
      const numA = cluster[a]?.weekNumber || 0;
      const numB = cluster[b]?.weekNumber || 0;
      return numA - numB;
    });

    // ملخص التجمع (Summary)
    let summary = {
      tickets: 0,
      general: 0,
      comm: 0,
      serv: 0
    };

    if (sortedWeeks.length > 0) {
      const lastWeek = sortedWeeks[sortedWeeks.length - 1];
      
      // مجموع التذاكر من البيانات الأصلية
      const totalTickets = rows.reduce((sum, r) => sum + (r.TicketsCount || 0), 0);
      
      summary = {
        tickets: totalTickets,
        general: Number(((cluster[lastWeek]?.avg || 0) * 100).toFixed(1)),
        comm: Number(((cluster[lastWeek]?.comm || 0) * 100).toFixed(1)),
        serv: Number(((cluster[lastWeek]?.serv || 0) * 100).toFixed(1))
      };
    }

    console.log(`✅ [satisfaction-weeks] تم تجميع البيانات: ${sortedWeeks.length} أسبوع، ${Object.keys(hospitals).length} مستشفى`);
    
    res.json({ 
      cluster, 
      hospitals,
      weeks: sortedWeeks,
      summary,
      success: true,
      totalWeeks: sortedWeeks.length,
      totalHospitals: Object.keys(hospitals).length
    });
  } catch (e) {
    console.error('خطأ في جلب بيانات الرضا الأسبوعي:', e);
    res.status(500).json({ message: e.message || 'خطأ في جلب البيانات' });
  }
});

export default router;

