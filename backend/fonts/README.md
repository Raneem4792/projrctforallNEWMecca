# خطوط عربية لـ PDF Reports

## 📥 تحميل الخطوط

يجب تحميل ملفات الخطوط العربية (TTF) ووضعها في هذا المجلد.

### خيار 1: تحميل Tajawal من Google Fonts

1. افتح: https://fonts.google.com/specimen/Tajawal
2. اضغط "Download family"
3. استخرج الملف المضغوط
4. انسخ الملفات التالية إلى هذا المجلد:
   - `Tajawal-Regular.ttf`
   - `Tajawal-Bold.ttf`

### خيار 2: استخدام خط عربي آخر

يمكنك استخدام أي خط عربي TTF مثل:
- Amiri
- Cairo
- Noto Sans Arabic
- Almarai

**ملاحظة:** إذا غيرت اسم الخط، يجب تعديل الأسماء في `backend/controllers/reportsController.js`:
- `AR_FONT_REGULAR`
- `AR_FONT_BOLD`

---

## 📁 الملفات المطلوبة

```
backend/fonts/
  ├── Tajawal-Regular.ttf
  ├── Tajawal-Bold.ttf
  └── README.md (هذا الملف)
```

