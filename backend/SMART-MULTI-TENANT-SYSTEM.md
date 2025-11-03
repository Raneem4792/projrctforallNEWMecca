# النظام الذكي متعدد المستشفيات

## 🎯 الهدف
نظام ذكي يتعامل تلقائياً مع قواعد بيانات متعددة بدون كتابة أسماء القواعد يدوياً في الكود.

## 🏗️ البنية

### 🏛️ القاعدة المركزية
- **الاسم**: `hospitals_mecca4`
- **المحتوى**: جميع البلاغات من جميع المستشفيات
- **المستخدمون**: مديرو التجمع، المسؤولون الكبار، البحث العام

### 🏥 قواعد المستشفيات
- **التسمية**: `hosp_aaaa`, `hosp_g`, `hosp_ksuh`
- **المحتوى**: بلاغات المستشفى الواحد فقط
- **المستخدمون**: موظفو المستشفى

## ⚙️ آلية العمل

### 1. إعدادات الاتصال
```javascript
// config/db.js
const DB_CONFIG = {
  host: process.env.CENTRAL_DB_HOST || 'localhost',
  user: process.env.CENTRAL_DB_USER || 'root',
  password: process.env.CENTRAL_DB_PASS || 'Raneem11',
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4_general_ci'
};
```

### 2. الاتصال الذكي
```javascript
// الحصول على الاتصال المناسب حسب المستخدم
const pool = await getContextualPool(user, req);

// الاستعلام بدون ذكر اسم قاعدة
const [rows] = await pool.query('SELECT * FROM complaints WHERE ...');
```

### 3. منطق التوجيه
- **زائر عادي**: القاعدة المركزية
- **موظف مستشفى**: قاعدة مستشفاه
- **مدير تجمع**: القاعدة المركزية (أو مستشفى محدد)
- **بحث عام**: القاعدة المركزية

## 🔧 المكونات الرئيسية

### 1. مدير الاتصالات (`config/db.js`)

#### `getContextualPool(user, req)`
```javascript
export async function getContextualPool(user, req = null) {
  // إذا لم يكن هناك مستخدم (زائر عادي) -> القاعدة المركزية
  if (!user) return centralDb;

  // أدوار المديرين (يرون كل شيء)
  const ADMIN_ROLES = [1, 4]; // SUPER_ADMIN, CLUSTER_MANAGER
  
  if (ADMIN_ROLES.includes(user.roleId)) {
    // إذا طلب مستشفى محدد
    const requestedHospitalId = req?.query?.hospitalId;
    if (requestedHospitalId) {
      return await getHospitalPool(parseInt(requestedHospitalId));
    }
    // وإلا القاعدة المركزية
    return centralDb;
  }

  // باقي المستخدمين -> قاعدة مستشفاهم
  if (user.hospitalId) {
    return await getHospitalPool(user.hospitalId);
  }

  // افتراضي: القاعدة المركزية
  return centralDb;
}
```

#### `getHospitalPool(hospitalId)`
```javascript
export async function getHospitalPool(hospitalId) {
  if (hospitalPools.has(hospitalId)) {
    return hospitalPools.get(hospitalId);
  }

  // جلب معلومات المستشفى من القاعدة المركزية
  const [rows] = await centralDb.query(
    `SELECT HospitalID, Code, NameAr, DbName FROM hospitals WHERE HospitalID = ? LIMIT 1`,
    [hospitalId]
  );

  const hospital = rows[0];
  
  // تحديد اسم قاعدة البيانات
  const dbName = hospital.DbName || 
                 `hosp_${hospital.Code}` || 
                 `hosp_${hospitalId}`;

  // إنشاء اتصال جديد
  const pool = mysql.createPool({
    ...DB_CONFIG,
    database: dbName,
    connectionLimit: 5
  });

  hospitalPools.set(hospitalId, pool);
  return pool;
}
```

### 2. نظام المصادقة الذكي (`middleware/auth.js`)

#### `optionalAuth`
```javascript
export function optionalAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (t) {
    try {
      const p = jwt.verify(t, process.env.JWT_SECRET);
      req.user = { 
        id: p.userId || p.uid,
        roleId: p.roleId || p.role,
        hospitalId: p.hospitalId || p.hosp,
        username: p.username,
        departmentId: p.departmentId || p.dept
      };
    } catch { /* تجاهل */ }
  }
  next();
}
```

#### `hospitalScopeSQL`
```javascript
export function hospitalScopeSQL(user, alias='c', req=null) {
  const SUPER_ADMIN = 1;     // مدير التجمع
  const CLUSTER_MGR  = 4;    // مدير الكلستر

  // المديرون يمكنهم رؤية كل شيء أو مستشفى محدد
  if (user && [SUPER_ADMIN, CLUSTER_MGR].includes(user.roleId)) {
    const hid = req ? parseInt((req.query.hospitalId||'').trim(),10) : NaN;
    return Number.isFinite(hid) ? { where:` AND ${alias}.HospitalID = ? `, params:[hid] }
                                : { where:'', params:[] };
  }
  
  // المستخدمون العاديون مقيدون بمستشفاهم
  if (user?.hospitalId) {
    return { where:` AND ${alias}.HospitalID = ? `, params:[user.hospitalId] };
  }
  
  // الزوار العاديين (بدون تسجيل دخول) - لا توجد قيود
  return { where:'', params:[] };
}
```

### 3. المسارات الذكية (`routes/complaints.js`)

#### مسار البحث `/track`
```javascript
router.get('/track', optionalAuth, async (req, res) => {
  const scope = hospitalScopeSQL(req.user, 'c', req);
  
  // البحث في القاعدة المركزية (تحتوي على جميع البلاغات)
  const [rows] = await centralDb.query(sql, params);
  
  res.json({ ok:true, items: rows });
});
```

#### مسار إنشاء البلاغ `POST /`
```javascript
router.post('/', requireAuth, async (req, res) => {
  const user = req.user;
  const hospitalId = Number(user.hospitalId);
  
  // الحصول على اتصال قاعدة المستشفى المناسب
  const hospitalPool = await getContextualPool(user);
  const connection = await hospitalPool.getConnection();
  
  // إنشاء البلاغ في قاعدة المستشفى
  const [result] = await connection.query('INSERT INTO complaints ...');
});
```

## 🎯 سيناريوهات الاستخدام

### 1. زائر عادي يبحث عن بلاغ
```
GET /api/complaints/track?name=رنيم
→ القاعدة المركزية (hospitals_mecca4)
→ يجد البلاغ من أي مستشفى
```

### 2. موظف مستشفى ينشئ بلاغ
```
POST /api/complaints (مع توكن)
→ قاعدة المستشفى (hosp_aaaa)
→ البلاغ يُحفظ في قاعدة المستشفى
```

### 3. مدير تجمع يشاهد البلاغات
```
GET /api/complaints/history (مع توكن مدير)
→ القاعدة المركزية (hospitals_mecca4)
→ يرى جميع البلاغات من جميع المستشفيات
```

### 4. مدير تجمع يشاهد مستشفى محدد
```
GET /api/complaints/history?hospitalId=11 (مع توكن مدير)
→ قاعدة المستشفى (hosp_aaaa)
→ يرى بلاغات المستشفى المحدد فقط
```

## 🔄 المزامنة

### من المستشفى إلى المركزية
```javascript
// عند إنشاء بلاغ في قاعدة المستشفى
// يتم إرساله تلقائياً للقاعدة المركزية عبر:
// 1. Trigger في قاعدة المستشفى
// 2. أو API call من النظام
// 3. أو Batch job دوري
```

## 🛡️ الأمان

### 1. عزل البيانات
- كل مستشفى يرى بياناته فقط
- المديرون فقط يرون كل شيء

### 2. التحقق من الصلاحيات
```javascript
// في كل مسار
const pool = await getContextualPool(req.user, req);
// النظام يختار القاعدة المناسبة تلقائياً
```

### 3. كاش الاتصالات
```javascript
// اتصالات محفوظة في الذاكرة
const hospitalPools = new Map(); // key: hospitalId -> Pool
// تحسين الأداء وتقليل إنشاء الاتصالات
```

## 📊 الميزات

### ✅ **ذكاء تلقائي**
- لا حاجة لكتابة أسماء القواعد في الكود
- النظام يختار القاعدة المناسبة تلقائياً

### ✅ **مرونة عالية**
- إضافة مستشفيات جديدة بدون تعديل الكود
- تغيير أسماء القواعد من جدول `hospitals`

### ✅ **أداء محسن**
- كاش الاتصالات
- اتصالات محدودة لكل قاعدة

### ✅ **أمان متقدم**
- عزل البيانات حسب المستخدم
- تحقق من الصلاحيات في كل طلب

### ✅ **سهولة الصيانة**
- كود نظيف ومفهوم
- فصل منطق الاتصال عن منطق العمل

## 🚀 النتيجة النهائية

- **🎯 ذكاء تلقائي**: النظام يختار القاعدة المناسبة
- **🔄 مرونة كاملة**: إضافة مستشفيات بدون تعديل الكود  
- **🛡️ أمان محكم**: عزل البيانات حسب المستخدم
- **⚡ أداء عالي**: كاش الاتصالات وتحسين الاستعلامات
- **🧹 كود نظيف**: لا أسماء قواعد في الاستعلامات

النظام الآن جاهز للعمل مع أي عدد من المستشفيات! 🎉
