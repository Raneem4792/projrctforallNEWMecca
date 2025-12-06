import express from 'express';
import multer from 'multer';
import JSZip from 'jszip';
import { parseStringPromise } from 'xml2js';
import { requireAuth } from '../middleware/auth.js';
import { getCentralPool } from '../db/centralPool.js';
import { getHospitalPool } from '../config/db.js';

const router = express.Router();
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB
});

/**
 * تنظيف النصوص
 */
function clean(text = '') {
  return String(text)
    .replace(/[\n\r\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * قراءة ملفات XML من داخل الإكسل بشكل كامل
 */
async function readExcel(buffer) {
  const zip = await JSZip.loadAsync(buffer);

  // Sheet XML
  const sheetFile = zip.file('xl/worksheets/sheet1.xml');
  // لا نلقي خطأ هنا فوراً، قد يكون الملف يعتمد كلياً على PivotCache
  let sheetXML = null;
  let sheet = null;
  if (sheetFile) {
    sheetXML = await sheetFile.async('string');
    sheet = await parseStringPromise(sheetXML);
  }

  // Shared Strings
  let sharedStrings = [];
  const sharedStringsFile = zip.file('xl/sharedStrings.xml');
  if (sharedStringsFile) {
    const sharedXML = await sharedStringsFile.async('string');
    const parsed = await parseStringPromise(sharedXML);
    if (parsed.sst && parsed.sst.si) {
      const siArray = Array.isArray(parsed.sst.si) ? parsed.sst.si : [parsed.sst.si];
      sharedStrings = siArray.map((si) => {
        if (Array.isArray(si.t)) {
          return clean(si.t[0]?._ || si.t[0] || '');
        }
        return clean(si.t?._ || si.t || '');
      });
    }
  }

  // Drawing Objects (Headers + Icons + TextBoxes)
  let drawingTexts = [];
  const drawingFiles = Object.keys(zip.files).filter(path => 
    path.startsWith('xl/drawings/') && (path.endsWith('.xml') || path.endsWith('.vml'))
  );
  
  if (drawingFiles.length > 0) {
    try {
      const drawXML = await zip.file(drawingFiles[0]).async('string');
      const parsed = await parseStringPromise(drawXML);

      const anchors = parsed?.wsDr?.twoCellAnchor || [];
      if (Array.isArray(anchors)) {
        for (const a of anchors) {
          const txBody = a?.txBody;
          if (txBody) {
            const txBodyArray = Array.isArray(txBody) ? txBody : [txBody];
            for (const body of txBodyArray) {
              const paragraphs = body?.p || [];
              const pArray = Array.isArray(paragraphs) ? paragraphs : [paragraphs];
              for (const p of pArray) {
                const runs = p?.r || [];
                const rArray = Array.isArray(runs) ? runs : [runs];
                for (const r of rArray) {
                  if (r && r.t) {
                    const texts = Array.isArray(r.t) ? r.t : [r.t];
                    for (const t of texts) {
                      const text = t?._ || t || '';
                      if (text) {
                        drawingTexts.push(clean(text));
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn('⚠️ [MISBEHAVIOR-IMPORT] خطأ في قراءة Drawings:', err.message);
    }
  }

  // Pivot Cache
  let pivotData = null;
  const pivotDefFile = zip.file('xl/pivotCache/pivotCacheDefinition1.xml');
  const pivotRecFile = zip.file('xl/pivotCache/pivotCacheRecords1.xml');
  
  if (pivotDefFile && pivotRecFile) {
      try {
        const defXML = await pivotDefFile.async('string');
        const recXML = await pivotRecFile.async('string');
        const pivotDef = await parseStringPromise(defXML);
        const pivotRec = await parseStringPromise(recXML);
        pivotData = { pivotDef, pivotRec };
      } catch (err) {
        console.warn('⚠️ [MISBEHAVIOR-IMPORT] خطأ في قراءة PivotCache:', err.message);
      }
  }

  return { sheet, sharedStrings, drawingTexts, pivotData };
}

/**
 * استخراج Shared Items من PivotCacheDefinition
 */
function loadSharedItems(def) {
    const cacheFields = def.pivotCacheDefinition?.cacheFields?.[0]?.cacheField;
    if (!cacheFields) return {};

    const items = {};

    cacheFields.forEach((f) => {
        const fieldName = f.$.name.trim();
        items[fieldName] = [];

        if (f.sharedItems && f.sharedItems[0] && f.sharedItems[0].s) {
            const shared = f.sharedItems[0].s;
            shared.forEach(s => {
                // قد تكون القيمة في s.$.v أو s.v
                const val = s.$ && s.$.v !== undefined ? s.$.v : (s.v || '');
                items[fieldName].push(val);
            });
        }
    });

    return items;
}

/**
 * فك PivotCacheRecords
 */
function parsePivotRecords(records, sharedItems) {
    const rList = records.pivotCacheRecords?.r;
    if (!rList) return [];

    const rows = [];

    rList.forEach(rec => {
        // helper لاستخراج القيمة من المصفوفات x, s, n, b
        const getVal = (arr, idx) => arr && arr[idx] && arr[idx].$ ? arr[idx].$.v : null;

        // 1. استخراج القيم من sharedItems باستخدام المؤشرات في x
        const facilityIdx = getVal(rec.x, 0);
        const monthIdx = getVal(rec.x, 1);
        const statusIdx = getVal(rec.x, 2); // قد يختلف الترتيب، لكن نتبع افتراض المستخدم

        const facility = facilityIdx !== null && sharedItems["اسم المنشأة"] ? sharedItems["اسم المنشأة"][parseInt(facilityIdx)] : null;
        const month = monthIdx !== null && sharedItems["الشهر"] ? sharedItems["الشهر"][parseInt(monthIdx)] : null;
        
        // تنظيف اسم الحالة (قد يحتوي على مسافة)
        let statusKey = "حالة البلاغ";
        if (!sharedItems[statusKey] && sharedItems["حالة البلاغ "]) statusKey = "حالة البلاغ ";
        const status = statusIdx !== null && sharedItems[statusKey] ? sharedItems[statusKey][parseInt(statusIdx)] : null;

        // 2. استخراج القيم النصية والرقمية المباشرة (s, n)
        const employee = getVal(rec.s, 0);
        
        let repeatCount = getVal(rec.s, 1); // قد يكون مخزناً كنص
        if (!repeatCount) repeatCount = getVal(rec.n, 1); // أو كرقم

        // 3. القيم المنطقية (b)
        const b0 = getVal(rec.b, 0);
        const b1 = getVal(rec.b, 1);
        const b2 = getVal(rec.b, 2);
        const b3 = getVal(rec.b, 3);

        const row = {
            'اسم المنشأة': clean(facility),
            'الشهر': clean(month),
            'اسم الموظف': clean(employee),
            'عدد مرات التكرار': clean(repeatCount),
            'هل تم عمل جلسة استرشادية': b0 === '1' ? '1' : '0',
            'هل تم توقيعها من مدير المنشأة': b1 === '1' ? '1' : '0',
            'هل تم إحالة الموظف للتدوين القانونية': b2 === '1' ? '1' : '0',
            'هل تم ربطها بتقييم الموظف السنوي': b3 === '1' ? '1' : '0',
            'حالة البلاغ': clean(status),
            // حقول قد تكون ناقصة من البنية المقترحة:
            'القسم': null, 
            'الرقم الوظيفي': null
        };

        // تحقق بسيط: يجب أن يكون هناك منشأة
        if (row['اسم المنشأة']) {
            rows.push(row);
        }
    });

    return rows;
}

/**
 * استخراج الصفوف من sheet1.xml (للملفات العادية)
 */
function extractSheetRows(sheet, sharedStrings) {
  let rows = [];
  
  if (sheet && sheet.worksheet && sheet.worksheet.sheetData) {
    const sheetData = Array.isArray(sheet.worksheet.sheetData) 
      ? sheet.worksheet.sheetData[0] 
      : sheet.worksheet.sheetData;
    
    if (sheetData && sheetData.row) {
      rows = Array.isArray(sheetData.row) ? sheetData.row : [sheetData.row];
    }
  }
  
  if (rows.length === 0 && sheet && sheet.sheetData) {
    const sheetData = Array.isArray(sheet.sheetData) 
      ? sheet.sheetData[0] 
      : sheet.sheetData;
    
    if (sheetData && sheetData.row) {
      rows = Array.isArray(sheetData.row) ? sheetData.row : [sheetData.row];
    }
  }

  if (rows.length === 0) {
    // قد لا يكون خطأ إذا كنا سنستخدم PivotCache
    console.log('ℹ️ [MISBEHAVIOR-IMPORT] لم يتم العثور على صفوف في sheet1.xml');
    return [];
  }

  console.log(`📊 [MISBEHAVIOR-IMPORT] تم العثور على ${rows.length} صف في XML`);

  return rows.map((row) => {
    const obj = {};
    const cells = Array.isArray(row.c) ? row.c : (row.c ? [row.c] : []);

    for (const c of cells) {
      if (!c || !c.$) continue;
      
      const cellRef = c.$.r || '';
      if (!cellRef) continue;

      let val = '';
      if (c.v !== undefined && c.v !== null) {
        const cellValue = Array.isArray(c.v) ? c.v[0] : c.v;
        val = String(cellValue || '');

        if (c.$.t === 's' && sharedStrings.length > 0) {
          const index = parseInt(val);
          if (!isNaN(index) && index >= 0 && index < sharedStrings.length) {
            val = sharedStrings[index];
          }
        }
      }

      obj[cellRef] = clean(val);
    }

    return obj;
  });
}

/**
 * تحويل مرجع الخلية (مثل A1) إلى رقم العمود
 */
function cellRefToColumn(cellRef) {
  if (!cellRef) return -1;
  const match = String(cellRef).match(/^([A-Z]+)(\d+)$/);
  if (!match) return -1;
  
  const colLetters = match[1].toUpperCase();
  let colNum = 0;
  for (let i = 0; i < colLetters.length; i++) {
    colNum = colNum * 26 + (colLetters.charCodeAt(i) - 64);
  }
  return colNum - 1; // 0-based
}

/**
 * تحويل الصفوف إلى JSON بناءً على عدد الأعمدة المتوقعة (للملفات العادية)
 */
function mapRowsToJSON(sheetRows) {
  const json = [];

  // التعيين الثابت (Hardcoded Mapping)
  const columnMap = {
    'اسم المنشأة': 1,
    'الشهر': 2,
    'اسم الموظف': 3,
    'الرقم الوظيفي': 4,
    'القسم': 5,
    'عدد مرات التكرار': 6,
    'هل تم عمل جلسة استرشادية': 7,
    'هل تم توقيعها من مدير المنشأة': 8,
    'هل تم إحالة الموظف للتدوين القانونية': 9,
    'هل تم ربطها بتقييم الموظف السنوي': 10,
    'حالة البلاغ': 11
  };

  console.log(`✅ [MISBEHAVIOR-IMPORT] (Sheet Mode) استخدام التعيين الثابت`);

  for (let i = 0; i < sheetRows.length; i++) {
    const row = sheetRows[i];
    if (!row || Object.keys(row).length === 0) continue;

    const rowCells = {};
    Object.keys(row).forEach(cellRef => {
      const colNum = cellRefToColumn(cellRef);
      if (colNum >= 0) rowCells[colNum] = row[cellRef];
    });

    const facilityVal = (rowCells[1] || '').trim(); 
    const isFacility = facilityVal.includes('مستشفى') || facilityVal.includes('مركز') || facilityVal.includes('مدينة') || facilityVal.includes('إدارة') || facilityVal.includes('مجمع');
    
    if (!isFacility) continue;

    let obj = {};
    for (const [key, colIdx] of Object.entries(columnMap)) {
      obj[key] = clean(rowCells[colIdx] || '');
    }

    let employeeName = obj['اسم الموظف'];
    let facilityName = obj['اسم المنشأة'];
    
    if (!facilityName && !employeeName) {
        continue;
    }

    json.push(obj);
  }

  return json;
}

/**
 * تحويل علامة ✔ إلى 1
 */
function toBool(v) {
  if (!v) return 0;
  const str = String(v).trim().toLowerCase();
  return (str.includes('✔') || str === 'true' || str === '1' || str === 'yes' || str === 'نعم') ? 1 : 0;
}

/**
 * إدخال البيانات في complaint_targets داخل قاعدة بيانات المستشفى
 */
async function saveToDB(rows, centralPool) {
  let inserted = 0;
  let errors = 0;
  const errorDetails = [];
  const skippedHospitals = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    
    try {
      const facilityName = (row['اسم المنشأة'] || '').trim();
      
      // إذا لم يكن هناك اسم منشأة، نتخطى
      if (!facilityName) {
        console.warn(`⚠️ [MISBEHAVIOR-IMPORT] الصف ${i + 2}: اسم المنشأة فارغ`);
        continue;
      }

      // 1️⃣ البحث عن المستشفى في القاعدة المركزية باستخدام LIKE للبحث المرن
      // أولاً: محاولة تطابق حرفي (أدق)
      let [hospRows] = await centralPool.query(
        `SELECT HospitalID, NameAr FROM hospitals WHERE NameAr = ? LIMIT 1`,
        [facilityName]
      );

      // إذا لم يتم العثور، استخدم LIKE للبحث المرن
      if (hospRows.length === 0) {
        // استخراج الكلمات المهمة من اسم المنشأة (إزالة الكلمات الشائعة)
        const importantWords = facilityName
          .replace(/\s+(مستشفى|مستوصف|مركز|صحي|طبي|تخصصي|عام)\s+/gi, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        
        if (importantWords) {
          // البحث باستخدام LIKE مع عدة محاولات
          [hospRows] = await centralPool.query(
            `SELECT HospitalID, NameAr FROM hospitals 
             WHERE NameAr LIKE ? 
                OR NameAr LIKE ?
                OR NameAr LIKE ?
             ORDER BY 
               CASE 
                 WHEN NameAr = ? THEN 1
                 WHEN NameAr LIKE ? THEN 2
                 WHEN NameAr LIKE ? THEN 3
                 ELSE 4
               END
             LIMIT 1`,
            [
              `%${facilityName}%`,      // البحث بكامل الاسم
              `%${importantWords}%`,     // البحث بالكلمات المهمة
              `${importantWords}%`,      // البحث ببداية الكلمات المهمة
              facilityName,              // للتطابق الحرفي في ORDER BY
              `${facilityName}%`,        // لبداية التطابق في ORDER BY
              `%${importantWords}%`      // لاحتواء الكلمات المهمة في ORDER BY
            ]
          );
        }
      }

      // 2️⃣ إذا المستشفى غير موجود → نخزّنه في skipped
      if (hospRows.length === 0) {
        if (!skippedHospitals.includes(facilityName)) {
          skippedHospitals.push(facilityName);
          console.warn(`⚠️ [MISBEHAVIOR-IMPORT] المستشفى غير موجود: ${facilityName}`);
        }
        continue;
      }

      const hospitalId = hospRows[0].HospitalID;
      const matchedHospitalName = hospRows[0].NameAr;
      
      // تسجيل مطابقة المستشفى (للتشخيص)
      if (matchedHospitalName !== facilityName) {
        console.log(`ℹ️ [MISBEHAVIOR-IMPORT] مطابقة: "${facilityName}" → "${matchedHospitalName}" (ID: ${hospitalId})`);
      }

      // 3️⃣ جلب قاعدة بيانات المستشفى
      let hospitalPool;
      try {
        hospitalPool = await getHospitalPool(hospitalId);
      } catch (poolErr) {
        errors++;
        errorDetails.push(`الصف ${i + 2}: فشل الاتصال بقاعدة بيانات المستشفى ${facilityName} (${poolErr.message})`);
        console.error(`❌ [MISBEHAVIOR-IMPORT] خطأ في الاتصال بقاعدة بيانات المستشفى ${hospitalId}:`, poolErr.message);
        continue;
      }

      // 4️⃣ تجهيز البيانات
      const employee = row['اسم الموظف'] || '';
      const employeeName = (employee && employee.trim()) ? employee.trim() : 'غير محدد';
      
      if (employeeName === 'غير محدد') {
        if (!row['القسم']) {
          continue;
        }
      }

      // 5️⃣ تخزين داخل قاعدة المستشفى فقط
      const connection = await hospitalPool.getConnection();
      try {
        // التحقق من وجود عمود HospitalID أولاً
        const [columns] = await connection.query(`SHOW COLUMNS FROM complaint_targets LIKE 'HospitalID'`);
        const hasHospitalID = columns.length > 0;

        if (hasHospitalID) {
          // ✅ إدراج مع HospitalID
          await connection.query(
            `
            INSERT INTO complaint_targets 
            (ComplaintID, TargetEmployeeName, TargetDepartmentName, RepeatCount,
             DidGuidanceSession, DidDirectorAction, DidLegalReferral,
             DidAnnualEvaluation, CaseStatus, TargetHospitalName, HospitalID, CreatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
            `,
            [
              null,
              employeeName,
              (row['القسم'] || '').trim() || null,
              (row['عدد مرات التكرار'] || '').trim() || null,
              toBool(row['هل تم عمل جلسة استرشادية'] || ''),
              toBool(row['هل تم توقيعها من مدير المنشأة'] || ''),
              toBool(row['هل تم إحالة الموظف للتدوين القانونية'] || ''),
              toBool(row['هل تم ربطها بتقييم الموظف السنوي'] || ''),
              (row['حالة البلاغ'] || '').trim() || null,
              matchedHospitalName || facilityName,  // حفظ اسم المستشفى المطابق
              hospitalId  // ✅ إضافة HospitalID
            ]
          );
        } else {
          // إدراج بدون HospitalID (للتوافق مع القواعد القديمة)
          await connection.query(
            `
            INSERT INTO complaint_targets 
            (ComplaintID, TargetEmployeeName, TargetDepartmentName, RepeatCount,
             DidGuidanceSession, DidDirectorAction, DidLegalReferral,
             DidAnnualEvaluation, CaseStatus, TargetHospitalName, CreatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
            `,
            [
              null,
              employeeName,
              (row['القسم'] || '').trim() || null,
              (row['عدد مرات التكرار'] || '').trim() || null,
              toBool(row['هل تم عمل جلسة استرشادية'] || ''),
              toBool(row['هل تم توقيعها من مدير المنشأة'] || ''),
              toBool(row['هل تم إحالة الموظف للتدوين القانونية'] || ''),
              toBool(row['هل تم ربطها بتقييم الموظف السنوي'] || ''),
              (row['حالة البلاغ'] || '').trim() || null,
              matchedHospitalName || facilityName  // حفظ اسم المستشفى المطابق
            ]
          );
        }

        inserted++;
      } finally {
        connection.release();
      }

    } catch (err) {
      errors++;
      errorDetails.push(`الصف ${i + 2}: ${err.message}`);
      console.error(`❌ [MISBEHAVIOR-IMPORT] خطأ في الصف ${i + 2}:`, err.message);
    }
  }

  return { inserted, errors, errorDetails, skippedHospitals };
}

/**
 * مسار الاستيراد الرئيسي
 */
router.post('/misbehavior', requireAuth, upload.single('file'), async (req, res) => {
  let connection;
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'لم يتم رفع أي ملف'
      });
    }

    console.log('📥 [MISBEHAVIOR-IMPORT] بدء استيراد ملف سوء المعاملة...');

    const { sheet, sharedStrings, pivotData } = await readExcel(req.file.buffer);
    
    let jsonRows = [];

    // الأولوية لـ PivotCache إذا وجد
    if (pivotData) {
        console.log('✅ [MISBEHAVIOR-IMPORT] تم العثور على PivotCache, جاري القراءة منه...');
        try {
            const sharedItems = loadSharedItems(pivotData.pivotDef);
            jsonRows = parsePivotRecords(pivotData.pivotRec, sharedItems);
            console.log(`✅ [MISBEHAVIOR-IMPORT] تم استخراج ${jsonRows.length} صف من PivotCache`);
        } catch (err) {
            console.error('❌ [MISBEHAVIOR-IMPORT] فشل قراءة PivotCache:', err);
            // سنحاول السقوط للخيار الثاني (Sheet)
        }
    }

    // إذا فشل PivotCache أو لم يوجد، نحاول قراءة Sheet1
    if (jsonRows.length === 0 && sheet) {
        console.log('ℹ️ [MISBEHAVIOR-IMPORT] المحاولة باستخدام Sheet1...');
        const sheetRows = extractSheetRows(sheet, sharedStrings);
        if (sheetRows.length > 0) {
            jsonRows = mapRowsToJSON(sheetRows);
        }
    }

    if (jsonRows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'الملف فارغ أو لا يحتوي على بيانات (تم فحص PivotTable و Sheet1)'
      });
    }

    if (jsonRows.length > 0) {
      console.log(`📋 [MISBEHAVIOR-IMPORT] عينة من البيانات:`, {
        'اسم المنشأة': jsonRows[0]['اسم المنشأة'],
        'اسم الموظف': jsonRows[0]['اسم الموظف'],
        'الشهر': jsonRows[0]['الشهر']
      });
    }

    // الحصول على القاعدة المركزية للبحث عن المستشفيات فقط
    const centralPool = await getCentralPool();
    if (!centralPool) {
      throw new Error('فشل الاتصال بقاعدة البيانات المركزية');
    }

    // حفظ البيانات في قواعد بيانات المستشفيات
    const { inserted, errors, errorDetails, skippedHospitals } = await saveToDB(jsonRows, centralPool);

    console.log(`✅ [MISBEHAVIOR-IMPORT] اكتمل الاستيراد: ${inserted} سجل تم إدراجه، ${errors} خطأ`);
    if (skippedHospitals.length > 0) {
      console.warn(`⚠️ [MISBEHAVIOR-IMPORT] تم تخطي ${skippedHospitals.length} منشأة غير موجودة:`, skippedHospitals);
    }

    // بناء رسالة شاملة
    let message = `تم استيراد ${inserted} سجل بنجاح`;
    if (errors > 0) {
      message += ` (${errors} خطأ)`;
    }
    if (skippedHospitals.length > 0) {
      message += `. تم تخطي ${skippedHospitals.length} منشأة غير موجودة`;
    }

    return res.json({
      success: true,
      inserted,
      total: jsonRows.length,
      errors,
      errorDetails: errors > 0 ? errorDetails.slice(0, 10) : [],
      skippedHospitals: skippedHospitals.length > 0 ? skippedHospitals : undefined,
      message: message
    });

  } catch (err) {
    console.error('❌ [MISBEHAVIOR-IMPORT] خطأ عام:', err);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء الاستيراد',
      error: err.message
    });
  }
});

export default router;
