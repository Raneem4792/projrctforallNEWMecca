# إعداد متغيرات البيئة

## إنشاء ملف .env

أنشئ ملف `.env` في مجلد `backend/` وأضف المتغيرات التالية:

```env
# إعدادات الخادم
PORT=3001

# إعدادات القاعدة المركزية
CENTRAL_DB_HOST=127.0.0.1
CENTRAL_DB_USER=root
CENTRAL_DB_PASS=@
CENTRAL_DB_NAME=hospitals_mecca4

# إعدادات JWT
JWT_SECRET=superscret_jwt_key
JWT_EXPIRES=7d

# إعدادات CORS
CORS_ORIGIN=http://127.0.0.1:5500

# إعدادات إضافية (اختيارية)
KMS_SECRET=local_demo_only
```

## اختبار الاتصال

بعد إنشاء ملف `.env`، يمكنك اختبار الاتصال عبر:

1. **اختبار عام:** `GET http://localhost:3001/api/health`
2. **اختبار القاعدة المركزية:** `GET http://localhost:3001/api/health/db/central`
3. **اختبار قاعدة المستشفى:** `GET http://localhost:3001/api/health/db/tenant/1`

## استكشاف الأخطاء

إذا ظهر خطأ `ER_ACCESS_DENIED_ERROR`:

1. تأكد من وجود ملف `.env` في مجلد `backend/`
2. تأكد من صحة بيانات الاتصال
3. تأكد من تشغيل MySQL
4. تحقق من الأذونات في MySQL
