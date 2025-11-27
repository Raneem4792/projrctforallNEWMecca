// ========================================
// صفحة البلاغات المفتوحة - Open Reports Page
// ========================================

let openData = [];
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
    
    console.log('🔐 معلومات المستخدم (البلاغات المفتوحة):', { 
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
  if (userInfoElement && window.openI18n) {
    const t = window.openI18n.t;
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
 * ترجمة الحالات
 */
function translateStatus(statusCode) {
  if (!window.openI18n) {
    // Fallback if translation system not loaded
    const statusMap = {
      'OPEN': 'مفتوحة', 'open': 'مفتوحة',
      'CLOSED': 'مغلقة', 'closed': 'مغلقة',
      'IN_PROGRESS': 'قيد المعالجة', 'in_progress': 'قيد المعالجة',
      'PENDING': 'معلقة', 'pending': 'معلقة',
      'AWAITING_RESPONSE': 'بانتظار الرد', 'awaiting_response': 'بانتظار الرد',
      'ON_HOLD': 'قيد الانتظار', 'on_hold': 'قيد الانتظار',
      'RESOLVED': 'محلولة', 'resolved': 'محلولة'
    };
    return statusMap[statusCode] || statusCode;
  }
  
  const t = window.openI18n.t;
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
 * ترجمة الأولويات
 */
function translatePriority(priorityCode) {
  if (!window.openI18n) {
    // Fallback if translation system not loaded
    const priorityMap = {
      'HIGH': 'عالية', 'high': 'عالية',
      'CRITICAL': 'حرجة', 'critical': 'حرجة',
      'URGENT': 'عاجلة', 'urgent': 'عاجلة',
      'MEDIUM': 'متوسطة', 'medium': 'متوسطة',
      'LOW': 'منخفضة', 'low': 'منخفضة',
      'NORMAL': 'عادية', 'normal': 'عادية'
    };
    return priorityMap[priorityCode] || priorityCode || 'غير محددة';
  }
  
  const t = window.openI18n.t;
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

// تهيئة الصفحة عند التحميل
document.addEventListener('DOMContentLoaded', async () => {
  // انتظر تحميل نظام الترجمة
  await new Promise(resolve => {
    if (window.openI18n) {
      resolve();
    } else {
      const checkInterval = setInterval(() => {
        if (window.openI18n) {
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
  
  await loadCurrentUser();
  await loadOpenData();
  initializeEventHandlers();
  
  // الاستماع لتغييرات اللغة
  if (window.openI18n) {
    window.openI18n.onChange(() => {
      updateUserInfo();
      renderReports();
      updateTopTable();
    });
  }
});

/**
 * تحميل بيانات البلاغات المفتوحة من API
 */
async function loadOpenData() {
  try {
    const API_BASE = location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? 'http://localhost:3001' : '';
    const response = await authFetch(`${API_BASE}/api/dashboard/total/open-reports`);
    
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
        console.log(`👤 موظف عادي - عرض بلاغات مفتوحة لمستشفى واحد فقط (ID: ${userHospitalId})`);
      } else {
        console.log('✅ مدير تجمع - عرض جميع البلاغات المفتوحة');
      }
      
      openData = filteredReports;
      
      // تحديث الإحصائيات
      updateSummaryCards(result.data.summary);
      
      // عرض البيانات
      renderReports();
      
      // تحديث الجدول
      updateTopTable();
      
      console.log('تم تحميل البلاغات المفتوحة:', openData.length, 'بلاغ');
    }
    
  } catch (error) {
    console.error('خطأ في تحميل البلاغات المفتوحة:', error);
    showErrorMessage('خطأ في تحميل البيانات');
  }
}

/**
 * تحديث كروت الإحصائيات
 */
function updateSummaryCards(summary) {
  // إجمالي البلاغات المفتوحة (بناءً على البيانات المفلترة)
  const totalElement = document.getElementById('open-total');
  if (totalElement) totalElement.textContent = openData.length;
  
  // عدد المستشفيات المتأثرة (بناءً على البيانات المفلترة)
  const hospitalsElement = document.getElementById('open-hospitals');
  if (hospitalsElement) {
    if (!isClusterManager && userHospitalId) {
      // إذا كان موظف عادي، اعرض 1 مستشفى فقط
      hospitalsElement.textContent = openData.length > 0 ? 1 : 0;
    } else {
      // إذا كان مدير تجمع، احسب عدد المستشفيات الفريدة
      const uniqueHospitals = new Set(openData.map(report => report.HospitalID));
      hospitalsElement.textContent = uniqueHospitals.size;
    }
  }
  
  // أكثر نوع تكراراً (بناءً على البيانات المفلترة)
  const topTypeElement = document.getElementById('open-top-type');
  if (topTypeElement) {
    if (openData.length === 0) {
      topTypeElement.textContent = '–';
    } else {
      // حساب أكثر نوع تكراراً من البيانات المفلترة
      const lang = window.openI18n?.getLanguage() || 'ar';
      const typeCounts = {};
      openData.forEach(report => {
        // استخدام الاسم حسب اللغة
        const typeName = lang === 'ar'
          ? (report.TypeNameAr || report.TypeName || 'غير محدد')
          : (report.TypeNameEn || report.TypeNameAr || report.TypeName || 'Not specified');
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
  const container = document.getElementById('open-list');
  if (!container) return;
  
  // تصفية البيانات حسب الفئة
  let filteredData = openData;
  if (currentCategory !== 'all') {
    filteredData = openData.filter(report => {
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
    const t = window.openI18n?.t || ((key) => key);
    container.innerHTML = `
      <div class="col-span-full text-center py-12">
        <div class="text-gray-400 text-6xl mb-4">🟠</div>
        <h3 class="text-xl font-bold text-gray-600 mb-2">${t('reports-empty-title')}</h3>
        <p class="text-gray-500">${t('reports-empty-subtitle')}</p>
      </div>
    `;
    return;
  }
  
  // تحديد مسار صفحة التفاصيل
  const DETAILS_PAGE = '../public/complaints/history/complaint-details.html';
  
  // الحصول على اللغة الحالية
  const lang = window.openI18n?.getLanguage() || 'ar';

  container.innerHTML = filteredData.map(report => {
    // بناء الباراميترات للرابط
    const params = new URLSearchParams({
      ticket: report.TicketNumber || '',
      hid: String(report.HospitalID || ''),
      complaintId: String(report.ComplaintID || '')
    }).toString();
    
    // تحديد اسم المستشفى حسب اللغة
    const hospitalName = lang === 'ar' 
      ? (report.HospitalNameAr || report.HospitalName || `#${report.HospitalID || ''}`)
      : (report.HospitalNameEn || report.HospitalNameAr || report.HospitalName || `#${report.HospitalID || ''}`);
    
    // تحديد اسم التصنيف حسب اللغة
    const typeName = lang === 'ar'
      ? (report.TypeNameAr || report.TypeName || ((window.openI18n?.t('report-undefined')) || 'غير محدد'))
      : (report.TypeNameEn || report.TypeNameAr || report.TypeName || ((window.openI18n?.t('report-undefined')) || 'Not specified'));

    return `
      <div class="bg-white rounded-xl p-6 shadow-lg border border-orange-100 hover:shadow-xl transition-shadow">
        <div class="flex items-start justify-between mb-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
              <span class="text-orange-600 text-lg">🟠</span>
            </div>
            <div>
              <h4 class="font-bold text-gray-800">${report.TicketNumber || '—'}</h4>
              <p class="text-sm text-gray-600">${hospitalName}</p>
            </div>
          </div>
          <span class="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm font-medium">
            ${translatePriority(report.PriorityCode)}
          </span>
        </div>
        
        <div class="space-y-2 mb-4">
          <div class="flex justify-between">
            <span class="text-gray-500 text-sm">${(window.openI18n?.t('report-type-label')) || 'النوع:'}</span>
            <span class="text-gray-800 text-sm font-medium">${typeName}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500 text-sm">${(window.openI18n?.t('report-department-label')) || 'القسم:'}</span>
            <span class="text-gray-800 text-sm font-medium">${report.DepartmentName || ((window.openI18n?.t('report-undefined')) || 'غير محدد')}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500 text-sm">${(window.openI18n?.t('report-status-label')) || 'الحالة:'}</span>
            <span class="text-gray-800 text-sm font-medium">${translateStatus(report.StatusCode)}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500 text-sm">${(window.openI18n?.t('report-date-label')) || 'التاريخ:'}</span>
            <span class="text-gray-800 text-sm font-medium">${formatDate(report.CreatedAt)}</span>
          </div>
        </div>
        
        <div class="pt-4 border-t border-gray-100">
          <a href="${DETAILS_PAGE}?${params}"
             class="block text-center w-full bg-orange-50 text-orange-700 py-2 px-4 rounded-lg hover:bg-orange-100 transition-colors text-sm font-medium">
            ${(window.openI18n?.t('report-details-button')) || 'عرض التفاصيل'}
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
  const container = document.getElementById('open-hospitals-grid');
  if (!container) return;
  
  // تحديد مسار صفحة التفاصيل
  const DETAILS_PAGE = '../public/complaints/history/complaint-details.html';
  
  // تجميع البلاغات حسب المستشفى
  const lang = window.openI18n?.getLanguage() || 'ar';
  let reportsByHospital = {};
  openData.forEach(report => {
    if (!reportsByHospital[report.HospitalID]) {
      // تحديد اسم المستشفى حسب اللغة
      const hospitalName = lang === 'ar'
        ? (report.HospitalNameAr || report.HospitalName)
        : (report.HospitalNameEn || report.HospitalNameAr || report.HospitalName);
      reportsByHospital[report.HospitalID] = {
        hospitalName: hospitalName,
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
    const t = window.openI18n?.t || ((key) => key);
    container.innerHTML = `
      <div class="col-span-full text-center py-12">
        <div class="text-gray-400 text-6xl mb-4">🏥</div>
        <h3 class="text-xl font-bold text-gray-600 mb-2">${t('reports-hospital-empty-title')}</h3>
        <p class="text-gray-500">${t('reports-hospital-empty-subtitle')}</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = Object.values(reportsByHospital).map(hospital => `
    <div class="bg-white rounded-xl p-6 shadow-lg border border-orange-100">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
          <span class="text-orange-600 text-xl">🏥</span>
        </div>
        <div>
          <h3 class="font-bold text-gray-800">${hospital.hospitalName}</h3>
          <p class="text-sm text-gray-600">${(window.openI18n?.t('reports-hospital-count', { count: hospital.reports.length })) || `${hospital.reports.length} بلاغ مفتوح`}</p>
        </div>
      </div>
      
      <div class="space-y-2">
        ${hospital.reports.slice(0, 3).map(report => {
          const params = new URLSearchParams({
            ticket: report.TicketNumber || '',
            hid: String(report.HospitalID || ''),
            complaintId: String(report.ComplaintID || '')
          }).toString();
          
          // تحديد اسم التصنيف حسب اللغة
          const typeName = lang === 'ar'
            ? (report.TypeNameAr || report.TypeName || ((window.openI18n?.t('report-undefined')) || 'غير محدد'))
            : (report.TypeNameEn || report.TypeNameAr || report.TypeName || ((window.openI18n?.t('report-undefined')) || 'Not specified'));
          
          return `
            <a href="${DETAILS_PAGE}?${params}" class="block">
              <div class="flex items-center justify-between p-3 bg-orange-50 rounded-lg hover:bg-orange-100 transition-colors cursor-pointer">
                <div>
                  <p class="font-medium text-gray-800 text-sm">${report.TicketNumber}</p>
                  <p class="text-xs text-gray-600">${typeName}</p>
                </div>
                <span class="text-xs text-orange-600 font-medium">${translatePriority(report.PriorityCode)}</span>
              </div>
            </a>
          `;
        }).join('')}
        
        ${hospital.reports.length > 3 ? `
          <div class="text-center pt-2">
            <span class="text-sm text-gray-500">${(window.openI18n?.t('reports-more-count', { count: hospital.reports.length - 3 })) || `و ${hospital.reports.length - 3} بلاغات أخرى`}</span>
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
    btn.classList.remove('bg-orange-50', 'text-orange-700', 'border-orange-200');
    btn.classList.add('bg-gray-50', 'border');
  });
  
  const activeBtn = document.querySelector(`[data-tab="${tab}"]`);
  if (activeBtn) {
    activeBtn.classList.remove('bg-gray-50', 'border');
    activeBtn.classList.add('bg-orange-50', 'text-orange-700', 'border-orange-200');
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
    btn.classList.remove('bg-orange-50', 'text-orange-700', 'border-orange-200');
    btn.classList.add('bg-gray-50', 'border');
  });
  
  const activeBtn = document.querySelector(`[data-cat="${category}"]`);
  if (activeBtn) {
    activeBtn.classList.remove('bg-gray-50', 'border');
    activeBtn.classList.add('bg-orange-50', 'text-orange-700', 'border-orange-200');
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
  const tableBody = document.getElementById('open-top-table');
  if (!tableBody) return;
  
  if (openData.length === 0) {
    const t = window.openI18n?.t || ((key) => key);
    tableBody.innerHTML = `
      <tr>
        <td colspan="3" class="text-center py-8 text-gray-500">${t('table-empty')}</td>
      </tr>
    `;
    return;
  }
  
  // تجميع البيانات حسب المستشفى والنوع
  const lang = window.openI18n?.getLanguage() || 'ar';
  const hospitalTypeCounts = {};
  openData.forEach(report => {
    // استخدام الاسم العربي للمفتاح (للتجميع)
    const typeKey = report.TypeNameAr || report.TypeName || 'غير محدد';
    const key = `${report.HospitalID}-${typeKey}`;
    
    if (!hospitalTypeCounts[key]) {
      // تحديد الأسماء حسب اللغة للعرض
      const hospitalName = lang === 'ar'
        ? (report.HospitalNameAr || report.HospitalName)
        : (report.HospitalNameEn || report.HospitalNameAr || report.HospitalName);
      
      const typeName = lang === 'ar'
        ? (report.TypeNameAr || report.TypeName || 'غير محدد')
        : (report.TypeNameEn || report.TypeNameAr || report.TypeName || 'Not specified');
      
      hospitalTypeCounts[key] = {
        hospitalName: hospitalName,
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
    const t = window.openI18n?.t || ((key) => key);
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
        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
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
  const container = document.getElementById('open-list');
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