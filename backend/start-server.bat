@echo off
echo ═══════════════════════════════════════════════════════════
echo 🚀 تشغيل خادم API - نظام تتبع البلاغات
echo ═══════════════════════════════════════════════════════════
echo.

REM التحقق من وجود node_modules
if not exist "node_modules\" (
    echo ⚠️  المجلد node_modules غير موجود!
    echo 📦 جاري تثبيت الحزم...
    echo.
    call npm install
    echo.
)

REM التحقق من وجود .env
if not exist ".env" (
    echo ⚠️  ملف .env غير موجود!
    echo 📝 يرجى إنشاء ملف .env من ENV-SETUP-TEMPLATE.txt
    echo.
    pause
    exit /b 1
)

echo ✅ جاري بدء التشغيل...
echo.

REM تشغيل الخادم
node app.js

pause

