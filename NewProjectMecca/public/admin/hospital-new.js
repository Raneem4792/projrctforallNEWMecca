// التحقق من وضع تعديل
const params = new URLSearchParams(window.location.search);
const editId = params.get('id');
if(editId){
  document.title = 'تعديل بيانات المستشفى';
  document.querySelector('header div.text-white.font-bold').textContent = 'تعديل بيانات المستشفى';
  document.getElementById('saveHospital').textContent = 'حفظ التعديلات';
  // سيتم تحميل البيانات بعد تحميل DOM
}

// توليد صف قسم جديد
function deptRow(idx) {
  return `
  <div class="grid md:grid-cols-4 gap-3 border border-gray-100 rounded-xl p-3">
    <div>
      <label class="block text-xs text-gray-600 mb-1">اسم القسم</label>
      <input name="deptName" required class="w-full h-10 rounded-xl border border-gray-200 px-3 focus:ring-2 focus:ring-blue-200"/>
    </div>
    <div>
      <label class="block text-xs text-gray-600 mb-1">الكود</label>
      <input name="deptCode" class="w-full h-10 rounded-xl border border-gray-200 px-3 focus:ring-2 focus:ring-blue-200"/>
    </div>
    <div>
      <label class="block text-xs text-gray-600 mb-1">البريد الافتراضي</label>
      <input name="deptEmail" type="email" class="w-full h-10 rounded-xl border border-gray-200 px-3 focus:ring-2 focus:ring-blue-200"/>
    </div>
    <div class="flex items-end gap-2">
      <div class="flex-1">
        <label class="block text-xs text-gray-600 mb-1">رئيس القسم (اختياري)</label>
        <input name="deptHead" class="w-full h-10 rounded-xl border border-gray-200 px-3 focus:ring-2 focus:ring-blue-200"/>
      </div>
      <button type="button" class="shrink-0 h-10 px-3 rounded-xl bg-rose-50 text-rose-600 text-sm hover:bg-rose-100 remove-dept">حذف</button>
    </div>
  </div>`;
}

const wrap = document.getElementById('deptsWrap');
const btnAddDept = document.getElementById('btnAddDept');
btnAddDept.addEventListener('click', () => {
  wrap.insertAdjacentHTML('beforeend', deptRow(wrap.children.length));
});

// صف افتراضي واحد (فقط إذا لم يكن في وضع تعديل)
if(!editId){
  wrap.insertAdjacentHTML('beforeend', deptRow(0));
}

// حذف صف
wrap.addEventListener('click', (e) => {
  if (e.target.classList.contains('remove-dept')) {
    e.target.closest('.grid').remove();
  }
});

// حفظ المستشفى
document.getElementById('hospitalForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  // إظهار رسالة تحميل
  const saveBtn = document.getElementById('saveHospital');
  const originalText = saveBtn.textContent;
  saveBtn.disabled = true;
  saveBtn.textContent = 'جاري الإنشاء...';

  // جمع بيانات الأقسام
  const deptBlocks = [...wrap.querySelectorAll('.grid.md\\:grid-cols-4')];
  const departments = deptBlocks.map(b => ({
    nameAr: b.querySelector('input[name="deptName"]')?.value.trim() || '',
    nameEn: b.querySelector('input[name="deptName"]')?.value.trim() || '',
    code: b.querySelector('input[name="deptCode"]')?.value.trim() || '',
    defaultEmail: b.querySelector('input[name="deptEmail"]')?.value.trim() || '',
    headName: b.querySelector('input[name="deptHead"]')?.value.trim() || '',
    headEmail: b.querySelector('input[name="deptEmail"]')?.value.trim() || '' // نفس البريد الافتراضي
  })).filter(d => d.nameAr); // فقط الأقسام التي بها اسم

  // جمع بيانات مدير النظام
  const adminUser = {
    fullName: document.getElementById('adminName').value.trim(),
    username: document.getElementById('adminUsername').value.trim(),
    email: document.getElementById('adminEmail').value.trim(),
    mobile: document.getElementById('adminMobile').value.trim(),
    passwordPlain: document.getElementById('adminPassword').value
  };

  const payload = {
    nameAr: document.getElementById('hNameAr').value.trim(),
    nameEn: document.getElementById('hNameEn').value.trim(),
    code: document.getElementById('hCode').value.trim().toUpperCase(),
    cityAr: document.getElementById('hCity').value.trim(),
    regionAr: document.getElementById('hRegion').value.trim(),
    isActive: document.getElementById('hActive').checked ? 1 : 0,
    departments: departments,
    adminUser: adminUser
  };

  // التحقق من البيانات الأساسية
  if (!payload.nameAr || !payload.code) {
    alert('الاسم العربي والكود مطلوبان');
    saveBtn.disabled = false;
    saveBtn.textContent = originalText;
    return;
  }

  // التحقق من بيانات مدير النظام
  if (!adminUser.username || !adminUser.passwordPlain) {
    alert('اسم المستخدم وكلمة المرور مطلوبان لمدير النظام');
    saveBtn.disabled = false;
    saveBtn.textContent = originalText;
    return;
  }

  // تحديد عنوان API حسب البيئة
  const API_BASE = 
    location.hostname === 'localhost' || location.hostname === '127.0.0.1'
      ? 'http://localhost:3001'
      : '';

  try {
    // إرسال طلب Provisioning للباكند
    const res = await fetch(`${API_BASE}/api/admin/hospitals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders()
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    // إظهار رسالة النجاح
    const successMsg = `✅ تم إنشاء المستشفى بنجاح!\n\nالتفاصيل:\n• اسم القاعدة: ${data.dbName}\n• المستخدم: ${data.dbUser}\n• عدد الأقسام: ${data.departmentsCount || 0}\n• مدير النظام: ${data.adminCreated ? '✅ تم الإنشاء' : '❌ لم يُنشأ'}\n\nسيتم توجيهك لصفحة المستشفيات...`;
    alert(successMsg);
    
    // التوجيه لصفحة المستشفيات
    window.location.href = 'admin-hospitals.html';

  } catch (err) {
    console.error('❌ خطأ في إنشاء المستشفى:', err);
    
    // رسالة خطأ محسّنة
    let errorMsg = '⚠️ فشل إنشاء المستشفى:\n\n';
    errorMsg += err.message || 'خطأ غير معروف';
    errorMsg += '\n\n📋 تحقق من:\n';
    errorMsg += '✓ تشغيل الباكند (npm start)\n';
    errorMsg += '✓ ملف .env موجود ومُعدّل بشكل صحيح\n';
    errorMsg += '✓ MySQL يعمل والصلاحيات صحيحة\n';
    errorMsg += '✓ القاعدة المركزية موجودة';
    
    alert(errorMsg);
    saveBtn.disabled = false;
    saveBtn.textContent = originalText;
  }
});

// دالة تحميل بيانات المستشفى عند التعديل
async function loadHospitalData(id){
  try{
    // TODO: اربط بالـ API الحقيقي
    // const res = await fetch(`/api/hospitals/${id}`, { headers: authHeaders() });
    // const data = await res.json();

    // بيانات تجريبية
    const mockData = {
      1: {
        name_ar:'مستشفى الملك عبدالعزيز',
        name_en:'King Abdulaziz Hospital',
        code:'KAH',
        city:'مكة',
        region:'الغربية',
        address:'طريق المدينة',
        phone:'0123456789',
        email:'info@kah.sa',
        domain:'kah.sa',
        active:1,
        departments:[
          {name:'الطوارئ',code:'ER',email:'er@kah.sa',head:'د. محمد'},
          {name:'الأشعة',code:'RAD',email:'rad@kah.sa',head:'د. أحمد'}
        ],
        admin:{
          full_name:'سامي الغامدي',
          email:'admin@kah.sa',
          mobile:'0501234567',
          username:'kah_admin',
          password:''
        }
      },
      2: {
        name_ar:'مستشفى حراء العام',
        name_en:'Hira General Hospital',
        code:'HRH',
        city:'مكة',
        region:'الغربية',
        address:'حي حراء',
        phone:'0123456780',
        email:'info@hrh.sa',
        domain:'hrh.sa',
        active:1,
        departments:[
          {name:'التمريض',code:'NUR',email:'nur@hrh.sa',head:''}
        ],
        admin:{
          full_name:'أحمد القحطاني',
          email:'admin@hrh.sa',
          mobile:'0502345678',
          username:'hrh_admin',
          password:''
        }
      },
      3: {
        name_ar:'مستشفى النور التخصصي',
        name_en:'Noor Specialist Hospital',
        code:'NRH',
        city:'مكة',
        region:'الغربية',
        address:'شارع النور',
        phone:'0123456770',
        email:'info@nrh.sa',
        domain:'nrh.sa',
        active:0,
        departments:[
          {name:'العناية المركزة',code:'ICU',email:'icu@nrh.sa',head:'د. سعد'}
        ],
        admin:{
          full_name:'خالد العتيبي',
          email:'admin@nrh.sa',
          mobile:'0503456789',
          username:'nrh_admin',
          password:''
        }
      }
    };

    const data = mockData[id];
    if(!data){
      alert('لم يتم العثور على المستشفى');
      return;
    }

    // تعبئة الحقول
    document.getElementById('hNameAr').value = data.name_ar;
    document.getElementById('hNameEn').value = data.name_en;
    document.getElementById('hCode').value = data.code;
    document.getElementById('hCity').value = data.city;
    document.getElementById('hRegion').value = data.region;
    document.getElementById('hAddress').value = data.address;
    document.getElementById('hPhone').value = data.phone;
    document.getElementById('hEmail').value = data.email;
    document.getElementById('hDomain').value = data.domain;
    document.getElementById('hActive').checked = !!data.active;

    // الأقسام
    wrap.innerHTML = '';
    data.departments.forEach((d,i)=>{
      wrap.insertAdjacentHTML('beforeend', deptRow(i));
      const block = wrap.lastElementChild;
      block.querySelector('[name="deptName"]').value = d.name;
      block.querySelector('[name="deptCode"]').value = d.code;
      block.querySelector('[name="deptEmail"]').value = d.email;
      block.querySelector('[name="deptHead"]').value = d.head;
    });

    // مدير النظام
    document.getElementById('adminName').value = data.admin.full_name;
    document.getElementById('adminEmail').value = data.admin.email;
    document.getElementById('adminMobile').value = data.admin.mobile;
    document.getElementById('adminUsername').value = data.admin.username;
    document.getElementById('adminPassword').value = data.admin.password;
  }catch(e){
    console.error(e);
    alert('تعذر تحميل بيانات المستشفى');
  }
}

// تحميل البيانات إذا كان في وضع تعديل
if(editId){
  loadHospitalData(editId);
}

// هيدر Authorization اختياري
function authHeaders(){
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

