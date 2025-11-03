// hospitals.js

// ===== Auth Context =====
let currentUser = null;
let isClusterManager = false;
let userHospitalId = null;

function getAuthToken() {
  // حدّثها حسب مشروعك (localStorage أو cookie)
  return localStorage.getItem('authToken');
}

// fetch يضيف Authorization تلقائياً
async function authFetch(url, options = {}) {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  // بعض الـ APIs تعتمد على الكوكيز أيضاً
  return fetch(url, { credentials: 'include', ...options, headers });
}

// جب لي /api/auth/me لمعرفة الدور والمستشفى
async function loadCurrentUser() {
  const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'http://localhost:3001'
    : '';
  const res = await authFetch(`${API_BASE}/api/auth/me`);
  if (!res.ok) throw new Error(`Auth failed: ${res.status}`);
  const me = await res.json();
  currentUser = me;
  
  // إظهار رابط "ملفي" إذا كان المستخدم مسجل دخول
  if (me?.authenticated || me?.UserID) {
    const profileLink = document.getElementById('nav-profile');
    if (profileLink) {
      profileLink.classList.remove('hidden');
    }
  }
  // عدّل هذي المفاتيح حسب استجابتك الفعلية
  isClusterManager = !!(me?.role?.isClusterManager || me?.isClusterManager || me?.role === 'cluster_admin');
  userHospitalId = me?.hospitalId || me?.HospitalID || me?.hospital?.id || null;
}

// تحديث عنوان الصفحة حسب الدور
function updatePageTitle() {
  const titleElement = document.querySelector('h1');
  const subtitleElement = document.querySelector('p');
  
  if (isClusterManager) {
    // مدير التجمع - يشوف كل المستشفيات
    if (titleElement) titleElement.textContent = 'المستشفيات والمراكز الصحية';
    if (subtitleElement) subtitleElement.textContent = 'نظرة شاملة على أداء جميع المستشفيات والمراكز التابعة للتجمع';
  } else {
    // موظف المستشفى - يشوف فقط مستشفاه
    const hospitalName = currentUser?.HospitalName || `مستشفى #${userHospitalId}`;
    if (titleElement) titleElement.textContent = hospitalName;
    if (subtitleElement) subtitleElement.textContent = `نظرة شاملة على أداء ${hospitalName}`;
  }
}

document.addEventListener('DOMContentLoaded', initHospitalsPage);

async function initHospitalsPage() {
  try {
    // 1) هوية المستخدم ودوره
    await loadCurrentUser();

    // 2) تحديد عنوان API حسب البيئة
    const API_BASE = 
      location.hostname === 'localhost' || location.hostname === '127.0.0.1'
        ? 'http://localhost:3001'
        : '';

    // 3) ابنِ رابط الجلب بحسب الدور:
    //    - مدير التجمع: بدون hospitalId (يشوف الجميع)
    //    - غير ذلك: نرسل hospitalId ليقصر البيانات على مستشفاه
    const qs = (!isClusterManager && userHospitalId) ? `?hospitalId=${encodeURIComponent(userHospitalId)}` : '';
    const url = `${API_BASE}/api/dashboard/total/by-hospital${qs}`;

    // 4) جلب بيانات المستشفيات الحقيقية من API
    const res = await authFetch(url);
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    
    const apiData = await res.json();

    // 5) إذا رجّع الـ API كل المستشفيات بالغلط، فلترها هنا كشبكة أمان
    const hospitalsData = (!isClusterManager && userHospitalId)
      ? apiData.filter(h => (h.HospitalID === userHospitalId || h.HospitalId === userHospitalId))
      : apiData;
    
    // تحويل البيانات إلى التنسيق المطلوب للعرض
    const hospitals = hospitalsData.map(hospital => {
      const totalReports = hospital.counts.complaint + hospital.counts.suggestion + hospital.counts.critical;
      const openReports = hospital.latest.filter(report => 
        report.status !== 'مغلقة' && report.status !== 'محلولة'
      ).length;
      const closedReports = totalReports - openReports;
      const solveRate = totalReports > 0 ? Math.round((closedReports / totalReports) * 100) : 0;
      
      return {
        id: hospital.HospitalID,
        name: hospital.HospitalName,
        type: 'عام', // يمكن إضافة نوع المستشفى في قاعدة البيانات لاحقاً
        beds: 0, // يمكن إضافة عدد الأسرة في قاعدة البيانات لاحقاً
        solveRate: solveRate,
        open: openReports,
        total: totalReports,
        priority: { 
          red: hospital.counts.critical, 
          orange: hospital.counts.complaint, 
          yellow: hospital.counts.suggestion 
        }
      };
    });

    // ترتيب المستشفيات حسب البلاغات الحمراء (الأولوية العالية أولاً)
    hospitals.sort((a,b) => b.priority.red - a.priority.red);

    // تحديث عنوان الصفحة حسب الدور
    updatePageTitle();

    renderHospitalsGrid(hospitals);
    
  } catch (error) {
    console.error('خطأ في تحميل بيانات المستشفيات:', error);
    
    // عرض رسالة خطأ للمستخدم
    const grid = document.getElementById('hospitalsGrid');
    grid.innerHTML = `
      <div class="col-span-full text-center py-12">
        <div class="text-red-600 text-xl mb-4">⚠️ تعذر تحميل بيانات المستشفيات</div>
        <div class="text-gray-600 mb-4">${error.message}</div>
        <button onclick="location.reload()" 
                class="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
          إعادة المحاولة
        </button>
      </div>
    `;
  }
}

function renderHospitalsGrid(items) {
  const grid = document.getElementById('hospitalsGrid');
  
  if (!items || items.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full text-center py-12">
        <div class="text-gray-600 text-xl mb-4">📋 لا توجد مستشفيات متاحة حالياً</div>
        <div class="text-gray-500">لم يتم العثور على أي مستشفيات في قاعدة البيانات</div>
      </div>
    `;
    return;
  }
  
  grid.innerHTML = items.map(h => hospitalCardHTML(h)).join('');
}

function hospitalCardHTML(h) {
  const badge = h.priority.red > 0
    ? `<div class="absolute -top-3 -right-3">
         <span class="inline-flex items-center px-3 py-1 rounded-full text-white text-sm shadow-md"
               style="background:linear-gradient(135deg,#ff6161,#ff3b3b)">حمراء ${h.priority.red}</span>
       </div>`
    : '';

  return `
  <div class="relative bg-white rounded-2xl p-8 shadow-xl border border-gray-100 hover:shadow-2xl transition">
    ${badge}
    <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center mx-auto mb-6">
      <svg class="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="12" height="16" rx="2"/></svg>
    </div>

    <h3 class="text-2xl font-bold text-center mb-1" style="color:#002B5B;">${h.name}</h3>
    <p class="text-center text-gray-500 mb-6">${h.type}${h.beds > 0 ? ` • ${h.beds} سرير` : ''}</p>

    <div class="grid grid-cols-3 gap-4 mb-5">
      <div class="bg-green-50 rounded-2xl py-4">
        <div class="text-2xl font-extrabold text-green-600">${h.solveRate}%</div>
        <div class="text-gray-500 text-sm">معدل الحل</div>
      </div>
      <div class="bg-amber-50 rounded-2xl py-4">
        <div class="text-2xl font-extrabold text-amber-500">${h.open}</div>
        <div class="text-gray-500 text-sm">مفتوحة</div>
      </div>
      <div class="bg-blue-50 rounded-2xl py-4">
        <div class="text-2xl font-extrabold text-blue-600">${h.total}</div>
        <div class="text-gray-500 text-sm">إجمالي</div>
      </div>
    </div>

    <div class="flex items-center justify-center gap-3 mb-6">
      <span class="inline-flex items-center gap-1 text-xs bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full">
        ${h.priority.yellow} <span class="w-2 h-2 rounded-full" style="background:#F59E0B"></span>
      </span>
      <span class="inline-flex items-center gap-1 text-xs bg-rose-100 text-rose-700 px-3 py-1 rounded-full">
        ${h.priority.red} <span class="w-2 h-2 rounded-full" style="background:#EF4444"></span>
      </span>
      <span class="inline-flex items-center gap-1 text-xs bg-orange-100 text-orange-700 px-3 py-1 rounded-full">
        ${h.priority.orange} <span class="w-2 h-2 rounded-full" style="background:#FB923C"></span>
      </span>
    </div>

    <div class="text-center">
      <a href="hospital/hospital.html?id=${h.id}"
         class="inline-flex items-center gap-2 px-5 py-3 rounded-full text-white"
         style="background:linear-gradient(135deg,#004A9F,#0FA47A)">
        عرض التفاصيل
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
      </a>
    </div>
  </div>`;
}
