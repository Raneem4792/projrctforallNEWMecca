/* ========================================
   ملف JavaScript الخاص بصفحة التقارير والإحصائيات
   Reports JavaScript File
   ======================================== */

// ===== قراءة اللغة من localStorage =====
const currentLang = localStorage.getItem("siteLanguage") || "ar";

// ===== App Namespace Protection =====
if (!window.App) window.App = {};
const App = window.App;

// ===== Auth Context =====
let currentUser = null;
let isClusterManager = false;
let userHospitalId = null;
let hospitalsData = [];

// ===== Chart Variables =====
let reportsChart, statusChart, hospitalChart, hospitalFunnelChart, deptCountChart, topEmployeesChart, criticalRatioChart;

// ===== Chart Helper Functions =====
function destroyChart(chartInstance) {
  if (chartInstance) {
    chartInstance.destroy();
  }
}

function destroyChartByCanvasId(canvasId) {
  try {
    const el = typeof canvasId === 'string' ? document.getElementById(canvasId) : canvasId;
    if (!el) return;
    // Chart.js v3/v4: يفضل تمرير عنصر الـ canvas إلى getChart
    const existingChart = Chart.getChart(el) || Chart.getChart(el?.id);
    if (existingChart) {
      existingChart.destroy();
    }
  } catch (error) {
    // تجاهل أخطاء التدمير
    console.warn('Warning destroying chart:', error);
  }
}

function destroyAllCharts() {
  destroyChart(reportsChart);
  destroyChart(statusChart);
  destroyChart(hospitalChart);
  destroyChart(hospitalFunnelChart);
  destroyChart(deptCountChart);
  destroyChart(topEmployeesChart);
  
  // تدمير جميع المخططات الأخرى الموجودة
  const instances = Chart.instances || [];
  for (let i = instances.length - 1; i >= 0; i--) {
    const instance = instances[i];
    if (instance.canvas) {
      try {
        instance.destroy();
      } catch (error) {
        // تجاهل أخطاء التدمير
      }
    }
  }
  
  // إعادة تعيين المتغيرات
  reportsChart = null;
  statusChart = null;
  hospitalChart = null;
  hospitalFunnelChart = null;
  deptCountChart = null;
  topEmployeesChart = null;
  criticalRatioChart = null;
}

// API Base URL
const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:3001'
  : '';

// دالة مساعدة للهيدرز
function authHeaders() {
  const token = localStorage.getItem('token') || localStorage.getItem('authToken');
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

// Cache للمستشفيات
let hospitalsCache = [];        // نخزّن القائمة هنا
let hospitalsById = new Map();  // خريطة سريعة ID->Name

// ===== Protected Functions =====
if (typeof App.getCurrentUser !== 'function') {
  App.getCurrentUser = function () {
    return window.currentUser || JSON.parse(localStorage.getItem('userData') || '{}');
  };
}

if (typeof App.isClusterManager !== 'function') {
  App.isClusterManager = function () {
    const u = App.getCurrentUser();
    // مدير تجمع (RoleID === 1) أو مركزي (RoleID === 4) فقط
    // مدير النظام (RoleID === 2) ليس مدير تجمع
    return u?.RoleID === 1 || u?.RoleID === 4 || u?.IsClusterManager === true;
  };
}

// ===== Auth Helper Functions =====
async function loadCurrentUser() {
  try {
    const token = localStorage.getItem('token') || localStorage.getItem('authToken');
    if (!token) {
      console.warn('No auth token found');
      return;
    }

    const response = await fetch(`${API_BASE}/api/auth/me`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        console.warn('Invalid token');
        localStorage.removeItem('token');
        localStorage.removeItem('authToken');
        localStorage.removeItem('userData');
        return;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const userData = await response.json();
    currentUser = userData;
    window.currentUser = userData;
    localStorage.setItem('userData', JSON.stringify(userData));
    
    isClusterManager = App.isClusterManager();
    userHospitalId = userData?.HospitalID;

    console.log('✅ تم تحميل بيانات المستخدم:', {
      userId: userData?.UserID,
      roleId: userData?.RoleID,
      hospitalId: userData?.HospitalID,
      isClusterManager
    });

  } catch (error) {
    console.error('❌ خطأ في تحميل بيانات المستخدم:', error);
    currentUser = null;
    isClusterManager = false;
    userHospitalId = null;
  }
}

// ===== Loading and Error Functions =====
function showLoadingIndicator(message = 'جاري التحميل...') {
  hideLoadingIndicator();
  const loadingDiv = document.createElement('div');
  loadingDiv.id = 'loading-indicator';
  loadingDiv.className = 'fixed top-20 left-1/2 transform -translate-x-1/2 bg-blue-100 border border-blue-400 text-blue-700 px-6 py-4 rounded-lg shadow-lg z-50';
  loadingDiv.innerHTML = `
    <div class="flex items-center">
      <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <div class="font-medium">${message}</div>
    </div>
  `;
  document.body.appendChild(loadingDiv);
}

function hideLoadingIndicator() {
  const loadingDiv = document.getElementById('loading-indicator');
  if (loadingDiv) {
    loadingDiv.remove();
  }
}

function showErrorMessage(title, message) {
  const errorDiv = document.createElement('div');
  errorDiv.className = 'fixed top-20 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg shadow-lg z-50 max-w-md';
  errorDiv.innerHTML = `
    <div class="flex items-center">
      <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path>
      </svg>
      <div>
        <div class="font-bold">${title}</div>
        <div class="text-sm">${message}</div>
      </div>
      <button onclick="this.parentElement.parentElement.remove()" class="ml-4 text-red-500 hover:text-red-700">
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>
        </svg>
      </button>
    </div>
  `;
  document.body.appendChild(errorDiv);
  setTimeout(() => {
    if (errorDiv.parentElement) {
      errorDiv.remove();
    }
  }, 10000);
}

function animateNumber(element, targetValue, duration = 1000) {
  const startValue = parseInt(element.textContent) || 0;
  const startTime = performance.now();
  
  function updateValue(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    const easeProgress = 1 - Math.pow(1 - progress, 3);
    const currentValue = Math.round(startValue + (targetValue - startValue) * easeProgress);
    
    element.textContent = currentValue.toLocaleString('en-US');
    
    if (progress < 1) {
      requestAnimationFrame(updateValue);
    }
  }
  
  requestAnimationFrame(updateValue);
}

// ========================================
// تحميل بيانات المستشفيات من API
// Load Hospitals Data from API
// ========================================

/**
 * تحميل بيانات المستشفيات من API
 */
async function loadHospitalsData() {
  try {
    showLoadingIndicator('جاري تحميل بيانات المستشفيات...');

    // 1) لازم نعرف المستخدم أول
    if (!currentUser) {
      await loadCurrentUser();
    }

    const token = localStorage.getItem('token') || localStorage.getItem('authToken');
    if (!token) {
      throw new Error('لا يوجد توكن للمصادقة');
    }

    // 2) بناء URL حسب الدور
    let url = `${API_BASE}/api/dashboard/total/by-hospital`;
    
    // إذا لم يكن مدير تجمع، نضيف hospitalId
    if (!isClusterManager && userHospitalId) {
      url += `?hospitalId=${userHospitalId}`;
    }

    console.log('🔍 جاري جلب بيانات المستشفيات من:', url);

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('التوكن غير صحيح');
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!Array.isArray(data)) {
      throw new Error('البيانات المستلمة غير صحيحة');
    }

    // 3) معالجة البيانات
    const lang = localStorage.getItem("siteLanguage") || currentLang || 'ar';
    hospitalsData = data.map(hospital => {
      // تحديد اسم المستشفى حسب اللغة
      const hospitalName = lang === 'en'
        ? (hospital.HospitalNameEn || hospital.HospitalNameAr || hospital.HospitalName || hospital.NameEn || 'Not specified')
        : (hospital.HospitalNameAr || hospital.HospitalName || hospital.NameAr || 'غير محدد');
      
      return {
        hospitalId: hospital.HospitalID,
        hospitalName: hospitalName,
        hospitalNameAr: hospital.HospitalNameAr || hospital.HospitalName || hospital.NameAr,
        hospitalNameEn: hospital.HospitalNameEn || hospital.HospitalName || hospital.NameEn,
        totalReports: Number(hospital.counts?.total || 0),
        openReports: Number(hospital.counts?.open || 0),
        closedReports: Number(hospital.counts?.closed || 0),
        priorityCounts: {
          red: Number(hospital.counts?.critical || hospital.counts?.urgent || 0),
          orange: Number(hospital.counts?.high || 0),
          yellow: Number(hospital.counts?.medium || 0),
          green: Number(hospital.counts?.low || 0)
        },
        redReports: hospital.redReports || []
      };
    });

    console.log('✅ تم تحميل بيانات المستشفيات:', hospitalsData);

    // 4) تحديث مؤشرات الأداء
    updateMainStatsCards();

    // 5) عرض الجدول الملخص
    renderSummaryTable();

    // 6) تحديث العنوان + تاريخ التصدير
    updateSummaryMeta();

    hideLoadingIndicator();

  } catch (error) {
    console.error('❌ خطأ في تحميل بيانات المستشفيات:', error);
    hideLoadingIndicator();
    showErrorMessage('خطأ في تحميل البيانات', error.message);
    
    // بيانات احتياطية
    hospitalsData = [];
    updateMainStatsCards();
  }
}

/**
 * تحديث الكروت الرئيسية بالإحصائيات
 */
// ===== دالة عرض جدول الملخص =====
function renderSummaryTable() {
  const tbody = document.getElementById('summaryTableBody');
  if (!tbody) return;

  tbody.innerHTML = '';

  let totalAll = 0;
  let openAll = 0;
  let closedAll = 0;
  let criticalAll = 0;

  // فلترة البيانات حسب الدور: الموظفون ومديرو النظام يرون مستشفاهم فقط
  let filteredData = hospitalsData;
  if (!isClusterManager && userHospitalId) {
    filteredData = hospitalsData.filter(h => 
      Number(h.hospitalId) === Number(userHospitalId) || 
      Number(h.HospitalID) === Number(userHospitalId)
    );
    console.log('🔍 تصفية بيانات الجدول للمستشفى:', userHospitalId, 'البيانات المفلترة:', filteredData);
  }

  const lang = localStorage.getItem("siteLanguage") || currentLang || 'ar';
  filteredData.forEach((h, idx) => {
    // تحديد اسم المستشفى حسب اللغة
    const name = lang === 'en'
      ? (h.hospitalNameEn || h.hospitalNameAr || h.hospitalName || h.HospitalNameEn || h.HospitalName || 'Not specified')
      : (h.hospitalNameAr || h.hospitalName || h.HospitalNameAr || h.HospitalName || 'غير محدد');
    const total = Number(h.totalReports || h.counts?.total || 0);
    const open = Number(h.openReports || h.counts?.open || 0);
    const closed = Number(h.closedReports || h.counts?.closed || 0);
    const critical = Number(h.priorityCounts?.red || h.counts?.critical || 0);
    const criticalPct = total > 0 ? ((critical / total) * 100).toFixed(1) + '%' : '0%';

    totalAll += total;
    openAll += open;
    closedAll += closed;
    criticalAll += critical;

    const tr = document.createElement('tr');
    tr.className = idx % 2 === 0 ? 'bg-gray-50' : 'bg-white';
    tr.innerHTML = `
      <td class="px-2 py-1 text-center border border-gray-200">${idx + 1}</td>
      <td class="px-2 py-1 text-right border border-gray-200 font-medium">${name}</td>
      <td class="px-2 py-1 text-center border border-gray-200">${total}</td>
      <td class="px-2 py-1 text-center border border-gray-200">${open}</td>
      <td class="px-2 py-1 text-center border border-gray-200">${closed}</td>
      <td class="px-2 py-1 text-center border border-gray-200">${critical}</td>
      <td class="px-2 py-1 text-center border border-gray-200">${criticalPct}</td>
    `;
    tbody.appendChild(tr);
  });

  // صف الإجمالي
  if (filteredData.length) {
    const totalCriticalPct =
      totalAll > 0 ? ((criticalAll / totalAll) * 100).toFixed(1) + '%' : '0%';

    const trTotal = document.createElement('tr');
    trTotal.className = 'bg-gray-200 font-bold';
    trTotal.innerHTML = `
      <td class="px-2 py-1 text-center border border-gray-200" colspan="2">الإجمالي</td>
      <td class="px-2 py-1 text-center border border-gray-200">${totalAll}</td>
      <td class="px-2 py-1 text-center border border-gray-200">${openAll}</td>
      <td class="px-2 py-1 text-center border border-gray-200">${closedAll}</td>
      <td class="px-2 py-1 text-center border border-gray-200">${criticalAll}</td>
      <td class="px-2 py-1 text-center border border-gray-200">${totalCriticalPct}</td>
    `;
    tbody.appendChild(trTotal);
  }
}

/**
 * تحديث عنوان الشهر + تاريخ التصدير
 */
function updateSummaryMeta() {
  const monthInput = document.getElementById('summaryMonth');
  const monthSpan = document.getElementById('summaryHeaderMonth');
  const dateSpan = document.getElementById('summaryExportDate');

  // شهر التقرير
  if (monthSpan && monthInput) {
    const val = monthInput.value; // شكلها YYYY-MM
    if (val) {
      const [year, m] = val.split('-');
      monthSpan.textContent = `عن شهر ${m}/${year}`;
    } else {
      monthSpan.textContent = '';
    }
  }

  // تاريخ التصدير الآن
  if (dateSpan) {
    const now = new Date();
    const dateStr = now.toLocaleDateString('ar-SA');
    const timeStr = now.toLocaleTimeString('ar-SA', {
      hour: '2-digit',
      minute: '2-digit'
    });
    dateSpan.textContent = `تاريخ التصدير: ${dateStr} ${timeStr}`;
  }
}

function updateMainStatsCards() {
  // حساب الإحصائيات حسب دور المستخدم
  let totalReports, openReports, closedReports, criticalReports, hospitalCount, slaCompliance;
  
  if (isClusterManager) {
    // مدير التجمع يرى جميع المستشفيات
    totalReports = hospitalsData.reduce((sum, hospital) => sum + hospital.totalReports, 0);
    openReports = hospitalsData.reduce((sum, hospital) => sum + hospital.openReports, 0);
    closedReports = hospitalsData.reduce((sum, hospital) => sum + hospital.closedReports, 0);
    criticalReports = hospitalsData.reduce((sum, hospital) => sum + hospital.priorityCounts.red, 0);
    hospitalCount = hospitalsData.length;
    slaCompliance = hospitalsData.reduce((sum, hospital) => sum + (hospital.slaCompliance || 0), 0) / hospitalsData.length;
  } else {
    // الموظف العادي يرى مستشفاه فقط
    const userHospital = hospitalsData.find(h => h.hospitalId === userHospitalId);
    if (userHospital) {
      totalReports = userHospital.totalReports || 0;
      openReports = userHospital.openReports || 0;
      closedReports = userHospital.closedReports || 0;
      criticalReports = userHospital.priorityCounts?.red || 0;
      hospitalCount = 1; // مستشفى واحد فقط
      slaCompliance = userHospital.slaCompliance || 0;
    } else {
      // إذا لم يجد المستشفى، استخدم القيم الافتراضية
      totalReports = openReports = closedReports = criticalReports = 0;
      hospitalCount = 0;
      slaCompliance = 0;
    }
  }

  // تحديث الكروت مع تأثيرات متحركة
  const totalElement = document.getElementById('kpi-total');
  if (totalElement) animateNumber(totalElement, totalReports);

  const openElement = document.getElementById('kpi-open');
  if (openElement) animateNumber(openElement, openReports);

  const closedElement = document.getElementById('kpi-closed');
  if (closedElement) animateNumber(closedElement, closedReports);

  const criticalElement = document.getElementById('kpi-critical');
  if (criticalElement) animateNumber(criticalElement, criticalReports);

  // حساب الإحصائيات الجديدة
  const avgResolutionRate = totalReports > 0 ? Math.round((closedReports / totalReports) * 100) : 0;

  // تحديث الكروت الجديدة
  const slaElement = document.getElementById('kpi-sla');
  if (slaElement) {
    slaElement.textContent = Math.round(slaCompliance) + '%';
  }

  const hospitalsElement = document.getElementById('kpi-hospitals');
  if (hospitalsElement) {
    // إخفاء بطاقة عدد المستشفيات للموظف العادي
    const hospitalsCard = hospitalsElement.closest('[data-perm="REPORTS_CARD_HOSPITALS"]');
    if (hospitalsCard) {
      if (isClusterManager) {
        hospitalsCard.style.display = 'flex';
        animateNumber(hospitalsElement, hospitalCount);
      } else {
        hospitalsCard.style.display = 'none';
      }
    }
  }

  console.log('تم تحديث الكروت الرئيسية:', {
    total: totalReports,
    open: openReports,
    closed: closedReports,
    critical: criticalReports,
    slaCompliance: Math.round(slaCompliance),
    hospitalCount,
    isClusterManager
  });
}

// إظهار رابط "ملفي" إذا كان المستخدم مسجل دخول
async function initHeaderProfileLink() {
  try {
    const token = localStorage.getItem('authToken') || localStorage.getItem('token');
    if (!token) return;
    
    const res = await fetch(`${API_BASE}/api/auth/me`, { 
      credentials: 'include',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    if (!res.ok) return;
    const me = await res.json();
    if (me?.authenticated || me?.UserID) {
      const profileLink = document.getElementById('nav-profile');
      if (profileLink) {
        profileLink.classList.remove('hidden');
      }
    }
  } catch (error) {
    console.log('Profile link check failed:', error);
  }
}

async function createMainCharts() {
  // جلب بيانات اتجاه البلاغات من الـ API
  await createReportsTrendChart();
  
  // جلب بيانات حالات البلاغات من الـ API
  await createStatusChart();
}

// جلب بيانات اتجاه البلاغات من جدول complaints
async function createReportsTrendChart() {
  const reportsCtx = document.getElementById('reportsChart');
  if (!reportsCtx) return;

  // تدمير المخطط السابق إذا كان موجوداً
  destroyChart(reportsChart);
  destroyChartByCanvasId('reportsChart');

  try {
    const API_BASE = location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? 'http://localhost:3001' : '';
    
    // إضافة فلتر المستشفى إذا لم يكن مدير تجمع
    let url = `${API_BASE}/api/dashboard/total/monthly-trends`;
    if (currentUser && !isClusterManager && userHospitalId) {
      url += `?hospitalId=${userHospitalId}`;
    }
    
    console.log('محاولة جلب بيانات اتجاه البلاغات من:', url);
    
    const response = await fetch(url, { headers: authHeaders() });
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`الـ endpoint غير موجود (404). تأكد من تشغيل الـ server على المنفذ 3001`);
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    if (result.success && result.data) {
      // تدمير الـ chart السابق إذا كان موجوداً
      destroyChart(reportsChart);
      destroyChartByCanvasId('reportsChart');
      
      // تحضير البيانات للرسم البياني
      const trendData = result.data;
      const lang = localStorage.getItem("siteLanguage") || currentLang || 'ar';
      const labels = trendData.map(item => {
        return lang === 'en'
          ? (item.monthNameEn || item.monthName)
          : (item.monthNameAr || item.monthName);
      });
      const newReportsData = trendData.map(item => item.newReports);
      const closedReportsData = trendData.map(item => item.closedReports);
      
      // دالة ترجمة آمنة
      const t = (key) => {
        try {
          if (window.reportsI18n && window.reportsI18n.t) {
            return window.reportsI18n.t(key);
          }
          const fallback = {
            'chart-new-reports': 'البلاغات الجديدة',
            'chart-closed-reports': 'البلاغات المغلقة'
          };
          return fallback[key] || key;
        } catch (e) {
          return key;
        }
      };
      
      reportsChart = new Chart(reportsCtx.getContext('2d'), {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            {
              label: t('chart-new-reports'),
              data: newReportsData,
              borderColor: '#004A9F',
              backgroundColor: 'rgba(0,74,159,.1)',
              tension: .4,
              fill: true
            },
            {
              label: t('chart-closed-reports'),
              data: closedReportsData,
              borderColor: '#0FA47A',
              backgroundColor: 'rgba(15,164,122,.1)',
              tension: .4,
              fill: true
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'top',
              labels: {
                font: { family: 'Tajawal' }
              }
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const label = context.dataset.label || '';
                  const value = context.parsed.y;
                  return `${label}: ${value}`;
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                font: { family: 'Tajawal' }
              }
            },
            x: {
              ticks: {
                font: { family: 'Tajawal' }
              }
            }
          }
        }
      });
      
      console.log('تم تحميل بيانات اتجاه البلاغات بنجاح:', trendData);
    } else {
      console.warn('الـ API لم يرجع بيانات صحيحة:', result);
      throw new Error('الـ API لم يرجع بيانات صحيحة');
    }
  } catch (error) {
    console.error('خطأ في تحميل بيانات اتجاه البلاغات:', error);
    console.log('استخدام بيانات وهمية كبديل...');
    
    // تدمير الـ chart السابق إذا كان موجوداً
    destroyChart(reportsChart);
    destroyChartByCanvasId('reportsChart');
    
    // في حالة الخطأ، استخدم بيانات وهمية كبديل
    const lang = localStorage.getItem("siteLanguage") || currentLang || 'ar';
    const monthNamesAr = ['أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر','يناير'];
    const monthNamesEn = ['August','September','October','November','December','January'];
    const fallbackLabels = lang === 'en' ? monthNamesEn : monthNamesAr;
    
    const t = (key) => {
      try {
        if (window.reportsI18n && window.reportsI18n.t) {
          return window.reportsI18n.t(key);
        }
        const fallback = {
          'chart-new-reports': 'البلاغات الجديدة',
          'chart-closed-reports': 'البلاغات المغلقة'
        };
        return fallback[key] || key;
      } catch (e) {
        return key;
      }
    };
    
    reportsChart = new Chart(reportsCtx.getContext('2d'), {
      type: 'line',
      data: {
        labels: fallbackLabels,
        datasets: [
          {
            label: t('chart-new-reports'),
            data: [1200,1350,1100,1400,1250,1500],
            borderColor: '#004A9F',
            backgroundColor: 'rgba(0,74,159,.1)',
            tension: .4,
            fill: true
          },
          {
            label: t('chart-closed-reports'),
            data: [1100,1250,1050,1300,1200,1400],
            borderColor: '#0FA47A',
            backgroundColor: 'rgba(15,164,122,.1)',
            tension: .4,
            fill: true
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: {
              font: { family: 'Tajawal' }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    });
  }
}

// جلب بيانات حالات البلاغات من جدول complaints و complaint_statuses
async function createStatusChart() {
  const statusCtx = document.getElementById('statusChart');
  if (!statusCtx) return;

  // تدمير المخطط السابق إذا كان موجوداً
  destroyChart(statusChart);
  // استخدم عنصر الـ canvas مباشرة لضمان التدمير الصحيح
  destroyChartByCanvasId(statusCtx);

  try {
    const API_BASE = location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? 'http://localhost:3001' : '';
    
    // إضافة فلتر المستشفى إذا لم يكن مدير تجمع
    let url = `${API_BASE}/api/dashboard/total/complaint-statuses`;
    if (currentUser && !isClusterManager && userHospitalId) {
      url += `?hospitalId=${userHospitalId}`;
    }
    
    console.log('محاولة جلب بيانات حالات البلاغات من:', url);
    
    const response = await fetch(url, { headers: authHeaders() });
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`الـ endpoint غير موجود (404). تأكد من تشغيل الـ server على المنفذ 3001`);
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    if (result.success && result.data) {
      // تدمير الـ chart السابق إذا كان موجوداً
      destroyChart(statusChart);
      destroyChartByCanvasId('statusChart');
      
      // تحضير البيانات للرسم البياني
      const statusData = result.data;
      const lang = localStorage.getItem("siteLanguage") || currentLang || 'ar';
      const labels = statusData.map(item => {
        return lang === 'en' 
          ? (item.LabelEn || item.LabelAr || item.Label || item.statusName || 'Not specified')
          : (item.LabelAr || item.Label || item.statusName || 'غير محدد');
      });
      const data = statusData.map(item => item.count);
      const colors = ['#0FA47A', '#F59E0B', '#3B82F6', '#EF4444', '#8B5CF6']; // ألوان متنوعة
      
      statusChart = new Chart(statusCtx.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: labels,
          datasets: [{
            data: data,
            backgroundColor: colors.slice(0, labels.length),
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                font: { family: 'Tajawal' },
                padding: 20
              }
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const label = context.label || '';
                  const value = context.parsed;
                  const total = context.dataset.data.reduce((a, b) => a + b, 0);
                  const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
                  return `${label}: ${value} (${percentage}%)`;
                }
              }
            }
          }
        }
      });
      
      console.log('تم تحميل بيانات حالات البلاغات بنجاح:', statusData);
    } else {
      console.warn('الـ API لم يرجع بيانات صحيحة:', result);
      throw new Error('الـ API لم يرجع بيانات صحيحة');
    }
  } catch (error) {
    console.error('خطأ في تحميل بيانات حالات البلاغات:', error);
    console.log('استخدام بيانات وهمية كبديل...');
    
    // تدمير الـ chart السابق إذا كان موجوداً
    destroyChart(statusChart);
    destroyChartByCanvasId('statusChart');
    
    // في حالة الخطأ، استخدم بيانات وهمية كبديل
    const lang = localStorage.getItem("siteLanguage") || currentLang || 'ar';
    const fallbackLabels = lang === 'en' 
      ? ['Closed', 'Open', 'In Progress']
      : ['مغلقة', 'مفتوحة', 'قيد المعالجة'];
    
    statusChart = new Chart(statusCtx.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: fallbackLabels,
        datasets: [{
          data: [13413, 1834, 892],
          backgroundColor: ['#0FA47A', '#F59E0B', '#3B82F6'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              font: { family: 'Tajawal' },
              padding: 20
            }
          }
        }
      }
    });
  }
}

async function createHospitalChart() {
  const ctx = document.getElementById('hospitalChart');
  if (!ctx) return;

  // تدمير المخطط السابق إذا كان موجوداً
  destroyChart(hospitalChart);
  destroyChartByCanvasId('hospitalChart');

  try {
    // جلب التوكن من localStorage
    const token = localStorage.getItem('token') || localStorage.getItem('authToken') || '';
    
    if (!token) {
      console.warn('⚠️ لا يوجد توكن - استخدام البيانات الافتراضية');
      throw new Error('لا يوجد توكن للمصادقة');
    }
    
    // إضافة فلتر المستشفى إذا لم يكن مدير تجمع
    let url = `${API_BASE}/api/dashboard/total/reports-by-type`;
    if (currentUser && !isClusterManager && userHospitalId) {
      url += `?hospitalId=${userHospitalId}`;
    }
    
    console.log('محاولة جلب بيانات البلاغات حسب النوع من:', url);
    
    // جلب البيانات الحقيقية من API الجديد
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        console.warn('⚠️ التوكن غير صحيح - استخدام البيانات الافتراضية');
        throw new Error('التوكن غير صحيح');
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    if (!result.success) {
      throw new Error('فشل في جلب البيانات');
    }
    
    const hospitalsData = result.data;
    console.log('تم جلب بيانات البلاغات حسب النوع:', hospitalsData);
    
    // تدمير الـ chart السابق إذا كان موجوداً
    destroyChart(hospitalChart);
    destroyChartByCanvasId('hospitalChart');
    
    // تحضير البيانات للرسم البياني
    const lang = localStorage.getItem("siteLanguage") || currentLang || 'ar';
    const labels = hospitalsData.map(hospital => {
      return lang === 'en'
        ? (hospital.hospitalNameEn || hospital.hospitalNameAr || hospital.hospitalName || 'Not specified')
        : (hospital.hospitalNameAr || hospital.hospitalName || 'غير محدد');
    });
    const openData = hospitalsData.map(hospital => hospital.openReports);
    const closedData = hospitalsData.map(hospital => hospital.closedReports);
    const criticalData = hospitalsData.map(hospital => hospital.criticalReports);

    // دالة ترجمة آمنة
    const t = (key) => {
      try {
        if (window.reportsI18n && window.reportsI18n.t) {
          return window.reportsI18n.t(key);
        }
        // Fallback للعربية
        const fallback = {
          'chart-open-reports': 'بلاغات مفتوحة',
          'chart-closed-reports': 'بلاغات مغلقة',
          'chart-critical-reports': 'بلاغات حرجة',
          'chart-hospital-types-title': 'عدد البلاغات حسب نوعها في كل مستشفى'
        };
        return fallback[key] || key;
      } catch (e) {
        console.warn('Translation error:', e);
        return key;
      }
    };
    
    hospitalChart = new Chart(ctx.getContext('2d'), {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: t('chart-open-reports'),
            data: openData,
            backgroundColor: '#3B82F6',
            borderColor: '#2563EB',
            borderWidth: 1
          },
          {
            label: t('chart-closed-reports'),
            data: closedData,
            backgroundColor: '#10B981',
            borderColor: '#059669',
            borderWidth: 1
          },
          {
            label: t('chart-critical-reports'),
            data: criticalData,
            backgroundColor: '#EF4444',
            borderColor: '#DC2626',
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { 
              font: { family: 'Tajawal' },
              padding: 20,
              usePointStyle: true
            }
          },
          title: {
            display: true,
            text: t('chart-hospital-types-title'),
            font: { family: 'Tajawal', size: 18 },
            color: '#002B5B',
            padding: { bottom: 20 }
          }
        },
        scales: {
          x: { 
            ticks: { 
              font: { family: 'Tajawal' },
              maxRotation: 45,
              minRotation: 45
            }
          },
          y: { 
            beginAtZero: true,
            ticks: {
              font: { family: 'Tajawal' }
            }
          }
        },
        interaction: {
          intersect: false,
          mode: 'index'
        }
      }
    });
  } catch (error) {
    console.error('خطأ في تحميل بيانات الرسم البياني للمستشفيات:', error);
    
    // إضافة رسالة توضيحية للمستخدم
    if (error.message.includes('توكن') || error.message.includes('مصادقة')) {
      const messageEl = document.createElement('div');
      messageEl.className = 'alert alert-warning mt-3';
      messageEl.innerHTML = `
        <i class="bi bi-exclamation-triangle me-2"></i>
        <strong>تنبيه:</strong> يرجى تسجيل الدخول لعرض البيانات الحقيقية. 
        البيانات المعروضة حالياً هي بيانات افتراضية.
      `;
      
      const mainContent = document.querySelector('.container-fluid') || document.body;
      if (mainContent && !document.querySelector('.alert-warning')) {
        mainContent.insertBefore(messageEl, mainContent.firstChild);
      }
    }
    
    // fallback: استخدام البيانات الافتراضية
    const fallbackData = [
      { hospitalName: 'مستشفى الملك عبدالعزيز', openReports: 3, closedReports: 3, criticalReports: 0 },
      { hospitalName: 'مستشفى الملك عبدالله', openReports: 8, closedReports: 8, criticalReports: 0 }
    ];
    
    const labels = fallbackData.map(hospital => hospital.hospitalName);
    const openData = fallbackData.map(hospital => hospital.openReports);
    const closedData = fallbackData.map(hospital => hospital.closedReports);
    const criticalData = fallbackData.map(hospital => hospital.criticalReports);
    
    hospitalChart = new Chart(ctx.getContext('2d'), {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'بلاغات مفتوحة',
            data: openData,
            backgroundColor: '#3B82F6',
            borderColor: '#2563EB',
            borderWidth: 1
          },
          {
            label: 'بلاغات مغلقة',
            data: closedData,
            backgroundColor: '#10B981',
            borderColor: '#059669',
            borderWidth: 1
          },
          {
            label: 'بلاغات حرجة',
            data: criticalData,
            backgroundColor: '#EF4444',
            borderColor: '#DC2626',
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { 
              font: { family: 'Tajawal' },
              padding: 20,
              usePointStyle: true
            }
          },
          title: {
            display: true,
            text: 'عدد البلاغات حسب نوعها في كل مستشفى (بيانات افتراضية)',
            font: { family: 'Tajawal', size: 16 },
            color: '#002B5B'
          }
        },
        scales: {
          x: {
            ticks: {
              font: { family: 'Tajawal' }
            }
          },
          y: { 
            beginAtZero: true,
            ticks: {
              font: { family: 'Tajawal' }
            }
          }
        },
        interaction: {
          intersect: false,
          mode: 'index'
        }
      }
    });
  }
}

async function createCriticalRatioChart() {
  const ctx = document.getElementById('criticalRatioChart');
  if (!ctx) return;

  // تدمير المخطط السابق إذا كان موجوداً
  destroyChartByCanvasId('criticalRatioChart');

  try {
    // جلب التوكن من localStorage
    const token = localStorage.getItem('token') || localStorage.getItem('authToken') || '';
    
    if (!token) {
      console.warn('⚠️ لا يوجد توكن - استخدام البيانات الافتراضية');
      throw new Error('لا يوجد توكن للمصادقة');
    }
    
    // إضافة فلتر المستشفى إذا لم يكن مدير تجمع
    let url = `${API_BASE}/api/dashboard/total/critical-ratio`;
    if (currentUser && !isClusterManager && userHospitalId) {
      url += `?hospitalId=${userHospitalId}`;
    }
    console.log('محاولة جلب بيانات نسبة البلاغات الحرجة من:', url);
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        console.warn('⚠️ التوكن غير صحيح - استخدام البيانات الافتراضية');
        throw new Error('التوكن غير صحيح');
      }
      if (response.status === 404) {
        throw new Error(`الـ endpoint غير موجود (404). تأكد من تشغيل الـ server على المنفذ 3001`);
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    if (result.success && result.data) {
      // تدمير الـ chart السابق إذا كان موجوداً
      destroyChart(criticalRatioChart);
      destroyChartByCanvasId('criticalRatioChart');
      
      // تحضير البيانات للرسم البياني
      const criticalData = result.data;
      const lang = localStorage.getItem("siteLanguage") || currentLang || 'ar';
      const labels = criticalData.map(item => {
        return lang === 'en'
          ? (item.hospitalNameEn || item.hospitalNameAr || item.hospitalName || 'Not specified')
          : (item.hospitalNameAr || item.hospitalName || 'غير محدد');
      });
      const data = criticalData.map(item => item.criticalRatio);
      const colors = [
        'rgba(239,68,68,0.8)',
        'rgba(251,146,60,0.8)',
        'rgba(250,204,21,0.8)',
        'rgba(34,197,94,0.8)',
        'rgba(16,185,129,0.8)'
      ];
      
      // دالة ترجمة آمنة
      const t = (key) => {
        try {
          if (window.reportsI18n && window.reportsI18n.t) {
            return window.reportsI18n.t(key);
          }
          // Fallback للعربية
          const fallback = {
            'chart-critical-ratio-label': 'نسبة البلاغات الحرجة (%)',
            'chart-critical-ratio-title': 'المستشفيات ذات النسبة الأعلى من البلاغات الحرجة'
          };
          return fallback[key] || key;
        } catch (e) {
          console.warn('Translation error:', e);
          return key;
        }
      };
      
      criticalRatioChart = new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: t('chart-critical-ratio-label'),
            data: data,
            backgroundColor: colors.slice(0, labels.length),
            borderRadius: 8,
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            title: {
              display: true,
              text: t('chart-critical-ratio-title'),
              font: { family: 'Tajawal', size: 16 },
              color: '#002B5B'
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const value = context.parsed.x;
                  return ` ${value}% من البلاغات حرجة `;
                }
              }
            }
          },
          scales: {
            x: { 
              beginAtZero: true, 
              max: 30, 
              ticks: { stepSize: 5 },
              title: {
                display: true,
                text: 'النسبة المئوية (%)',
                font: { family: 'Tajawal' }
              }
            },
            y: { 
              ticks: { font: { family: 'Tajawal' } }
            }
          }
        }
      });
      
      console.log('تم تحميل بيانات نسبة البلاغات الحرجة بنجاح:', criticalData);
    } else {
      console.warn('الـ API لم يرجع بيانات صحيحة:', result);
      throw new Error('الـ API لم يرجع بيانات صحيحة');
    }
  } catch (error) {
    console.error('خطأ في تحميل بيانات نسبة البلاغات الحرجة:', error);
    
    // إضافة رسالة تحذيرية إذا كان الخطأ متعلق بالمصادقة
    if (error.message.includes('توكن') || error.message.includes('مصادقة')) {
      const messageEl = document.createElement('div');
      messageEl.className = 'alert alert-warning mt-3';
      messageEl.innerHTML = `
        <i class="bi bi-exclamation-triangle me-2"></i>
        <strong>تنبيه:</strong> يرجى تسجيل الدخول لعرض البيانات الحقيقية. 
        البيانات المعروضة حالياً هي بيانات افتراضية.
      `;
      const mainContent = document.querySelector('.container-fluid') || document.body;
      if (mainContent && !document.querySelector('.alert-warning')) {
        mainContent.insertBefore(messageEl, mainContent.firstChild);
      }
    }
    
    console.log('استخدام بيانات وهمية كبديل...');
    
    // تدمير الـ chart السابق إذا كان موجوداً
    destroyChart(criticalRatioChart);
    destroyChartByCanvasId('criticalRatioChart');
    
    // في حالة الخطأ، استخدم بيانات وهمية كبديل
    criticalRatioChart = new Chart(ctx.getContext('2d'), {
      type: 'bar',
      data: {
        labels: ['الملك عبدالعزيز', 'النور التخصصي', 'الهدى العام', 'العزيزية', 'الشرائع'],
        datasets: [{
          label: 'نسبة البلاغات الحرجة (%)',
          data: [25, 18, 9, 7, 4],
          backgroundColor: [
            'rgba(239,68,68,0.8)',
            'rgba(251,146,60,0.8)',
            'rgba(250,204,21,0.8)',
            'rgba(34,197,94,0.8)',
            'rgba(16,185,129,0.8)'
          ],
          borderRadius: 8,
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: 'المستشفيات ذات النسبة الأعلى من البلاغات الحرجة',
            font: { family: 'Tajawal', size: 16 },
            color: '#002B5B'
          },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.parsed.x}% من البلاغات حرجة `
            }
          }
        },
        scales: {
          x: { beginAtZero: true, max: 30, ticks: { stepSize: 5 } },
          y: { ticks: { font: { family: 'Tajawal' } } }
        }
      }
    });
  }
}

// نفس أسماء المستشفيات المستخدمة في hospitalChart للحفاظ على الاتساق
const funnelStages = ['تم التقديم','تم الإسناد','قيد المعالجة','بانتظار رد','مغلق'];

const funnelDataByHospital = {
  'مستشفى الملك فيصل التخصصي': [1600, 1450, 1200, 950, 880],
  'مستشفى الملك عبدالعزيز':   [1800, 1600, 1300, 1000, 920],
  'مستشفى النور التخصصي':     [1400, 1250, 1030, 820, 760],
  'مستشفى الهدى العام':       [900,  780,  640,  510,  470],
  'مركز العزيزية':            [600,  520,  430,  330,  300],
  'مركز الشرائع':             [480,  420,  360,  290,  260]
};

async function createHospitalFunnelChart(initialHospital = 'مستشفى الملك عبدالعزيز') {
  const el = document.getElementById('complaintFunnelByHospital');
  if (!el) return;

  // تدمير المخطط السابق إذا كان موجوداً
  destroyChart(hospitalFunnelChart);
  destroyChartByCanvasId('complaintFunnelByHospital');

  const ctx = el.getContext('2d');
  const colors = ['#2563EB', '#3B82F6', '#22C55E', '#10B981', '#059669'];

  try {
    const API_BASE = location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? 'http://localhost:3001' : '';
    
    // إضافة فلتر المستشفى إذا لم يكن مدير تجمع
    let url = `${API_BASE}/api/dashboard/total/funnel-by-hospital`;
    if (currentUser && !isClusterManager && userHospitalId) {
      url += `?hospitalId=${userHospitalId}`;
    }
    
    console.log('محاولة جلب بيانات قمع رحلة البلاغ من:', url);
    
    const response = await fetch(url, { headers: authHeaders() });
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`الـ endpoint غير موجود (404). تأكد من تشغيل الـ server على المنفذ 3001`);
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    if (result.success && result.data) {
      // تدمير الـ chart السابق إذا كان موجوداً
      destroyChart(hospitalFunnelChart);
      destroyChartByCanvasId('complaintFunnelByHospital');
      
      // تحضير البيانات للرسم البياني
      const funnelData = result.data;
      const data = [
        funnelData.submitted || 0,
        funnelData.assigned || 0,
        funnelData.inProgress || 0,
        funnelData.awaitingResponse || 0,
        funnelData.closed || 0
      ];

      hospitalFunnelChart = new Chart(ctx, {
        type: 'funnel',
        data: {
          labels: funnelStages,
          datasets: [{
            label: initialHospital,
            data: data,
            backgroundColor: colors,
            borderColor: 'rgba(255,255,255,0.9)',
            borderWidth: 1.5,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          sort: 'desc',
          gap: 6,
          plugins: {
            legend: { display: false },
            title: {
              display: true,
              text: `رحلة البلاغ — ${initialHospital}`,
              font: { family: 'Tajawal', size: 16 },
              color: '#002B5B',
              padding: { bottom: 10 }
            },
            tooltip: {
              callbacks: {
                // إضافة نسبة التحوّل من المرحلة الحالية للي بعدها
                footer: (items) => {
                  const i = items[0].dataIndex;
                  const arr = hospitalFunnelChart.data.datasets[0].data;
                  if (i === arr.length - 1) return '';
                  const curr = arr[i], next = arr[i+1];
                  const pct = curr ? Math.round((next / curr) * 100) : 0;
                  return `نسبة الانتقال للمرحلة التالية: ${pct}%`;
                }
              }
            }
          },
          funnel: { dynamicSlope: true }
        }
      });
      
      console.log('تم تحميل بيانات قمع رحلة البلاغ بنجاح:', funnelData);
    } else {
      console.warn('الـ API لم يرجع بيانات صحيحة:', result);
      throw new Error('الـ API لم يرجع بيانات صحيحة');
    }
  } catch (error) {
    console.error('خطأ في تحميل بيانات قمع رحلة البلاغ:', error);
    console.log('استخدام بيانات وهمية كبديل...');
    
    // تدمير الـ chart السابق إذا كان موجوداً
    destroyChart(hospitalFunnelChart);
    destroyChartByCanvasId('complaintFunnelByHospital');
    
    // في حالة الخطأ، استخدم بيانات وهمية كبديل
    hospitalFunnelChart = new Chart(ctx, {
      type: 'funnel',
      data: {
        labels: funnelStages,
        datasets: [{
          label: initialHospital,
          data: funnelDataByHospital[initialHospital] || [],
          backgroundColor: colors,
          borderColor: 'rgba(255,255,255,0.9)',
          borderWidth: 1.5,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        sort: 'desc',
        gap: 6,
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: `رحلة البلاغ — ${initialHospital}`,
            font: { family: 'Tajawal', size: 16 },
            color: '#002B5B',
            padding: { bottom: 10 }
          },
          tooltip: {
            callbacks: {
              // إضافة نسبة التحوّل من المرحلة الحالية للي بعدها
              footer: (items) => {
                const i = items[0].dataIndex;
                const arr = hospitalFunnelChart.data.datasets[0].data;
                if (i === arr.length - 1) return '';
                const curr = arr[i], next = arr[i+1];
                const pct = curr ? Math.round((next / curr) * 100) : 0;
                return `نسبة الانتقال للمرحلة التالية: ${pct}%`;
              }
            }
          }
        },
        funnel: { dynamicSlope: true }
      }
    });
  }
}

function updateHospitalFunnelChart(hospitalName) {
  if (!hospitalFunnelChart) return;
  const ds = hospitalFunnelChart.data.datasets[0];
  ds.label = hospitalName;
  ds.data = funnelDataByHospital[hospitalName] || [];

  hospitalFunnelChart.options.plugins.title.text = `رحلة البلاغ — ${hospitalName}`;
  hospitalFunnelChart.update();
}

// لوائح الأقسام + بيانات تجريبية لكل مستشفى
const departments = ['الطوارئ','العيادات','الأشعة','المختبر','التنويم','خدمات المرضى'];

const boxplotDataByHospital = {
  'مستشفى الملك فيصل التخصصي': [
    {min:1, q1:2, median:4, q3:7,  max:12, outliers:[15]},
    {min:2, q1:3, median:5, q3:8,  max:13},
    {min:1, q1:2, median:3, q3:6,  max:10, outliers:[14,18]},
    {min:2, q1:3, median:4, q3:7,  max:11},
    {min:3, q1:4, median:6, q3:9,  max:14, outliers:[20]},
    {min:1, q1:2, median:3, q3:5,  max:8}
  ],
  'مستشفى الملك عبدالعزيز': [
    {min:1, q1:2, median:3, q3:6,  max:11, outliers:[16]},
    {min:2, q1:3, median:4, q3:7,  max:12},
    {min:1, q1:2, median:3, q3:5,  max:9},
    {min:2, q1:3, median:5, q3:8,  max:13, outliers:[18]},
    {min:3, q1:4, median:6, q3:9,  max:15},
    {min:1, q1:2, median:3, q3:5,  max:8}
  ],
  'مستشفى النور التخصصي': [
    {min:1, q1:2, median:4, q3:7,  max:12},
    {min:2, q1:3, median:5, q3:8,  max:13, outliers:[17]},
    {min:1, q1:2, median:3, q3:5,  max:9},
    {min:2, q1:3, median:4, q3:7,  max:11},
    {min:3, q1:4, median:6, q3:9,  max:14},
    {min:1, q1:2, median:3, q3:5,  max:8, outliers:[11]}
  ],
  'مستشفى الهدى العام': [
    {min:1, q1:2, median:4, q3:6,  max:9},
    {min:2, q1:3, median:4, q3:6,  max:9},
    {min:1, q1:2, median:3, q3:5,  max:8, outliers:[12]},
    {min:2, q1:3, median:4, q3:6,  max:9},
    {min:2, q1:3, median:5, q3:7,  max:10},
    {min:1, q1:2, median:3, q3:4.5,max:7}
  ],
  'مركز العزيزية': [
    {min:1, q1:2, median:3, q3:5,  max:8},
    {min:2, q1:3, median:4, q3:6,  max:9},
    {min:1, q1:2, median:3, q3:4.5,max:7, outliers:[10]},
    {min:2, q1:3, median:4, q3:5.5,max:8},
    {min:2, q1:3, median:4.5,q3:6.5,max:9},
    {min:1, q1:2, median:3, q3:4.5,max:7}
  ],
  'مركز الشرائع': [
    {min:1, q1:2, median:3, q3:5,  max:8},
    {min:2, q1:3, median:4, q3:6,  max:9},
    {min:1, q1:2, median:3, q3:4.5,max:7},
    {min:2, q1:3, median:4, q3:5.5,max:8, outliers:[10,12]},
    {min:2, q1:3, median:4.5,q3:6.5,max:9},
    {min:1, q1:2, median:3, q3:4.5,max:7}
  ]
};


// أقسام موحّدة
const deptLabels = ['الطوارئ','العيادات','الأشعة','المختبر','التنويم','خدمات المرضى','الصيدلية','العناية المركزة'];

// بيانات تجريبية — عدّليها لاحقًا من الـ API
const deptCountsByHospital = {
  'مستشفى الملك فيصل التخصصي': { 'الطوارئ': 620, 'العيادات': 540, 'الأشعة': 310, 'المختبر': 280, 'التنويم': 450, 'خدمات المرضى': 390, 'الصيدلية': 260, 'العناية المركزة': 170 },
  'مستشفى الملك عبدالعزيز':   { 'الطوارئ': 710, 'العيادات': 590, 'الأشعة': 360, 'المختبر': 330, 'التنويم': 520, 'خدمات المرضى': 430, 'الصيدلية': 300, 'العناية المركزة': 220 },
  'مستشفى النور التخصصي':     { 'الطوارئ': 560, 'العيادات': 510, 'الأشعة': 290, 'المختبر': 260, 'التنويم': 470, 'خدمات المرضى': 350, 'الصيدلية': 240, 'العناية المركزة': 180 },
  'مستشفى الهدى العام':       { 'الطوارئ': 320, 'العيادات': 290, 'الأشعة': 180, 'المختبر': 160, 'التنويم': 250, 'خدمات المرضى': 210, 'الصيدلية': 150, 'العناية المركزة': 90 },
  'مركز العزيزية':            { 'الطوارئ': 210, 'العيادات': 190, 'الأشعة': 120, 'المختبر': 110, 'التنويم': 160, 'خدمات المرضى': 140, 'الصيدلية': 100, 'العناية المركزة': 60 },
  'مركز الشرائع':             { 'الطوارئ': 180, 'العيادات': 170, 'الأشعة': 100, 'المختبر': 90,  'التنويم': 140, 'خدمات المرضى': 120, 'الصيدلية': 85,  'العناية المركزة': 55 }
};

// ألوان متدرجة للأشرطة
const barColors = ['#1D4ED8','#2563EB','#3B82F6','#60A5FA','#22C55E','#10B981','#F59E0B','#EF4444'];

function buildSortedDeptData(hospitalName) {
  const obj = deptCountsByHospital[hospitalName] || {};
  const pairs = Object.entries(obj); // [ ['الطوارئ',620], ... ]
  // ترتيب تنازلي حسب العدد
  pairs.sort((a,b) => b[1] - a[1]);
  const labels = pairs.map(p => p[0]);
  const values = pairs.map(p => p[1]);
  return { labels, values };
}

async function createDeptCountChart(hospitalId = null) {
  // إذا لم يتم تحديد hospitalId، استخدم userHospitalId للموظفين ومديري النظام
  if (!hospitalId && !isClusterManager && userHospitalId) {
    hospitalId = userHospitalId;
  } else if (!hospitalId) {
    hospitalId = 1; // قيمة افتراضية
  }
  const el = document.getElementById('deptCountChart');
  if (!el) return;

  try {
    let labels = [], values = [], titleText = '';
    // تجهيز الكاش لو فاضي
    if (!hospitalsCache.length) {
      hospitalsCache = await loadHospitals();
      hospitalsCache.forEach(h => {
        hospitalsById.set(String(h.HospitalID), {
          nameAr: h.HospitalNameAr || h.HospitalName || h.NameAr,
          nameEn: h.HospitalNameEn || h.HospitalName || h.NameEn
        });
      });
    }

    if (hospitalId === 'all') {
      // ✅ نجمع محليًا من كل المستشفيات
      const sumMap = new Map(); // deptName -> totalCount
      const ids = hospitalsCache.map(h => h.HospitalID);

      // نجلب بالتوازي
      const resList = await Promise.allSettled(
        ids.map(id => fetch(`${API_BASE}/api/dashboard/total/dept-count/${id}`))
      );

      for (let i = 0; i < resList.length; i++) {
        const r = resList[i];
        if (r.status === 'fulfilled' && r.value.ok) {
          const j = await r.value.json();
          if (j.success && Array.isArray(j.data)) {
            for (const row of j.data) {
              const name = row.departmentName || row.DepartmentName || row.deptName || 'غير محدد';
              const cnt  = Number(row.complaintCount || row.count || 0);
              sumMap.set(name, (sumMap.get(name) || 0) + cnt);
            }
          }
        }
      }

      // تحويل الـ Map إلى مصفوفات مرتبة تنازليًا
      const pairs = Array.from(sumMap.entries()).sort((a,b) => b[1]-a[1]);
      labels = pairs.map(p => p[0]);
      values = pairs.map(p => p[1]);
      const lang = localStorage.getItem("siteLanguage") || currentLang || 'ar';
      titleText = lang === 'en' 
        ? 'Reports Count by Department — All Hospitals'
        : 'عدد البلاغات لكل قسم — جميع المستشفيات';
    } else {
      // ✅ وضع مستشفى واحد
      const response = await fetch(`${API_BASE}/api/dashboard/total/dept-count/${hospitalId}`);
      if (!response.ok) throw new Error('فشل في الاتصال بالخادم');
      const result = await response.json();
      if (!result.success) throw new Error('فشل في جلب البيانات');

      const deptData = result.data;
      labels = deptData.map(item => item.departmentName);
      values = deptData.map(item => item.complaintCount);

      const lang = localStorage.getItem("siteLanguage") || currentLang || 'ar';
      const hospitalInfo = hospitalsById.get(String(hospitalId));
      const hospitalName = hospitalInfo
        ? (lang === 'en' ? hospitalInfo.nameEn : hospitalInfo.nameAr) || hospitalInfo.nameAr
        : (lang === 'en' ? 'Hospital not specified' : 'مستشفى غير محدد');
      titleText = lang === 'en' 
        ? `Reports Count by Department — ${hospitalName}`
        : `عدد البلاغات لكل قسم — ${hospitalName}`;
    }

    // تدمير الـ chart السابق إذا كان موجوداً
    destroyChart(deptCountChart);
    destroyChartByCanvasId('deptCountChart');

    // دالة ترجمة آمنة
    const t = (key) => {
      try {
        if (window.reportsI18n && window.reportsI18n.t) {
          return window.reportsI18n.t(key);
        }
        const fallback = {
          'chart-complaints-count': 'عدد البلاغات'
        };
        return fallback[key] || key;
      } catch (e) {
        return key;
      }
    };
    
    deptCountChart = new Chart(el.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: t('chart-complaints-count'),
          data: values,
          backgroundColor: labels.map((_, i) => barColors[i % barColors.length]),
          borderColor: '#fff',
          borderWidth: 1,
          borderRadius: 8,
          barThickness: 24,
          maxBarThickness: 28
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: titleText,
            font: { family: 'Tajawal', size: 16 },
            color: '#002B5B',
            padding: { bottom: 10 }
          }
        },
        scales: {
          x: { beginAtZero: true, ticks: { stepSize: 50 }, grid: { color: 'rgba(0,0,0,0.05)' } },
          y: { ticks: { font: { family: 'Tajawal' } }, grid: { display: false } }
        },
        animation: { duration: 600 }
      }
    });

  } catch (error) {
    console.error('خطأ في إنشاء رسم عدد البلاغات لكل قسم:', error);
    // fallback السابق كما هو...
    const { labels, values } = buildSortedDeptData('مستشفى الملك عبدالعزيز');
    // تدمير الـ chart السابق إذا كان موجوداً
    destroyChart(deptCountChart);
    destroyChartByCanvasId('deptCountChart');
    const t = (key) => {
      try {
        if (window.reportsI18n && window.reportsI18n.t) {
          return window.reportsI18n.t(key);
        }
        const fallback = {
          'chart-complaints-count': 'عدد البلاغات'
        };
        return fallback[key] || key;
      } catch (e) {
        return key;
      }
    };
    
    deptCountChart = new Chart(el.getContext('2d'), {
      type: 'bar',
      data: { labels, datasets: [{ label: t('chart-complaints-count'), data: values, backgroundColor: labels.map((_, i) => barColors[i % barColors.length]), borderColor:'#fff', borderWidth:1, borderRadius:8, barThickness:24, maxBarThickness:28 }]},
      options: { indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, title:{ display:true, text:'عدد البلاغات لكل قسم — مستشفى الملك عبدالعزيز (بيانات افتراضية)', font:{family:'Tajawal', size:16}, color:'#002B5B', padding:{bottom:10} }}, scales:{ x:{ beginAtZero:true, ticks:{stepSize:50}, grid:{color:'rgba(0,0,0,0.05)'} }, y:{ ticks:{ font:{family:'Tajawal'} }, grid:{display:false} } }, animation:{duration:600} }
    });
  }
}

async function updateDeptCountChart(hospitalId) {
  await createDeptCountChart(hospitalId);
}

// ========== أكثر الموظفين تكرّرًا في البلاغات ==========

// بيانات نموذجية — استبدلي لاحقًا ببيانات من الـ API (EmployeeID موحّد لتفادي تكرار الأسماء).
// الصيغة: لكل مستشفى مصفوفة عناصر { id, name, dept, count }
const employeesByHospital = {
  'مستشفى الملك فيصل التخصصي': [
    { id: 11, name: 'أحمد الزهراني',  dept: 'الطوارئ',       count: 92 },
    { id: 12, name: 'سارة العتيبي',   dept: 'العيادات',      count: 85 },
    { id: 13, name: 'ماهر بخش',       dept: 'الأشعة',        count: 70 },
    { id: 14, name: 'نورة الشهري',    dept: 'خدمات المرضى',  count: 66 },
    { id: 15, name: 'محمد الثقفي',    dept: 'التنويم',       count: 60 },
    { id: 16, name: 'هند العوفي',     dept: 'المختبر',       count: 54 },
    { id: 17, name: 'عبدالله الغامدي',dept: 'الصيدلية',      count: 48 },
    { id: 18, name: 'إيمان باحمدين',  dept: 'العناية المركزة', count: 41 },
    { id: 19, name: 'خالد الشريف',    dept: 'الأشعة',        count: 39 }
  ],
  'مستشفى الملك عبدالعزيز': [
    { id: 21, name: 'عبدالرحمن المطيري', dept: 'الطوارئ',      count: 110 },
    { id: 22, name: 'ريم الحربي',       dept: 'العيادات',     count: 95 },
    { id: 23, name: 'خالد باوزير',      dept: 'خدمات المرضى', count: 88 },
    { id: 24, name: 'وجدان السلمي',     dept: 'الأشعة',       count: 76 },
    { id: 25, name: 'علي القرني',       dept: 'التنويم',      count: 73 },
    { id: 26, name: 'أثير الجهني',      dept: 'المختبر',      count: 66 },
    { id: 27, name: 'منال الزبيدي',     dept: 'الصيدلية',     count: 59 },
    { id: 28, name: 'نواف المالكي',     dept: 'العناية المركزة', count: 52 },
    { id: 29, name: 'أروى البلوي',      dept: 'العيادات',     count: 47 }
  ],
  'مستشفى النور التخصصي': [
    { id: 31, name: 'سلمان الحربي',  dept: 'الطوارئ',   count: 90 },
    { id: 32, name: 'روان بخاري',    dept: 'العيادات',  count: 78 },
    { id: 33, name: 'عبدالله الشهري',dept: 'التنويم',   count: 72 },
    { id: 34, name: 'أحمد بخيت',     dept: 'الأشعة',    count: 65 },
    { id: 35, name: 'سارة العمري',   dept: 'المختبر',   count: 58 },
    { id: 36, name: 'نوال الزهراني', dept: 'خدمات المرضى', count: 53 }
  ],
  'مستشفى الهدى العام': [
    { id: 41, name: 'نايف الثقفي',   dept: 'الطوارئ',   count: 55 },
    { id: 42, name: 'شيماء العجمي',  dept: 'العيادات',  count: 49 },
    { id: 43, name: 'مها الزهراني',  dept: 'الأشعة',    count: 41 },
    { id: 44, name: 'أحمد العتيبي',  dept: 'التنويم',   count: 38 }
  ],
  'مركز العزيزية': [
    { id: 51, name: 'هناء باوزير',   dept: 'العيادات',  count: 34 },
    { id: 52, name: 'قصي فلمبان',    dept: 'الطوارئ',   count: 31 },
    { id: 53, name: 'وليد المولد',   dept: 'المختبر',   count: 27 },
    { id: 54, name: 'جنى الزهراني',  dept: 'الأشعة',    count: 25 }
  ],
  'مركز الشرائع': [
    { id: 61, name: 'سيف الحربي',    dept: 'الطوارئ',   count: 28 },
    { id: 62, name: 'ليان العتيبي',  dept: 'العيادات',  count: 26 },
    { id: 63, name: 'مازن القرشي',   dept: 'خدمات المرضى', count: 22 }
  ]
};

// ألوان متناسقة
const empBarColors = ['#1D4ED8','#2563EB','#3B82F6','#60A5FA','#22C55E','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899'];

function buildTopEmployees(hospitalName, topN = 8) {
  const arr = (employeesByHospital[hospitalName] || []).slice();
  // ترتيب تنازلي حسب count
  arr.sort((a, b) => b.count - a.count);
  const sliced = arr.slice(0, topN);
  const labels = sliced.map(e => `${e.name} — ${e.dept}`);
  const values = sliced.map(e => e.count);
  const total = arr.reduce((s, e) => s + e.count, 0) || 1;
  const pct = sliced.map(v => Math.round((v / total) * 100));
  return { labels, values, pct };
}

async function createTopEmployeesChart(hospitalId = null, topN = 8) {
  // إذا لم يتم تحديد hospitalId، استخدم userHospitalId للموظفين ومديري النظام
  if (!hospitalId && !isClusterManager && userHospitalId) {
    hospitalId = userHospitalId;
  } else if (!hospitalId) {
    hospitalId = 1; // قيمة افتراضية
  }
  const el = document.getElementById('topEmployeesChart');
  if (!el) return;

  // تدمير المخطط السابق إذا كان موجوداً
  destroyChart(topEmployeesChart);
  destroyChartByCanvasId('topEmployeesChart');

  try {
    // تجهيز الكاش لو فاضي
    if (!hospitalsCache.length) {
      hospitalsCache = await loadHospitals();
      hospitalsCache.forEach(h => {
        hospitalsById.set(String(h.HospitalID), {
          nameAr: h.HospitalNameAr || h.HospitalName || h.NameAr,
          nameEn: h.HospitalNameEn || h.HospitalName || h.NameEn
        });
      });
    }

    let labels = [], values = [], titleText = '';
    if (hospitalId === 'all') {
      // ✅ دمج محلي لكل المستشفيات
      const agg = new Map(); // key -> {count}
      const ids = hospitalsCache.map(h => h.HospitalID);

      const resList = await Promise.allSettled(
        ids.map(id => fetch(`${API_BASE}/api/dashboard/total/top-employees/${id}?top=${topN}`, {
          headers: authHeaders()
        }))
      );

      for (const r of resList) {
        if (r.status === 'fulfilled' && r.value.ok) {
          const j = await r.value.json();
          if (j.success && Array.isArray(j.data)) {
            for (const row of j.data) {
              const name = row.displayName || row.name || '—';
              const dept = row.departmentName || row.dept || '';
              const key  = dept ? `${name} — ${dept}` : name;
              const cnt  = Number(row.complaintCount || row.count || 0);
              agg.set(key, (agg.get(key) || 0) + cnt);
            }
          }
        }
      }

      // ترتيب وأخذ Top N النهائي بعد الدمج
      const pairs = Array.from(agg.entries()).sort((a,b) => b[1]-a[1]).slice(0, topN);
      labels = pairs.map(p => p[0]);
      values = pairs.map(p => p[1]);
      const lang = localStorage.getItem("siteLanguage") || currentLang || 'ar';
      titleText = lang === 'en'
        ? 'Most Frequent Employees in Reports — All Hospitals'
        : 'أكثر الموظفين تكرّرًا في البلاغات — جميع المستشفيات';
    } else {
      // ✅ وضع مستشفى واحد
      const response = await fetch(`${API_BASE}/api/dashboard/total/top-employees/${hospitalId}?top=${topN}`, {
        headers: authHeaders()
      });
      if (!response.ok) throw new Error('فشل في الاتصال بالخادم');
      const result = await response.json();
      if (!result.success) throw new Error('فشل في جلب البيانات');

      const employeeData = result.data;
      labels = employeeData.map(item => item.displayName);
      values = employeeData.map(item => item.complaintCount);

      const lang = localStorage.getItem("siteLanguage") || currentLang || 'ar';
      const hospitalInfo = hospitalsById.get(String(hospitalId));
      const hospitalName = hospitalInfo
        ? (lang === 'en' ? hospitalInfo.nameEn : hospitalInfo.nameAr) || hospitalInfo.nameAr
        : (lang === 'en' ? 'Hospital not specified' : 'مستشفى غير محدد');
      titleText = lang === 'en'
        ? `Most Frequent Employees in Reports — ${hospitalName}`
        : `أكثر الموظفين تكرّرًا في البلاغات — ${hospitalName}`;
    }

    // تدمير الـ chart السابق إذا كان موجوداً
    destroyChart(topEmployeesChart);
    destroyChartByCanvasId('topEmployeesChart');

    // دالة ترجمة آمنة
    const t = (key) => {
      try {
        if (window.reportsI18n && window.reportsI18n.t) {
          return window.reportsI18n.t(key);
        }
        const fallback = {
          'chart-complaints-count': 'عدد البلاغات',
          'chart-complaint-singular': 'بلاغ'
        };
        return fallback[key] || key;
      } catch (e) {
        return key;
      }
    };
    
    topEmployeesChart = new Chart(el.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: t('chart-complaints-count'),
          data: values,
          backgroundColor: labels.map((_, i) => empBarColors[i % empBarColors.length]),
          borderColor: '#fff',
          borderWidth: 1,
          borderRadius: 8,
          barThickness: 24,
          maxBarThickness: 28
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: titleText,
            font: { family: 'Tajawal', size: 16 },
            color: '#002B5B',
            padding: { bottom: 10 }
          },
          tooltip: { 
            callbacks: { 
              label: (ctx) => {
                const lang = localStorage.getItem("siteLanguage") || currentLang || 'ar';
                const complaintText = lang === 'en' ? 'report(s)' : 'بلاغ';
                return ` ${ctx.label} : ${ctx.raw} ${complaintText} `;
              }
            } 
          }
        },
        scales: {
          x: { beginAtZero: true, ticks: { stepSize: 10 }, grid: { color: 'rgba(0,0,0,0.05)' } },
          y: { ticks: { font: { family: 'Tajawal' } }, grid: { display: false } }
        },
        animation: { duration: 600 }
      }
    });

  } catch (error) {
    console.error('خطأ في إنشاء رسم الموظفين الأكثر تكرّرًا:', error);
    // fallback السابق كما هو...
    const { labels, values } = buildTopEmployees('مستشفى الملك عبدالعزيز', topN);
    // تدمير الـ chart السابق إذا كان موجوداً
    destroyChart(topEmployeesChart);
    destroyChartByCanvasId('topEmployeesChart');
    const t = (key) => {
      try {
        if (window.reportsI18n && window.reportsI18n.t) {
          return window.reportsI18n.t(key);
        }
        const fallback = {
          'chart-complaints-count': 'عدد البلاغات'
        };
        return fallback[key] || key;
      } catch (e) {
        return key;
      }
    };
    
    topEmployeesChart = new Chart(el.getContext('2d'), {
      type: 'bar',
      data: { labels, datasets: [{ label: t('chart-complaints-count'), data: values, backgroundColor: labels.map((_, i) => empBarColors[i % empBarColors.length]), borderColor:'#fff', borderWidth:1, borderRadius:8, barThickness:24, maxBarThickness:28 }]},
      options: { indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, title:{ display:true, text:'أكثر الموظفين تكرّرًا في البلاغات — مستشفى الملك عبدالعزيز (بيانات افتراضية)', font:{family:'Tajawal', size:16}, color:'#002B5B', padding:{bottom:10} }}, scales:{ x:{ beginAtZero:true, ticks:{stepSize:10}, grid:{color:'rgba(0,0,0,0.05)'} }, y:{ ticks:{ font:{family:'Tajawal'} }, grid:{display:false} } }, animation:{duration:600} }
    });
  }
}

async function updateTopEmployeesChart(hospitalId, topN) {
  await createTopEmployeesChart(hospitalId, topN);
}

// تطبيق صلاحيات تصدير التقارير (PDF/Excel)
async function applyReportExportPermissions() {
  try {
    const res = await fetch(`${API_BASE}/api/permissions/me`, {
      headers: { 
        'Accept': 'application/json', 
        'Authorization': `Bearer ${localStorage.getItem('token') || localStorage.getItem('authToken')}` 
      },
      credentials: 'include'
    });
    
    if (!res.ok) {
      console.warn('⚠️ فشل تحميل صلاحيات التقارير:', res.status);
      return;
    }
    
    const json = await res.json();
    const p = json.data || {};

    console.log('🔍 الصلاحيات المحملة للتقارير:', {
      reportSummaryExport: p.reportSummaryExport,
      reportDetailsExport: p.reportDetailsExport,
      reportDepartmentsExport: p.reportDepartmentsExport,
      reportEmployeesExport: p.reportEmployeesExport,
      reportCriticalExport: p.reportCriticalExport
    });
    
    document.querySelectorAll('[data-perm]').forEach(el => {
      const key = el.dataset.perm;
      const map = {
        'REPORT_SUMMARY_EXPORT': p.reportSummaryExport,
        'REPORT_DETAILS_EXPORT': p.reportDetailsExport,
        'REPORT_DEPARTMENTS_EXPORT': p.reportDepartmentsExport,
        'REPORT_EMPLOYEES_EXPORT': p.reportEmployeesExport,
        'REPORT_CRITICAL_EXPORT': p.reportCriticalExport
      };
      
      // إذا كانت الصلاحية موجودة في الـ map (للتقارير فقط)
      if (map.hasOwnProperty(key)) {
        const hasPermission = map[key] === true || map[key] === 1 || map[key] === 'true';
        if (hasPermission) {
          // إذا كانت الصلاحية موجودة وصحيحة، عرض العنصر
          el.style.display = '';
          el.style.visibility = 'visible';
          el.removeAttribute('hidden');
          console.log(`✅ عرض التقرير: ${key} (الصلاحية: ${map[key]})`);
        } else {
          // إذا لم تكن الصلاحية موجودة، إخفاء العنصر
          el.style.display = 'none';
          el.setAttribute('hidden', '');
          console.log(`❌ إخفاء التقرير: ${key} (الصلاحية: ${map[key]})`);
        }
      }
      // إذا لم تكن في الـ map (مثل REPORTS_CARD_*)، نتركها كما هي
    });
  } catch (err) {
    console.error('❌ فشل تحميل صلاحيات التقارير:', err);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // انتظر تحميل نظام الترجمة
  await new Promise(resolve => {
    if (window.reportsI18n) {
      resolve();
    } else {
      const checkInterval = setInterval(() => {
        if (window.reportsI18n) {
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
  
  try {
    // تدمير جميع الـ charts السابقة قبل البدء
    destroyAllCharts();
    
    // تحميل بيانات المستخدم أولاً
    await loadCurrentUser();
    
    // الاستماع لتغييرات اللغة
    if (window.reportsI18n) {
      window.reportsI18n.onChange = () => {
        // إعادة تحميل البيانات عند تغيير اللغة
        if (hospitalsData.length > 0) {
          // تحديث أسماء المستشفيات في البيانات الموجودة
          const lang = localStorage.getItem("siteLanguage") || currentLang || 'ar';
          hospitalsData = hospitalsData.map(h => ({
            ...h,
            hospitalName: lang === 'en' ? (h.hospitalNameEn || h.hospitalNameAr || h.hospitalName) : (h.hospitalNameAr || h.hospitalName)
          }));
          // إعادة عرض الجدول والرسوم البيانية
          renderSummaryTable();
          // إعادة إنشاء الرسوم البيانية مع الترجمة الجديدة
          if (hospitalChart) {
            createHospitalChart();
          }
          if (criticalRatioChart) {
            createCriticalRatioChart();
          }
        }
      };
    }
    
    // تطبيق صلاحيات تصدير التقارير
    await applyReportExportPermissions();
    
    await createMainCharts();
    await createHospitalChart();
    await createCriticalRatioChart();

    // 1) حمّل المستشفيات واملأ القوائم
    const hospitals = await loadHospitals();
    // إذا لم يكن مدير تجمع، استخدم userHospitalId كافتراضي
    const defaultId = (isClusterManager || !userHospitalId) ? 'all' : String(userHospitalId);
    const funnelSel  = document.getElementById('funnelHospital');
    const deptSel    = document.getElementById('deptCountHospital');
    const empSel     = document.getElementById('topEmployeesHospital');

    if (funnelSel) fillHospitalSelect(funnelSel, hospitals, defaultId);
    if (deptSel)   fillHospitalSelect(deptSel, hospitals, defaultId);
    if (empSel)    fillHospitalSelect(empSel, hospitals, defaultId);
    
    // ملء قوائم المستشفيات في قسم التصدير
    const detailHospitalSel = document.getElementById('detailHospital');
    const deptReportHospitalSel = document.getElementById('deptReportHospital');
    const empReportHospitalSel = document.getElementById('empReportHospital');
    const criticalHospitalSel = document.getElementById('criticalHospital');
    
    // تحديد صلاحيات المستخدم
    const isCM = isClusterManager; // استخدام المتغير العام
    const userHospId = userHospitalId; // استخدام المتغير العام
    
    // ملء القوائم حسب نوع المستخدم
    if (isCM) {
      // مدير التجمع: يظهر جميع المستشفيات مع خيار "الكل"
      if (detailHospitalSel) fillHospitalSelect(detailHospitalSel, hospitals, defaultId);
      if (deptReportHospitalSel) fillHospitalSelect(deptReportHospitalSel, hospitals, defaultId);
      if (empReportHospitalSel) fillHospitalSelect(empReportHospitalSel, hospitals, defaultId);
      if (criticalHospitalSel) fillHospitalSelect(criticalHospitalSel, hospitals, defaultId);
    } else {
      // موظف عادي: يظهر فقط مستشفاه (بدون قائمة منسدلة، أو قائمة مع خيار واحد)
      const userHospital = hospitals.find(h => Number(h.HospitalID) === Number(userHospId));
      if (userHospital) {
        // ملء القوائم بمستشفى واحد فقط (بدون خيار "الكل")
        const lang = localStorage.getItem("siteLanguage") || currentLang || 'ar';
        const hospitalName = lang === 'en'
          ? (userHospital.HospitalNameEn || userHospital.HospitalNameAr || userHospital.HospitalName)
          : (userHospital.HospitalNameAr || userHospital.HospitalName);
        
        if (detailHospitalSel) {
          detailHospitalSel.innerHTML = '';
          const opt = document.createElement('option');
          opt.value = String(userHospital.HospitalID);
          opt.textContent = hospitalName;
          opt.selected = true;
          detailHospitalSel.appendChild(opt);
          detailHospitalSel.disabled = true; // تعطيل القائمة
        }
        if (deptReportHospitalSel) {
          deptReportHospitalSel.innerHTML = '';
          const opt = document.createElement('option');
          opt.value = String(userHospital.HospitalID);
          opt.textContent = hospitalName;
          opt.selected = true;
          deptReportHospitalSel.appendChild(opt);
          deptReportHospitalSel.disabled = true;
        }
        if (empReportHospitalSel) {
          empReportHospitalSel.innerHTML = '';
          const opt = document.createElement('option');
          opt.value = String(userHospital.HospitalID);
          opt.textContent = hospitalName;
          opt.selected = true;
          empReportHospitalSel.appendChild(opt);
          empReportHospitalSel.disabled = true;
        }
        if (criticalHospitalSel) {
          criticalHospitalSel.innerHTML = '';
          const opt = document.createElement('option');
          opt.value = String(userHospital.HospitalID);
          opt.textContent = hospitalName;
          opt.selected = true;
          criticalHospitalSel.appendChild(opt);
          criticalHospitalSel.disabled = true;
        }
      }
    }

    // تطبيق قيود الواجهة حسب صلاحيات المستخدم
    applyUserPermissions();

    // 2) ارسم القمع للمستشفى الافتراضي
    if (defaultId === 'all') {
      // إذا اختار "الكل"، اعرض قمع عام لجميع المستشفيات
      await createHospitalFunnelChart();
    } else if (defaultId) {
      await createHospitalFunnelChartById(defaultId);
    } else {
      // fallback: استخدم القمع القديم إذا لم توجد مستشفيات
      await createHospitalFunnelChart();
    }

    // 3) اربطي تغييرات القوائم
    if (funnelSel) {
      funnelSel.addEventListener('change', (e) => {
        const id = e.target.value;
        if (id === 'all') {
          createHospitalFunnelChart(); // عرض جميع المستشفيات
        } else {
          updateHospitalFunnelChartById(id);
        }
      });
    }

    // إنشاء باقي الرسوم البيانية
    if (defaultId === 'all') {
      // إذا اختار "الكل"، اعرض رسوم عامة لجميع المستشفيات
      createDeptCountChart('all');
      createTopEmployeesChart('all', 8);
    } else if (defaultId) {
      await createDeptCountChart(defaultId);
      await createTopEmployeesChart(defaultId, 8);
    } else {
      createDeptCountChart();
      createTopEmployeesChart();
    }
    
  } catch (error) {
    console.error('خطأ في تحميل التقارير:', error);
    // fallback: إنشاء الرسوم بالطريقة القديمة
    await createMainCharts();
    await createHospitalChart();
    await createCriticalRatioChart();
    await createHospitalFunnelChart();
    createDeptCountChart();
    createTopEmployeesChart();
  }


  const deptSel = document.getElementById('deptCountHospital');
  if (deptSel) {
    deptSel.addEventListener('change', (e) => {
      const hospitalId = e.target.value;
      if (hospitalId === 'all') {
        createDeptCountChart('all'); // عرض جميع المستشفيات
      } else {
        updateDeptCountChart(hospitalId);
      }
    });
  }

  // ربط مُبدّل الموظفين
  const empSel = document.getElementById('topEmployeesHospital');
  const topNSel = document.getElementById('topEmployeesCount');
  const triggerUpdate = () => {
    const hospitalId = empSel ? empSel.value : 'all';
    const n = topNSel ? Number(topNSel.value) : 8;
    if (hospitalId === 'all') {
      createTopEmployeesChart('all', n); // عرض جميع المستشفيات
    } else {
      updateTopEmployeesChart(hospitalId, n);
    }
  };
  if (empSel) empSel.addEventListener('change', triggerUpdate);
  if (topNSel) topNSel.addEventListener('change', triggerUpdate);
});

// ====== دوال جديدة للمستشفيات ======

// تحميل قائمة المستشفيات وتعبئة كل الـ selects مع تطبيق نظام الصلاحيات
async function loadHospitals() {
  try {
    // جلب بيانات المستخدم من localStorage
    const userData = JSON.parse(localStorage.getItem('userData') || '{}');
    const userRoleId = Number(userData.RoleID || userData.roleId || 0);
    const userHospitalId = Number(userData.HospitalID || userData.hospitalId || 0);
    
    // التحقق من isClusterManager
    const isCluster = App.isClusterManager();
    
    console.log('🔐 فحص صلاحيات المستخدم:', { userRoleId, userHospitalId, isCluster });
    
    // إذا كان مدير تجمع (RoleID === 1 أو 4)، اجلب جميع المستشفيات
    if (isCluster) {
      console.log('✅ مدير تجمع - جلب جميع المستشفيات');
      const r = await fetch(`${API_BASE}/api/dashboard/total/hospitals`);
      if (!r.ok) {
        console.warn('فشل في جلب المستشفيات من API، استخدام بيانات افتراضية');
        return [
          { HospitalID: 1, HospitalName: 'مستشفى الملك فيصل التخصصي' },
          { HospitalID: 2, HospitalName: 'مستشفى الملك عبدالعزيز' },
          { HospitalID: 3, HospitalName: 'مستشفى النور التخصصي' },
          { HospitalID: 4, HospitalName: 'مستشفى الهدى العام' },
          { HospitalID: 5, HospitalName: 'مركز العزيزية' },
          { HospitalID: 6, HospitalName: 'مركز الشرائع' }
        ];
      }
      const j = await r.json();
      if (!j.success) throw new Error('تعذر تحميل المستشفيات');
      return j.data; // [{HospitalID, HospitalName}, ...]
    } 
    // إذا كان موظف عادي، اجلب فقط مستشفاه
    else if (userHospitalId > 0) {
      console.log('👤 موظف عادي - جلب مستشفى واحد فقط:', userHospitalId);
      const r = await fetch(`${API_BASE}/api/dashboard/total/hospitals`);
      if (!r.ok) {
        console.warn('فشل في جلب المستشفيات من API، استخدام بيانات افتراضية');
        return [
          { HospitalID: userHospitalId, HospitalName: `مستشفى ${userHospitalId}` }
        ];
      }
      const j = await r.json();
      if (!j.success) throw new Error('تعذر تحميل المستشفيات');
      
      // تصفية المستشفيات ليعرض فقط مستشفى المستخدم
      const filteredHospitals = j.data.filter(h => h.HospitalID === userHospitalId);
      console.log('🏥 المستشفيات المتاحة للموظف:', filteredHospitals);
      return filteredHospitals;
    }
    // إذا لم توجد بيانات مستخدم صحيحة
    else {
      console.warn('⚠️ بيانات مستخدم غير صحيحة، استخدام بيانات افتراضية');
      return [
        { HospitalID: 1, HospitalName: 'مستشفى الملك فيصل التخصصي' }
      ];
    }
  } catch (error) {
    console.warn('خطأ في جلب المستشفيات:', error.message);
    // إرجاع بيانات افتراضية
    return [
      { HospitalID: 1, HospitalName: 'مستشفى الملك فيصل التخصصي' },
      { HospitalID: 2, HospitalName: 'مستشفى الملك عبدالعزيز' },
      { HospitalID: 3, HospitalName: 'مستشفى النور التخصصي' },
      { HospitalID: 4, HospitalName: 'مستشفى الهدى العام' },
      { HospitalID: 5, HospitalName: 'مركز العزيزية' },
      { HospitalID: 6, HospitalName: 'مركز الشرائع' }
    ];
  }
}

function fillHospitalSelect(selectEl, hospitals, selectedId) {
  selectEl.innerHTML = '';

  // ✅ أولاً نضيف خيار "الكل"
  const allOpt = document.createElement('option');
  allOpt.value = 'all';
  allOpt.textContent = 'الكل';
  selectEl.appendChild(allOpt);

  // ✅ بعدين نضيف باقي المستشفيات
  const lang = localStorage.getItem("siteLanguage") || currentLang || 'ar';
  hospitals.forEach(h => {
    const opt = document.createElement('option');
    opt.value = String(h.HospitalID);
    const hospitalName = lang === 'en'
      ? (h.HospitalNameEn || h.HospitalNameAr || h.HospitalName)
      : (h.HospitalNameAr || h.HospitalName);
    opt.textContent = hospitalName;
    if (selectedId && Number(selectedId) === Number(h.HospitalID)) opt.selected = true;
    selectEl.appendChild(opt);
  });
}

// تطبيق قيود الواجهة حسب صلاحيات المستخدم
function applyUserPermissions() {
  try {
    // جلب بيانات المستخدم من localStorage
    const userData = JSON.parse(localStorage.getItem('userData') || '{}');
    const userRoleId = Number(userData.RoleID || userData.roleId || 0);
    const userHospitalId = Number(userData.HospitalID || userData.hospitalId || 0);
    
    console.log('🔐 تطبيق قيود الواجهة:', { userRoleId, userHospitalId });
    
    // إذا كان موظف عادي (ليس مدير تجمع)
    if (userRoleId !== 1) {
      console.log('👤 موظف عادي - تطبيق قيود الواجهة');
      
      // إخفاء أو تعطيل dropdowns المستشفيات إذا كان لديه مستشفى واحد فقط
      const hospitalSelects = [
        'funnelHospital',
        'deptCountHospital',
        'topEmployeesHospital',
        'detailHospital',
        'deptReportHospital',
        'empReportHospital',
        'criticalHospital'
      ];
      
      hospitalSelects.forEach(selectId => {
        const selectEl = document.getElementById(selectId);
        if (selectEl) {
          // إذا كان لديه خيار واحد فقط، اجعله disabled
          if (selectEl.options.length <= 1) {
            selectEl.disabled = true;
            selectEl.title = 'متاح فقط لمستشفاك';
            selectEl.style.opacity = '0.6';
            console.log(`🔒 تعطيل ${selectId} - مستشفى واحد فقط`);
          }
        }
      });
      
      // إضافة رسالة توضيحية للموظفين العاديين
      const permissionMessage = document.createElement('div');
      permissionMessage.className = 'alert alert-info mt-3';
      permissionMessage.innerHTML = `
        <i class="bi bi-info-circle me-2"></i>
        <strong>ملاحظة:</strong> أنت ترى التقارير الخاصة بمستشفاك فقط. 
        مديرو التجمع يمكنهم رؤية جميع المستشفيات.
      `;
      
      // إضافة الرسالة في بداية الصفحة
      const mainContent = document.querySelector('.container-fluid') || document.body;
      if (mainContent && !document.querySelector('.alert-info')) {
        mainContent.insertBefore(permissionMessage, mainContent.firstChild);
      }
      
    } else {
      console.log('✅ مدير تجمع - لا توجد قيود');
      
      // إزالة الرسالة التوضيحية إذا كانت موجودة
      const existingMessage = document.querySelector('.alert-info');
      if (existingMessage) {
        existingMessage.remove();
      }
    }
    
  } catch (error) {
    console.error('خطأ في تطبيق قيود الواجهة:', error);
  }
}

// إنشاء/تحديث قمع المستشفى ببيانات "حقيقية" من قاعدة المستشفى
async function createHospitalFunnelChartById(hospitalId) {
  const el = document.getElementById('complaintFunnelByHospital');
  if (!el) return;

  // تدمير المخطط السابق إذا كان موجوداً
  destroyChart(hospitalFunnelChart);
  destroyChartByCanvasId('complaintFunnelByHospital');
  
  const ctx = el.getContext('2d');

  // ✅ لو اختار "الكل"، نعرض كل المستشفيات من الكاش
  if (hospitalId === 'all') hospitalId = 0; // يعرض الكل

  try {
    // لو أول مرة، حمّلي المستشفيات وجهّزي الخرائط
    if (!hospitalsCache.length) {
      hospitalsCache = await loadHospitals();
      hospitalsCache.forEach(h => {
        hospitalsById.set(String(h.HospitalID), {
          nameAr: h.HospitalNameAr || h.HospitalName || h.NameAr,
          nameEn: h.HospitalNameEn || h.HospitalName || h.NameEn
        });
      });
    }

    const lang = localStorage.getItem("siteLanguage") || currentLang || 'ar';
    const hospitalInfo = hospitalsById.get(String(hospitalId));
    const name = hospitalInfo
      ? (lang === 'en' ? hospitalInfo.nameEn : hospitalInfo.nameAr) || hospitalInfo.nameAr
      : '—';
    const url  = `${API_BASE}/api/dashboard/total/funnel/${hospitalId}`;
    const res  = await fetch(url);
    
    let data, labels, colors;
    
    if (!res.ok) {
      console.warn(`فشل في جلب بيانات قمع المستشفى ${hospitalId}، استخدام بيانات افتراضية`);
      // بيانات افتراضية
      data = [100, 80, 60, 40, 20];
      labels = ['تم التقديم','تم الإسناد','قيد المعالجة','بانتظار رد','مغلق'];
      colors = ['#2563EB','#3B82F6','#22C55E','#10B981','#059669'];
    } else {
      const json = await res.json();
      if (!json.success) throw new Error('تعذر تحميل قمع المستشفى');

      const d = json.data || {};
      data = [
        Number(d.submitted || 0),
        Number(d.assigned || 0),
        Number(d.inProgress || 0),
        Number(d.awaitingResponse || 0),
        Number(d.closed || 0),
      ];
      labels = ['تم التقديم','تم الإسناد','قيد المعالجة','بانتظار رد','مغلق'];
      colors = ['#2563EB','#3B82F6','#22C55E','#10B981','#059669'];
    }

    // تدمير الـ chart السابق إذا كان موجوداً
    destroyChart(hospitalFunnelChart);
    destroyChartByCanvasId('complaintFunnelByHospital');

    hospitalFunnelChart = new Chart(ctx, {
      type: 'funnel',
      data: { labels, datasets: [{ label: name, data, backgroundColor: colors, borderWidth: 1.5 }] },
      options: {
        responsive: true, maintainAspectRatio: false, sort: 'desc', gap: 6,
        plugins: {
          legend: { display: false },
          title: { display: true, text: `رحلة البلاغ — ${name}`, font: { family:'Tajawal', size:16 }, color:'#002B5B' },
          tooltip: {
            callbacks: {
              footer: items => {
                const i = items[0].dataIndex;
                if (i >= data.length - 1) return '';
                const curr = data[i], next = data[i+1];
                const pct = curr ? Math.round((next / curr) * 100) : 0;
                return `نسبة الانتقال للمرحلة التالية: ${pct}%`;
              }
            }
          }
        },
        funnel: { dynamicSlope: true }
      }
    });
  } catch (error) {
    console.error('خطأ في إنشاء قمع المستشفى:', error);
    // fallback: استخدام القمع القديم
    await createHospitalFunnelChart();
  }
}

async function updateHospitalFunnelChartById(hospitalId) {
  await createHospitalFunnelChartById(hospitalId);
}

// دالة تحديث مؤشرات الأداء من الرسوم البيانية
function updateKpisFromCharts() {
  // إجمالي، مفتوحة، مغلقة من statusChart (لو موجود)
  let total = 0, open = 0, closed = 0, critical = 0;

  if (statusChart?.data?.datasets?.[0]) {
    const labels = statusChart.data.labels;
    const data = statusChart.data.datasets[0].data;
    total = data.reduce((a,b)=>a+b,0);
    labels.forEach((lbl, i) => {
      const v = data[i] || 0;
      if (/مغلقة/.test(lbl)) closed += v;
      if (/مفتوحة/.test(lbl)) open += v;
      if (/حرجة/.test(lbl)) critical += v;
    });
  }

  // عدد المستشفيات من الكاش (أو صفر)
  const hospitalsCount = Array.isArray(hospitalsCache) ? hospitalsCache.length : 0;

  // SLA (اختياري — تقدير بسيط لو ما فيه API)
  const slaPct = total ? Math.round((closed / total) * 100) + '%' : '—';

  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) {
      if (typeof val === 'number') {
        el.textContent = val.toLocaleString('en-US');
      } else {
        el.textContent = val;
      }
    }
  };

  set('kpi-total', total);
  set('kpi-open', open);
  set('kpi-closed', closed);
  set('kpi-critical', critical);
  set('kpi-hospitals', hospitalsCount);
  set('kpi-sla', slaPct);
}

// تم حذف الكتلة المكررة لتجنب "Canvas is already in use"

/**
 * تهيئة صفحة التقارير
 */
async function initializeReports() {
  try {
    showLoadingIndicator('جاري تهيئة صفحة التقارير...');

    // 0) تدمير جميع المخططات الموجودة أولاً
    destroyAllCharts();

    // 1) هوية المستخدم ودوره
    await loadCurrentUser();

    // 2) تحديث مؤشرات الأداء أولاً
    await loadHospitalsData();

    // 3) تحميل الرسوم البيانية
    await createMainCharts();
    await createHospitalChart();
    await createCriticalRatioChart();
    await loadHospitals();
    await initHeaderProfileLink();

    hideLoadingIndicator();
    console.log('✅ تم تهيئة صفحة التقارير بنجاح');

  } catch (error) {
    console.error('❌ خطأ في تهيئة صفحة التقارير:', error);
    hideLoadingIndicator();
    showErrorMessage('خطأ في تحميل الصفحة', error.message);
  }
}

// ========================================
// تطبيق صلاحيات التقارير
// ========================================
async function applyReportPermissions() {
  try {
    const token = localStorage.getItem('token') || localStorage.getItem('authToken');
    if (!token) {
      console.warn('No auth token found');
      return;
    }

    const response = await fetch(`${API_BASE}/api/permissions/me`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    });

    if (!response.ok) {
      console.warn('Failed to fetch permissions');
      return;
    }

    const result = await response.json();
    const p = result.data || {};

    // لو ما معاه صلاحية الصفحة، رجّعيه أو اخفي الصفحة
    if (!p.reportsPage) {
      document.body.innerHTML = '<div class="p-10 text-center text-gray-500">لا تملك صلاحية عرض التقارير.</div>';
      return;
    }

    // اخفاء أي عنصر ليس مصرح به (للصلاحيات القديمة فقط)
    document.querySelectorAll('[data-perm]').forEach(el => {
      const key = el.getAttribute('data-perm');
      
      // صلاحيات التقارير القديمة (الكروت والرسوم البيانية)
      const oldMap = {
        'REPORTS_CARD_TOTALS': p.reportsCardTotals,
        'REPORTS_CARD_OPEN': p.reportsCardOpen,
        'REPORTS_CARD_CLOSED': p.reportsCardClosed,
        'REPORTS_CARD_URGENT': p.reportsCardUrgent,
        'REPORTS_CARD_SLA': p.reportsCardSLA,
        'REPORTS_CARD_HOSPITALS': p.reportsCardHospitals,
        'REPORTS_CHART_BY_HOSPITAL_TYPE': p.reportsChartByHospitalType,
        'REPORTS_CHART_STATUS_DISTRIBUTION': p.reportsChartStatusDistribution,
        'REPORTS_CHART_TREND_6M': p.reportsChartTrend6m,
        'REPORTS_CHART_URGENT_PERCENT': p.reportsChartUrgentPercent,
        'REPORTS_CHART_BY_DEPARTMENT': p.reportsChartByDepartment,
        'REPORTS_CHART_TOP_EMPLOYEES': p.reportsChartTopEmployees,
      };
      
      // صلاحيات تصدير التقارير الجديدة
      const exportMap = {
        'REPORT_SUMMARY_EXPORT': p.reportSummaryExport,
        'REPORT_DETAILS_EXPORT': p.reportDetailsExport,
        'REPORT_DEPARTMENTS_EXPORT': p.reportDepartmentsExport,
        'REPORT_EMPLOYEES_EXPORT': p.reportEmployeesExport,
        'REPORT_CRITICAL_EXPORT': p.reportCriticalExport
      };
      
      // إذا كانت صلاحية تصدير، نتعامل معها في الدالة الأخرى
      if (exportMap.hasOwnProperty(key)) {
        // لا نفعل شيء هنا، الدالة الأولى ستتعامل معها
        return;
      }
      
      // إذا كانت صلاحية قديمة، نطبق المنطق القديم
      if (oldMap.hasOwnProperty(key)) {
        if (!oldMap[key]) {
          el.style.display = 'none';
        }
      }
    });

    console.log('✅ تم تطبيق صلاحيات التقارير بنجاح');

  } catch (error) {
    console.error('❌ خطأ في تطبيق صلاحيات التقارير:', error);
  }
}

// ========================================
// تشغيل التهيئة عند تحميل الصفحة
// ========================================
document.addEventListener('DOMContentLoaded', async () => {
  // تطبيق الصلاحيات أولاً
  await applyReportPermissions();
  
  // ثم تهيئة التقارير
  await initializeReports();

  // إضافة مستمع لتحديث الهيدر عند تغيير الشهر
  const monthInput = document.getElementById('summaryMonth');
  if (monthInput) {
    monthInput.addEventListener('change', updateSummaryMeta);
    updateSummaryMeta(); // أول مرة
  }
});

// ========================================
// معالج زر تحديث البيانات
// ========================================
document.addEventListener('DOMContentLoaded', () => {
  const refreshBtn = document.getElementById('refresh-reports-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      try {
        // إضافة تأثير التحميل للزر
        refreshBtn.disabled = true;
        refreshBtn.innerHTML = `
          <svg class="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          جاري التحديث...
        `;

        // تدمير جميع المخططات أولاً
        destroyAllCharts();
        
        // تحديث مؤشرات الأداء
        await loadHospitalsData();
        
        // إعادة تحميل الرسوم البيانية
        await createMainCharts();
        await createHospitalChart();
        await createCriticalRatioChart();

        console.log('✅ تم تحديث جميع البيانات بنجاح');
        
      } catch (error) {
        console.error('❌ خطأ في تحديث البيانات:', error);
        
        // عرض رسالة خطأ
        showErrorMessage('خطأ في تحديث البيانات', error.message);
        
      } finally {
        // إعادة تعيين الزر
        refreshBtn.disabled = false;
        refreshBtn.innerHTML = `
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
          </svg>
          تحديث البيانات
        `;
      }
    });
  }
});

// ========================================
// ===== دوال تقرير البلاغات التفصيلية =====
// ========================================

/**
 * جلب بيانات البلاغات التفصيلية من API
 */
async function fetchDetailedComplaintsData({ fromDate, toDate, hospitalId }) {
  try {
    const token = localStorage.getItem('token') || localStorage.getItem('authToken');
    if (!token) {
      throw new Error('لا يوجد توكن للمصادقة');
    }

    const params = new URLSearchParams();
    if (fromDate) params.set('from', fromDate);
    if (toDate) params.set('to', toDate);
    if (hospitalId && hospitalId !== 'all') {
      params.set('hospitalId', hospitalId);
    }
    // جلب جميع البلاغات (بدون pagination)
    params.set('pageSize', '10000');
    params.set('page', '1');

    const url = `${API_BASE}/api/complaints/history?${params.toString()}`;
    console.log('🔍 جاري جلب بيانات البلاغات التفصيلية من:', url);

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    
    // البيانات في result.items أو result.data
    const data = result.items || result.data || [];
    
    console.log('✅ تم جلب بيانات البلاغات التفصيلية:', data.length, 'بلاغ');
    return data;
  } catch (error) {
    console.error('❌ خطأ في جلب بيانات البلاغات التفصيلية:', error);
    throw error;
  }
}

/**
 * ملء جدول البلاغات التفصيلية
 */
function renderDetailsTable(complaints) {
  const tbody = document.getElementById('detailsTableBody');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (!complaints || complaints.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td colspan="8" class="px-2 py-4 text-center border border-gray-200 text-red-500">
        لا توجد بلاغات مطابقة للفترة/المستشفى المحدّد
      </td>
    `;
    tbody.appendChild(tr);
    return;
  }

  complaints.forEach((complaint, idx) => {
    const tr = document.createElement('tr');
    tr.className = idx % 2 === 0 ? 'bg-gray-50' : 'bg-white';
    
    const formatDate = (dateStr) => {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleDateString('ar-SA');
    };

    // دعم أسماء الأعمدة المختلفة من API
    const lang = localStorage.getItem("siteLanguage") || currentLang || 'ar';
    const ticketNumber = complaint.ticket || complaint.TicketNumber || complaint.id || '';
    const hospitalName = lang === 'en'
      ? (complaint.hospitalNameEn || complaint.hospitalNameAr || complaint.hospital || complaint.HospitalNameEn || complaint.HospitalName || '')
      : (complaint.hospitalNameAr || complaint.hospital || complaint.HospitalNameAr || complaint.HospitalName || '');
    const departmentName = complaint.department || complaint.DepartmentName || '';
    const statusName = complaint.statusName || complaint.status || (complaint.StatusCode === 'CLOSED' ? 'مغلق' : complaint.StatusCode === 'OPEN' ? 'مفتوح' : '');
    const priorityName = complaint.priorityName || complaint.priority || '';
    const createdAt = complaint.createdAt || complaint.CreatedAt || '';
    const lastUpdate = complaint.lastUpdate || complaint.UpdatedAt || '';
    const isClosed = complaint.status === 'CLOSED' || complaint.StatusCode === 'CLOSED';

    tr.innerHTML = `
      <td class="px-2 py-1 text-center border border-gray-200">${idx + 1}</td>
      <td class="px-2 py-1 text-center border border-gray-200">${ticketNumber}</td>
      <td class="px-2 py-1 text-right border border-gray-200">${hospitalName}</td>
      <td class="px-2 py-1 text-right border border-gray-200">${departmentName}</td>
      <td class="px-2 py-1 text-center border border-gray-200">${statusName}</td>
      <td class="px-2 py-1 text-center border border-gray-200">${priorityName}</td>
      <td class="px-2 py-1 text-center border border-gray-200">${formatDate(createdAt)}</td>
      <td class="px-2 py-1 text-center border border-gray-200">${isClosed ? formatDate(lastUpdate) : ''}</td>
    `;
    tbody.appendChild(tr);
  });
}

/**
 * جلب بيانات أداء الأقسام
 */
async function fetchDepartmentsPerformanceData({ hospitalId }) {
  try {
    const token = localStorage.getItem('token') || localStorage.getItem('authToken');
    if (!token) {
      throw new Error('لا يوجد توكن للمصادقة');
    }

    const params = new URLSearchParams();
    if (hospitalId && hospitalId !== 'all') {
      params.set('hospitalId', hospitalId);
    }

    const url = `${API_BASE}/api/reports/departments/data?${params.toString()}`;
    console.log('🔍 جاري جلب بيانات أداء الأقسام من:', url);

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    const data = result.data || result.items || [];
    
    console.log('✅ تم جلب بيانات أداء الأقسام:', data.length, 'قسم');
    return data;
  } catch (error) {
    console.error('❌ خطأ في جلب بيانات أداء الأقسام:', error);
    throw error;
  }
}

/**
 * رسم الرسم البياني لأداء الأقسام (horizontal bar chart)
 */
async function renderDepartmentsChart(departments) {
  const canvas = document.getElementById('departmentsChart');
  const chartArea = document.getElementById('departmentsChartArea');
  if (!canvas || !chartArea) return;

  // تدمير الرسم البياني السابق إن وجد
  if (window.departmentsChartInstance) {
    window.departmentsChartInstance.destroy();
    window.departmentsChartInstance = null;
  }
  destroyChartByCanvasId('departmentsChart');

  // إزالة الرسالة السابقة إن وجدت
  const existingMsg = chartArea.querySelector('.no-data-message');
  if (existingMsg) existingMsg.remove();

  // إظهار canvas
  canvas.style.display = 'block';

  // لا توجد بيانات ➜ إظهار رسالة بدلاً من فراغ
  if (!departments || departments.length === 0) {
    canvas.style.display = 'none';

    const msg = document.createElement('div');
    msg.className = 'no-data-message text-center text-gray-400 py-16 text-lg';
    msg.textContent = 'لا توجد بيانات كافية لعرض الرسم البياني للأقسام في الفترة المحددة.';

    chartArea.appendChild(msg);
    return;
  }

  // ترتيب الأقسام حسب عدد البلاغات (تنازلي)
  const sorted = [...departments].sort((a, b) => {
    const totalA = a.totalComplaints || 0;
    const totalB = b.totalComplaints || 0;
    return totalB - totalA;
  });

  const labels = sorted.map(d => d.departmentName || 'غير محدد');
  const data = sorted.map(d => d.totalComplaints || 0);

  // ألوان متدرجة للأشرطة
  const colors = [
    '#1D4ED8', '#2563EB', '#3B82F6', '#60A5FA',
    '#22C55E', '#10B981', '#F59E0B', '#EF4444',
    '#8B5CF6', '#A855F7', '#EC4899', '#F43F5E'
  ];

  const ctx = canvas.getContext('2d');
  window.departmentsChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'عدد البلاغات',
        data,
        backgroundColor: colors.slice(0, labels.length),
        borderRadius: 6,
        barThickness: 20
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 0 },
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: 'عدد البلاغات لكل قسم',
          font: { size: 16, family: 'Tajawal, Arial' },
          padding: { bottom: 10 }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.label}: ${ctx.formattedValue} بلاغ`
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { display: false },
          ticks: {
            color: '#475569',
            font: { family: 'Tajawal, Arial' }
          }
        },
        y: {
          grid: { display: false },
          ticks: {
            color: '#475569',
            font: { family: 'Tajawal, Arial' }
          }
        }
      }
    }
  });

  // انتظار اكتمال الرسم
  await new Promise(resolve => setTimeout(resolve, 300));
  console.log('✅ تم رسم الرسم البياني للأقسام');
}

/**
 * رسم جدول أداء الأقسام
 */
function renderDepartmentsTable(departments) {
  const tbody = document.getElementById('departmentsTableBody');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (!departments || departments.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td colspan="6" class="px-2 py-4 text-center border border-gray-200 text-red-500">
        لا توجد بيانات للأقسام
      </td>
    `;
    tbody.appendChild(tr);
    return;
  }

  departments.forEach((dept, idx) => {
    const tr = document.createElement('tr');
    tr.className = idx % 2 === 0 ? 'bg-gray-50' : 'bg-white';
    
    const deptName = dept.departmentName || dept.DepartmentName || dept.name || '';
    const totalComplaints = dept.totalComplaints || dept.TotalComplaints || dept.total || 0;
    const closedComplaints = dept.closedComplaints || dept.ClosedComplaints || dept.closed || 0;
    const criticalComplaints = dept.criticalComplaints || dept.CriticalComplaints || dept.critical || 0;
    const avgCloseTime = dept.avgCloseTime || dept.AvgCloseTime || dept.averageCloseTime || 0;
    
    const avgCloseTimeDays = avgCloseTime ? parseFloat(avgCloseTime).toFixed(1) : '—';

    tr.innerHTML = `
      <td class="px-2 py-1 text-center border border-gray-200">${idx + 1}</td>
      <td class="px-2 py-1 text-right border border-gray-200">${deptName}</td>
      <td class="px-2 py-1 text-center border border-gray-200">${totalComplaints}</td>
      <td class="px-2 py-1 text-center border border-gray-200">${closedComplaints}</td>
      <td class="px-2 py-1 text-center border border-gray-200">${criticalComplaints}</td>
      <td class="px-2 py-1 text-center border border-gray-200">${avgCloseTimeDays}</td>
    `;
    tbody.appendChild(tr);
  });
}

/**
 * تحديث معلومات الهيدر والفوتر لتقرير أداء الأقسام
 */
function updateDepartmentsMeta({ hospitalId, hospitalName }) {
  const headerInfo = document.getElementById('departmentsHeaderInfo');
  const exportDate = document.getElementById('departmentsExportDate');

  let hospitalText = 'المستشفى: جميع المستشفيات';
  if (hospitalId && hospitalId !== 'all') {
    hospitalText = `المستشفى: ${hospitalName || `ID ${hospitalId}`}`;
  }

  if (headerInfo) {
    headerInfo.textContent = hospitalText;
  }

  // تاريخ التصدير
  if (exportDate) {
    const now = new Date();
    const dateStr = now.toLocaleDateString('ar-SA');
    const timeStr = now.toLocaleTimeString('ar-SA', {
      hour: '2-digit',
      minute: '2-digit'
    });
    exportDate.textContent = `تاريخ التصدير: ${dateStr} ${timeStr}`;
  }
}

/**
 * جلب بيانات أداء الموظفين
 */
async function fetchEmployeesPerformanceData({ hospitalId }) {
  try {
    const token = localStorage.getItem('token') || localStorage.getItem('authToken');
    if (!token) {
      throw new Error('لا يوجد توكن للمصادقة');
    }

    const params = new URLSearchParams();
    if (hospitalId && hospitalId !== 'all') {
      params.set('hospitalId', hospitalId);
    }

    const url = `${API_BASE}/api/reports/employees/data?${params.toString()}`;
    console.log('🔍 جاري جلب بيانات أداء الموظفين من:', url);

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    const data = result.data || result.items || [];
    
    console.log('✅ تم جلب بيانات أداء الموظفين:', data.length, 'موظف');
    return data;
  } catch (error) {
    console.error('❌ خطأ في جلب بيانات أداء الموظفين:', error);
    throw error;
  }
}

/**
 * رسم الرسم البياني لأداء الموظفين (horizontal bar chart)
 */
async function renderEmployeesChart(employees) {
  const canvas = document.getElementById('employeesChart');
  const chartArea = document.getElementById('employeesChartArea');
  if (!canvas || !chartArea) return;

  // تدمير الرسم البياني السابق إن وجد
  if (window.employeesChartInstance) {
    window.employeesChartInstance.destroy();
    window.employeesChartInstance = null;
  }
  destroyChartByCanvasId('employeesChart');

  // إزالة الرسالة السابقة إن وجدت
  const existingMsg = chartArea.querySelector('.no-data-message');
  if (existingMsg) existingMsg.remove();

  // إظهار canvas
  canvas.style.display = 'block';

  // لا توجد بيانات ➜ إظهار رسالة بدلاً من فراغ
  if (!employees || employees.length === 0) {
    canvas.style.display = 'none';

    const msg = document.createElement('div');
    msg.className = 'no-data-message text-center text-gray-400 py-16 text-lg';
    msg.textContent = 'لا توجد بيانات كافية لعرض الرسم البياني للموظفين في الفترة المحددة.';

    chartArea.appendChild(msg);
    return;
  }

  // ترتيب الموظفين حسب عدد البلاغات (تنازلي)
  const sorted = [...employees].sort((a, b) => {
    const countA = a.complaintCount || a.totalComplaints || 0;
    const countB = b.complaintCount || b.totalComplaints || 0;
    return countB - countA;
  });

  const labels = sorted.map(e => e.employeeName || e.name || 'غير محدد');
  const data = sorted.map(e => e.complaintCount || e.totalComplaints || 0);

  // ألوان متدرجة للأشرطة
  const colors = [
    '#1D4ED8', '#2563EB', '#3B82F6', '#60A5FA',
    '#22C55E', '#10B981', '#F59E0B', '#EF4444',
    '#8B5CF6', '#A855F7', '#EC4899', '#F43F5E'
  ];

  const ctx = canvas.getContext('2d');
  window.employeesChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'عدد البلاغات',
        data,
        backgroundColor: colors.slice(0, labels.length),
        borderRadius: 6,
        barThickness: 20
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 0 },
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: 'عدد البلاغات لكل موظف',
          font: { size: 16, family: 'Tajawal, Arial' },
          padding: { bottom: 10 }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.label}: ${ctx.formattedValue} بلاغ`
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { display: false },
          ticks: {
            color: '#475569',
            font: { family: 'Tajawal, Arial' }
          }
        },
        y: {
          grid: { display: false },
          ticks: {
            color: '#475569',
            font: { family: 'Tajawal, Arial' }
          }
        }
      }
    }
  });

  // انتظار اكتمال الرسم
  await new Promise(resolve => setTimeout(resolve, 300));
  console.log('✅ تم رسم الرسم البياني للموظفين');
}

/**
 * رسم جدول أداء الموظفين
 */
function renderEmployeesTable(employees) {
  const tbody = document.getElementById('employeesTableBody');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (!employees || employees.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td colspan="6" class="px-2 py-4 text-center border border-gray-200 text-red-500">
        لا توجد بيانات للموظفين
      </td>
    `;
    tbody.appendChild(tr);
    return;
  }

  // ترتيب حسب عدد البلاغات (تنازلي)
  const sorted = [...employees].sort((a, b) => {
    const countA = a.complaintCount || a.totalComplaints || 0;
    const countB = b.complaintCount || b.totalComplaints || 0;
    return countB - countA;
  });

  sorted.forEach((emp, idx) => {
    const tr = document.createElement('tr');
    tr.className = idx % 2 === 0 ? 'bg-gray-50' : 'bg-white';
    
    const employeeName = emp.employeeName || emp.name || 'غير محدد';
    const departmentName = emp.departmentName || emp.department || '';
    const complaintCount = emp.complaintCount || emp.totalComplaints || 0;
    const firstComplaint = emp.firstComplaint ? new Date(emp.firstComplaint).toLocaleDateString('ar-SA') : '—';
    const lastComplaint = emp.lastComplaint ? new Date(emp.lastComplaint).toLocaleDateString('ar-SA') : '—';

    tr.innerHTML = `
      <td class="px-2 py-1 text-center border border-gray-200">${idx + 1}</td>
      <td class="px-2 py-1 text-right border border-gray-200">${employeeName}</td>
      <td class="px-2 py-1 text-right border border-gray-200">${departmentName}</td>
      <td class="px-2 py-1 text-center border border-gray-200">${complaintCount}</td>
      <td class="px-2 py-1 text-center border border-gray-200">${firstComplaint}</td>
      <td class="px-2 py-1 text-center border border-gray-200">${lastComplaint}</td>
    `;
    tbody.appendChild(tr);
  });
}

/**
 * تحديث معلومات الهيدر والفوتر لتقرير أداء الموظفين
 */
function updateEmployeesMeta({ hospitalId, hospitalName }) {
  const headerInfo = document.getElementById('employeesHeaderInfo');
  const exportDate = document.getElementById('employeesExportDate');

  let hospitalText = 'المستشفى: جميع المستشفيات';
  if (hospitalId && hospitalId !== 'all') {
    hospitalText = `المستشفى: ${hospitalName || `ID ${hospitalId}`}`;
  }

  if (headerInfo) {
    headerInfo.textContent = hospitalText;
  }

  // تاريخ التصدير
  if (exportDate) {
    const now = new Date();
    const dateStr = now.toLocaleDateString('ar-SA');
    const timeStr = now.toLocaleTimeString('ar-SA', {
      hour: '2-digit',
      minute: '2-digit'
    });
    exportDate.textContent = `تاريخ التصدير: ${dateStr} ${timeStr}`;
  }
}

/**
 * جلب بيانات البلاغات الحرجة
 */
async function fetchCriticalComplaintsData({ hospitalId, fromDate, toDate }) {
  try {
    const token = localStorage.getItem('token') || localStorage.getItem('authToken');
    if (!token) {
      throw new Error('لا يوجد توكن للمصادقة');
    }

    const params = new URLSearchParams();
    if (hospitalId && hospitalId !== 'all') {
      params.set('hospitalId', hospitalId);
    }
    if (fromDate) {
      params.set('fromDate', fromDate);
    }
    if (toDate) {
      params.set('toDate', toDate);
    }

    const url = `${API_BASE}/api/reports/critical/data?${params.toString()}`;
    console.log('🔍 جاري جلب بيانات البلاغات الحرجة من:', url);

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    const data = result.data || result.items || [];
    
    console.log('✅ تم جلب بيانات البلاغات الحرجة:', data.length, 'بلاغ');
    return data;
  } catch (error) {
    console.error('❌ خطأ في جلب بيانات البلاغات الحرجة:', error);
    throw error;
  }
}

/**
 * رسم جدول البلاغات الحرجة
 */
function renderCriticalTable(complaints) {
  const tbody = document.getElementById('criticalTableBody');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (!complaints || complaints.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td colspan="7" class="px-2 py-4 text-center border border-gray-200 text-red-500">
        لا توجد بلاغات حرجة
      </td>
    `;
    tbody.appendChild(tr);
    return;
  }

  // ترتيب حسب تاريخ البلاغ (تنازلي)
  const sorted = [...complaints].sort((a, b) => {
    const dateA = new Date(a.createdAt || a.CreatedAt || 0);
    const dateB = new Date(b.createdAt || b.CreatedAt || 0);
    return dateB - dateA;
  });

  sorted.forEach((complaint, idx) => {
    const tr = document.createElement('tr');
    tr.className = idx % 2 === 0 ? 'bg-gray-50' : 'bg-white';
    
    const ticketNumber = complaint.ticketNumber || complaint.TicketNumber || complaint.ticket || '—';
    const lang = localStorage.getItem("siteLanguage") || currentLang || 'ar';
    const hospitalName = lang === 'en'
      ? (complaint.hospitalNameEn || complaint.hospitalNameAr || complaint.hospitalName || complaint.HospitalNameEn || complaint.HospitalName || '—')
      : (complaint.hospitalNameAr || complaint.hospitalName || complaint.HospitalNameAr || complaint.HospitalName || '—');
    const departmentName = complaint.departmentName || complaint.DepartmentName || '—';
    const priorityCode = complaint.priorityCode || complaint.PriorityCode || '—';
    const statusCode = complaint.statusCode || complaint.StatusCode || '—';
    const createdAt = complaint.createdAt || complaint.CreatedAt;
    const dateStr = createdAt ? new Date(createdAt).toLocaleDateString('ar-SA') : '—';

    tr.innerHTML = `
      <td class="px-2 py-1 text-center border border-gray-200">${idx + 1}</td>
      <td class="px-2 py-1 text-center border border-gray-200">${ticketNumber}</td>
      <td class="px-2 py-1 text-right border border-gray-200">${hospitalName}</td>
      <td class="px-2 py-1 text-right border border-gray-200">${departmentName}</td>
      <td class="px-2 py-1 text-center border border-gray-200">${priorityCode}</td>
      <td class="px-2 py-1 text-center border border-gray-200">${statusCode}</td>
      <td class="px-2 py-1 text-center border border-gray-200">${dateStr}</td>
    `;
    tbody.appendChild(tr);
  });
}

/**
 * تحديث معلومات الهيدر والفوتر لتقرير البلاغات الحرجة
 */
function updateCriticalMeta({ hospitalId, hospitalName, fromDate, toDate }) {
  const headerInfo = document.getElementById('criticalHeaderInfo');
  const exportDate = document.getElementById('criticalExportDate');

  let infoText = '';
  if (hospitalId && hospitalId !== 'all') {
    infoText = `المستشفى: ${hospitalName || `ID ${hospitalId}`}`;
  } else {
    infoText = 'المستشفى: جميع المستشفيات';
  }

  if (fromDate || toDate) {
    infoText += ` | الفترة: ${fromDate || '—'} إلى ${toDate || '—'}`;
  }

  if (headerInfo) {
    headerInfo.textContent = infoText;
  }

  // تاريخ التصدير
  if (exportDate) {
    const now = new Date();
    const dateStr = now.toLocaleDateString('ar-SA');
    const timeStr = now.toLocaleTimeString('ar-SA', {
      hour: '2-digit',
      minute: '2-digit'
    });
    exportDate.textContent = `تاريخ التصدير: ${dateStr} ${timeStr}`;
  }
}

/**
 * تحديث معلومات الهيدر والفوتر لتقرير التفاصيل
 */
function updateDetailsMeta({ fromDate, toDate, hospitalId, hospitalName }) {
  const headerInfo = document.getElementById('detailsHeaderInfo');
  const exportDate = document.getElementById('detailsExportDate');

  // معلومات الفترة والمستشفى
  let periodText = 'الفترة: جميع التواريخ';
  if (fromDate || toDate) {
    periodText = `الفترة: ${fromDate || '—'} إلى ${toDate || '—'}`;
  }

  let hospitalText = 'المستشفى: جميع المستشفيات';
  if (hospitalId && hospitalId !== 'all') {
    hospitalText = `المستشفى: ${hospitalName || `ID ${hospitalId}`}`;
  }

  if (headerInfo) {
    headerInfo.textContent = `${periodText} | ${hospitalText}`;
  }

  // تاريخ التصدير
  if (exportDate) {
    const now = new Date();
    const dateStr = now.toLocaleDateString('ar-SA');
    const timeStr = now.toLocaleTimeString('ar-SA', {
      hour: '2-digit',
      minute: '2-digit'
    });
    exportDate.textContent = `تاريخ التصدير: ${dateStr} ${timeStr}`;
  }
}

// ========================================
// ===== تصدير التقارير إلى PDF أو Excel =====
// ========================================
async function exportReport(reportKey, format) {
  try {
    const token = localStorage.getItem('token') || localStorage.getItem('authToken');
    if (!token) {
      throw new Error('يرجى تسجيل الدخول أولاً');
    }

    const params = new URLSearchParams();

    // التقارير المختلفة والفلاتر الخاصة بها
    if (reportKey === 'summary') {
      const month = document.getElementById('summaryMonth')?.value || '';
      if (month) params.set('month', month); // شكلها YYYY-MM
    }

    if (reportKey === 'details') {
      params.set('fromDate', document.getElementById('detailFrom')?.value || '');
      params.set('toDate', document.getElementById('detailTo')?.value || '');
      params.set('hospitalId', document.getElementById('detailHospital')?.value || 'all');
    }

    if (reportKey === 'departments') {
      params.set('hospitalId', document.getElementById('deptReportHospital')?.value || 'all');
    }

    if (reportKey === 'employees') {
      params.set('hospitalId', document.getElementById('empReportHospital')?.value || 'all');
    }

    if (reportKey === 'critical') {
      params.set('fromDate', document.getElementById('criticalFrom')?.value || '');
      params.set('toDate', document.getElementById('criticalTo')?.value || '');
      params.set('hospitalId', document.getElementById('criticalHospital')?.value || 'all');
    }

    let url = `${API_BASE}/api/reports/${reportKey}.${format}?${params.toString()}`;
    let fetchOptions = {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    };

    // ✅ حالة خاصة لتقرير ملخص التجمع PDF:
    // نستخدم html2canvas لتصوير منطقة التقرير كاملة كصورة واحدة + جدول أرقام
    console.log('[Export] فحص حالة خاصة:', { reportKey, format, isSummaryPdf: reportKey === 'summary' && format === 'pdf', isDetailsPdf: reportKey === 'details' && format === 'pdf' });
    
    if (reportKey === 'summary' && format === 'pdf') {
      console.log('[Export] ✅ ملخص التجمع PDF - تقرير احترافي');

      const month = document.getElementById('summaryMonth')?.value || '';

      // تحديث العنوان + تاريخ التصدير في أسفل الصفحة
      updateSummaryMeta();

      const container = document.getElementById('summaryCombinedArea');
      if (!container) {
        throw new Error('لم يتم العثور على العنصر summaryCombinedArea في الصفحة');
      }

      // تشغيل وضع التصدير (CSS خاص)
      document.body.classList.add('summary-exporting');
      container.classList.add('summary-export');

      // ننتظر فريم عشان الـCSS يطبّق
      await new Promise(r => setTimeout(r, 50));

      const canvas = await html2canvas(container, {
        scale: 1.5, // تقليل من 2 إلى 1.5 لتقليل الحجم
        useCORS: true,
        scrollY: 0,
        backgroundColor: '#ffffff'
      });

      // إرجاع الصفحة كما كانت
      container.classList.remove('summary-export');
      document.body.classList.remove('summary-exporting');

      // استخدام JPEG بدلاً من PNG لتقليل الحجم (جودة 0.85)
      const summaryImage = canvas.toDataURL('image/jpeg', 0.85);
      const sizeMB = (summaryImage.length / 1024 / 1024).toFixed(2);
      console.log('[Export] ✅ تم إنشاء صورة التقرير، طول الداتا:', summaryImage.length, 'بايت');
      console.log('[Export] 📊 حجم الصورة:', sizeMB, 'MB');

      url = `${API_BASE}/api/reports/${reportKey}.${format}`;
      fetchOptions = {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          month,
          summaryImage
        })
      };
    } else if (reportKey === 'details' && format === 'pdf') {
      console.log('[Export] ✅ تقرير البلاغات التفصيلية PDF - تقرير احترافي');

      const fromDate = document.getElementById('detailFrom')?.value || '';
      const toDate = document.getElementById('detailTo')?.value || '';
      const hospitalId = document.getElementById('detailHospital')?.value || 'all';

      // جلب بيانات البلاغات
      showLoadingIndicator('جاري تحميل بيانات البلاغات...');
      const complaints = await fetchDetailedComplaintsData({ fromDate, toDate, hospitalId });
      hideLoadingIndicator();

      // جلب اسم المستشفى إذا كان محدد
      let hospitalName = null;
      if (hospitalId && hospitalId !== 'all' && complaints.length > 0) {
        hospitalName = complaints[0].hospital || complaints[0].HospitalName || null;
      }

      // ملء الجدول
      renderDetailsTable(complaints);

      // تحديث معلومات الهيدر والفوتر
      updateDetailsMeta({ fromDate, toDate, hospitalId, hospitalName });

      const container = document.getElementById('detailsCombinedArea');
      if (!container) {
        throw new Error('لم يتم العثور على العنصر detailsCombinedArea في الصفحة');
      }

      // التأكد من أن الجدول يحتوي على بيانات
      const tableBody = document.getElementById('detailsTableBody');
      if (!tableBody || tableBody.children.length === 0) {
        throw new Error('لا توجد بيانات في الجدول. تأكد من اختيار الفلاتر الصحيحة.');
      }

      // تشغيل وضع التصدير (CSS خاص)
      // الحاوية ستكون مخفية خارج viewport (left: -10000px) ولكن html2canvas سيستطيع تصويرها
      document.body.classList.add('details-exporting');
      container.classList.remove('hidden');
      container.classList.add('details-export');

      // ننتظر أكثر من فريم عشان الـCSS يطبّق والبيانات تظهر
      await new Promise(r => setTimeout(r, 300));

      // التحقق من أن الحاوية موجودة في DOM (html2canvas يعمل مع العناصر حتى لو كانت خارج viewport)
      const rect = container.getBoundingClientRect();
      console.log('[Export] 📐 أبعاد الحاوية:', { width: rect.width, height: rect.height, left: rect.left });

      // html2canvas يعمل حتى لو كانت الحاوية خارج viewport
      // تقليل scale لتقليل حجم الصورة
      const canvas = await html2canvas(container, {
        scale: 1.5, // تقليل من 2 إلى 1.5 لتقليل الحجم
        useCORS: true,
        scrollY: 0,
        backgroundColor: '#ffffff',
        logging: false,
        allowTaint: true,
        windowWidth: container.scrollWidth,
        windowHeight: container.scrollHeight
      });

      // إرجاع الصفحة كما كانت
      container.classList.remove('details-export');
      container.classList.add('hidden');
      document.body.classList.remove('details-exporting');

      // استخدام JPEG بدلاً من PNG لتقليل الحجم (جودة 0.85)
      const detailsImage = canvas.toDataURL('image/jpeg', 0.85);
      console.log('[Export] ✅ تم إنشاء صورة التقرير، طول الداتا:', detailsImage.length, 'بايت');
      
      // تحويل إلى MB للتحقق
      const sizeMB = (detailsImage.length / 1024 / 1024).toFixed(2);
      console.log('[Export] 📊 حجم الصورة:', sizeMB, 'MB');
      
      if (detailsImage.length < 100) {
        throw new Error('الصورة المُنشأة فارغة أو صغيرة جداً. تأكد من أن الجدول يحتوي على بيانات.');
      }

      url = `${API_BASE}/api/reports/${reportKey}.${format}`;
      fetchOptions = {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fromDate,
          toDate,
          hospitalId,
          detailsImage
        })
      };
    } else if (reportKey === 'departments' && format === 'pdf') {
      console.log('[Export] ✅ تقرير أداء الأقسام PDF - تقرير احترافي');

      const hospitalId = document.getElementById('deptReportHospital')?.value || 'all';

      // جلب بيانات الأقسام
      showLoadingIndicator('جاري تحميل بيانات الأقسام...');
      const departments = await fetchDepartmentsPerformanceData({ hospitalId });
      hideLoadingIndicator();

      // جلب اسم المستشفى إذا كان محدد
      let hospitalName = null;
      if (hospitalId && hospitalId !== 'all' && departments.length > 0) {
        // يمكن جلب اسم المستشفى من API آخر أو من البيانات
        hospitalName = null; // سيتم جلبها لاحقاً إذا لزم
      }

      // رسم الرسم البياني
      await renderDepartmentsChart(departments);

      // ملء الجدول
      renderDepartmentsTable(departments);

      // تحديث معلومات الهيدر والفوتر
      updateDepartmentsMeta({ hospitalId, hospitalName });

      const container = document.getElementById('departmentsCombinedArea');
      if (!container) {
        throw new Error('لم يتم العثور على العنصر departmentsCombinedArea في الصفحة');
      }

      // التأكد من أن الجدول يحتوي على بيانات
      const tableBody = document.getElementById('departmentsTableBody');
      if (!tableBody || tableBody.children.length === 0) {
        throw new Error('لا توجد بيانات في الجدول. تأكد من اختيار المستشفى الصحيح.');
      }

      // تشغيل وضع التصدير (CSS خاص)
      document.body.classList.add('departments-exporting');
      container.classList.remove('hidden');
      container.classList.add('departments-export');

      // ننتظر فريم عشان الـCSS يطبّق
      await new Promise(r => setTimeout(r, 50));

      const canvas = await html2canvas(container, {
        scale: 1.5, // تقليل من 2 إلى 1.5 لتقليل الحجم
        useCORS: true,
        scrollY: 0,
        backgroundColor: '#ffffff'
      });

      // إرجاع الصفحة كما كانت
      container.classList.remove('departments-export');
      container.classList.add('hidden');
      document.body.classList.remove('departments-exporting');

      // استخدام JPEG بدلاً من PNG لتقليل الحجم (جودة 0.85)
      const departmentsImage = canvas.toDataURL('image/jpeg', 0.85);
      const sizeMB = (departmentsImage.length / 1024 / 1024).toFixed(2);
      console.log('[Export] ✅ تم إنشاء صورة التقرير، طول الداتا:', departmentsImage.length, 'بايت');
      console.log('[Export] 📊 حجم الصورة:', sizeMB, 'MB');

      if (departmentsImage.length < 100) {
        throw new Error('الصورة المُنشأة فارغة أو صغيرة جداً. تأكد من أن الجدول يحتوي على بيانات.');
      }

      url = `${API_BASE}/api/reports/${reportKey}.${format}`;
      fetchOptions = {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          hospitalId,
          departmentsImage
        })
      };
    } else if (reportKey === 'employees' && format === 'pdf') {
      console.log('[Export] ✅ تقرير أداء الموظفين PDF - تقرير احترافي');

      const hospitalId = document.getElementById('empReportHospital')?.value || 'all';

      // جلب بيانات الموظفين
      showLoadingIndicator('جاري تحميل بيانات الموظفين...');
      const employees = await fetchEmployeesPerformanceData({ hospitalId });
      hideLoadingIndicator();

      // جلب اسم المستشفى إذا كان محدد
      let hospitalName = null;
      if (hospitalId && hospitalId !== 'all' && employees.length > 0) {
        hospitalName = null; // سيتم جلبها لاحقاً إذا لزم
      }

      // رسم الرسم البياني
      await renderEmployeesChart(employees);

      // ملء الجدول
      renderEmployeesTable(employees);

      // تحديث معلومات الهيدر والفوتر
      updateEmployeesMeta({ hospitalId, hospitalName });

      const container = document.getElementById('employeesCombinedArea');
      if (!container) {
        throw new Error('لم يتم العثور على العنصر employeesCombinedArea في الصفحة');
      }

      // التأكد من أن الجدول يحتوي على بيانات
      const tableBody = document.getElementById('employeesTableBody');
      if (!tableBody || tableBody.children.length === 0) {
        throw new Error('لا توجد بيانات في الجدول. تأكد من اختيار المستشفى الصحيح.');
      }

      // تشغيل وضع التصدير (CSS خاص)
      document.body.classList.add('employees-exporting');
      container.classList.remove('hidden');
      container.classList.add('employees-export');

      // ننتظر فريم عشان الـCSS يطبّق
      await new Promise(r => setTimeout(r, 50));

      const canvas = await html2canvas(container, {
        scale: 1.5, // تقليل من 2 إلى 1.5 لتقليل الحجم
        useCORS: true,
        scrollY: 0,
        backgroundColor: '#ffffff'
      });

      // إرجاع الصفحة كما كانت
      container.classList.remove('employees-export');
      container.classList.add('hidden');
      document.body.classList.remove('employees-exporting');

      // استخدام JPEG بدلاً من PNG لتقليل الحجم (جودة 0.85)
      const employeesImage = canvas.toDataURL('image/jpeg', 0.85);
      const sizeMB = (employeesImage.length / 1024 / 1024).toFixed(2);
      console.log('[Export] ✅ تم إنشاء صورة التقرير، طول الداتا:', employeesImage.length, 'بايت');
      console.log('[Export] 📊 حجم الصورة:', sizeMB, 'MB');

      if (employeesImage.length < 100) {
        throw new Error('الصورة المُنشأة فارغة أو صغيرة جداً. تأكد من أن الجدول يحتوي على بيانات.');
      }

      url = `${API_BASE}/api/reports/${reportKey}.${format}`;
      fetchOptions = {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          hospitalId,
          employeesImage
        })
      };
    } else if (reportKey === 'critical' && format === 'pdf') {
      console.log('[Export] ✅ تقرير البلاغات الحرجة PDF - تقرير احترافي');

      const hospitalId = document.getElementById('criticalReportHospital')?.value || 'all';
      const fromDate = document.getElementById('criticalFrom')?.value || '';
      const toDate = document.getElementById('criticalTo')?.value || '';

      // جلب بيانات البلاغات الحرجة
      showLoadingIndicator('جاري تحميل البلاغات الحرجة...');
      const complaints = await fetchCriticalComplaintsData({ hospitalId, fromDate, toDate });
      hideLoadingIndicator();

      // جلب اسم المستشفى إذا كان محدد
      let hospitalName = null;
      if (hospitalId && hospitalId !== 'all' && complaints.length > 0) {
        hospitalName = complaints[0].hospitalName || complaints[0].HospitalName || null;
      }

      // ملء الجدول
      renderCriticalTable(complaints);

      // تحديث معلومات الهيدر والفوتر
      updateCriticalMeta({ hospitalId, hospitalName, fromDate, toDate });

      const container = document.getElementById('criticalCombinedArea');
      if (!container) {
        throw new Error('لم يتم العثور على العنصر criticalCombinedArea في الصفحة');
      }

      // التأكد من أن الجدول يحتوي على بيانات
      const tableBody = document.getElementById('criticalTableBody');
      if (!tableBody || tableBody.children.length === 0) {
        throw new Error('لا توجد بيانات في الجدول. تأكد من اختيار المستشفى الصحيح.');
      }

      // تشغيل وضع التصدير (CSS خاص)
      document.body.classList.add('critical-exporting');
      container.classList.remove('hidden');
      container.classList.add('critical-export');

      // ننتظر فريم عشان الـCSS يطبّق
      await new Promise(r => setTimeout(r, 50));

      const canvas = await html2canvas(container, {
        scale: 1.5, // تقليل من 2 إلى 1.5 لتقليل الحجم
        useCORS: true,
        scrollY: 0,
        backgroundColor: '#ffffff'
      });

      // إرجاع الصفحة كما كانت
      container.classList.remove('critical-export');
      container.classList.add('hidden');
      document.body.classList.remove('critical-exporting');

      // استخدام JPEG بدلاً من PNG لتقليل الحجم (جودة 0.85)
      const criticalImage = canvas.toDataURL('image/jpeg', 0.85);
      const sizeMB = (criticalImage.length / 1024 / 1024).toFixed(2);
      console.log('[Export] ✅ تم إنشاء صورة التقرير، طول الداتا:', criticalImage.length, 'بايت');
      console.log('[Export] 📊 حجم الصورة:', sizeMB, 'MB');

      if (criticalImage.length < 100) {
        throw new Error('الصورة المُنشأة فارغة أو صغيرة جداً. تأكد من أن الجدول يحتوي على بيانات.');
      }

      url = `${API_BASE}/api/reports/${reportKey}.${format}`;
      fetchOptions = {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          hospitalId,
          fromDate,
          toDate,
          criticalImage
        })
      };
    } else if (format === 'excel') {
      // ✅ تصدير Excel من الواجهة مباشرة
      console.log('[Export] ✅ تصدير Excel من الواجهة:', reportKey);
      
      let table = null;
      let sheetName = 'تقرير';
      let fileName = `${reportKey}-${Date.now()}.xlsx`;

      // تحديد الجدول والبيانات حسب نوع التقرير
      if (reportKey === 'summary') {
        // جلب البيانات أولاً
        showLoadingIndicator('جاري تحميل بيانات التقرير...');
        const month = document.getElementById('summaryMonth')?.value || '';
        
        try {
          // جلب البيانات والرسم البياني بالتوازي
          await Promise.all([
            loadHospitalsData(),
            new Promise(resolve => setTimeout(resolve, 100)) // انتظار قصير للتأكد من رندر الجدول
          ]);
        } catch (err) {
          console.error('❌ فشل تحميل بيانات ملخص التجمع:', err);
          hideLoadingIndicator();
          throw new Error('فشل تحميل بيانات التقرير: ' + err.message);
        }
        
        hideLoadingIndicator();
        
        table = document.querySelector('#summaryTableArea table');
        if (!table) {
          throw new Error('لم يتم العثور على جدول ملخص البلاغات. تأكد من تحميل البيانات أولاً.');
        }
        
        sheetName = 'ملخص البلاغات';
        fileName = `ملخص-البلاغات-${month || 'كل-الأشهر'}-${Date.now()}.xlsx`;
      } else if (reportKey === 'details') {
        const fromDate = document.getElementById('detailFrom')?.value || '';
        const toDate = document.getElementById('detailTo')?.value || '';
        const hospitalId = document.getElementById('detailHospital')?.value || 'all';
        
        showLoadingIndicator('جاري تحميل بيانات البلاغات...');
        const complaints = await fetchDetailedComplaintsData({ fromDate, toDate, hospitalId });
        renderDetailsTable(complaints);
        hideLoadingIndicator();
        
        table = document.querySelector('#detailsTableArea table');
        sheetName = 'البلاغات التفصيلية';
        fileName = `البلاغات-التفصيلية-${fromDate || 'كل-التواريخ'}-${Date.now()}.xlsx`;
      } else if (reportKey === 'departments') {
        const hospitalId = document.getElementById('deptReportHospital')?.value || 'all';
        
        showLoadingIndicator('جاري تحميل بيانات الأقسام...');
        const departments = await fetchDepartmentsPerformanceData({ hospitalId });
        renderDepartmentsTable(departments);
        hideLoadingIndicator();
        
        table = document.querySelector('#departmentsTableArea table');
        sheetName = 'أداء الأقسام';
        fileName = `أداء-الأقسام-${hospitalId === 'all' ? 'كل-المستشفيات' : hospitalId}-${Date.now()}.xlsx`;
      } else if (reportKey === 'employees') {
        const hospitalId = document.getElementById('empReportHospital')?.value || 'all';
        
        showLoadingIndicator('جاري تحميل بيانات الموظفين...');
        const employees = await fetchEmployeesPerformanceData({ hospitalId });
        renderEmployeesTable(employees);
        hideLoadingIndicator();
        
        table = document.querySelector('#employeesTableArea table');
        sheetName = 'أداء الموظفين';
        fileName = `أداء-الموظفين-${hospitalId === 'all' ? 'كل-المستشفيات' : hospitalId}-${Date.now()}.xlsx`;
      } else if (reportKey === 'critical') {
        const hospitalId = document.getElementById('criticalHospital')?.value || 'all';
        const fromDate = document.getElementById('criticalFrom')?.value || '';
        const toDate = document.getElementById('criticalTo')?.value || '';
        
        showLoadingIndicator('جاري تحميل البلاغات الحرجة...');
        const complaints = await fetchCriticalComplaintsData({ hospitalId, fromDate, toDate });
        renderCriticalTable(complaints);
        hideLoadingIndicator();
        
        table = document.querySelector('#criticalTableArea table');
        sheetName = 'البلاغات الحرجة';
        fileName = `البلاغات-الحرجة-${fromDate || 'كل-التواريخ'}-${Date.now()}.xlsx`;
      }

      if (!table) {
        throw new Error('لم يتم العثور على الجدول للتصدير. تأكد من تحميل البيانات أولاً.');
      }

      // التحقق من وجود بيانات في الجدول
      const tbody = table.querySelector('tbody');
      if (!tbody || tbody.children.length === 0) {
        throw new Error('لا توجد بيانات في الجدول. تأكد من اختيار الفلاتر الصحيحة.');
      }

      // تحويل الجدول إلى Excel باستخدام XLSX
      const wb = XLSX.utils.table_to_book(table, { 
        sheet: sheetName,
        raw: false // تحويل التنسيقات
      });

      // حفظ الملف
      XLSX.writeFile(wb, fileName);
      
      console.log('✅ تم تصدير Excel بنجاح:', fileName);
      showSuccessMessage('تم تصدير التقرير إلى Excel بنجاح');
      return; // لا نكمل مع fetch
    } else {
      console.log('[Export] حالة عادية - استخدام GET');
    }

    console.log('[Export] طلب تقرير:', { url, method: fetchOptions.method, hasAuth: !!fetchOptions.headers.Authorization });

    const res = await fetch(url, fetchOptions);

    // التحقق من نوع المحتوى أولاً
    const contentType = res.headers.get('content-type') || '';

    if (!res.ok || !contentType.includes('application')) {
      const errText = await res.text();
      console.error('استجابة غير صحيحة من السيرفر:', errText);
      throw new Error(`فشل إنشاء التقرير (HTTP ${res.status})`);
    }

    const blob = await res.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `${reportKey}-${Date.now()}.${format === 'excel' ? 'xlsx' : 'pdf'}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(downloadUrl);

    console.log('✅ تم تحميل التقرير بنجاح');
  } catch (error) {
    console.error('❌ خطأ في تصدير التقرير:', error);
    showErrorMessage('خطأ في تصدير التقرير', error.message);
  }
}

// جعل الدالة متاحة عالمياً للاستخدام من HTML
window.exportReport = exportReport;

// دالة رسائل نجاح / خطأ عامة
function showSuccessMessage(message, isError = false) {
  const alertBox = document.createElement("div");
  alertBox.className = `fixed top-5 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-lg shadow-lg text-white font-semibold z-[9999] ${
    isError ? "bg-red-600" : "bg-green-600"
  }`;
  alertBox.textContent = message;
  document.body.appendChild(alertBox);
  setTimeout(() => alertBox.remove(), 3500);
}

// ====== تصفية التقارير حسب المستشفى ======
// دوال مساعدة لإعادة تحميل بيانات كل تقرير
async function loadDetailsData(hospitalId) {
  const fromDate = document.getElementById('detailFrom')?.value || '';
  const toDate = document.getElementById('detailTo')?.value || '';
  
  showLoadingIndicator('جاري تحديث بيانات البلاغات التفصيلية...');
  
  try {
    const complaints = await fetchDetailedComplaintsData({ fromDate, toDate, hospitalId });
    renderDetailsTable(complaints);
    
    // جلب اسم المستشفى إذا كان محدد
    let hospitalName = null;
    if (hospitalId && hospitalId !== 'all' && complaints.length > 0) {
      hospitalName = complaints[0].hospital || complaints[0].HospitalName || null;
    }
    
    updateDetailsMeta({ fromDate, toDate, hospitalId, hospitalName });
    hideLoadingIndicator();
  } catch (err) {
    hideLoadingIndicator();
    throw err;
  }
}

async function loadDepartmentsData(hospitalId) {
  showLoadingIndicator('جاري تحديث بيانات الأقسام...');
  
  try {
    const departments = await fetchDepartmentsPerformanceData({ hospitalId });
    await renderDepartmentsChart(departments);
    renderDepartmentsTable(departments);
    
    // جلب اسم المستشفى
    let hospitalName = null;
    if (hospitalId && hospitalId !== 'all' && departments.length > 0) {
      // يمكن جلب اسم المستشفى من API آخر أو من البيانات
      hospitalName = null;
    }
    
    updateDepartmentsMeta({ hospitalId, hospitalName });
    hideLoadingIndicator();
  } catch (err) {
    hideLoadingIndicator();
    throw err;
  }
}

async function loadEmployeesData(hospitalId) {
  showLoadingIndicator('جاري تحديث بيانات الموظفين...');
  
  try {
    const employees = await fetchEmployeesPerformanceData({ hospitalId });
    await renderEmployeesChart(employees);
    renderEmployeesTable(employees);
    
    // جلب اسم المستشفى
    let hospitalName = null;
    if (hospitalId && hospitalId !== 'all' && employees.length > 0) {
      hospitalName = null;
    }
    
    updateEmployeesMeta({ hospitalId, hospitalName });
    hideLoadingIndicator();
  } catch (err) {
    hideLoadingIndicator();
    throw err;
  }
}

async function loadCriticalData(hospitalId) {
  const fromDate = document.getElementById('criticalFrom')?.value || '';
  const toDate = document.getElementById('criticalTo')?.value || '';
  
  showLoadingIndicator('جاري تحديث البلاغات الحرجة...');
  
  try {
    const complaints = await fetchCriticalComplaintsData({ hospitalId, fromDate, toDate });
    renderCriticalTable(complaints);
    
    // جلب اسم المستشفى إذا كان محدد
    let hospitalName = null;
    if (hospitalId && hospitalId !== 'all' && complaints.length > 0) {
      hospitalName = complaints[0].hospitalName || complaints[0].HospitalName || null;
    }
    
    updateCriticalMeta({ hospitalId, hospitalName, fromDate, toDate });
    hideLoadingIndicator();
  } catch (err) {
    hideLoadingIndicator();
    throw err;
  }
}

// ربط الأحداث بالقوائم المنسدلة للمستشفيات
document.addEventListener("DOMContentLoaded", () => {
  // ربط الأحداث بالقوائم المنسدلة
  const selects = [
    { id: "detailHospital", reportKey: "details", loadFn: loadDetailsData },
    { id: "deptReportHospital", reportKey: "departments", loadFn: loadDepartmentsData },
    { id: "empReportHospital", reportKey: "employees", loadFn: loadEmployeesData },
    { id: "criticalHospital", reportKey: "critical", loadFn: loadCriticalData }
  ];

  selects.forEach(sel => {
    const el = document.getElementById(sel.id);
    if (!el) return;

    el.addEventListener("change", async () => {
      const hospitalId = el.value;
      console.log(`🔍 تم اختيار مستشفى (${hospitalId}) لتقرير ${sel.reportKey}`);

      try {
        // استدعاء الدالة الخاصة بكل تقرير لإعادة تحميل البيانات
        await sel.loadFn(hospitalId);
        showSuccessMessage(`✅ تم تصفية تقرير ${sel.reportKey} بنجاح`);
      } catch (err) {
        console.error(`❌ خطأ أثناء التصفية لتقرير ${sel.reportKey}:`, err);
        showSuccessMessage(`⚠️ فشل في تحميل بيانات التقرير: ${err.message}`, true);
      }
    });
  });
});