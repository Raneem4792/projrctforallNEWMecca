// public/submit-complaint/submit-complaint.js

// عناصر الصفحة
const els = {
  form: document.getElementById('complaintForm') || document.querySelector('form'),
  resetBtn: document.getElementById('resetBtn'),
  hospitalName: document.getElementById('hospitalName'),
  hospitalDropdown: document.getElementById('hospitalDropdown'),
  hospitalId: document.getElementById('hospitalId'),
  visitDate: document.getElementById('visitDate'),
  fullName: document.getElementById('fullName'),
  nationalId: document.getElementById('nationalId'),
  mobile: document.getElementById('mobile'),
  gender: document.getElementById('gender'),
  fileNumber: document.getElementById('fileNumber'),
  complaintType: document.getElementById('complaintType'),
  subType: document.getElementById('subType'),
  details: document.getElementById('details'),
  finalDepartmentId: document.getElementById('finalDepartmentId'),
  fileInput: document.getElementById('fileInput'),
  filesList: document.getElementById('filesList'),
  dropzone: document.getElementById('dropzone'),
  excelInput: document.getElementById('excelInput'),
  excelFileBox: document.getElementById('excelFileBox'),
  excelDropzone: document.getElementById('excelDropzone'),
};

// عناصر التصنيف الجديد
const newTypeEls = {
  box: document.getElementById('newTypeBox'),
  btn: document.getElementById('btnAddType'),
  nameAr: document.getElementById('newTypeNameAr'),
  nameEn: document.getElementById('newTypeNameEn'),
  save: document.getElementById('saveNewType'),
  cancel: document.getElementById('cancelNewType'),
};

// عناصر التصنيف الفرعي الجديد
const newSubTypeEls = {
  box: document.getElementById('newSubTypeBox'),
  btn: document.getElementById('btnAddSubType'),
  nameAr: document.getElementById('newSubTypeNameAr'),
  nameEn: document.getElementById('newSubTypeNameEn'),
  save: document.getElementById('saveNewSubType'),
  cancel: document.getElementById('cancelNewSubType'),
};

// عناصر أزرار إدارة التصنيفات
const manageTypeEls = {
  editType: document.getElementById('btnEditType'),
  deleteType: document.getElementById('btnDeleteType'),
  editSubType: document.getElementById('btnEditSubType'),
  deleteSubType: document.getElementById('btnDeleteSubType'),
};

function toggleNewSubTypeBox(show) {
  if (!newSubTypeEls.box) return;
  if (show) newSubTypeEls.box.classList.remove('hidden');
  else newSubTypeEls.box.classList.add('hidden');
}

// دالة تجيب hospitalId الحالي
function getCurrentHospitalId() {
  const hospitalSelect   = document.getElementById('hospitalSelect');
  const hospitalIdHidden = document.getElementById('hospitalIdHidden');

  return (
    (hospitalSelect && hospitalSelect.value) ||
    (hospitalIdHidden && hospitalIdHidden.value) ||
    ''
  );
}

// دالة إظهار/إخفاء فورم التصنيف الجديد
function toggleNewTypeBox(show) {
  if (!newTypeEls.box) return;
  if (show) {
    newTypeEls.box.classList.remove('hidden');
  } else {
    newTypeEls.box.classList.add('hidden');
  }
}

// رفع المرفقات
let uploaded = [];     // {id, file, name, size}
let excelFile = null;  // {file, name}

// ✅ بيانات المستخدم المسجل
let currentUser = null;

// ====== بلاغ على موظف (اختياري) ======
const empEls = {
  toggle: document.getElementById('isEmployeeTarget'),
  box: document.getElementById('employeeTargetFields'),
  search: document.getElementById('employeeSearch'),
  results: document.getElementById('employeeResults'),
  id: document.getElementById('TargetEmployeeID'),
  name: document.getElementById('TargetEmployeeName'),
  deptId: document.getElementById('TargetDepartmentID'),
  deptName: document.getElementById('TargetDepartmentName'),
};

// ====== Helpers ======
// حددي مسار الـ API الحقيقي (نفس اللي شغّلتيه في app.js)
const API_BASE = 'http://localhost:3001/api';

// ====== دالة إنشاء بلاغ على موظف ======
async function createComplaintTarget(complaintId, targetData) {
  const token = localStorage.getItem('token') || '';
  
  if (!token) {
    throw new Error('انتهت جلستك. يرجى تسجيل الدخول مرة أخرى');
  }
  
  const response = await fetch(`${API_BASE}/complaint-targets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      complaintId: complaintId,
      targetEmployeeId: targetData.targetEmployeeId,
      targetEmployeeName: targetData.targetEmployeeName,
      targetDepartmentId: targetData.targetDepartmentId,
      targetDepartmentName: targetData.targetDepartmentName
    })
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || 'HTTP ' + response.status);
  }
  
  return await response.json();
}

async function apiGet(url, { auth = true } = {}) {
  const headers = { 'Accept': 'application/json' };
  const token = localStorage.getItem('token') || '';

  if (auth && token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(API_BASE + url, {
    headers,
    credentials: 'include' // اختياري لو عندك كوكيز
  });

  if (!res.ok) {
    if (res.status === 401) {
      alert('انتهت جلستك. يرجى تسجيل الدخول مرة أخرى');
      window.location.href = '../../auth/login.html';
      return;
    }
    throw new Error('HTTP ' + res.status);
  }
  return res.json();
}

function fillSelect(select, items, withEmpty = true) {
  if (!select) return;
  select.innerHTML = withEmpty ? '<option value="">اختر</option>' : '';
  items.forEach(it => {
    const opt = document.createElement('option');
    opt.value = it.value ?? it.code ?? it.id ?? it;
    opt.textContent = it.label ?? it.name ?? it.nameAr ?? it;
    select.appendChild(opt);
  });
}

function fillSelectComplex(select, items, withEmpty = true) {
  if (!select) return;
  select.innerHTML = withEmpty ? '<option value="">اختر</option>' : '';
  items.forEach(it => {
    const opt = document.createElement('option');
    opt.value = it.value;
    opt.textContent = it.label;
    select.appendChild(opt);
  });
}

function getLoggedInUserIdSafely() {
  try {
    const u = JSON.parse(localStorage.getItem('user') || '{}');
    if (u && (u.UserID || u.userId || u.id)) return Number(u.UserID || u.userId || u.id);
  } catch (_) { }
  return null;
}

// ====== مستشفيات: بحث + اختيار ======
let hospitalItems = [];
let isDropdownOpen = false;
let selectedHospital = null;

function openDropdown() { 
  if (els.hospitalDropdown) {
    els.hospitalDropdown.style.display = 'block';
    els.hospitalDropdown.classList.remove('hidden');
  }
  isDropdownOpen = true; 
}

function closeDropdown() { 
  if (els.hospitalDropdown) {
    els.hospitalDropdown.style.display = 'none';
    els.hospitalDropdown.classList.add('hidden');
  }
  isDropdownOpen = false; 
}

let hospTimer = null;
async function handleHospitalSearch() {
  const q = els.hospitalName.value.trim();
  selectedHospital = null;
  if (els.hospitalId) els.hospitalId.value = '';
  
  clearTimeout(hospTimer);
  hospTimer = setTimeout(async () => {
    try {
      const url = q ? `/hospitals?q=${encodeURIComponent(q)}` : `/hospitals`;
      hospitalItems = await apiGet(url);
      renderHospitalDropdown(hospitalItems, q);
    } catch (err) {
      console.error('خطأ في جلب المستشفيات:', err);
    }
  }, 180);
}

function renderHospitalDropdown(list, query = '') {
  if (!els.hospitalDropdown) return;
  els.hospitalDropdown.innerHTML = '';
  
  if (!list.length) {
    els.hospitalDropdown.innerHTML = `
      <div class="p-3 text-gray-500">لا توجد نتائج</div>
    `;
  } else {
    list.forEach(h => {
      const div = document.createElement('div');
      div.className = 'dropdown-item p-3 hover:bg-blue-50 cursor-pointer border-b border-gray-100 flex items-center justify-between';
      div.dataset.hid = h.id;
      const display = query ? h.name.replace(new RegExp(`(${query})`, 'gi'), '<mark>$1</mark>') : h.name;
      div.innerHTML = `<div class="text-sm">${display}</div><div class="text-xs text-gray-400">${h.Code || ''}</div>`;
      div.addEventListener('click', () => selectHospital(h));
      els.hospitalDropdown.appendChild(div);
    });
  }
  openDropdown();
}

// ⚠️ دالة قديمة - غير مستخدمة الآن (المستشفى يُحدد تلقائياً من التوكن)
function selectHospital(h) {
  els.hospitalName.value = h.name;
  if (els.hospitalId) els.hospitalId.value = h.id;
  selectedHospital = h;
  closeDropdown();
  // استخدام الدالة الآمنة الجديدة
  loadDepartmentsForCurrentUser();
}

// ✅ أقسام: تحميل موحد - نفس الطريقة المستخدمة في signup
async function loadDepartmentsForCurrentUser() {
  try {
    const token = localStorage.getItem('token') || '';
    
    if (!token) {
      console.error('❌ لا يوجد توكن');
      return;
    }

    // تحديد hospitalId حسب نوع المستخدم
    let hospitalId = null;
    
    // إذا كان مدير تجمع - خذ من المستشفى المختار
    const hospitalSelect = document.getElementById('hospitalSelect');
    if (hospitalSelect && hospitalSelect.value) {
      hospitalId = hospitalSelect.value;
      console.log(`✅ مدير تجمع - استخدام المستشفى المختار: ${hospitalId}`);
    } 
    // إذا كان موظف مستشفى - خذ من التوكن
    else if (currentUser && currentUser.HospitalID) {
      hospitalId = currentUser.HospitalID;
      console.log(`✅ موظف مستشفى - استخدام المستشفى من التوكن: ${hospitalId}`);
    }
    
    if (!hospitalId) {
      console.error('❌ لا يوجد hospitalId - اختر المستشفى أولاً');
      alert('يرجى اختيار المستشفى أولاً');
      return;
    }

    // استخدام نفس API المستخدم في signup مع التوكن
    const res = await fetch(`${API_BASE}/departments?hospitalId=${hospitalId}`, {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });
    
    if (!res.ok) {
      if (res.status === 401) {
        alert('انتهت جلستك. يرجى تسجيل الدخول مرة أخرى');
        window.location.href = '../../auth/login.html';
        return;
      }
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    
    const result = await res.json();
    console.log(`🔍 استجابة API (Current User):`, result);
    
    // ✅ التعامل مع الصيغ المختلفة للاستجابة
    let data = [];
    
    if (result.success && result.data) {
      // الصيغة الجديدة: {success: true, data: [...]}
      data = result.data;
    } else if (result.ok && result.items) {
      // الصيغة القديمة: {ok: true, items: [...]}
      data = result.items;
    } else if (Array.isArray(result)) {
      // صيغة مباشرة: [...]
      data = result;
    } else {
      console.error('🔍 صيغة استجابة غير متوقعة (Current User):', result);
      throw new Error('صيغة استجابة غير متوقعة من API');
    }
    
    console.log(`🔍 البيانات المستخرجة (Current User):`, data);
    
    // صيغة موحّدة للكاسكيدر الموجود في HTML
    window.departments = data.map(d => ({ 
      id: String(d.DepartmentID || d.id), 
      name: d.NameAr || d.nameAr || d.name, 
      parentId: d.ParentDepartmentID || d.parentId ? String(d.ParentDepartmentID || d.parentId) : null 
    }));
    
    console.log(`✅ تم تحميل ${window.departments.length} قسم للمستشفى ${hospitalId}`);
    
    if (typeof buildChildrenMap === 'function') buildChildrenMap();
    if (typeof initCascader === 'function') initCascader();
    
  } catch (err) {
    console.error('❌ خطأ في جلب الأقسام:', err);
    console.error('تفاصيل الخطأ:', err.message);
    alert(`فشل تحميل الأقسام: ${err.message}`);
  }
}

// ====== وظائف بلاغ على موظف ======
// تفعيل/إخفاء حقول الموظف
if (empEls?.toggle && empEls?.box) {
  empEls.toggle.addEventListener('change', () => {
    empEls.box.style.display = empEls.toggle.checked ? 'grid' : 'none';
    // مسح الحقول عند إلغاء التفعيل
    if (!empEls.toggle.checked) {
      if (empEls.search) empEls.search.value = '';
      if (empEls.id) empEls.id.value = '';
      if (empEls.name) empEls.name.value = '';
      if (empEls.deptId) empEls.deptId.value = '';
      if (empEls.deptName) empEls.deptName.value = '';
      if (empEls.results) empEls.results.style.display = 'none';
    }
  });
}

// البحث عن موظف
let empTimer = null;
async function searchEmployees(q) {
  const url = `/complaint-targets/search-employees?q=${encodeURIComponent(q)}`;
  try {
    const data = await apiGet(url);
    renderEmpResults(Array.isArray(data) ? data : (data.data || []));
  } catch (e) {
    console.error('❌ خطأ في البحث عن موظف:', e);
    if (empEls.results) {
      empEls.results.innerHTML = '<div class="p-3 text-red-500">فشل البحث. تحقق من اتصال الإنترنت.</div>';
      empEls.results.style.display = 'grid';
    }
  }
}

// عرض نتائج البحث
function renderEmpResults(list) {
  if (!empEls.results) return;
  empEls.results.innerHTML = '';
  
  if (!list.length) {
    empEls.results.innerHTML = '<div class="p-3 text-gray-500">لا توجد نتائج</div>';
    empEls.results.style.display = 'grid';
    return;
  }
  
  list.forEach(emp => {
    const a = document.createElement('div');
    a.className = 'file-pill cursor-pointer hover:bg-blue-50 transition-colors';
    
    const fullName = emp.FullName || emp.full_name || emp.name || '';
    const empId = emp.UserID || emp.EmployeeID || emp.id || ''; // UserID أولاً
    const deptId = emp.DepartmentID || emp.dept_id || '';
    const deptName = emp.DepartmentName || emp.dept_name || '';
    
    a.innerHTML = `
      <div class="meta flex-1">
        <div class="font-semibold text-gray-800">${fullName}</div>
        <div class="text-xs text-gray-500">${deptName || 'بدون قسم'} ${empId ? '• #' + empId : ''}</div>
      </div>
      <button type="button" class="px-3 py-1 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600">اختيار</button>
    `;
    
    a.querySelector('button').onclick = (e) => {
      e.preventDefault();
      empEls.id.value = empId || '';
      empEls.name.value = fullName || '';
      empEls.deptId.value = deptId || '';
      empEls.deptName.value = deptName || '';
      empEls.results.style.display = 'none';
      empEls.search.value = fullName;
    };
    
    empEls.results.appendChild(a);
  });
  
  empEls.results.style.display = 'grid';
}

// تفعيل البحث عند الكتابة
if (empEls?.search) {
  empEls.search.addEventListener('input', () => {
    const q = empEls.search.value.trim();
    clearTimeout(empTimer);
    
    if (!q) {
      if (empEls.results) {
        empEls.results.style.display = 'none';
        empEls.results.innerHTML = '';
      }
      return;
    }
    
    empTimer = setTimeout(() => searchEmployees(q), 250);
  });
  
  // إخفاء النتائج عند النقر خارجها
  document.addEventListener('click', (e) => {
    if (empEls.search && empEls.results && 
        !empEls.search.contains(e.target) && 
        !empEls.results.contains(e.target)) {
      empEls.results.style.display = 'none';
    }
  });
}

// ====== أنواع 937 ======
async function loadTypesAndGenders() {
  try {
    // تحميل الجنس
    const genders = await apiGet('/genders');
    fillSelect(els.gender, genders.map(g => ({ value: g.code, label: g.labelAr })), true);

    // تحميل التصنيفات الرئيسية من قاعدة بيانات المستشفى
    const hospitalSelect   = document.getElementById('hospitalSelect');
    const hospitalIdHidden = document.getElementById('hospitalIdHidden');
    const hospitalId =
      (hospitalSelect && hospitalSelect.value) ||
      (hospitalIdHidden && hospitalIdHidden.value) || '';

    // بناء URL مع hospitalId إن وجد
    const typesUrl = hospitalId 
      ? `/complaint-types?hospitalId=${hospitalId}`
      : '/complaint-types';
    
    const types = await apiGet(typesUrl);
    window._types = types;
    fillSelectComplex(els.complaintType, types.map(t => ({ value: t.id, label: t.nameAr })), true);

    // 👈 نضيف خيار "تصنيف جديد"
    if (els.complaintType) {
      const newOpt = document.createElement('option');
      newOpt.value = '__NEW__';
      newOpt.textContent = '+ تصنيف جديد...';
      els.complaintType.appendChild(newOpt);
    }

    // عند تغيير التصنيف الرئيسي، تحميل الفرعي أو فتح إضافة جديد
    if (els.complaintType) {
      els.complaintType.addEventListener('change', async () => {
        const val = els.complaintType.value;

        // 👈 لو اختار "تصنيف جديد" نعرض الفورم ونوقف
        if (val === '__NEW__') {
          toggleNewTypeBox(true);
          // نفرّغ اختيار التصنيف عشان ما ينحسب في الفاليديشن قبل الحفظ
          els.complaintType.value = '';
          // ما نحمل تصنيفات فرعية هنا
          toggleNewSubTypeBox(false);
          return;
        } else {
          // إخفاء فورم التصنيف الجديد لو كان ظاهر
          toggleNewTypeBox(false);
        }

        const typeId = Number(val || 0);
        
        // لو ما فيه نوع رئيسي نوقف ونفضي الفرعي
        if (!typeId) {
          if (els.subType) {
            els.subType.disabled = true;
            els.subType.innerHTML = '<option value="">اختر التصنيف الفرعي</option>';
          }
          toggleNewSubTypeBox(false);
          return;
        }
        
        try {
          // استخراج hospitalId لإرساله مع الطلب
          const hospitalSelect = document.getElementById('hospitalSelect');
          const hospitalIdHidden = document.getElementById('hospitalIdHidden');
          const hospitalId = (hospitalSelect && hospitalSelect.value) || (hospitalIdHidden && hospitalIdHidden.value) || '';
          
          // بناء URL مع hospitalId إن وجد
          const url = hospitalId 
            ? `/complaint-subtypes?typeId=${typeId}&hospitalId=${hospitalId}`
            : `/complaint-subtypes?typeId=${typeId}`;
          
          const subs = await apiGet(url);

          // نعبي القائمة الأساسية
          fillSelectComplex(
            els.subType,
            subs.map(s => ({ value: s.id, label: s.nameAr })),
            true
          );

          if (els.subType) {
            els.subType.disabled = false;

            // 👉 نضيف خيار "تصنيف فرعي جديد"
            const newOpt = document.createElement('option');
            newOpt.value = '__NEW_SUB__';
            newOpt.textContent = '+ تصنيف فرعي جديد...';
            els.subType.appendChild(newOpt);
          }

          toggleNewSubTypeBox(false);
        } catch (err) {
          console.error('خطأ في جلب التصنيفات الفرعية:', err);
        }
      });
    }
  } catch (err) {
    console.error('خطأ في تحميل البيانات:', err);
    alert('تعذر تحميل البيانات المرجعية. تأكد من أن الـ API يعمل.');
  }
}

// دالة حفظ التصنيف الفرعي الجديد
async function saveNewComplaintSubType() {
  const nameAr = (newSubTypeEls.nameAr?.value || '').trim();
  const nameEn = (newSubTypeEls.nameEn?.value || '').trim() || null;

  if (!nameAr) {
    alert('اكتبي اسم التصنيف الفرعي بالعربي');
    return;
  }

  // لازم يكون فيه تصنيف رئيسي مختار
  const typeId = Number(els.complaintType?.value || 0);
  if (!typeId) {
    alert('اختاري التصنيف الرئيسي أولاً');
    return;
  }

  const token = localStorage.getItem('token') || '';
  if (!token) {
    alert('انتهت جلستك. يرجى تسجيل الدخول مرة أخرى');
    window.location.href = '../../auth/login.html';
    return;
  }

  // نفس منطق البلاغ في استخراج hospitalId
  const hospitalSelect   = document.getElementById('hospitalSelect');
  const hospitalIdHidden = document.getElementById('hospitalIdHidden');

  const hospitalId =
    (hospitalSelect && hospitalSelect.value) ||
    (hospitalIdHidden && hospitalIdHidden.value) || '';

  if (!hospitalId) {
    alert('يرجى اختيار المستشفى أولاً');
    return;
  }

  try {
    const res = await fetch(API_BASE + '/complaint-subtypes/custom', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Hospital-Id': hospitalId,  // يحدد قاعدة بيانات المستشفى
      },
      body: JSON.stringify({
        typeId,
        nameAr,
        nameEn,
      }),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.message || data.error || ('HTTP ' + res.status));
    }

    const newId = data.id;
    const select = els.subType;
    if (!select) return;

    // ننشئ option جديد قبل "__NEW_SUB__"
    const opt = document.createElement('option');
    opt.value = String(newId);
    opt.textContent = nameAr;

    const newPlaceholder = select.querySelector('option[value="__NEW_SUB__"]');
    if (newPlaceholder) {
      select.insertBefore(opt, newPlaceholder);
    } else {
      select.appendChild(opt);
    }

    // نختار التصنيف الفرعي الجديد
    select.value = String(newId);

    // تنظيف وإخفاء الفورم
    if (newSubTypeEls.nameAr) newSubTypeEls.nameAr.value = '';
    if (newSubTypeEls.nameEn) newSubTypeEls.nameEn.value = '';
    toggleNewSubTypeBox(false);

    alert('✅ تم إضافة التصنيف الفرعي الجديد لهذا المستشفى وتم اختياره في البلاغ.');
  } catch (err) {
    console.error('❌ خطأ في إضافة التصنيف الفرعي الجديد:', err);
    alert('فشل إضافة التصنيف الفرعي الجديد: ' + err.message);
  }
}

// دالة تعديل التصنيف الأساسي
async function editComplaintType() {
  const select = els.complaintType;
  if (!select) return;

  const id = Number(select.value || 0);
  if (!id) {
    alert('اختاري التصنيف الأساسي أولاً');
    return;
  }

  const currentName = select.options[select.selectedIndex].textContent;
  const newNameAr = prompt('اكتبي الاسم الجديد للتصنيف الأساسي:', currentName || '');
  if (newNameAr === null) return;      // إلغاء
  const trimmedName = newNameAr.trim();
  if (!trimmedName) {
    alert('الاسم لا يمكن أن يكون فارغاً');
    return;
  }

  const newNameEn = prompt('الاسم بالإنجليزي (اختياري):', '') || null;

  const token = localStorage.getItem('token') || '';
  if (!token) {
    alert('انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى');
    window.location.href = '../../auth/login.html';
    return;
  }

  const hospitalId = getCurrentHospitalId();
  if (!hospitalId) {
    alert('يرجى اختيار المستشفى أولاً');
    return;
  }

  try {
    const res = await fetch(API_BASE + `/complaint-types/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Hospital-Id': hospitalId,
      },
      body: JSON.stringify({
        nameAr: trimmedName,
        nameEn: newNameEn,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.success) {
      throw new Error(data.message || data.error || ('HTTP ' + res.status));
    }

    // نحدث النص في الـ select
    select.options[select.selectedIndex].textContent = trimmedName;
    alert('✅ تم تعديل التصنيف الأساسي بنجاح');
  } catch (err) {
    console.error('❌ خطأ في تعديل التصنيف الأساسي:', err);
    alert('فشل تعديل التصنيف الأساسي: ' + err.message);
  }
}

// دالة حذف التصنيف الأساسي
async function deleteComplaintType() {
  const select = els.complaintType;
  if (!select) return;

  const id = Number(select.value || 0);
  if (!id) {
    alert('اختاري التصنيف الأساسي أولاً');
    return;
  }

  if (!confirm('هل أنتِ متأكدة من حذف هذا التصنيف؟ قد لا يمكن استرجاعه.')) {
    return;
  }

  const token = localStorage.getItem('token') || '';
  if (!token) {
    alert('انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى');
    window.location.href = '../../auth/login.html';
    return;
  }

  const hospitalId = getCurrentHospitalId();
  if (!hospitalId) {
    alert('يرجى اختيار المستشفى أولاً');
    return;
  }

  try {
    const res = await fetch(API_BASE + `/complaint-types/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Hospital-Id': hospitalId,
      },
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.success) {
      throw new Error(data.message || data.error || ('HTTP ' + res.status));
    }

    // نحذف الـ option من القائمة
    select.remove(select.selectedIndex);
    select.value = '';
    if (els.subType) {
      els.subType.innerHTML = '<option value="">اختر التصنيف الفرعي</option>';
      els.subType.disabled = true;
    }

    alert('✅ تم حذف التصنيف الأساسي بنجاح');
  } catch (err) {
    console.error('❌ خطأ في حذف التصنيف الأساسي:', err);
    alert('فشل حذف التصنيف الأساسي: ' + err.message);
  }
}

// دالة تعديل التصنيف الفرعي
async function editComplaintSubType() {
  const select = els.subType;
  if (!select) return;

  const id = Number(select.value || 0);
  if (!id) {
    alert('اختاري التصنيف الفرعي أولاً');
    return;
  }

  const currentName = select.options[select.selectedIndex].textContent;
  const newNameAr = prompt('اكتبي الاسم الجديد للتصنيف الفرعي:', currentName || '');
  if (newNameAr === null) return;
  const trimmedName = newNameAr.trim();
  if (!trimmedName) {
    alert('الاسم لا يمكن أن يكون فارغاً');
    return;
  }

  const newNameEn = prompt('الاسم بالإنجليزي (اختياري):', '') || null;

  const token = localStorage.getItem('token') || '';
  if (!token) {
    alert('انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى');
    window.location.href = '../../auth/login.html';
    return;
  }

  const hospitalId = getCurrentHospitalId();
  if (!hospitalId) {
    alert('يرجى اختيار المستشفى أولاً');
    return;
  }

  try {
    const res = await fetch(API_BASE + `/complaint-subtypes/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Hospital-Id': hospitalId,
      },
      body: JSON.stringify({
        nameAr: trimmedName,
        nameEn: newNameEn,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.success) {
      throw new Error(data.message || data.error || ('HTTP ' + res.status));
    }

    select.options[select.selectedIndex].textContent = trimmedName;
    alert('✅ تم تعديل التصنيف الفرعي بنجاح');
  } catch (err) {
    console.error('❌ خطأ في تعديل التصنيف الفرعي:', err);
    alert('فشل تعديل التصنيف الفرعي: ' + err.message);
  }
}

// دالة حذف التصنيف الفرعي
async function deleteComplaintSubType() {
  const select = els.subType;
  if (!select) return;

  const id = Number(select.value || 0);
  if (!id) {
    alert('اختاري التصنيف الفرعي أولاً');
    return;
  }

  if (!confirm('هل أنتِ متأكدة من حذف هذا التصنيف الفرعي؟')) {
    return;
  }

  const token = localStorage.getItem('token') || '';
  if (!token) {
    alert('انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى');
    window.location.href = '../../auth/login.html';
    return;
  }

  const hospitalId = getCurrentHospitalId();
  if (!hospitalId) {
    alert('يرجى اختيار المستشفى أولاً');
    return;
  }

  try {
    const res = await fetch(API_BASE + `/complaint-subtypes/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Hospital-Id': hospitalId,
      },
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.success) {
      throw new Error(data.message || data.error || ('HTTP ' + res.status));
    }

    select.remove(select.selectedIndex);
    select.value = '';
    alert('✅ تم حذف التصنيف الفرعي بنجاح');
  } catch (err) {
    console.error('❌ خطأ في حذف التصنيف الفرعي:', err);
    alert('فشل حذف التصنيف الفرعي: ' + err.message);
  }
}

// دالة حفظ التصنيف الجديد واستعماله مباشرة
async function saveNewComplaintType() {
  const nameAr = (newTypeEls.nameAr?.value || '').trim();
  const nameEn = (newTypeEls.nameEn?.value || '').trim() || null;

  if (!nameAr) {
    alert('اكتبي اسم التصنيف بالعربي');
    return;
  }

  const token = localStorage.getItem('token') || '';
  if (!token) {
    alert('انتهت جلستك. يرجى تسجيل الدخول مرة أخرى');
    window.location.href = '../../auth/login.html';
    return;
  }

  // ✅ نفس منطق onSubmit في استخراج hospitalId
  const hospitalSelect = document.getElementById('hospitalSelect');
  const hospitalIdHidden = document.getElementById('hospitalIdHidden');

  const hospitalId =
    (hospitalSelect && hospitalSelect.value) ||
    (hospitalIdHidden && hospitalIdHidden.value) || '';

  if (!hospitalId) {
    alert('يرجى اختيار المستشفى أولاً');
    return;
  }

  try {
    // ✅ نستخدم نفس API_BASE = http://localhost:3001/api
    const res = await fetch(API_BASE + '/complaint-types/custom', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Hospital-Id': hospitalId   // 👈 مهم: يحدد قاعدة بيانات المستشفى المستهدف
      },
      body: JSON.stringify({
        nameAr,
        nameEn
      })
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.message || data.error || ('HTTP ' + res.status));
    }

    const newId = data.id;        // ID التصنيف في قاعدة بيانات هذا المستشفى فقط
    const select = els.complaintType;
    if (!select) return;

    // ننشئ option جديد قبل خيار "__NEW__" إن وجد
    const opt = document.createElement('option');
    opt.value = String(newId);
    opt.textContent = nameAr;

    const newPlaceholder = select.querySelector('option[value="__NEW__"]');
    if (newPlaceholder) {
      select.insertBefore(opt, newPlaceholder);
    } else {
      select.appendChild(opt);
    }

    // نختار التصنيف الجديد مباشرة
    select.value = String(newId);

    // تنظيف وإخفاء الفورم
    if (newTypeEls.nameAr) newTypeEls.nameAr.value = '';
    if (newTypeEls.nameEn) newTypeEls.nameEn.value = '';
    toggleNewTypeBox(false);

    alert('✅ تم إضافة التصنيف الجديد في مستشفى واحد (المختار) وتم اختياره في البلاغ.');

  } catch (err) {
    console.error('❌ خطأ في إضافة التصنيف الجديد:', err);
    alert('فشل إضافة التصنيف الجديد: ' + err.message);
  }
}

// ====== Dropzones ======
function initDropzone() {
  if (!els.dropzone || !els.fileInput) return;
  
  els.dropzone.addEventListener('click', () => els.fileInput.click());
  
  ['dragenter', 'dragover'].forEach(ev =>
    els.dropzone.addEventListener(ev, e => { 
      e.preventDefault(); 
      e.stopPropagation(); 
      els.dropzone.classList.add('dragover'); 
    })
  );
  
  ['dragleave', 'drop'].forEach(ev =>
    els.dropzone.addEventListener(ev, e => { 
      e.preventDefault(); 
      e.stopPropagation(); 
      els.dropzone.classList.remove('dragover'); 
    })
  );
  
  els.dropzone.addEventListener('drop', e => handleFiles(e.dataTransfer.files));
  els.fileInput.addEventListener('change', e => handleFiles(e.target.files));
}

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB
const ALLOWED = [
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

function handleFiles(fileList) {
  Array.from(fileList).forEach(f => {
    if (!ALLOWED.includes(f.type)) {
      alert('نوع ملف غير مسموح: ' + f.name);
      return;
    }
    if (f.size > MAX_FILE_SIZE) {
      alert('الملف يتجاوز 15MB: ' + f.name);
      return;
    }
    uploaded.push({ 
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random(), 
      file: f, 
      name: f.name, 
      size: f.size 
    });
  });
  renderFiles();
}

function renderFiles() {
  if (!els.filesList) return;
  els.filesList.innerHTML = '';
  
  uploaded.forEach(item => {
    const row = document.createElement('div');
    row.className = 'file-pill flex items-center justify-between p-2 bg-gray-100 rounded mb-2';
    row.innerHTML = `
      <div class="meta text-sm">${item.name} • ${(item.size / 1024 / 1024).toFixed(2)} MB</div>
      <button type="button" class="text-red-600 hover:text-red-800 text-sm" data-id="${item.id}">حذف</button>
    `;
    row.querySelector('button').onclick = () => {
      uploaded = uploaded.filter(x => x.id !== item.id);
      renderFiles();
    };
    els.filesList.appendChild(row);
  });
}

// ====== Excel Dropzone ======
function initExcelDropzone() {
  if (!els.excelDropzone || !els.excelInput) return;

  els.excelDropzone.addEventListener('click', () => els.excelInput.click());

  ['dragenter', 'dragover'].forEach(ev =>
    els.excelDropzone.addEventListener(ev, e => { 
      e.preventDefault(); 
      e.stopPropagation(); 
      els.excelDropzone.classList.add('dragover'); 
    })
  );
  
  ['dragleave', 'drop'].forEach(ev =>
    els.excelDropzone.addEventListener(ev, e => { 
      e.preventDefault(); 
      e.stopPropagation(); 
      els.excelDropzone.classList.remove('dragover'); 
    })
  );

  els.excelDropzone.addEventListener('drop', e => handleExcelFiles(e.dataTransfer.files));
  els.excelInput.addEventListener('change', e => handleExcelFiles(e.target.files));
}

const MAX_EXCEL_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXCEL = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel'
];

function handleExcelFiles(fileList) {
  const f = Array.from(fileList)[0];
  if (!f) return;

  if (!ALLOWED_EXCEL.includes(f.type) && !/\.(xlsx|xls)$/i.test(f.name)) {
    alert('الرجاء اختيار ملف Excel بصيغة ‎.xlsx أو ‎.xls');
    return;
  }
  if (f.size > MAX_EXCEL_SIZE) {
    alert('ملف الإكسل يتجاوز 10MB');
    return;
  }

  excelFile = { file: f, name: f.name, size: f.size };
  renderExcelFile();
}

function renderExcelFile() {
  if (!els.excelFileBox) return;
  els.excelFileBox.innerHTML = '';
  if (!excelFile) return;

  const row = document.createElement('div');
  row.className = 'file-pill flex items-center justify-between p-2 bg-gray-100 rounded mb-2';
  row.innerHTML = `
    <div class="meta text-sm">${excelFile.name} • ${(excelFile.size / 1024 / 1024).toFixed(2)} MB</div>
    <button type="button" class="text-red-600 hover:text-red-800 text-sm" id="removeExcel">حذف</button>
  `;
  row.querySelector('#removeExcel').onclick = () => { 
    excelFile = null; 
    renderExcelFile(); 
  };
  els.excelFileBox.appendChild(row);
}

// ====== تحقق وإرسال ======
function validate() {
  const errors = [];
  
  // ✅ التحقق من التوكن أولاً
  const token = localStorage.getItem('token') || '';
  if (!token) {
    errors.push('❌ انتهت جلستك. يرجى تسجيل الدخول مرة أخرى');
    return errors;
  }
  
  // ✅ التحقق من تحميل الأقسام
  if (!window.departments || window.departments.length === 0) {
    errors.push('❌ جاري تحميل الأقسام... انتظر قليلاً أو أعد تحميل الصفحة');
    return errors;
  }
  
  // ✅ التحقق من اختيار المستشفى
  const hospitalSelect = document.getElementById('hospitalSelect');
  const hospitalIdHidden = document.getElementById('hospitalIdHidden');
  
  // إذا كان مدير تجمع (القائمة المنسدلة ظاهرة)
  if (hospitalSelect && hospitalSelect.offsetParent !== null && !hospitalSelect.value) {
    errors.push('❌ يجب اختيار المستشفى');
  }
  
  // إذا كان موظف مستشفى (الحقل المخفي موجود لكن فارغ)
  if (hospitalIdHidden && hospitalIdHidden.offsetParent !== null && !hospitalIdHidden.value) {
    errors.push('❌ خطأ: لا يوجد مستشفى محدد. تواصل مع الإدارة.');
  }
  
  // ✅ الحقول الإلزامية الأخرى
  const deptVal = String(els.finalDepartmentId?.value || '').replace(/\D/g, '');
  if (!deptVal) {
    errors.push('❌ يجب اختيار القسم');
  }
  
  if (!els.fullName?.value?.trim()) {
    errors.push('❌ يجب إدخال اسم المريض (PatientFullName)');
  }
  
  if (!els.details?.value?.trim()) {
    errors.push('❌ يجب إدخال وصف البلاغ (Description)');
  }
  
  // حقول مهمة (ليست إلزامية في DB لكن منطقياً مهمة)
  if (!els.visitDate?.value) {
    errors.push('⚠️ يُفضّل تحديد تاريخ الزيارة');
  }
  
  if (!els.nationalId?.value?.trim()) {
    errors.push('⚠️ يُفضّل إدخال رقم الهوية');
  }
  
  if (!els.mobile?.value?.trim()) {
    errors.push('⚠️ يُفضّل إدخال رقم الجوال');
  }
  
  if (!els.gender?.value) {
    errors.push('⚠️ يُفضّل اختيار الجنس');
  }
  
  return errors;
}

function buildFormData() {
  const fd = new FormData();
  
  // 🔹 نظّف أي حروف من الـ IDs (لأن الكاسكيدر يستخدم "d14" بدل 14)
  const departmentIdClean = String(els.finalDepartmentId?.value || '').replace(/\D/g, '');
  const complaintTypeIdClean = String(els.complaintType?.value || '').replace(/\D/g, '');
  const subTypeIdClean = els.subType?.value ? String(els.subType.value).replace(/\D/g, '') : '';
  
  // ✅ تحديد HospitalID حسب نوع المستخدم
  let hospitalId = null;
  const hospitalSelect = document.getElementById('hospitalSelect');
  const hospitalIdHidden = document.getElementById('hospitalIdHidden');
  
  if (hospitalSelect && hospitalSelect.style.display !== 'none' && hospitalSelect.offsetParent !== null) {
    // مدير تجمع: من القائمة المنسدلة
    hospitalId = hospitalSelect.value;
  } else if (hospitalIdHidden) {
    // موظف مستشفى: من الحقل المخفي
    hospitalId = hospitalIdHidden.value;
  }
  
  // ✅ الحقول الإلزامية (PascalCase كما يتوقعها الباك-إند)
  if (hospitalId) {
    fd.append('HospitalID', hospitalId);
  }
  fd.append('DepartmentID', departmentIdClean);
  fd.append('PatientFullName', els.fullName?.value?.trim() || '');
  fd.append('Description', els.details?.value?.trim() || '');
  
  // الحقول الاختيارية (PascalCase)
  if (els.visitDate?.value) {
    fd.append('VisitDate', els.visitDate.value);
  }
  
  if (els.nationalId?.value?.trim()) {
    fd.append('PatientIDNumber', els.nationalId.value.trim());
  }
  
  if (els.mobile?.value?.trim()) {
    fd.append('PatientMobile', els.mobile.value.trim());
  }
  
  if (els.gender?.value) {
    fd.append('GenderCode', els.gender.value);
  }
  
  if (els.fileNumber?.value?.trim()) {
    fd.append('FileNumber', els.fileNumber.value.trim());
  }
  
  if (complaintTypeIdClean) {
    fd.append('ComplaintTypeID', complaintTypeIdClean);
  }
  
  if (subTypeIdClean) {
    fd.append('SubTypeID', subTypeIdClean);
  }
  
  // تم حذف إرسال PriorityCode - يتم تحديده تلقائياً في الباك-إند
  fd.append('SubmissionType', '937');
  
  // المرفقات العادية
  uploaded.forEach(item => fd.append('attachments', item.file, item.name));
  
  // ملف Excel
  if (excelFile?.file) {
    fd.append('attachments', excelFile.file, excelFile.name);
  }
  
  // 🔹 بيانات الموظف المستهدف (إذا تم تفعيل البلاغ على موظف)
  if (empEls?.toggle?.checked) {
    const target = {
      TargetEmployeeID: (empEls.id?.value || '').trim() || null,
      TargetEmployeeName: (empEls.name?.value || '').trim() || null,
      TargetDepartmentID: (empEls.deptId?.value || '').trim() || null,
      TargetDepartmentName: (empEls.deptName?.value || '').trim() || null,
    };
    
    // نرسل فقط إذا فيه بيانات معبّأة
    if (Object.values(target).some(v => v && String(v).length)) {
      fd.append('AgainstEmployee', JSON.stringify(target));
      console.log('✅ تم إضافة بيانات الموظف المستهدف:', target);
    }
  }
  
  // تتبع ما تم إرساله (للتشخيص)
  console.log('📋 البيانات المُرسلة:', {
    DepartmentID: departmentIdClean,
    PatientFullName: els.fullName?.value?.substring(0, 20),
    Description: els.details?.value?.substring(0, 30),
    SubmissionType: '937'
  });
  
  return fd;
}

async function onSubmit(e) {
  e.preventDefault();
  
  const errors = validate();
  if (errors.length) {
    alert('تأكد من الحقول:\n- ' + errors.join('\n- '));
    return;
  }
  
  try {
    const fd = buildFormData();
    const token = localStorage.getItem('token') || '';
    
    if (!token) {
      alert('انتهت جلستك. يرجى تسجيل الدخول مرة أخرى');
      window.location.href = '../../auth/login.html';
      return;
    }
    
    // ✅ استخراج hospitalId قبل الإرسال
    const hospitalSelect = document.getElementById('hospitalSelect');
    const hospitalIdHidden = document.getElementById('hospitalIdHidden');
    const hospitalId = 
      (hospitalSelect && hospitalSelect.value) ||
      (hospitalIdHidden && hospitalIdHidden.value) || '';

    console.log('🔍 hospitalId المُرسل:', hospitalId);

    // ✅ إرسال مع Authorization header و X-Hospital-Id
    const res = await fetch(API_BASE + '/complaints', {
      method: 'POST',
      body: fd,
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Hospital-Id': hospitalId   // 👈 مهم - يرسل hospitalId في الهيدر
        // لا نرسل Content-Type لأن FormData يضبطه تلقائياً مع boundary
      }
    });
    
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      
      if (res.status === 401) {
        alert('انتهت جلستك. يرجى تسجيل الدخول مرة أخرى');
        window.location.href = '../../auth/login.html';
        return;
      }
      
      throw new Error(errorData.message || errorData.error || 'HTTP ' + res.status);
    }
    
    const data = await res.json();
    const ticketNum = data.TicketNumber || data.data?.TicketNumber || 'غير محدد';
    const priority = data.PriorityCode || data.data?.PriorityCode || 'MEDIUM';
    const complaintId = data.ComplaintID || data.data?.ComplaintID;
    
    // إنشاء بلاغ على موظف إذا تم تحديده
    if (complaintId && empEls?.toggle?.checked && empEls?.name?.value) {
      try {
        await createComplaintTarget(complaintId, {
          targetEmployeeId: empEls.id.value || null,
          targetEmployeeName: empEls.name.value,
          targetDepartmentId: empEls.deptId.value || null,
          targetDepartmentName: empEls.deptName.value || null
        });
        console.log('✅ تم إنشاء البلاغ على الموظف بنجاح');
      } catch (error) {
        console.error('❌ خطأ في إنشاء البلاغ على الموظف:', error);
        // لا نوقف العملية، فقط نعرض تحذير
      }
    }
    
    alert(`✅ تم إنشاء البلاغ بنجاح!\n\nرقم التذكرة: ${ticketNum}\nالأولوية: ${priority}\n\nسيتم التواصل معك قريباً.`);
    resetForm();
    
    // توجيه للوحة التحكم أو سجل البلاغات
    setTimeout(() => {
      window.location.href = '../history/complaints-history.html';
    }, 2000);
    
  } catch (err) {
    console.error('خطأ في إرسال البلاغ:', err);
    alert('❌ فشل إرسال البلاغ. حاول مرة أخرى.\n\nالخطأ: ' + err.message);
  }
}

function resetForm() {
  if (els.form) els.form.reset();
  uploaded = [];
  excelFile = null;
  renderFiles();
  renderExcelFile();
  if (els.hospitalDropdown) els.hospitalDropdown.innerHTML = '';
  if (els.hospitalId) els.hospitalId.value = '';
  if (els.subType) els.subType.disabled = true;
  
  // إعادة تعيين حقول الموظف المستهدف
  if (empEls?.toggle) empEls.toggle.checked = false;
  if (empEls?.box) empEls.box.style.display = 'none';
  if (empEls?.search) empEls.search.value = '';
  if (empEls?.id) empEls.id.value = '';
  if (empEls?.name) empEls.name.value = '';
  if (empEls?.deptId) empEls.deptId.value = '';
  if (empEls?.deptName) empEls.deptName.value = '';
  if (empEls?.results) {
    empEls.results.style.display = 'none';
    empEls.results.innerHTML = '';
  }
  
  // إعادة تعيين القائمة المتفرعة للأقسام
  if (typeof initCascader === 'function') {
    initCascader();
  }
}

// ✅ تهيئة الصفحة بتحميل بيانات المستخدم تلقائياً
async function initPage() {
  // 1) اقرأ المستخدم من localStorage
  currentUser = JSON.parse(localStorage.getItem('user') || 'null');
  
  if (!currentUser) {
    alert('الرجاء تسجيل الدخول أولاً');
    window.location.href = '../../auth/login.html';
    return;
  }

  console.log('✅ المستخدم المسجل:', currentUser);

  // 2) ✅ تحديد نوع المستخدم: مدير تجمع أو موظف مستشفى
  const isCluster = currentUser.Scope === 'central' || 
                    currentUser.Scope === 'cluster' || 
                    currentUser.roleScope === 'cluster' ||
                    ['CLUSTER_ADMIN', 'CLUSTER_MANAGER'].includes(currentUser.RoleCode);

  if (isCluster) {
    // 🟦 مدير التجمع: أظهر قائمة المستشفيات
    await initClusterMode();
  } else {
    // 🟩 موظف مستشفى: أظهر المستشفى الثابت
    await initHospitalMode();
  }

  // 3) حمّل بقية البيانات المرجعية
  await loadTypesAndGenders();
}

// 🟦 وضع مدير التجمع: يختار المستشفى من قائمة
async function initClusterMode() {
  console.log('🟦 وضع مدير التجمع: يمكنه اختيار أي مستشفى');
  
  const selectContainer = document.getElementById('hospitalSelectContainer');
  const textContainer = document.getElementById('hospitalTextContainer');
  const hospitalSelect = document.getElementById('hospitalSelect');
  
  if (selectContainer) selectContainer.style.display = 'block';
  if (textContainer) textContainer.style.display = 'none';
  
  // تحميل قائمة المستشفيات
  try {
    const response = await apiGet('/hospitals?active=1');
    
    // ✅ التعامل مع كلا الصيغتين: { success, data } أو array مباشر
    const hospitals = response.data || response;
    
    if (hospitalSelect && Array.isArray(hospitals) && hospitals.length > 0) {
      hospitalSelect.innerHTML = '<option value="">اختر المستشفى...</option>';
      hospitals.forEach(h => {
        const opt = document.createElement('option');
        opt.value = h.HospitalID || h.id;
        opt.textContent = h.NameAr || h.name;
        hospitalSelect.appendChild(opt);
      });
      
      console.log(`✅ تم تحميل ${hospitals.length} مستشفى`);
      
      // عند اختيار مستشفى، حمّل أقسامه وأعد تحميل التصنيفات
      hospitalSelect.addEventListener('change', async () => {
        const hospId = hospitalSelect.value;
        if (hospId) {
          console.log(`✅ تم اختيار المستشفى: ${hospId}`);
          await loadDepartmentsForHospital(hospId);
          // إعادة تحميل التصنيفات من قاعدة بيانات المستشفى المختار
          await loadTypesAndGenders();
        } else {
          // مسح الأقسام
          window.departments = [];
          if (typeof buildChildrenMap === 'function') buildChildrenMap();
          if (typeof initCascader === 'function') initCascader();
        }
      });
    } else {
      console.warn('⚠️ لا توجد مستشفيات متاحة أو البيانات غير صحيحة:', response);
      if (hospitalSelect) {
        hospitalSelect.innerHTML = '<option value="">لا توجد مستشفيات متاحة</option>';
      }
    }
  } catch (err) {
    console.error('❌ خطأ في تحميل المستشفيات:', err);
    console.error('تفاصيل الخطأ:', err.message);
    
    if (hospitalSelect) {
      hospitalSelect.innerHTML = '<option value="">⚠️ فشل تحميل المستشفيات</option>';
    }
    
    alert(`فشل تحميل قائمة المستشفيات.\n\nالخطأ: ${err.message}\n\nتأكد من:\n1. تشغيل الخادم على المنفذ 3001\n2. الاتصال بالإنترنت\n3. وجود بيانات في جدول hospitals`);
  }
}

// 🟩 وضع موظف المستشفى: المستشفى ثابت من التوكن
async function initHospitalMode() {
  console.log('🟩 وضع موظف المستشفى: المستشفى محدد من التوكن');
  
  if (!currentUser.HospitalID) {
    alert('خطأ: لا يوجد مستشفى محدد لهذا الحساب. تواصل مع الإدارة.');
    return;
  }
  
  const selectContainer = document.getElementById('hospitalSelectContainer');
  const textContainer = document.getElementById('hospitalTextContainer');
  const hospitalNameText = document.getElementById('hospitalNameText');
  const hospitalIdHidden = document.getElementById('hospitalIdHidden');
  
  if (textContainer) textContainer.style.display = 'block';
  if (selectContainer) selectContainer.style.display = 'none';
  
  // عبّئ اسم المستشفى وأقفل الحقل
  if (hospitalNameText) {
    hospitalNameText.value = currentUser.HospitalName || `مستشفى #${currentUser.HospitalID}`;
  }
  
  if (hospitalIdHidden) {
    hospitalIdHidden.value = currentUser.HospitalID;
  }

  // حمّل أقسام هذا المستشفى فقط (من التوكن - آمن)
  await loadDepartmentsForCurrentUser();
}

// ✅ تحميل أقسام مستشفى محدد (لمدير التجمع) - موحد مع signup
async function loadDepartmentsForHospital(hospitalId) {
  try {
    const token = localStorage.getItem('token') || '';
    
    if (!token) {
      console.error('❌ لا يوجد توكن');
      return;
    }

    if (!hospitalId) {
      console.error('❌ لا يوجد hospitalId');
      alert('يرجى اختيار المستشفى أولاً');
      return;
    }

    console.log(`🔄 جاري تحميل الأقسام للمستشفى: ${hospitalId}`);

    // استخدام نفس API المستخدم في signup
    console.log(`🔍 طلب الأقسام: ${API_BASE}/departments?hospitalId=${hospitalId}`);
    console.log(`🔍 التوكن: ${token.substring(0, 20)}...`);
    
    const res = await fetch(`${API_BASE}/departments?hospitalId=${hospitalId}`, {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });
    
    console.log(`🔍 استجابة HTTP: ${res.status} ${res.statusText}`);
    
    if (!res.ok) {
      if (res.status === 401) {
        alert('انتهت جلستك. يرجى تسجيل الدخول مرة أخرى');
        window.location.href = '../../auth/login.html';
        return;
      }
      
      // محاولة قراءة رسالة الخطأ
      try {
        const errorData = await res.json();
        console.error('🔍 تفاصيل خطأ HTTP:', errorData);
        throw new Error(`HTTP ${res.status}: ${errorData.message || res.statusText}`);
      } catch (parseError) {
        console.error('🔍 خطأ في تحليل استجابة الخطأ:', parseError);
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
    }
    
    const result = await res.json();
    console.log(`🔍 استجابة API:`, result);
    
    // ✅ التعامل مع الصيغ المختلفة للاستجابة
    let data = [];
    
    if (result.success && result.data) {
      // الصيغة الجديدة: {success: true, data: [...]}
      data = result.data;
    } else if (result.ok && result.items) {
      // الصيغة القديمة: {ok: true, items: [...]}
      data = result.items;
    } else if (Array.isArray(result)) {
      // صيغة مباشرة: [...]
      data = result;
    } else {
      console.error('🔍 صيغة استجابة غير متوقعة:', result);
      throw new Error('صيغة استجابة غير متوقعة من API');
    }
    
    console.log(`🔍 البيانات المستخرجة:`, data);
    
    // صيغة موحّدة للكاسكيدر
    window.departments = data.map(d => ({ 
      id: String(d.DepartmentID || d.id), 
      name: d.NameAr || d.nameAr || d.name, 
      parentId: d.ParentDepartmentID || d.parentId ? String(d.ParentDepartmentID || d.parentId) : null 
    }));
    
    console.log(`✅ تم تحميل ${window.departments.length} قسم للمستشفى ${hospitalId}`);
    
    if (typeof buildChildrenMap === 'function') buildChildrenMap();
    if (typeof initCascader === 'function') initCascader();
    
  } catch (err) {
    console.error('❌ خطأ في جلب الأقسام:', err);
    console.error('تفاصيل الخطأ:', err.message);
    alert(`فشل تحميل الأقسام: ${err.message}`);
  }
}

// ====== بدء التشغيل ======
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // ✅ التهيئة الأولية بتحميل بيانات المستخدم
    await initPage();

    // إخفاء البحث عن المستشفيات (لأنه ثابت الآن)
    if (els.hospitalDropdown) {
      els.hospitalDropdown.style.display = 'none';
    }

    initDropzone();
    initExcelDropzone();

    if (els.form) els.form.addEventListener('submit', onSubmit);
    if (els.resetBtn) els.resetBtn.addEventListener('click', resetForm);
    
    // ربط أزرار التصنيف الجديد
    if (newTypeEls.btn) {
      newTypeEls.btn.addEventListener('click', () => toggleNewTypeBox(true));
    }
    if (newTypeEls.cancel) {
      newTypeEls.cancel.addEventListener('click', () => {
        toggleNewTypeBox(false);
        // تنظيف الحقول
        if (newTypeEls.nameAr) newTypeEls.nameAr.value = '';
        if (newTypeEls.nameEn) newTypeEls.nameEn.value = '';
      });
    }
    if (newTypeEls.save) {
      newTypeEls.save.addEventListener('click', saveNewComplaintType);
    }

    // أزرار التصنيف الفرعي الجديد
    if (newSubTypeEls.btn) {
      newSubTypeEls.btn.addEventListener('click', () => toggleNewSubTypeBox(true));
    }
    if (newSubTypeEls.cancel) {
      newSubTypeEls.cancel.addEventListener('click', () => toggleNewSubTypeBox(false));
    }
    if (newSubTypeEls.save) {
      newSubTypeEls.save.addEventListener('click', saveNewComplaintSubType);
    }

    // لو المستخدم اختار من القائمة "تصنيف فرعي جديد..."
    if (els.subType) {
      els.subType.addEventListener('change', () => {
        if (els.subType.value === '__NEW_SUB__') {
          // نعرض الفورم ونفرغ القيمة عشان ما تنحسب تصنيف فعلي
          els.subType.value = '';
          toggleNewSubTypeBox(true);
        }
      });
    }

    // أزرار تعديل / حذف التصنيف الأساسي
    if (manageTypeEls.editType) {
      manageTypeEls.editType.addEventListener('click', editComplaintType);
    }
    if (manageTypeEls.deleteType) {
      manageTypeEls.deleteType.addEventListener('click', deleteComplaintType);
    }

    // أزرار تعديل / حذف التصنيف الفرعي
    if (manageTypeEls.editSubType) {
      manageTypeEls.editSubType.addEventListener('click', editComplaintSubType);
    }
    if (manageTypeEls.deleteSubType) {
      manageTypeEls.deleteSubType.addEventListener('click', deleteComplaintSubType);
    }
    
    // معاينة الأولوية المباشرة
    setupPriorityPreview();
    
  } catch (e) {
    console.error('خطأ في التهيئة:', e);
    alert('تعذر تحميل البيانات المرجعية. تأكد من تشغيل الـ API.');
  }
});

// معاينة الأولوية المباشرة
function setupPriorityPreview() {
  const previewEl = document.getElementById('priorityPreview');
  if (!previewEl || !els.details) return;
  
  let prevTimer = null;
  
  els.details.addEventListener('input', () => {
    clearTimeout(prevTimer);
    prevTimer = setTimeout(async () => {
      try {
        const description = els.details.value.trim();
        if (!description) {
          previewEl.textContent = 'الأولوية المتوقعة: —';
          return;
        }
        
        const token = localStorage.getItem('authToken') || localStorage.getItem('token') || '';
        const res = await fetch('http://localhost:3001/api/utils/priority-detect', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ description })
        });
        
        const data = await res.json();
        if (data.success) {
          const priorityMap = {
            'URGENT': 'عاجل',
            'HIGH': 'عالي', 
            'MEDIUM': 'متوسط',
            'LOW': 'منخفض'
          };
          const priorityText = priorityMap[data.priority] || data.priority;
          previewEl.textContent = `الأولوية المتوقعة: ${priorityText}`;
          
          // تغيير اللون حسب الأولوية
          previewEl.className = 'text-sm mt-2 block font-medium';
          switch (data.priority) {
            case 'URGENT':
              previewEl.className += ' text-red-600';
              break;
            case 'HIGH':
              previewEl.className += ' text-orange-600';
              break;
            case 'MEDIUM':
              previewEl.className += ' text-yellow-600';
              break;
            case 'LOW':
              previewEl.className += ' text-green-600';
              break;
            default:
              previewEl.className += ' text-gray-600';
          }
        } else {
          previewEl.textContent = 'الأولوية المتوقعة: —';
          previewEl.className = 'text-sm text-gray-600 mt-2 block';
        }
      } catch (error) {
        console.warn('خطأ في معاينة الأولوية:', error);
        previewEl.textContent = 'الأولوية المتوقعة: —';
        previewEl.className = 'text-sm text-gray-600 mt-2 block';
      }
    }, 500); // تأخير 500ms لتجنب الطلبات المتكررة
  });
}
