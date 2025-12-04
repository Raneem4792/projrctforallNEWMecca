// hospitals.js

// ===== قراءة اللغة من localStorage =====
const currentLang = localStorage.getItem("siteLanguage") || "ar";

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
  const lang = localStorage.getItem("siteLanguage") || currentLang || 'ar';
  const t = window.hospitalsI18n?.t || ((key) => key);
  const titleElement = document.querySelector('h1');
  const subtitleElement = document.querySelector('p');
  
  if (isClusterManager) {
    // مدير التجمع - يشوف كل المستشفيات
    if (titleElement) titleElement.textContent = t('hero-title');
    if (subtitleElement) subtitleElement.textContent = t('hero-subtitle');
  } else {
    // موظف المستشفى - يشوف فقط مستشفاه
    const hospitalName = lang === 'en'
      ? (currentUser?.HospitalNameEn || currentUser?.HospitalNameAr || currentUser?.HospitalName || `Hospital #${userHospitalId}`)
      : (currentUser?.HospitalNameAr || currentUser?.HospitalName || `مستشفى #${userHospitalId}`);
    if (titleElement) titleElement.textContent = hospitalName;
    if (subtitleElement) {
      const subtitle = lang === 'en'
        ? `Comprehensive overview of ${hospitalName} performance`
        : `نظرة شاملة على أداء ${hospitalName}`;
      subtitleElement.textContent = subtitle;
    }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // قراءة اللغة من localStorage وتطبيقها
  const lang = localStorage.getItem("siteLanguage") || "ar";
  document.documentElement.setAttribute("lang", lang);
  document.documentElement.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
  
  await initHospitalsPage();
  
  // الاستماع لتغييرات اللغة
  if (window.hospitalsI18n) {
    window.hospitalsI18n.onChange((newLang) => {
      // تحديث dir و lang
      document.documentElement.setAttribute("lang", newLang);
      document.documentElement.setAttribute("dir", newLang === "ar" ? "rtl" : "ltr");
      
      // إعادة عرض البيانات مع الترجمة الجديدة
      initHospitalsPage();
    });
  }
});

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
    const lang = localStorage.getItem("siteLanguage") || currentLang || 'ar';
    const hospitals = hospitalsData.map(hospital => {
      const totalReports = hospital.counts.total || (hospital.counts.complaint + hospital.counts.suggestion + hospital.counts.critical);
      const openReports = hospital.counts.open || 0; // استخدام القيمة من API مباشرة
      const closedReports = hospital.counts.closed || (totalReports - openReports);
      const solveRate = totalReports > 0 ? Math.round((closedReports / totalReports) * 100) : 0;
      
      // تحديد اسم المستشفى حسب اللغة
      const hospitalName = lang === 'en'
        ? (hospital.HospitalNameEn || hospital.HospitalNameAr || hospital.HospitalName)
        : (hospital.HospitalNameAr || hospital.HospitalName);
      
      return {
        id: hospital.HospitalID,
        name: hospitalName,
        nameAr: hospital.HospitalNameAr || hospital.HospitalName,
        nameEn: hospital.HospitalNameEn || hospital.HospitalNameAr || hospital.HospitalName,
        type: lang === 'en' ? 'General' : 'عام', // يمكن إضافة نوع المستشفى في قاعدة البيانات لاحقاً
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
    const lang = localStorage.getItem("siteLanguage") || currentLang || 'ar';
    const t = window.hospitalsI18n?.t || ((key) => key);
    const grid = document.getElementById('hospitalsGrid');
    grid.innerHTML = `
      <div class="col-span-full text-center py-12">
        <div class="text-red-600 text-xl mb-4">⚠️ ${t('error-load-failed')}</div>
        <div class="text-gray-600 mb-4">${error.message}</div>
        <button onclick="location.reload()" 
                class="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
          ${t('error-retry')}
        </button>
      </div>
    `;
  }
}

function renderHospitalsGrid(items) {
  const grid = document.getElementById('hospitalsGrid');
  const lang = localStorage.getItem("siteLanguage") || currentLang || 'ar';
  const t = window.hospitalsI18n?.t || ((key) => key);
  
  if (!items || items.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full text-center py-12">
        <div class="text-gray-600 text-xl mb-4">📋 ${t('empty-no-hospitals')}</div>
        <div class="text-gray-500">${t('empty-no-hospitals-subtitle')}</div>
      </div>
    `;
    return;
  }
  
  grid.innerHTML = items.map(h => hospitalCardHTML(h)).join('');
}

function hospitalCardHTML(h) {
  const lang = localStorage.getItem("siteLanguage") || currentLang || 'ar';
  const t = window.hospitalsI18n?.t || ((key) => key);
  
  // استخدام اسم المستشفى حسب اللغة
  const hospitalName = lang === 'en' ? h.nameEn : h.nameAr;
  
  const badge = h.priority.red > 0
    ? `<div class="absolute -top-3 -right-3">
         <span class="inline-flex items-center px-3 py-1 rounded-full text-white text-sm shadow-md"
               style="background:linear-gradient(135deg,#ff6161,#ff3b3b)">${t('card-critical-badge')} ${h.priority.red}</span>
       </div>`
    : '';

  return `
  <div class="relative bg-white rounded-2xl p-8 shadow-xl border border-gray-100 hover:shadow-2xl transition">
    ${badge}
    <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center mx-auto mb-6">
      <svg class="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="12" height="16" rx="2"/></svg>
    </div>

    <h3 class="text-2xl font-bold text-center mb-1" style="color:#002B5B;">${hospitalName}</h3>
    <p class="text-center text-gray-500 mb-6">${h.type}${h.beds > 0 ? ` • ${h.beds} ${lang === 'en' ? 'beds' : 'سرير'}` : ''}</p>

    <div class="grid grid-cols-3 gap-4 mb-5">
      <div class="bg-green-50 rounded-2xl py-4 flex flex-col items-center justify-center gap-1">
        <div class="text-2xl font-extrabold text-green-600">${h.solveRate}%</div>
        <div class="text-black font-semibold text-sm">${t('card-solve-rate')}</div>
      </div>
      <div class="bg-amber-50 rounded-2xl py-4 flex flex-col items-center justify-center gap-1">
        <div class="text-2xl font-extrabold text-amber-500">${h.open}</div>
        <div class="text-black font-semibold text-sm">${t('card-open')}</div>
      </div>
      <div class="bg-blue-50 rounded-2xl py-4 flex flex-col items-center justify-center gap-1">
        <div class="text-2xl font-extrabold text-blue-600">${h.total}</div>
        <div class="text-black font-semibold text-sm">${t('card-total')}</div>
      </div>
    </div>

    <div class="flex items-center justify-center gap-3 mb-6">
      <span class="inline-flex items-center gap-1 text-sm bg-yellow-100 text-black font-semibold px-3 py-1 rounded-full">
        ${h.priority.yellow} <span class="w-2 h-2 rounded-full" style="background:#F59E0B"></span>
      </span>
      <span class="inline-flex items-center gap-1 text-sm bg-rose-100 text-black font-semibold px-3 py-1 rounded-full">
        ${h.priority.red} <span class="w-2 h-2 rounded-full" style="background:#EF4444"></span>
      </span>
      <span class="inline-flex items-center gap-1 text-sm bg-orange-100 text-black font-semibold px-3 py-1 rounded-full">
        ${h.priority.orange} <span class="w-2 h-2 rounded-full" style="background:#FB923C"></span>
      </span>
    </div>

    <div class="text-center">
      <a href="hospital/hospital.html?id=${h.id}"
         class="inline-flex items-center gap-2 px-5 py-3 rounded-full text-white"
         style="background:linear-gradient(135deg,#004A9F,#0FA47A)">
        ${t('card-view-details')}
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
      </a>
    </div>
  </div>`;
}
