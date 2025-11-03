// ========================================
// صفحة البلاغات الحرجة - Critical Reports Page
// ========================================

// نفس سياق الداشبورد
let currentUser=null, isClusterManager=false, userHospitalId=null;

function getAuthToken(){ return localStorage.getItem('authToken'); }
async function authFetch(url, options={}) {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, { credentials:'include', ...options, headers });
}
async function loadCurrentUser(){
  const API_BASE = (location.hostname==='localhost'||location.hostname==='127.0.0.1') ? 'http://localhost:3001' : '';
  const res = await authFetch(`${API_BASE}/api/auth/me`);
  const me = await res.json();
  currentUser = me;
  isClusterManager = !!(me?.role?.isClusterManager || me?.isClusterManager || me?.role === 'cluster_admin');
  userHospitalId = me?.hospitalId || me?.HospitalID || me?.hospital?.id || null;
}

let criticalData = [];
let currentTab = 'all';

// مسار صفحة التفاصيل
const DETAILS_PAGE = '../public/complaints/history/complaint-details.html';

// تهيئة الصفحة عند التحميل
document.addEventListener('DOMContentLoaded', async () => {
  await loadCriticalData();
  initializeEventHandlers();
});

/**
 * تحميل بيانات البلاغات الحرجة من API
 */
async function loadCriticalData() {
  try {
    const API_BASE = (location.hostname==='localhost'||location.hostname==='127.0.0.1') ? 'http://localhost:3001' : '';

    // حمّل هوية المستخدم أولاً
    if (!currentUser) await loadCurrentUser();

    const qs = (!isClusterManager && userHospitalId) ? `?hospitalId=${encodeURIComponent(userHospitalId)}` : '';
    const response = await authFetch(`${API_BASE}/api/dashboard/total/critical-reports${qs}`);

    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    const result = await response.json();

    if (result.success && result.data) {
      criticalData = result.data.reports || [];
      
      // تحديث الإحصائيات
      updateSummaryCards(result.data.summary);
      
      // عرض البيانات
      renderReports();
      
      console.log('تم تحميل البلاغات الحرجة:', criticalData.length, 'بلاغ');
      console.log('عينة من البيانات:', criticalData[0]); // لرؤية بنية البيانات
      
      // جلب أسماء المستشفيات إذا لم تكن متوفرة
      await loadHospitalNames();
    }
    
  } catch (error) {
    console.error('خطأ في تحميل البلاغات الحرجة:', error);
    showErrorMessage('خطأ في تحميل البيانات');
  }
}

/**
 * تحديث كروت الإحصائيات
 */
function updateSummaryCards(summary) {
  // إجمالي البلاغات الحرجة
  const totalElement = document.getElementById('crit-total');
  if (totalElement) totalElement.textContent = summary.totalCritical;
  
  // عدد المستشفيات المتأثرة
  const hospitalsElement = document.getElementById('crit-hospitals');
  if (hospitalsElement) hospitalsElement.textContent = summary.affectedHospitals;
  
  // أكثر نوع تكراراً
  const topTypeElement = document.getElementById('crit-top-type');
  if (topTypeElement) {
    topTypeElement.textContent = summary.mostFrequentType;
  }
  
  // عرض البلاغات الأكثر تكراراً لكل مستشفى
  updateMostFrequentByHospital();
}

/**
 * تحديث عرض البلاغات الأكثر تكراراً لكل مستشفى
 */
function updateMostFrequentByHospital() {
  const container = document.getElementById('crit-top-table');
  if (!container || criticalData.length === 0) return;
  
  // تجميع البيانات حسب المستشفى
  const hospitalStats = {};
  criticalData.forEach(report => {
    const hospitalId = report.HospitalID;
    const hospitalName = getHospitalDisplayName(report);
    const typeName = report.TypeName || 'غير محدد';
    
    if (!hospitalStats[hospitalId]) {
      hospitalStats[hospitalId] = {
        name: hospitalName,
        types: {}
      };
    }
    
    hospitalStats[hospitalId].types[typeName] = (hospitalStats[hospitalId].types[typeName] || 0) + 1;
  });
  
  // إنشاء HTML للعرض كجدول
  if (Object.keys(hospitalStats).length === 0) {
    container.innerHTML = `
      <tr>
        <td colspan="3" class="py-8 text-center text-gray-500">
          لا توجد بيانات متاحة
        </td>
      </tr>
    `;
    return;
  }
  
  const html = Object.values(hospitalStats).map(hospital => {
    const mostFrequent = Object.entries(hospital.types)
      .sort((a, b) => b[1] - a[1])[0];
    
    return `
      <tr class="border-b border-gray-100 hover:bg-gray-50">
        <td class="py-3 px-4 font-medium text-gray-800">${hospital.name}</td>
        <td class="py-3 px-4 text-gray-600">${mostFrequent[0]}</td>
        <td class="py-3 px-4 text-center">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            ${mostFrequent[1]} بلاغ
          </span>
        </td>
      </tr>
    `;
  }).join('');
  
  container.innerHTML = html;
}

/**
 * عرض البلاغات
 */
function renderReports() {
  if (currentTab === 'all') {
    renderAllReports();
  } else if (currentTab === 'by-hospital') {
    renderByHospital();
  }
}

/**
 * عرض جميع البلاغات
 */
function renderAllReports() {
  const container = document.getElementById('crit-list');
  if (!container) return;
  
  if (criticalData.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-12">
        <div class="text-gray-400 text-6xl mb-4">🔴</div>
        <h3 class="text-xl font-bold text-gray-600 mb-2">لا توجد بلاغات حرجة</h3>
        <p class="text-gray-500">جميع البلاغات في حالة جيدة</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = criticalData.map(report => {
    const params = new URLSearchParams({
      complaintId: String(report.ComplaintID),
      hospitalId: String(report.HospitalID ?? ''),
      ticket: report.TicketNumber || ''
    }).toString();

    return `
    <div class="bg-white rounded-xl p-6 shadow-lg border border-red-100 hover:shadow-xl transition-shadow">
      <div class="flex items-start justify-between mb-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
            <span class="text-red-600 text-lg">🔴</span>
          </div>
          <div>
            <h4 class="font-bold text-gray-800">${report.TicketNumber}</h4>
            <p class="text-sm text-gray-600">${getHospitalDisplayName(report)}</p>
          </div>
        </div>
        <span class="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium">
          ${translatePriority(report.PriorityCode)}
        </span>
      </div>
      
      <div class="space-y-2 mb-4">
        <div class="flex justify-between">
          <span class="text-gray-500 text-sm">النوع:</span>
          <span class="text-gray-800 text-sm font-medium">${report.TypeName || 'غير محدد'}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-500 text-sm">القسم:</span>
          <span class="text-gray-800 text-sm font-medium">${report.DepartmentName || 'غير محدد'}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-500 text-sm">الحالة:</span>
          <span class="text-gray-800 text-sm font-medium">${translateStatus(report.StatusCode)}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-500 text-sm">التاريخ:</span>
          <span class="text-gray-800 text-sm font-medium">${formatDate(report.CreatedAt)}</span>
        </div>
      </div>
      
      <div class="pt-4 border-t border-gray-100">
        <a href="${DETAILS_PAGE}?${params}"
           class="block w-full text-center bg-red-50 text-red-700 py-2 px-4 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium">
          عرض التفاصيل
        </a>
      </div>
    </div>
    `;
  }).join('');
}

/**
 * عرض البلاغات حسب المستشفى
 */
function renderByHospital() {
  const container = document.getElementById('crit-hospitals-grid');
  if (!container) return;
  
  // تجميع البلاغات حسب المستشفى
  const reportsByHospital = {};
  criticalData.forEach(report => {
    if (!reportsByHospital[report.HospitalID]) {
      reportsByHospital[report.HospitalID] = {
        hospitalName: report.HospitalName,
        reports: []
      };
    }
    reportsByHospital[report.HospitalID].reports.push(report);
  });
  
  if (Object.keys(reportsByHospital).length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-12">
        <div class="text-gray-400 text-6xl mb-4">🏥</div>
        <h3 class="text-xl font-bold text-gray-600 mb-2">لا توجد بلاغات حرجة</h3>
        <p class="text-gray-500">جميع المستشفيات في حالة جيدة</p>
       </div>
     `;
    return;
  }
  
  container.innerHTML = Object.values(reportsByHospital).map(hospital => `
    <div class="bg-white rounded-xl p-6 shadow-lg border border-red-100">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
          <span class="text-red-600 text-xl">🏥</span>
        </div>
        <div>
          <h3 class="font-bold text-gray-800">${hospital.hospitalName}</h3>
          <p class="text-sm text-gray-600">${hospital.reports.length} بلاغ حرج</p>
        </div>
      </div>
      
      <div class="space-y-2">
        ${hospital.reports.slice(0, 3).map(report => `
          <div class="flex items-center justify-between p-3 bg-red-50 rounded-lg">
            <div>
              <p class="font-medium text-gray-800 text-sm">${report.TicketNumber}</p>
              <p class="text-xs text-gray-600">${report.TypeName || 'غير محدد'}</p>
            </div>
            <span class="text-xs text-red-600 font-medium">${report.PriorityCode}</span>
          </div>
        `).join('')}
        
        ${hospital.reports.length > 3 ? `
          <div class="text-center pt-2">
            <span class="text-sm text-gray-500">و ${hospital.reports.length - 3} بلاغات أخرى</span>
          </div>
        ` : ''}
      </div>
    </div>
  `).join('');
}

/**
 * تهيئة معالجات الأحداث
 */
function initializeEventHandlers() {
  // معالجات التبويبات
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tab = e.target.dataset.tab;
      switchTab(tab);
    });
  });
}

/**
 * تبديل التبويبات
 */
function switchTab(tab) {
  currentTab = tab;
  
  // تحديث أزرار التبويب
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('bg-red-50', 'text-red-700', 'border-red-200');
    btn.classList.add('bg-gray-50', 'border');
  });
  
  const activeBtn = document.querySelector(`[data-tab="${tab}"]`);
  if (activeBtn) {
    activeBtn.classList.remove('bg-gray-50', 'border');
    activeBtn.classList.add('bg-red-50', 'text-red-700', 'border-red-200');
  }
  
  // إخفاء/إظهار المحتوى
  document.querySelectorAll('[id^="tab-"]').forEach(content => {
    content.classList.add('hidden');
  });
  
  const activeContent = document.getElementById(`tab-${tab}`);
  if (activeContent) {
    activeContent.classList.remove('hidden');
  }
  
  // إعادة عرض البيانات
  renderReports();
}

/**
 * تنسيق التاريخ
 */
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('ar-SA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * ترجمة كود الأولوية إلى العربية
 */
function translatePriority(priorityCode) {
  const priorityMap = {
    'URGENT': 'عاجل',
    'urgent': 'عاجل',
    'CRITICAL': 'حرج',
    'critical': 'حرج',
    'HIGH': 'عالي',
    'high': 'عالي',
    'MEDIUM': 'متوسط',
    'medium': 'متوسط',
    'LOW': 'منخفض',
    'low': 'منخفض',
    'حرجة': 'حرج',
    'عاجلة': 'عاجل',
    'عالية': 'عالي',
    'متوسطة': 'متوسط',
    'منخفضة': 'منخفض'
  };
  return priorityMap[priorityCode] || priorityCode || 'غير محدد';
}

/**
 * ترجمة كود الحالة إلى العربية
 */
function translateStatus(statusCode) {
  const statusMap = {
    'OPEN': 'مفتوح',
    'open': 'مفتوح',
    'IN_PROGRESS': 'قيد المعالجة',
    'in_progress': 'قيد المعالجة',
    'ON_HOLD': 'معلق',
    'on_hold': 'معلق',
    'CLOSED': 'مغلق',
    'closed': 'مغلق',
    'RESOLVED': 'محلول',
    'resolved': 'محلول',
    'مفتوح': 'مفتوح',
    'قيد المعالجة': 'قيد المعالجة',
    'معلق': 'معلق',
    'مغلق': 'مغلق',
    'محلول': 'محلول'
  };
  return statusMap[statusCode] || statusCode || 'غير محدد';
}

/**
 * جلب أسماء المستشفيات من القاعدة المركزية
 */
async function loadHospitalNames() {
  try {
    // جمع معرفات المستشفيات الفريدة
    const hospitalIds = [...new Set(criticalData.map(report => report.HospitalID).filter(Boolean))];
    
    if (hospitalIds.length === 0) return;
    
    const API_BASE = (location.hostname==='localhost'||location.hostname==='127.0.0.1') ? 'http://localhost:3001' : '';
    
    // جلب أسماء المستشفيات من API
    const response = await authFetch(`${API_BASE}/api/hospitals`);
    if (response.ok) {
      const hospitals = await response.json();
      const hospitalMap = new Map(hospitals.map(h => [h.HospitalID, h.NameAr]));
      
      // تحديث البيانات
      criticalData.forEach(report => {
        if (report.HospitalID && hospitalMap.has(report.HospitalID)) {
          report.HospitalName = hospitalMap.get(report.HospitalID);
        }
      });
      
      // إعادة عرض البيانات
      renderReports();
      updateMostFrequentByHospital();
      
      console.log('✅ تم تحديث أسماء المستشفيات');
    }
  } catch (error) {
    console.warn('تحذير: فشل في جلب أسماء المستشفيات:', error);
  }
}

/**
 * تحسين عرض اسم المستشفى
 */
function getHospitalDisplayName(report) {
  if (report.HospitalName && report.HospitalName !== 'null' && report.HospitalName.trim()) {
    return report.HospitalName;
  }
  
  // إذا لم يكن هناك اسم، استخدم معرف المستشفى
  if (report.HospitalID) {
    return `مستشفى ${report.HospitalID}`;
  }
  
  return 'غير محدد';
}

/**
 * عرض رسالة خطأ
 */
function showErrorMessage(message) {
  const container = document.getElementById('crit-list');
  if (container) {
    container.innerHTML = `
      <div class="col-span-full text-center py-12">
        <div class="text-red-400 text-6xl mb-4">⚠️</div>
        <h3 class="text-xl font-bold text-red-600 mb-2">خطأ في تحميل البيانات</h3>
        <p class="text-gray-500">${message}</p>
      </div>
    `;
  }
}