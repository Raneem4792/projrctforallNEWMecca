// routes/importMisbehavior.routes.js
import express from 'express';
import multer from 'multer';
import JSZip from 'jszip';
import { parseStringPromise } from 'xml2js';
import { requireAuth } from '../middleware/auth.js';
import { getCentralPool } from '../db/centralPool.js';

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
  if (!sheetFile) {
    throw new Error('لم يتم العثور على sheet1.xml في الملف');
  }
  const sheetXML = await sheetFile.async('string');
  const sheet = await parseStringPromise(sheetXML);

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

  return { sheet, sharedStrings, drawingTexts };
}

/**
 * استخراج الصفوف من sheet1.xml
 */
function extractSheetRows(sheet, sharedStrings) {
  // محاولة قراءة البنية بطرق مختلفة
  let rows = [];
  
  // الطريقة 1: sheet.worksheet.sheetData[0].row
  if (sheet.worksheet && sheet.worksheet.sheetData) {
    const sheetData = Array.isArray(sheet.worksheet.sheetData) 
      ? sheet.worksheet.sheetData[0] 
      : sheet.worksheet.sheetData;
    
    if (sheetData && sheetData.row) {
      rows = Array.isArray(sheetData.row) ? sheetData.row : [sheetData.row];
    }
  }
  
  // الطريقة 2: sheet.sheetData.row
  if (rows.length === 0 && sheet.sheetData) {
    const sheetData = Array.isArray(sheet.sheetData) 
      ? sheet.sheetData[0] 
      : sheet.sheetData;
    
    if (sheetData && sheetData.row) {
      rows = Array.isArray(sheetData.row) ? sheetData.row : [sheetData.row];
    }
  }

  if (rows.length === 0) {
    console.error('❌ [MISBEHAVIOR-IMPORT] لم يتم العثور على صفوف في XML');
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

        // إذا كانت القيمة من sharedStrings
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
 * استخراج الأعمدة (الهيدر) من الرسم
 */
function detectHeaders(drawingTexts) {
  const headers = [
    'اسم المنشأة',
    'الشهر',
    'اسم الموظف',
    'الرقم الوظيفي',
    'القسم',
    'عدد مرات التكرار',
    'هل تم عمل جلسة استرشادية',
    'هل تم توقيعها من مدير المنشأة',
    'هل تم إحالة الموظف للتدوين القانونية',
    'هل تم ربطها بتقييم الموظف السنوي',
    'حالة البلاغ'
  ];

  // إذا كان هناك نصوص من Drawings، نبحث عن العناوين فيها
  if (drawingTexts.length > 0) {
    const found = drawingTexts.filter((t) =>
      headers.some((h) => t.includes(h))
    );

    if (found.length > 0) {
      console.log('🎨 [MISBEHAVIOR-IMPORT] تم العثور على رؤوس أعمدة من Drawings:', found.slice(0, 11));
      return found.slice(0, 11);
    }
  }

  console.log('📋 [MISBEHAVIOR-IMPORT] استخدام أسماء أعمدة افتراضية');
  return headers;
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
 * تحويل الصفوف إلى JSON بناءً على عدد الأعمدة المتوقعة
 */
function mapRowsToJSON(headers, sheetRows) {
  const cols = headers.length;
  const json = [];

  // البحث عن أول صف بيانات (عادة يبدأ من الصف 14)
  let dataStartRow = 13; // الصف 14 (0-based = 13)
  
  for (let i = 0; i < sheetRows.length; i++) {
    const row = sheetRows[i];
    const rowValues = Object.values(row).filter(v => v && v.trim().length > 0);
    
    if (rowValues.length >= 3) {
      const rowText = rowValues.join(' ').toLowerCase();
      if (rowText.includes('مستشفى') || rowText.includes('مركز') || 
          rowText.includes('محمد') || rowText.includes('احمد') ||
          rowText.match(/\d+/)) {
        dataStartRow = i;
        console.log(`📊 [MISBEHAVIOR-IMPORT] تم اكتشاف بداية البيانات في الصف ${i + 1}`);
        break;
      }
    }
  }

  // قراءة البيانات من الصف المكتشف
  for (let i = dataStartRow; i < sheetRows.length; i++) {
    const row = sheetRows[i];
    if (!row || Object.keys(row).length === 0) continue;

    // تجميع الخلايا حسب رقم العمود
    const rowCells = {};
    Object.keys(row).forEach(cellRef => {
      const colNum = cellRefToColumn(cellRef);
      if (colNum >= 0 && colNum < cols) {
        // نأخذ القيمة الأولى إذا كان هناك عدة خلايا في نفس العمود
        if (!rowCells[colNum] || !rowCells[colNum].trim()) {
          rowCells[colNum] = row[cellRef];
        }
      }
    });

    // إنشاء كائن من القيم
    const values = [];
    for (let h = 0; h < cols; h++) {
      values.push(rowCells[h] || '');
    }

    // التحقق من وجود بيانات
    if (values.filter(v => v && v.trim().length > 0).length < 3) continue;

    let obj = {};
    for (let h = 0; h < cols; h++) {
      obj[headers[h]] = clean(values[h] || '');
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
 * إدخال البيانات في complaint_targets
 */
async function saveToDB(rows, connection) {
  let inserted = 0;
  let errors = 0;
  const errorDetails = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    
    try {
      const employee = row['اسم الموظف'] || '';
      if (!employee || !employee.trim()) {
        errors++;
        errorDetails.push(`الصف ${i + 2}: اسم الموظف مطلوب`);
        continue;
      }

      await connection.query(
        `
        INSERT INTO complaint_targets 
        (ComplaintID, TargetEmployeeName, TargetDepartmentName, RepeatCount,
         DidGuidanceSession, DidDirectorAction, DidLegalReferral,
         DidAnnualEvaluation, CaseStatus, CreatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `,
        [
          null, // ComplaintID = NULL للبيانات من الإكسل
          employee.trim(),
          (row['القسم'] || '').trim() || null,
          (row['عدد مرات التكرار'] || '').trim() || null,
          toBool(row['هل تم عمل جلسة استرشادية'] || ''),
          toBool(row['هل تم توقيعها من مدير المنشأة'] || ''),
          toBool(row['هل تم إحالة الموظف للتدوين القانونية'] || ''),
          toBool(row['هل تم ربطها بتقييم الموظف السنوي'] || ''),
          (row['حالة البلاغ'] || '').trim() || null
        ]
      );

      inserted++;
    } catch (err) {
      errors++;
      errorDetails.push(`الصف ${i + 2}: ${err.message}`);
      console.error(`❌ [MISBEHAVIOR-IMPORT] خطأ في الصف ${i + 2}:`, err.message);
    }
  }

  return { inserted, errors, errorDetails };
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

    const { sheet, sharedStrings, drawingTexts } = await readExcel(req.file.buffer);
    
    console.log(`📚 [MISBEHAVIOR-IMPORT] تم قراءة ${sharedStrings.length} نص من sharedStrings`);
    console.log(`🎨 [MISBEHAVIOR-IMPORT] تم قراءة ${drawingTexts.length} نص من Drawings`);

    const sheetRows = extractSheetRows(sheet, sharedStrings);
    
    if (sheetRows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'الملف فارغ أو لا يحتوي على بيانات'
      });
    }

    const headers = detectHeaders(drawingTexts);
    console.log('📌 [MISBEHAVIOR-IMPORT] رؤوس الأعمدة:', headers);

    const jsonRows = mapRowsToJSON(headers, sheetRows);
    console.log(`✅ [MISBEHAVIOR-IMPORT] تم تحويل ${jsonRows.length} صف إلى JSON`);

    if (jsonRows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'الملف فارغ أو لا يحتوي على بيانات. تأكد من أن الملف يحتوي على جدول بيانات يبدأ من الصف 14.'
      });
    }

    // عرض عينة من البيانات
    if (jsonRows.length > 0) {
      console.log(`📋 [MISBEHAVIOR-IMPORT] عينة من البيانات:`, {
        'اسم المنشأة': jsonRows[0]['اسم المنشأة'],
        'اسم الموظف': jsonRows[0]['اسم الموظف'],
        'الشهر': jsonRows[0]['الشهر']
      });
    }

    // الاتصال بقاعدة البيانات
    const pool = await getCentralPool();
    if (!pool) {
      throw new Error('فشل الاتصال بقاعدة البيانات');
    }

    connection = await pool.getConnection();

    const { inserted, errors, errorDetails } = await saveToDB(jsonRows, connection);

    console.log(`✅ [MISBEHAVIOR-IMPORT] اكتمل الاستيراد: ${inserted} سجل تم إدراجه، ${errors} خطأ`);

    return res.json({
      success: true,
      inserted,
      total: jsonRows.length,
      errors,
      errorDetails: errors > 0 ? errorDetails.slice(0, 10) : [],
      message: `تم استيراد ${inserted} سجل بنجاح${errors > 0 ? ` (${errors} خطأ)` : ''}`
    });

  } catch (err) {
    console.error('❌ [MISBEHAVIOR-IMPORT] خطأ عام:', err);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء الاستيراد',
      error: err.message
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

export default router;
