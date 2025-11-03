# حل مشكلة 404 في إدارة المستخدمين

## المشكلة
الصفحة مفتوحة من المنفذ 5500 وتطلب `/api/...` على نفس المنفذ، بينما الـAPI مركّب في app.js على المنفذ 3001، مما يسبب خطأ 404.

## الحلول المتاحة

### الحل السريع ✅ (تم تطبيقه)
تعديل السكربت في `admin-users.html` ليتوجه إلى المنفذ 3001:

```javascript
// تحديد عنوان API حسب المنفذ
const API_BASE = (location.port === '3001') ? '' : 'http://localhost:3001';

// استخدام API_BASE في جميع الطلبات
const res = await fetch(`${API_BASE}/api/hospitals?active=1`, { headers: authHeaders() });
```

**النتيجة:** الصفحة تعمل من المنفذ 5500 وتتصل بـ API على المنفذ 3001.

### الحل الأفضل ✅ (جاهز للتطبيق)
خدمة الصفحة من نفس المنفذ 3001:

1. **إضافة خدمة الملفات الثابتة في app.js:**
```javascript
// خدمة الملفات الثابتة للواجهة
app.use(express.static(path.join(__dirname, 'public')));
```

2. **إنشاء مجلد public في backend:**
```bash
mkdir backend/public
```

3. **نسخ الصفحة:**
```bash
cp NewProjectMecca/public/admin/admin-users.html backend/public/
```

4. **فتح الصفحة:**
```
http://localhost:3001/admin-users.html
```

**النتيجة:** لا حاجة لـ API_BASE أو CORS، الصفحة والـAPI على نفس المنفذ.

## كيفية التطبيق

### للحل السريع (جاهز الآن):
1. شغّل الخادم: `npm start`
2. افتح الصفحة: `http://localhost:5500/admin-users.html`
3. ستجد أن الطلبات تتوجه تلقائياً إلى المنفذ 3001

### للحل الأفضل:
1. أنشئ مجلد `backend/public`
2. انسخ `admin-users.html` إلى `backend/public/`
3. افتح: `http://localhost:3001/admin-users.html`

## ملاحظات مهمة

- **Tailwind CSS:** يعمل في كلا الحلين
- **CORS:** غير مطلوب في الحل الأفضل
- **الأداء:** الحل الأفضل أسرع (لا حاجة لطلبات عبر الشبكة)
- **التطوير:** الحل الأفضل أسهل في التطوير

## API Endpoints المتاحة

- `GET /api/hospitals?active=1` - المستشفيات المفعّلة
- `GET /api/users` - جميع المستخدمين  
- `GET /api/users?hospitalId=1` - المستخدمين حسب المستشفى
- `GET /api/users?search=أحمد` - البحث في المستخدمين
- `DELETE /api/users/:id` - حذف مستخدم
- `PUT /api/users/:id` - تعديل مستخدم

## اختبار الحل

```bash
# تشغيل الخادم
cd backend
npm start

# اختبار API مباشرة
curl http://localhost:3001/api/hospitals?active=1
curl http://localhost:3001/api/users

# اختبار الصفحة (الحل السريع)
# افتح: http://localhost:5500/admin-users.html

# اختبار الصفحة (الحل الأفضل)  
# افتح: http://localhost:3001/admin-users.html
```
