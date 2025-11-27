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
  // انتظر تحميل نظام الترجمة
  await new Promise(resolve => {
    if (window.criticalI18n) {
      resolve();
    } else {
      const checkInterval = setInterval(() => {
        if (window.criticalI18n) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 50);
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve(); // Continue even if translation system not loaded
      }, 2000);
    }
  });
  
  await loadCriticalData();
  initializeEventHandlers();
  
  // الاستماع لتغييرات اللغة
  if (window.criticalI18n) {
    window.criticalI18n.onChange(() => {
      renderReports();
      updateMostFrequentByHospital();
    });
  }
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
    // البحث عن البلاغ الأول لهذا النوع للحصول على الأسماء
    const lang = window.criticalI18n?.getLanguage() || 'ar';
    const sampleReport = criticalData.find(r => 
      (r.TypeNameAr || r.TypeName) === summary.mostFrequentType
    );
    
    if (sampleReport) {
      const typeName = lang === 'ar'
        ? (sampleReport.TypeNameAr || sampleReport.TypeName || summary.mostFrequentType)
        : (sampleReport.TypeNameEn || sampleReport.TypeNameAr || sampleReport.TypeName || summary.mostFrequentType);
      topTypeElement.textContent = typeName;
    } else {
      topTypeElement.textContent = summary.mostFrequentType;
    }
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
  const lang = window.criticalI18n?.getLanguage() || 'ar';
  criticalData.forEach(report => {
    const hospitalId = report.HospitalID;
    // تحديد اسم المستشفى حسب اللغة
    const hospitalName = lang === 'ar'
      ? (report.HospitalNameAr || report.HospitalName || getHospitalDisplayName(report))
      : (report.HospitalNameEn || report.HospitalNameAr || report.HospitalName || getHospitalDisplayName(report));
    
    // استخدام الاسم العربي للمفتاح (للتجميع)
    const typeKey = report.TypeNameAr || report.TypeName || 'غير محدد';
    
    if (!hospitalStats[hospitalId]) {
      hospitalStats[hospitalId] = {
        name: hospitalName,
        types: {}
      };
    }
    
    hospitalStats[hospitalId].types[typeKey] = (hospitalStats[hospitalId].types[typeKey] || 0) + 1;
  });
  
  // إنشاء HTML للعرض كجدول
  if (Object.keys(hospitalStats).length === 0) {
    const t = window.criticalI18n?.t || ((key) => key);
    container.innerHTML = `
      <tr>
        <td colspan="3" class="py-8 text-center text-gray-500">
          ${t('table-empty')}
        </td>
      </tr>
    `;
    return;
  }
  
  const html = Object.values(hospitalStats).map(hospital => {
    const mostFrequent = Object.entries(hospital.types)
      .sort((a, b) => b[1] - a[1])[0];
    
    // العثور على البلاغ الأول لهذا المستشفى والنوع للحصول على الأسماء
    const sampleReport = criticalData.find(r => 
      r.HospitalID === Object.keys(hospitalStats).find(id => hospitalStats[id] === hospital) &&
      (r.TypeNameAr || r.TypeName) === mostFrequent[0]
    );
    
    // تحديد اسم التصنيف حسب اللغة
    const typeName = lang === 'ar'
      ? (sampleReport?.TypeNameAr || sampleReport?.TypeName || mostFrequent[0])
      : (sampleReport?.TypeNameEn || sampleReport?.TypeNameAr || sampleReport?.TypeName || mostFrequent[0]);
    
    const t = window.criticalI18n?.t || ((key) => key);
    const countText = lang === 'ar' ? `${mostFrequent[1]} بلاغ` : `${mostFrequent[1]} report(s)`;
    
    return `
      <tr class="border-b border-gray-100 hover:bg-gray-50">
        <td class="py-3 px-4 font-medium text-gray-800">${hospital.name}</td>
        <td class="py-3 px-4 text-gray-600">${typeName}</td>
        <td class="py-3 px-4 text-center">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            ${countText}
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
    const t = window.criticalI18n?.t || ((key) => key);
    container.innerHTML = `
      <div class="col-span-full text-center py-12">
        <div class="text-gray-400 text-6xl mb-4">🔴</div>
        <h3 class="text-xl font-bold text-gray-600 mb-2">${t('reports-empty-title')}</h3>
        <p class="text-gray-500">${t('reports-empty-subtitle')}</p>
      </div>
    `;
    return;
  }
  
  // الحصول على اللغة الحالية
  const lang = window.criticalI18n?.getLanguage() || 'ar';
  
  container.innerHTML = criticalData.map(report => {
    const params = new URLSearchParams({
      complaintId: String(report.ComplaintID),
      hospitalId: String(report.HospitalID ?? ''),
      ticket: report.TicketNumber || ''
    }).toString();
    
    // تحديد اسم المستشفى حسب اللغة
    const hospitalName = lang === 'ar' 
      ? (report.HospitalNameAr || report.HospitalName || getHospitalDisplayName(report) || `#${report.HospitalID || ''}`)
      : (report.HospitalNameEn || report.HospitalNameAr || report.HospitalName || getHospitalDisplayName(report) || `#${report.HospitalID || ''}`);
    
    // تحديد اسم التصنيف حسب اللغة
    const typeName = lang === 'ar'
      ? (report.TypeNameAr || report.TypeName || ((window.criticalI18n?.t('report-undefined')) || 'غير محدد'))
      : (report.TypeNameEn || report.TypeNameAr || report.TypeName || ((window.criticalI18n?.t('report-undefined')) || 'Not specified'));

    return `
    <div class="bg-white rounded-xl p-6 shadow-lg border border-red-100 hover:shadow-xl transition-shadow">
      <div class="flex items-start justify-between mb-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
            <span class="text-red-600 text-lg">🔴</span>
          </div>
          <div>
            <h4 class="font-bold text-gray-800">${report.TicketNumber}</h4>
            <p class="text-sm text-gray-600">${hospitalName}</p>
          </div>
        </div>
        <span class="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium">
          ${translatePriority(report.PriorityCode)}
        </span>
      </div>
      
      <div class="space-y-2 mb-4">
        <div class="flex justify-between">
          <span class="text-gray-500 text-sm">${(window.criticalI18n?.t('report-type-label')) || 'النوع:'}</span>
          <span class="text-gray-800 text-sm font-medium">${typeName}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-500 text-sm">${(window.criticalI18n?.t('report-department-label')) || 'القسم:'}</span>
          <span class="text-gray-800 text-sm font-medium">${report.DepartmentName || ((window.criticalI18n?.t('report-undefined')) || 'غير محدد')}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-500 text-sm">${(window.criticalI18n?.t('report-status-label')) || 'الحالة:'}</span>
          <span class="text-gray-800 text-sm font-medium">${translateStatus(report.StatusCode)}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-500 text-sm">${(window.criticalI18n?.t('report-date-label')) || 'التاريخ:'}</span>
          <span class="text-gray-800 text-sm font-medium">${formatDate(report.CreatedAt)}</span>
        </div>
      </div>
      
      <div class="pt-4 border-t border-gray-100">
        <a href="${DETAILS_PAGE}?${params}"
           class="block w-full text-center bg-red-50 text-red-700 py-2 px-4 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium">
          ${(window.criticalI18n?.t('report-details-button')) || 'عرض التفاصيل'}
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
  const lang = window.criticalI18n?.getLanguage() || 'ar';
  let reportsByHospital = {};
  criticalData.forEach(report => {
    if (!reportsByHospital[report.HospitalID]) {
      // تحديد اسم المستشفى حسب اللغة
      const hospitalName = lang === 'ar'
        ? (report.HospitalNameAr || report.HospitalName || getHospitalDisplayName(report))
        : (report.HospitalNameEn || report.HospitalNameAr || report.HospitalName || getHospitalDisplayName(report));
      reportsByHospital[report.HospitalID] = {
        hospitalName: hospitalName,
        reports: []
      };
    }
    reportsByHospital[report.HospitalID].reports.push(report);
  });
  
  if (Object.keys(reportsByHospital).length === 0) {
    const t = window.criticalI18n?.t || ((key) => key);
    container.innerHTML = `
      <div class="col-span-full text-center py-12">
        <div class="text-gray-400 text-6xl mb-4">🏥</div>
        <h3 class="text-xl font-bold text-gray-600 mb-2">${t('reports-hospital-empty-title')}</h3>
        <p class="text-gray-500">${t('reports-hospital-empty-subtitle')}</p>
       </div>
     `;
    return;
  }
  
  container.innerHTML = Object.values(reportsByHospital).map(hospital => {
    const params = new URLSearchParams({
      complaintId: String(hospital.reports[0]?.ComplaintID || ''),
      hospitalId: String(hospital.reports[0]?.HospitalID ?? ''),
      ticket: hospital.reports[0]?.TicketNumber || ''
    }).toString();
    
    return `
    <div class="bg-white rounded-xl p-6 shadow-lg border border-red-100">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
          <span class="text-red-600 text-xl">🏥</span>
        </div>
        <div>
          <h3 class="font-bold text-gray-800">${hospital.hospitalName}</h3>
          <p class="text-sm text-gray-600">${(window.criticalI18n?.t('reports-hospital-count', { count: hospital.reports.length })) || `${hospital.reports.length} بلاغ حرج`}</p>
        </div>
      </div>
      
      <div class="space-y-2">
        ${hospital.reports.slice(0, 3).map(report => {
          const reportParams = new URLSearchParams({
            complaintId: String(report.ComplaintID),
            hospitalId: String(report.HospitalID ?? ''),
            ticket: report.TicketNumber || ''
          }).toString();
          
          // تحديد اسم التصنيف حسب اللغة
          const typeName = lang === 'ar'
            ? (report.TypeNameAr || report.TypeName || ((window.criticalI18n?.t('report-undefined')) || 'غير محدد'))
            : (report.TypeNameEn || report.TypeNameAr || report.TypeName || ((window.criticalI18n?.t('report-undefined')) || 'Not specified'));
          
          return `
          <a href="${DETAILS_PAGE}?${reportParams}" class="block">
            <div class="flex items-center justify-between p-3 bg-red-50 rounded-lg hover:bg-red-100 transition-colors cursor-pointer">
              <div>
                <p class="font-medium text-gray-800 text-sm">${report.TicketNumber}</p>
                <p class="text-xs text-gray-600">${typeName}</p>
              </div>
              <span class="text-xs text-red-600 font-medium">${translatePriority(report.PriorityCode)}</span>
            </div>
          </a>
        `;
        }).join('')}
        
        ${hospital.reports.length > 3 ? `
          <div class="text-center pt-2">
            <span class="text-sm text-gray-500">${(window.criticalI18n?.t('reports-more-count', { count: hospital.reports.length - 3 })) || `و ${hospital.reports.length - 3} بلاغات أخرى`}</span>
          </div>
        ` : ''}
      </div>
    </div>
  `;
  }).join('');
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
 * ترجمة كود الأولوية
 */
function translatePriority(priorityCode) {
  if (!window.criticalI18n) {
    // Fallback if translation system not loaded
    const priorityMap = {
      'URGENT': 'عاجل', 'urgent': 'عاجل',
      'CRITICAL': 'حرج', 'critical': 'حرج',
      'HIGH': 'عالي', 'high': 'عالي',
      'MEDIUM': 'متوسط', 'medium': 'متوسط',
      'LOW': 'منخفض', 'low': 'منخفض'
    };
    return priorityMap[priorityCode] || priorityCode || 'غير محدد';
  }
  
  const t = window.criticalI18n.t;
  const priorityKeyMap = {
    'HIGH': 'priority-high', 'high': 'priority-high',
    'CRITICAL': 'priority-critical', 'critical': 'priority-critical',
    'URGENT': 'priority-urgent', 'urgent': 'priority-urgent',
    'MEDIUM': 'priority-medium', 'medium': 'priority-medium',
    'LOW': 'priority-low', 'low': 'priority-low',
    'NORMAL': 'priority-normal', 'normal': 'priority-normal',
    'حرجة': 'priority-critical', 'عاجلة': 'priority-urgent',
    'عالية': 'priority-high', 'متوسطة': 'priority-medium',
    'منخفضة': 'priority-low', 'عادية': 'priority-normal',
    'حرج': 'priority-critical', 'عاجل': 'priority-urgent'
  };
  
  const key = priorityKeyMap[priorityCode];
  return key ? t(key) : (priorityCode || t('priority-unknown'));
}

/**
 * ترجمة كود الحالة
 */
function translateStatus(statusCode) {
  if (!window.criticalI18n) {
    // Fallback if translation system not loaded
    const statusMap = {
      'OPEN': 'مفتوح', 'open': 'مفتوح',
      'IN_PROGRESS': 'قيد المعالجة', 'in_progress': 'قيد المعالجة',
      'ON_HOLD': 'معلق', 'on_hold': 'معلق',
      'CLOSED': 'مغلق', 'closed': 'مغلق',
      'RESOLVED': 'محلول', 'resolved': 'محلول'
    };
    return statusMap[statusCode] || statusCode || 'غير معروف';
  }
  
  const t = window.criticalI18n.t;
  const statusKeyMap = {
    'OPEN': 'status-open', 'open': 'status-open',
    'CLOSED': 'status-closed', 'closed': 'status-closed',
    'IN_PROGRESS': 'status-in-progress', 'in_progress': 'status-in-progress',
    'PENDING': 'status-pending', 'pending': 'status-pending',
    'AWAITING_RESPONSE': 'status-awaiting', 'awaiting_response': 'status-awaiting',
    'ON_HOLD': 'status-on-hold', 'on_hold': 'status-on-hold',
    'RESOLVED': 'status-resolved', 'resolved': 'status-resolved',
    'مغلق': 'status-closed', 'محلول': 'status-resolved',
    'مكتمل': 'status-resolved', 'مفتوحة': 'status-open',
    'قيد المراجعة': 'status-in-progress', 'معلقة': 'status-pending'
  };
  
  const key = statusKeyMap[statusCode];
  return key ? t(key) : statusCode;
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
  const lang = window.criticalI18n?.getLanguage() || 'ar';
  if (lang === 'ar') {
    if (report.HospitalNameAr && report.HospitalNameAr !== 'null' && report.HospitalNameAr.trim()) {
      return report.HospitalNameAr;
    }
    if (report.HospitalName && report.HospitalName !== 'null' && report.HospitalName.trim()) {
      return report.HospitalName;
    }
  } else {
    if (report.HospitalNameEn && report.HospitalNameEn !== 'null' && report.HospitalNameEn.trim()) {
      return report.HospitalNameEn;
    }
    if (report.HospitalNameAr && report.HospitalNameAr !== 'null' && report.HospitalNameAr.trim()) {
      return report.HospitalNameAr;
    }
    if (report.HospitalName && report.HospitalName !== 'null' && report.HospitalName.trim()) {
      return report.HospitalName;
    }
  }
  
  // إذا لم يكن هناك اسم، استخدم معرف المستشفى
  if (report.HospitalID) {
    return lang === 'ar' ? `مستشفى ${report.HospitalID}` : `Hospital ${report.HospitalID}`;
  }
  
  return lang === 'ar' ? 'غير محدد' : 'Not specified';
}

/**
 * عرض رسالة خطأ
 */
function showErrorMessage(message) {
  const container = document.getElementById('crit-list');
  if (container) {
    const t = window.criticalI18n?.t || ((key) => key);
    container.innerHTML = `
      <div class="col-span-full text-center py-12">
        <div class="text-red-400 text-6xl mb-4">⚠️</div>
        <h3 class="text-xl font-bold text-red-600 mb-2">${t('error-title')}</h3>
        <p class="text-gray-500">${message}</p>
      </div>
    `;
  }
}