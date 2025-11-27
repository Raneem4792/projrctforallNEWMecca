// ========================================
// صفحة إجمالي البلاغات - Total Reports Page
// ========================================

// ===== قراءة اللغة من localStorage =====
const currentLang = localStorage.getItem("siteLanguage") || "ar";

let totalData = [];
let currentTab = 'all';
let currentCategory = 'all';

// ===== Auth Context =====
let currentUser = null;
let isClusterManager = false;
let userHospitalId = null;

function getAuthToken() {
  return localStorage.getItem('authToken');
}

// fetch يضيف Authorization تلقائياً
async function authFetch(url, options = {}) {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, { credentials: 'include', ...options, headers });
}

// جلب معلومات المستخدم الحالي
async function loadCurrentUser() {
  try {
    const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'http://localhost:3001'
      : '';
    const res = await authFetch(`${API_BASE}/api/auth/me`);
    if (!res.ok) throw new Error(`Auth failed: ${res.status}`);
    const me = await res.json();
    currentUser = me;
    // تحديد نوع المستخدم
    isClusterManager = !!(me?.role?.isClusterManager || me?.isClusterManager || me?.role === 'cluster_admin' || me?.RoleID === 1);
    userHospitalId = me?.hospitalId || me?.HospitalID || me?.hospital?.id || null;
    
    console.log('🔐 معلومات المستخدم:', { 
      isClusterManager, 
      userHospitalId, 
      role: me?.RoleID || me?.role 
    });
    
    // تحديث معلومات المستخدم في الواجهة
    updateUserInfo();
  } catch (error) {
    console.error('خطأ في جلب معلومات المستخدم:', error);
    // في حالة الخطأ، افترض أنه مدير تجمع للسماح بالوصول
    isClusterManager = true;
    userHospitalId = null;
    updateUserInfo();
  }
}

/**
 * تحديث معلومات المستخدم في الواجهة
 */
function updateUserInfo() {
  const userInfoElement = document.getElementById('user-info');
  if (userInfoElement) {
    const t = window.totalI18n?.t || ((key, params) => {
      const translations = {
        ar: {
          'user-cluster': '👑 مدير التجمع - عرض جميع المستشفيات',
          'user-employee': `👤 موظف - عرض مستشفى واحد فقط (ID: ${userHospitalId})`,
          'user-unknown': '⚠️ نوع المستخدم غير محدد'
        },
        en: {
          'user-cluster': '👑 Cluster Manager – showing all hospitals',
          'user-employee': `👤 Employee – showing a single hospital (ID: ${userHospitalId})`,
          'user-unknown': '⚠️ User type is not defined'
        }
      };
      const lang = window.totalI18n?.getLanguage() || currentLang || 'ar';
      return translations[lang]?.[key] || translations.ar[key] || key;
    });
    
    if (isClusterManager) {
      userInfoElement.textContent = t('user-cluster');
      userInfoElement.className = 'mt-2 text-sm text-green-600 font-medium';
    } else if (userHospitalId) {
      userInfoElement.textContent = t('user-employee', { id: userHospitalId });
      userInfoElement.className = 'mt-2 text-sm text-blue-600 font-medium';
    } else {
      userInfoElement.textContent = t('user-unknown');
      userInfoElement.className = 'mt-2 text-sm text-orange-600 font-medium';
    }
  }
}

/**
 * ترجمة الحالات حسب اللغة
 */
function translateStatus(statusCode) {
  const lang = localStorage.getItem("siteLanguage") || currentLang || 'ar';
  const statusMapAr = {
    'OPEN': 'مفتوحة',
    'open': 'مفتوحة',
    'CLOSED': 'مغلقة',
    'closed': 'مغلقة',
    'IN_PROGRESS': 'قيد المعالجة',
    'in_progress': 'قيد المعالجة',
    'PENDING': 'معلقة',
    'pending': 'معلقة',
    'AWAITING_RESPONSE': 'بانتظار الرد',
    'awaiting_response': 'بانتظار الرد',
    'ON_HOLD': 'قيد الانتظار',
    'on_hold': 'قيد الانتظار',
    'RESOLVED': 'محلولة',
    'resolved': 'محلولة',
    'مغلق': 'مغلقة',
    'محلول': 'محلولة',
    'مكتمل': 'مكتملة',
    'مفتوحة': 'مفتوحة',
    'قيد المراجعة': 'قيد المراجعة',
    'معلقة': 'معلقة'
  };
  const statusMapEn = {
    'OPEN': 'Open',
    'open': 'Open',
    'CLOSED': 'Closed',
    'closed': 'Closed',
    'IN_PROGRESS': 'In Progress',
    'in_progress': 'In Progress',
    'PENDING': 'Pending',
    'pending': 'Pending',
    'AWAITING_RESPONSE': 'Awaiting Response',
    'awaiting_response': 'Awaiting Response',
    'ON_HOLD': 'On Hold',
    'on_hold': 'On Hold',
    'RESOLVED': 'Resolved',
    'resolved': 'Resolved',
    'مغلق': 'Closed',
    'محلول': 'Resolved',
    'مكتمل': 'Completed',
    'مفتوحة': 'Open',
    'قيد المراجعة': 'Under Review',
    'معلقة': 'Pending'
  };
  
  if (lang === 'en') {
    return statusMapEn[statusCode] || statusCode;
  }
  return statusMapAr[statusCode] || statusCode;
}

/**
 * ترجمة الأولويات حسب اللغة
 */
function translatePriority(priorityCode) {
  const lang = localStorage.getItem("siteLanguage") || currentLang || 'ar';
  const priorityMapAr = {
    'HIGH': 'عالية',
    'high': 'عالية',
    'CRITICAL': 'حرجة',
    'critical': 'حرجة',
    'URGENT': 'عاجلة',
    'urgent': 'عاجلة',
    'MEDIUM': 'متوسطة',
    'medium': 'متوسطة',
    'LOW': 'منخفضة',
    'low': 'منخفضة',
    'NORMAL': 'عادية',
    'normal': 'عادية',
    'حرجة': 'حرجة',
    'عاجلة': 'عاجلة',
    'عالية': 'عالية',
    'متوسطة': 'متوسطة',
    'منخفضة': 'منخفضة',
    'عادية': 'عادية',
    'حرج': 'حرجة',
    'عاجل': 'عاجلة'
  };
  const priorityMapEn = {
    'HIGH': 'High',
    'high': 'High',
    'CRITICAL': 'Critical',
    'critical': 'Critical',
    'URGENT': 'Urgent',
    'urgent': 'Urgent',
    'MEDIUM': 'Medium',
    'medium': 'Medium',
    'LOW': 'Low',
    'low': 'Low',
    'NORMAL': 'Normal',
    'normal': 'Normal',
    'حرجة': 'Critical',
    'عاجلة': 'Urgent',
    'عالية': 'High',
    'متوسطة': 'Medium',
    'منخفضة': 'Low',
    'عادية': 'Normal',
    'حرج': 'Critical',
    'عاجل': 'Urgent'
  };
  
  if (lang === 'en') {
    return priorityMapEn[priorityCode] || priorityCode || 'Not specified';
  }
  return priorityMapAr[priorityCode] || priorityCode || 'غير محددة';
}

// تهيئة الصفحة عند التحميل
document.addEventListener('DOMContentLoaded', async () => {
  // قراءة اللغة من localStorage وتطبيقها
  const lang = localStorage.getItem("siteLanguage") || "ar";
  document.documentElement.setAttribute("lang", lang);
  document.documentElement.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
  
  await loadCurrentUser();
  await loadTotalData();
  initializeEventHandlers();
  
  // الاستماع لتغييرات اللغة
  if (window.totalI18n) {
    window.totalI18n.onChange((newLang) => {
      // تحديث dir و lang
      document.documentElement.setAttribute("lang", newLang);
      document.documentElement.setAttribute("dir", newLang === "ar" ? "rtl" : "ltr");
      
      // إعادة عرض البيانات مع الترجمة الجديدة
      renderReports();
      updateTopTable();
      updateSummaryCards({});
      updateUserInfo();
    });
  }
});

/**
 * تحميل بيانات جميع البلاغات من API
 */
async function loadTotalData() {
  try {
    const API_BASE = location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? 'http://localhost:3001' : '';
    const response = await authFetch(`${API_BASE}/api/dashboard/total/all-reports`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    if (result.success && result.data) {
      // فلترة البيانات حسب نوع المستخدم
      let filteredReports = result.data.reports;
      
      if (!isClusterManager && userHospitalId) {
        // إذا كان موظف عادي، اعرض فقط بلاغات مستشفاه
        filteredReports = result.data.reports.filter(report => 
          report.HospitalID === userHospitalId
        );
        console.log(`👤 موظف عادي - عرض بلاغات مستشفى واحد فقط (ID: ${userHospitalId})`);
      } else {
        console.log('✅ مدير تجمع - عرض جميع البلاغات');
      }
      
      totalData = filteredReports;
      
      // تحديث الإحصائيات
      updateSummaryCards(result.data.summary);
      
      // عرض البيانات
      renderReports();
      
      // تحديث الجدول
      updateTopTable();
      
      console.log('تم تحميل البلاغات:', totalData.length, 'بلاغ');
    }
    
  } catch (error) {
    console.error('خطأ في تحميل جميع البلاغات:', error);
    showErrorMessage('خطأ في تحميل البيانات');
  }
}

/**
 * تحديث كروت الإحصائيات
 */
function updateSummaryCards(summary) {
  // إجمالي البلاغات (بناءً على البيانات المفلترة)
  const totalElement = document.getElementById('total-count');
  if (totalElement) totalElement.textContent = totalData.length;
  
  // عدد المستشفيات المتأثرة (بناءً على البيانات المفلترة)
  const hospitalsElement = document.getElementById('total-hospitals');
  if (hospitalsElement) {
    if (!isClusterManager && userHospitalId) {
      // إذا كان موظف عادي، اعرض 1 مستشفى فقط
      hospitalsElement.textContent = totalData.length > 0 ? 1 : 0;
    } else {
      // إذا كان مدير تجمع، احسب عدد المستشفيات الفريدة
      const uniqueHospitals = new Set(totalData.map(report => report.HospitalID));
      hospitalsElement.textContent = uniqueHospitals.size;
    }
  }
  
      // أكثر نوع تكراراً (بناءً على البيانات المفلترة)
      const topTypeElement = document.getElementById('total-top-type');
      if (topTypeElement) {
        if (totalData.length === 0) {
          topTypeElement.textContent = '–';
        } else {
          // حساب أكثر نوع تكراراً من البيانات المفلترة
          const lang = localStorage.getItem("siteLanguage") || currentLang || 'ar';
          const typeCounts = {};
          totalData.forEach(report => {
            // استخدام TypeNameAr أو TypeNameEn حسب اللغة
            const typeName = lang === 'en' 
              ? (report.TypeNameEn || report.TypeNameAr || 'Not specified')
              : (report.TypeNameAr || report.TypeNameEn || 'غير محدد');
            typeCounts[typeName] = (typeCounts[typeName] || 0) + 1;
          });
          
          const mostFrequentType = Object.entries(typeCounts)
            .sort(([,a], [,b]) => b - a)[0];
          
          topTypeElement.textContent = mostFrequentType ? mostFrequentType[0] : '–';
        }
      }
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
  const container = document.getElementById('total-list');
  if (!container) return;
  
  // تصفية البيانات حسب الفئة
  let filteredData = totalData;
  if (currentCategory !== 'all') {
    filteredData = totalData.filter(report => {
      if (currentCategory === 'complaint') {
        return report.TypeCode !== 'SUGGESTION' && !report.PriorityCode.includes('حرج');
      } else if (currentCategory === 'suggestion') {
        return report.TypeCode === 'SUGGESTION';
      } else if (currentCategory === 'critical') {
        return report.PriorityCode.includes('حرج') || report.PriorityCode.includes('عاجل');
      }
      return true;
    });
  }
  
  if (filteredData.length === 0) {
    const t = window.totalI18n?.t || ((key) => key);
    container.innerHTML = `
      <div class="col-span-full text-center py-12">
        <div class="text-gray-400 text-6xl mb-4">📊</div>
        <h3 class="text-xl font-bold text-gray-600 mb-2">${t('reports-empty-title')}</h3>
        <p class="text-gray-500">${t('reports-empty-subtitle')}</p>
      </div>
    `;
    return;
  }
  
  // تحديد مسار صفحة التفاصيل
  const DETAILS_PAGE = '../public/complaints/history/complaint-details.html';

  const lang = localStorage.getItem("siteLanguage") || currentLang || 'ar';
  const t = window.totalI18n?.t || ((key) => key);
  
  container.innerHTML = filteredData.map(report => {
    // تحديد لون البطاقة حسب الأولوية
    let cardColor = 'blue';
    let icon = '📊';
    if (report.PriorityCode.includes('حرج') || report.PriorityCode.includes('عاجل') || report.PriorityCode === 'CRITICAL' || report.PriorityCode === 'URGENT') {
      cardColor = 'red';
      icon = '🔴';
    } else if (report.StatusCode.includes('مغلق') || report.StatusCode.includes('محلول') || report.StatusCode === 'CLOSED' || report.StatusCode === 'RESOLVED') {
      cardColor = 'green';
      icon = '✅';
    } else {
      cardColor = 'orange';
      icon = '🟠';
    }
    
    // تحديد اسم المستشفى حسب اللغة
    const hospitalName = lang === 'en'
      ? (report.HospitalNameEn || report.HospitalNameAr || report.HospitalName || `#${report.HospitalID || ''}`)
      : (report.HospitalNameAr || report.HospitalName || `#${report.HospitalID || ''}`);
    
    // تحديد اسم التصنيف حسب اللغة
    const typeName = lang === 'en'
      ? (report.TypeNameEn || report.TypeNameAr || 'Not specified')
      : (report.TypeNameAr || report.TypeNameEn || 'غير محدد');
    
    // بناء الباراميترات للرابط
    const params = new URLSearchParams({
      ticket: report.TicketNumber || '',
      hid: String(report.HospitalID || ''),
      complaintId: String(report.ComplaintID || '')
    }).toString();
    
    return `
      <div class="bg-white rounded-xl p-6 shadow-lg border border-${cardColor}-100 hover:shadow-xl transition-shadow">
        <div class="flex items-start justify-between mb-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-${cardColor}-100 rounded-full flex items-center justify-center">
              <span class="text-${cardColor}-600 text-lg">${icon}</span>
            </div>
            <div>
              <h4 class="font-bold text-gray-800">${report.TicketNumber || '—'}</h4>
              <p class="text-sm text-gray-600">${hospitalName}</p>
            </div>
          </div>
          <span class="px-3 py-1 bg-${cardColor}-100 text-${cardColor}-700 rounded-full text-sm font-medium">
            ${translatePriority(report.PriorityCode)}
          </span>
        </div>
        
        <div class="space-y-2 mb-4">
          <div class="flex justify-between">
            <span class="text-gray-500 text-sm">${t('report-type-label')}</span>
            <span class="text-gray-800 text-sm font-medium">${typeName}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500 text-sm">${t('report-department-label')}</span>
            <span class="text-gray-800 text-sm font-medium">${report.DepartmentName || t('report-undefined')}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500 text-sm">${t('report-status-label')}</span>
            <span class="text-gray-800 text-sm font-medium">${translateStatus(report.StatusCode)}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500 text-sm">${t('report-date-label')}</span>
            <span class="text-gray-800 text-sm font-medium">${formatDate(report.CreatedAt)}</span>
          </div>
        </div>
        
        <div class="pt-4 border-t border-gray-100">
          <a href="${DETAILS_PAGE}?${params}"
             class="block text-center w-full bg-${cardColor}-50 text-${cardColor}-700 py-2 px-4 rounded-lg hover:bg-${cardColor}-100 transition-colors text-sm font-medium">
            ${t('report-details-button')}
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
  const container = document.getElementById('total-hospitals-grid');
  if (!container) return;
  
  const lang = localStorage.getItem("siteLanguage") || currentLang || 'ar';
  const t = window.totalI18n?.t || ((key, params) => {
    if (params && params.count !== undefined) {
      return key.replace('{count}', params.count);
    }
    return key;
  });
  const DETAILS_PAGE = '../public/complaints/history/complaint-details.html';
  
  // تجميع البلاغات حسب المستشفى
  let reportsByHospital = {};
  totalData.forEach(report => {
    if (!reportsByHospital[report.HospitalID]) {
      // تحديد اسم المستشفى حسب اللغة
      const hospitalName = lang === 'en'
        ? (report.HospitalNameEn || report.HospitalNameAr || report.HospitalName)
        : (report.HospitalNameAr || report.HospitalName);
      
      reportsByHospital[report.HospitalID] = {
        hospitalName: hospitalName,
        hospitalNameAr: report.HospitalNameAr || report.HospitalName,
        hospitalNameEn: report.HospitalNameEn || report.HospitalNameAr || report.HospitalName,
        reports: []
      };
    }
    reportsByHospital[report.HospitalID].reports.push(report);
  });
  
  // إذا كان موظف عادي، اعرض فقط مستشفاه
  if (!isClusterManager && userHospitalId) {
    const userHospitalReports = reportsByHospital[userHospitalId];
    if (userHospitalReports) {
      reportsByHospital = { [userHospitalId]: userHospitalReports };
    } else {
      reportsByHospital = {};
    }
  }
  
  if (Object.keys(reportsByHospital).length === 0) {
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
    // استخدام اسم المستشفى حسب اللغة
    const hospitalName = lang === 'en' ? hospital.hospitalNameEn : hospital.hospitalNameAr;
    
    return `
    <div class="bg-white rounded-xl p-6 shadow-lg border border-blue-100">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
          <span class="text-blue-600 text-xl">🏥</span>
        </div>
        <div>
          <h3 class="font-bold text-gray-800">${hospitalName}</h3>
          <p class="text-sm text-gray-600">${t('reports-hospital-count', { count: hospital.reports.length })}</p>
        </div>
      </div>
      
      <div class="space-y-2">
        ${hospital.reports.slice(0, 3).map(report => {
          let icon = '📊';
          let color = 'blue';
          if (report.PriorityCode.includes('حرج') || report.PriorityCode.includes('عاجل') || report.PriorityCode === 'CRITICAL' || report.PriorityCode === 'URGENT') {
            icon = '🔴';
            color = 'red';
          } else if (report.StatusCode.includes('مغلق') || report.StatusCode.includes('محلول') || report.StatusCode === 'CLOSED' || report.StatusCode === 'RESOLVED') {
            icon = '✅';
            color = 'green';
          } else {
            icon = '🟠';
            color = 'orange';
          }
          
          // تحديد اسم التصنيف حسب اللغة
          const typeName = lang === 'en'
            ? (report.TypeNameEn || report.TypeNameAr || 'Not specified')
            : (report.TypeNameAr || report.TypeNameEn || 'غير محدد');
          
          const params = new URLSearchParams({
            ticket: report.TicketNumber || '',
            hid: String(report.HospitalID || ''),
            complaintId: String(report.ComplaintID || '')
          }).toString();
          
          return `
            <a href="${DETAILS_PAGE}?${params}" class="block">
              <div class="flex items-center justify-between p-3 bg-${color}-50 rounded-lg hover:bg-${color}-100 transition-colors cursor-pointer">
                <div class="flex items-center gap-2">
                  <span class="text-${color}-600">${icon}</span>
                  <div>
                    <p class="font-medium text-gray-800 text-sm">${report.TicketNumber}</p>
                    <p class="text-xs text-gray-600">${typeName}</p>
                  </div>
                </div>
                <span class="text-xs text-${color}-600 font-medium">${translatePriority(report.PriorityCode)}</span>
              </div>
            </a>
          `;
        }).join('')}
        
        ${hospital.reports.length > 3 ? `
          <div class="text-center pt-2">
            <span class="text-sm text-gray-500">${t('reports-more-count', { count: hospital.reports.length - 3 })}</span>
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
  
  // معالجات فلاتر التصنيف
  document.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const category = e.target.dataset.cat;
      switchCategory(category);
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
    btn.classList.remove('bg-blue-50', 'text-blue-700', 'border-blue-200');
    btn.classList.add('bg-gray-50', 'border');
  });
  
  const activeBtn = document.querySelector(`[data-tab="${tab}"]`);
  if (activeBtn) {
    activeBtn.classList.remove('bg-gray-50', 'border');
    activeBtn.classList.add('bg-blue-50', 'text-blue-700', 'border-blue-200');
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
  
  // تحديث الجدول
  updateTopTable();
}

/**
 * تبديل فلاتر التصنيف
 */
function switchCategory(category) {
  currentCategory = category;
  
  // تحديث أزرار التصنيف
  document.querySelectorAll('.cat-btn').forEach(btn => {
    btn.classList.remove('bg-blue-50', 'text-blue-700', 'border-blue-200');
    btn.classList.add('bg-gray-50', 'border');
  });
  
  const activeBtn = document.querySelector(`[data-cat="${category}"]`);
  if (activeBtn) {
    activeBtn.classList.remove('bg-gray-50', 'border');
    activeBtn.classList.add('bg-blue-50', 'text-blue-700', 'border-blue-200');
  }
  
  // إعادة عرض البيانات
  renderReports();
  
  // تحديث الجدول
  updateTopTable();
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
 * تحديث جدول الأكثر تكراراً
 */
function updateTopTable() {
  const tableBody = document.getElementById('total-top-table');
  if (!tableBody) return;
  
  const lang = localStorage.getItem("siteLanguage") || currentLang || 'ar';
  const t = window.totalI18n?.t || ((key) => key);
  
  if (totalData.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="3" class="text-center py-8 text-gray-500">${t('table-empty')}</td>
      </tr>
    `;
    return;
  }
  
  // تجميع البيانات حسب المستشفى والنوع
  const hospitalTypeCounts = {};
  totalData.forEach(report => {
    // استخدام TypeNameAr أو TypeNameEn حسب اللغة
    const typeName = lang === 'en'
      ? (report.TypeNameEn || report.TypeNameAr || 'Not specified')
      : (report.TypeNameAr || report.TypeNameEn || 'غير محدد');
    
    const key = `${report.HospitalID}-${typeName}`;
    if (!hospitalTypeCounts[key]) {
      hospitalTypeCounts[key] = {
        hospitalName: lang === 'en'
          ? (report.HospitalNameEn || report.HospitalNameAr || report.HospitalName)
          : (report.HospitalNameAr || report.HospitalName),
        typeName: typeName,
        count: 0
      };
    }
    hospitalTypeCounts[key].count++;
  });
  
  // تحويل إلى مصفوفة وترتيب حسب العدد
  const sortedData = Object.values(hospitalTypeCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10); // أعلى 10
  
  if (sortedData.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="3" class="text-center py-8 text-gray-500">${t('table-empty')}</td>
      </tr>
    `;
    return;
  }
  
  tableBody.innerHTML = sortedData.map(item => `
    <tr class="border-b border-gray-100 hover:bg-gray-50">
      <td class="py-3 px-4 font-medium text-gray-800">${item.hospitalName}</td>
      <td class="py-3 px-4 text-gray-600">${item.typeName}</td>
      <td class="py-3 px-4 text-center">
        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          ${item.count}
        </span>
      </td>
    </tr>
  `).join('');
}

/**
 * عرض رسالة خطأ
 */
function showErrorMessage(message) {
  const container = document.getElementById('total-list');
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