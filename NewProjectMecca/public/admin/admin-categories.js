// admin-categories.js
const API_BASE = (location.port === '3001') ? '' : 'http://localhost:3001';

// دالة للحصول على headers المصادقة
function authHeaders() {
  const token = localStorage.getItem('token') || localStorage.getItem('authToken');
  return {
    'Accept': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    'Content-Type': 'application/json'
  };
}

let currentHospitalId = null;
let currentMainCategoryId = null;
let mainCategories = [];
let subCategories = [];

// عناصر الصفحة
const els = {
  hospitalSelect: document.getElementById('hospitalSelect'),
  mainCategoriesSection: document.getElementById('mainCategoriesSection'),
  mainCategoriesList: document.getElementById('mainCategoriesList'),
  btnAddMainCategory: document.getElementById('btnAddMainCategory'),
  subCategoriesSection: document.getElementById('subCategoriesSection'),
  subCategoriesList: document.getElementById('subCategoriesList'),
  selectedMainCategoryName: document.getElementById('selectedMainCategoryName'),
  btnAddSubCategory: document.getElementById('btnAddSubCategory'),
};

// جلب المستشفيات
async function loadHospitals() {
  try {
    const res = await fetch(`${API_BASE}/api/hospitals?active=1`, {
      headers: authHeaders()
    });
    
    if (!res.ok) throw new Error('فشل جلب المستشفيات');
    
    const hospitals = await res.json();
    els.hospitalSelect.innerHTML = '<option value="">اختر المستشفى...</option>';
    
    hospitals.forEach(h => {
      const opt = document.createElement('option');
      opt.value = h.HospitalID;
      opt.textContent = h.NameAr;
      els.hospitalSelect.appendChild(opt);
    });
  } catch (err) {
    console.error('❌ خطأ في جلب المستشفيات:', err);
    alert('فشل تحميل المستشفيات: ' + err.message);
  }
}

// جلب التصنيفات الرئيسية
async function loadMainCategories() {
  if (!currentHospitalId) return;
  
  try {
    const res = await fetch(`${API_BASE}/api/complaint-types?hospitalId=${currentHospitalId}`, {
      headers: {
        ...authHeaders(),
        'X-Hospital-Id': currentHospitalId
      }
    });
    
    if (!res.ok) throw new Error('فشل جلب التصنيفات الرئيسية');
    
    mainCategories = await res.json();
    renderMainCategories();
  } catch (err) {
    console.error('❌ خطأ في جلب التصنيفات الرئيسية:', err);
    alert('فشل تحميل التصنيفات الرئيسية: ' + err.message);
  }
}

// عرض التصنيفات الرئيسية
function renderMainCategories() {
  els.mainCategoriesList.innerHTML = '';
  
  if (mainCategories.length === 0) {
    els.mainCategoriesList.innerHTML = '<div class="text-gray-500 text-center py-4">لا توجد تصنيفات رئيسية</div>';
    return;
  }
  
  mainCategories.forEach(cat => {
    const div = document.createElement('div');
    div.className = 'flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200 hover:bg-gray-100 transition';
    div.innerHTML = `
      <div class="flex-1">
        <div class="font-semibold text-[#002B5B]">${cat.nameAr || cat.name}</div>
        ${cat.nameEn ? `<div class="text-sm text-gray-500">${cat.nameEn}</div>` : ''}
      </div>
      <div class="flex gap-2">
        <button class="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition edit-main" data-id="${cat.id}">
          تعديل
        </button>
        <button class="px-3 py-1 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition view-subs" data-id="${cat.id}" data-name="${cat.nameAr || cat.name}">
          عرض الفرعية
        </button>
        <button class="px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 transition delete-main" data-id="${cat.id}">
          حذف
        </button>
      </div>
    `;
    
    // ربط الأحداث
    div.querySelector('.edit-main').addEventListener('click', () => editMainCategory(cat));
    div.querySelector('.view-subs').addEventListener('click', () => viewSubCategories(cat.id, cat.nameAr || cat.name));
    div.querySelector('.delete-main').addEventListener('click', () => deleteMainCategory(cat.id));
    
    els.mainCategoriesList.appendChild(div);
  });
}

// عرض التصنيفات الفرعية
async function viewSubCategories(mainCategoryId, mainCategoryName) {
  currentMainCategoryId = mainCategoryId;
  els.selectedMainCategoryName.textContent = `(${mainCategoryName})`;
  els.subCategoriesSection.style.display = 'block';
  
  // التأكد من أن الحاوية مرئية
  if (categoriesContainer) categoriesContainer.style.display = 'grid';
  
  try {
    const res = await fetch(`${API_BASE}/api/complaint-subtypes?typeId=${mainCategoryId}&hospitalId=${currentHospitalId}`, {
      headers: {
        ...authHeaders(),
        'X-Hospital-Id': currentHospitalId
      }
    });
    
    if (!res.ok) throw new Error('فشل جلب التصنيفات الفرعية');
    
    subCategories = await res.json();
    renderSubCategories();
  } catch (err) {
    console.error('❌ خطأ في جلب التصنيفات الفرعية:', err);
    alert('فشل تحميل التصنيفات الفرعية: ' + err.message);
  }
}

// عرض التصنيفات الفرعية
function renderSubCategories() {
  els.subCategoriesList.innerHTML = '';
  
  if (subCategories.length === 0) {
    els.subCategoriesList.innerHTML = '<div class="text-gray-500 text-center py-4">لا توجد تصنيفات فرعية</div>';
    return;
  }
  
  subCategories.forEach(cat => {
    const div = document.createElement('div');
    div.className = 'flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200 hover:bg-gray-100 transition';
    div.innerHTML = `
      <div class="flex-1">
        <div class="font-semibold text-[#002B5B]">${cat.nameAr || cat.name}</div>
        ${cat.nameEn ? `<div class="text-sm text-gray-500">${cat.nameEn}</div>` : ''}
      </div>
      <div class="flex gap-2">
        <button class="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition edit-sub" data-id="${cat.id}">
          تعديل
        </button>
        <button class="px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 transition delete-sub" data-id="${cat.id}">
          حذف
        </button>
      </div>
    `;
    
    // ربط الأحداث
    div.querySelector('.edit-sub').addEventListener('click', () => editSubCategory(cat));
    div.querySelector('.delete-sub').addEventListener('click', () => deleteSubCategory(cat.id));
    
    els.subCategoriesList.appendChild(div);
  });
}

// إضافة تصنيف رئيسي
els.btnAddMainCategory.addEventListener('click', () => {
  const nameAr = prompt('اسم التصنيف الرئيسي بالعربي:');
  if (!nameAr || !nameAr.trim()) return;
  
  const nameEn = prompt('اسم التصنيف الرئيسي بالإنجليزي (اختياري):') || null;
  
  addMainCategory(nameAr.trim(), nameEn?.trim() || null);
});

// إضافة تصنيف فرعي
els.btnAddSubCategory.addEventListener('click', () => {
  if (!currentMainCategoryId) {
    alert('يرجى اختيار تصنيف رئيسي أولاً');
    return;
  }
  
  const nameAr = prompt('اسم التصنيف الفرعي بالعربي:');
  if (!nameAr || !nameAr.trim()) return;
  
  const nameEn = prompt('اسم التصنيف الفرعي بالإنجليزي (اختياري):') || null;
  
  addSubCategory(currentMainCategoryId, nameAr.trim(), nameEn?.trim() || null);
});

// دالة إضافة تصنيف رئيسي
async function addMainCategory(nameAr, nameEn) {
  try {
    const res = await fetch(`${API_BASE}/api/complaint-types/custom`, {
      method: 'POST',
      headers: {
        ...authHeaders(),
        'X-Hospital-Id': currentHospitalId
      },
      body: JSON.stringify({ nameAr, nameEn })
    });
    
    const data = await res.json();
    
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'فشل إضافة التصنيف');
    }
    
    alert('✅ تم إضافة التصنيف الرئيسي بنجاح');
    await loadMainCategories();
  } catch (err) {
    console.error('❌ خطأ في إضافة التصنيف الرئيسي:', err);
    alert('فشل إضافة التصنيف: ' + err.message);
  }
}

// دالة تعديل تصنيف رئيسي
async function editMainCategory(cat) {
  const nameAr = prompt('اسم التصنيف الرئيسي بالعربي:', cat.nameAr || cat.name);
  if (!nameAr || !nameAr.trim()) return;
  
  const nameEn = prompt('اسم التصنيف الرئيسي بالإنجليزي (اختياري):', cat.nameEn || '') || null;
  
  try {
    const res = await fetch(`${API_BASE}/api/complaint-types/${cat.id}`, {
      method: 'PUT',
      headers: {
        ...authHeaders(),
        'X-Hospital-Id': currentHospitalId
      },
      body: JSON.stringify({ nameAr: nameAr.trim(), nameEn: nameEn?.trim() || null })
    });
    
    const data = await res.json();
    
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'فشل تعديل التصنيف');
    }
    
    alert('✅ تم تعديل التصنيف الرئيسي بنجاح');
    await loadMainCategories();
  } catch (err) {
    console.error('❌ خطأ في تعديل التصنيف الرئيسي:', err);
    alert('فشل تعديل التصنيف: ' + err.message);
  }
}

// دالة حذف تصنيف رئيسي
async function deleteMainCategory(id) {
  if (!confirm('هل أنت متأكد من حذف هذا التصنيف الرئيسي؟ سيتم حذف جميع التصنيفات الفرعية المرتبطة به.')) {
    return;
  }
  
  try {
    const res = await fetch(`${API_BASE}/api/complaint-types/${id}`, {
      method: 'DELETE',
      headers: {
        ...authHeaders(),
        'X-Hospital-Id': currentHospitalId
      }
    });
    
    const data = await res.json();
    
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'فشل حذف التصنيف');
    }
    
    alert('✅ تم حذف التصنيف الرئيسي بنجاح');
    await loadMainCategories();
    
    // إخفاء قسم التصنيفات الفرعية إذا كان التصنيف المحذوف هو المحدد
    if (currentMainCategoryId === id) {
      els.subCategoriesSection.style.display = 'none';
      currentMainCategoryId = null;
    }
  } catch (err) {
    console.error('❌ خطأ في حذف التصنيف الرئيسي:', err);
    alert('فشل حذف التصنيف: ' + err.message);
  }
}

// دالة إضافة تصنيف فرعي
async function addSubCategory(typeId, nameAr, nameEn) {
  try {
    const res = await fetch(`${API_BASE}/api/complaint-subtypes/custom`, {
      method: 'POST',
      headers: {
        ...authHeaders(),
        'X-Hospital-Id': currentHospitalId
      },
      body: JSON.stringify({ typeId, nameAr, nameEn })
    });
    
    const data = await res.json();
    
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'فشل إضافة التصنيف الفرعي');
    }
    
    alert('✅ تم إضافة التصنيف الفرعي بنجاح');
    await viewSubCategories(typeId, els.selectedMainCategoryName.textContent.replace(/[()]/g, ''));
  } catch (err) {
    console.error('❌ خطأ في إضافة التصنيف الفرعي:', err);
    alert('فشل إضافة التصنيف الفرعي: ' + err.message);
  }
}

// دالة تعديل تصنيف فرعي
async function editSubCategory(cat) {
  const nameAr = prompt('اسم التصنيف الفرعي بالعربي:', cat.nameAr || cat.name);
  if (!nameAr || !nameAr.trim()) return;
  
  const nameEn = prompt('اسم التصنيف الفرعي بالإنجليزي (اختياري):', cat.nameEn || '') || null;
  
  try {
    const res = await fetch(`${API_BASE}/api/complaint-subtypes/${cat.id}`, {
      method: 'PUT',
      headers: {
        ...authHeaders(),
        'X-Hospital-Id': currentHospitalId
      },
      body: JSON.stringify({ nameAr: nameAr.trim(), nameEn: nameEn?.trim() || null })
    });
    
    const data = await res.json();
    
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'فشل تعديل التصنيف الفرعي');
    }
    
    alert('✅ تم تعديل التصنيف الفرعي بنجاح');
    await viewSubCategories(currentMainCategoryId, els.selectedMainCategoryName.textContent.replace(/[()]/g, ''));
  } catch (err) {
    console.error('❌ خطأ في تعديل التصنيف الفرعي:', err);
    alert('فشل تعديل التصنيف الفرعي: ' + err.message);
  }
}

// دالة حذف تصنيف فرعي
async function deleteSubCategory(id) {
  if (!confirm('هل أنت متأكد من حذف هذا التصنيف الفرعي؟')) {
    return;
  }
  
  try {
    const res = await fetch(`${API_BASE}/api/complaint-subtypes/${id}`, {
      method: 'DELETE',
      headers: {
        ...authHeaders(),
        'X-Hospital-Id': currentHospitalId
      }
    });
    
    const data = await res.json();
    
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'فشل حذف التصنيف الفرعي');
    }
    
    alert('✅ تم حذف التصنيف الفرعي بنجاح');
    await viewSubCategories(currentMainCategoryId, els.selectedMainCategoryName.textContent.replace(/[()]/g, ''));
  } catch (err) {
    console.error('❌ خطأ في حذف التصنيف الفرعي:', err);
    alert('فشل حذف التصنيف الفرعي: ' + err.message);
  }
}

// عنصر الحاوية
const categoriesContainer = document.getElementById('categoriesContainer');

// عند تغيير المستشفى
els.hospitalSelect.addEventListener('change', async (e) => {
  currentHospitalId = e.target.value;
  
  if (!currentHospitalId) {
    if (categoriesContainer) categoriesContainer.style.display = 'none';
    els.subCategoriesSection.style.display = 'none';
    return;
  }
  
  if (categoriesContainer) categoriesContainer.style.display = 'grid';
  els.mainCategoriesSection.style.display = 'block';
  els.subCategoriesSection.style.display = 'none';
  currentMainCategoryId = null;
  
  await loadMainCategories();
});

// التهيئة
document.addEventListener('DOMContentLoaded', async () => {
  await loadHospitals();
});

