# ✅ فحص سريع - الخطوط العربية

## التحقق من الملفات

تأكد من وجود الملفات التالية:

```
backend/fonts/
  ├── Tajawal-Regular.ttf  ✅ يجب أن يكون موجود
  ├── Tajawal-Bold.ttf     ✅ يجب أن يكون موجود
  └── README.md
```

## التحقق من الكود

افتح `backend/controllers/reportsController.js` وتأكد من:

1. **الاستيرادات في الأعلى:**
   ```js
   import fs from 'fs';
   import path from 'path';
   import { fileURLToPath } from 'url';
   ```

2. **مسارات الخطوط:**
   ```js
   const AR_FONT_REGULAR = path.join(__dirname, '..', 'fonts', 'Tajawal-Regular.ttf');
   const AR_FONT_BOLD = path.join(__dirname, '..', 'fonts', 'Tajawal-Bold.ttf');
   ```

3. **التحقق من وجود الخطوط:**
   ```js
   const hasArabicFont = fs.existsSync(AR_FONT_REGULAR) && fs.existsSync(AR_FONT_BOLD);
   ```

4. **في دالة exportSummaryPdf:**
   ```js
   if (hasArabicFont) {
     doc.registerFont('ar-regular', AR_FONT_REGULAR);
     doc.registerFont('ar-bold', AR_FONT_BOLD);
   }
   const fontBold = hasArabicFont ? 'ar-bold' : 'Helvetica-Bold';
   const fontRegular = hasArabicFont ? 'ar-regular' : 'Helvetica';
   ```

## اختبار

1. شغّل السيرفر: `node app.js`
2. راقب التيرمنال:
   - ✅ `✅ [PDF] تم تسجيل الخطوط العربية` → الخطوط موجودة
   - ⚠️ `⚠️ [PDF] لم يتم العثور على الخطوط العربية` → يجب تحميل الخطوط

3. اختبر التقرير:
   - افتح صفحة التقارير
   - اضغط PDF
   - افتح الملف المُحمّل
   - **إذا كانت الخطوط موجودة:** النصوص العربية واضحة ✅
   - **إذا لم تكن موجودة:** ستظهر حروف غريبة مثل `b!Bc&J...` ⚠️

