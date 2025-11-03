// signup-integration.js - ربط صفحة التسجيل بالباك-إند
const API_BASE = 'http://localhost:3001/api';

// دوال مساعدة لتعبئة القوائم
function fillSelect(select, items, {withEmpty=true, text='label', value='value'} = {}) {
  if (!select) return;
  select.innerHTML = withEmpty ? '<option value="" disabled selected>اختر</option>' : '';
  items.forEach(it => {
    const opt = document.createElement('option');
    opt.value = it[value];
    opt.textContent = it[text];
    select.appendChild(opt);
  });
}

function resetDepts() {
  const mainSelect = document.getElementById('mainDept');
  const subSelect = document.getElementById('subDept');
  
  if (mainSelect) {
    mainSelect.innerHTML = '<option value="" disabled selected>اختر المستشفى أولاً</option>';
    mainSelect.disabled = true;
  }
  if (subSelect) {
    subSelect.innerHTML = '<option value="" disabled selected>اختر قسم فرعي (اختياري)</option>';
    subSelect.disabled = true;
  }
}

// تحميل كل أقسام المستشفى المختار (رئيسية + فرعية) في ضربة واحدة
async function loadDepartmentsForHospital(hospitalId) {
  if (!hospitalId) { 
    resetDepts(); 
    return; 
  }

  try {
    const url = `${API_BASE}/departments?hospitalId=${hospitalId}`;
    
    // إضافة التوكن إذا كان متوفراً (للمستخدمين المسجلين)
    const token = localStorage.getItem('token') || '';
    const headers = {
      'Accept': 'application/json'
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const res = await fetch(url, { headers });
    
    if (!res.ok) {
      if (res.status === 400) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'hospitalId مطلوب');
      }
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    
    const result = await res.json();
    console.log('🔍 استجابة API (Signup):', result);
    
    // ✅ التعامل مع الصيغ المختلفة للاستجابة
    let rows = [];
    
    if (result.success && result.data) {
      // الصيغة الجديدة: {success: true, data: [...]}
      rows = result.data;
    } else if (result.ok && result.items) {
      // الصيغة القديمة: {ok: true, items: [...]}
      rows = result.items;
    } else if (Array.isArray(result)) {
      // صيغة مباشرة: [...]
      rows = result;
    } else {
      console.error('🔍 صيغة استجابة غير متوقعة (Signup):', result);
      throw new Error('صيغة استجابة غير متوقعة من API');
    }
    
    console.log('🔍 البيانات المستخرجة (Signup):', rows);
    
    // تحويل البيانات للصيغة الموحدة
    const departments = rows.map(d => ({
      id: d.DepartmentID,
      nameAr: d.NameAr,
      nameEn: d.NameEn,
      parentId: d.ParentDepartmentID
    }));

    // الأقسام الرئيسية = parentId NULL أو 0
    const mains = departments
      .filter(d => !d.parentId || d.parentId === 0)
      .map(d => ({ value: d.id, label: d.nameAr }));
    
    const mainSelect = document.getElementById('mainDept');
    const subSelect = document.getElementById('subDept');
    
    fillSelect(mainSelect, mains, {withEmpty: true});
    if (mainSelect) {
      mainSelect.disabled = false;
      mainSelect.querySelector('option').textContent = 'اختر القسم الرئيسي';
    }

    // عند اختيار رئيسي، نعبي الفرعي من نفس المصفوفة
    if (mainSelect) {
      mainSelect.onchange = () => {
        const parentId = Number(mainSelect.value || 0);
        const children = departments
          .filter(d => Number(d.parentId) === parentId)
          .map(d => ({ value: d.id, label: d.nameAr }));
        
        fillSelect(subSelect, children, {withEmpty: true});
        if (subSelect) {
          subSelect.querySelector('option').textContent = 'اختر قسم فرعي (اختياري)';
          subSelect.disabled = children.length === 0;
        }
      };
    }

    // أوّل مرة: فرّغ الفرعي
    if (subSelect) {
      subSelect.disabled = true;
      subSelect.innerHTML = '<option value="" disabled selected>اختر قسم فرعي (اختياري)</option>';
    }

  } catch (e) {
    console.error('خطأ تحميل الأقسام:', e);
    resetDepts();
    alert('تعذر تحميل الأقسام. تأكد من تشغيل الـ API و CORS.');
  }
}

// معالجة تسجيل مستخدم جديد
async function handleSignup(e) {
  e.preventDefault();
  
  const formData = {
    FullName: document.getElementById('fullName')?.value.trim(),
    Username: document.getElementById('username')?.value.trim(),
    Mobile: document.getElementById('mobile')?.value.trim() || null,
    NationalID: document.getElementById('nationalId')?.value.trim() || null,
    DepartmentID: Number(document.getElementById('departmentId')?.value) || null,
    Email: document.getElementById('email')?.value.trim() || null,
    Password: document.getElementById('password')?.value
    // لا نرسل RoleID - السيرفر يعينه تلقائياً على EMPLOYEE
  };

  // التحقق الأساسي
  if (!formData.FullName || !formData.Username || !formData.DepartmentID || !formData.Password) {
    alert('يرجى ملء جميع الحقول المطلوبة');
    return;
  }

  const submitBtn = document.getElementById('signupBtn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'جاري التسجيل...';
  }

  try {
    const response = await fetch(`${API_BASE}/auth/signup`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify(formData)
    });

    const result = await response.json();

    if (response.ok && result.success) {
      // حفظ بيانات المستخدم والتوكن
      if (result.token) {
        localStorage.setItem('token', result.token);
        localStorage.setItem('user', JSON.stringify(result.user));
      }
      
      alert('تم إنشاء الحساب بنجاح!');
      
      // توجيه المستخدم
      if (confirm('هل تريد الانتقال إلى صفحة تسجيل الدخول؟')) {
        window.location.href = 'login.html';
      }
    } else {
      throw new Error(result.message || 'فشل في إنشاء الحساب');
    }
  } catch (error) {
    alert(`خطأ: ${error.message}`);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'إنشاء حساب';
    }
  }
}

// تهيئة الصفحة عند التحميل
document.addEventListener('DOMContentLoaded', () => {
  // تهيئة الأقسام (معطلة حتى يتم اختيار مستشفى)
  resetDepts();

  // ربط حدث تغيير المستشفى ⇒ إعادة تحميل الأقسام
  const hospitalSelect = document.getElementById('hospitalId');
  if (hospitalSelect) {
    hospitalSelect.addEventListener('change', (e) => {
      const hospitalId = Number(e.target.value);
      loadDepartmentsForHospital(hospitalId);
    });
  }
  
  // ربط نموذج التسجيل
  const signupForm = document.getElementById('signupForm');
  if (signupForm) {
    signupForm.addEventListener('submit', handleSignup);
  }
});

// دالة مساعدة للتحقق من حالة الاتصال
async function checkAPIHealth() {
  try {
    const response = await fetch(`${API_BASE}/health`);
    const result = await response.json();
    console.log('✅ API متاح:', result.message);
    return true;
  } catch (error) {
    console.error('❌ API غير متاح:', error);
    return false;
  }
}

// اختبار الاتصال عند التحميل
checkAPIHealth();
