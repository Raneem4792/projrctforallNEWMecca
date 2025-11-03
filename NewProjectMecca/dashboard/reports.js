/* ========================================
   ملف JavaScript الخاص بصفحة التقارير والإحصائيات
   Reports JavaScript File
   ======================================== */

// ===== App Namespace Protection =====
if (!window.App) window.App = {};
const App = window.App;

// ===== Auth Context =====
let currentUser = null;
let isClusterManager = false;
let userHospitalId = null;
let hospitalsData = [];

// ===== Chart Variables =====
let reportsChart, statusChart, hospitalChart, hospitalFunnelChart, deptCountChart, topEmployeesChart;

// ===== Chart Helper Functions =====
function destroyChart(chartInstance) {
  if (chartInstance) {
    chartInstance.destroy();
  }
}

function destroyChartByCanvasId(canvasId) {
  try {
    // استخدام Chart.getChart() للبحث عن المخطط
    const existingChart = Chart.getChart(canvasId);
    if (existingChart) {
      existingChart.destroy();
    }
  } catch (error) {
    // تجاهل أخطاء التدمير
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
    return u?.RoleID === 1 || u?.IsClusterManager === true;
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
    hospitalsData = data.map(hospital => ({
      hospitalId: hospital.HospitalID,
      hospitalName: hospital.HospitalName || hospital.NameAr || hospital.NameEn || 'غير محدد',
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
    }));

    console.log('✅ تم تحميل بيانات المستشفيات:', hospitalsData);

    // 4) تحديث مؤشرات الأداء
    updateMainStatsCards();

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
      // تحضير البيانات للرسم البياني
      const trendData = result.data;
      const labels = trendData.map(item => item.monthName);
      const newReportsData = trendData.map(item => item.newReports);
      const closedReportsData = trendData.map(item => item.closedReports);
      
      reportsChart = new Chart(reportsCtx.getContext('2d'), {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            {
              label: 'البلاغات الجديدة',
              data: newReportsData,
              borderColor: '#004A9F',
              backgroundColor: 'rgba(0,74,159,.1)',
              tension: .4,
              fill: true
            },
            {
              label: 'البلاغات المغلقة',
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
    
    // في حالة الخطأ، استخدم بيانات وهمية كبديل
    reportsChart = new Chart(reportsCtx.getContext('2d'), {
      type: 'line',
      data: {
        labels: ['أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر','يناير'],
        datasets: [
          {
            label: 'البلاغات الجديدة',
            data: [1200,1350,1100,1400,1250,1500],
            borderColor: '#004A9F',
            backgroundColor: 'rgba(0,74,159,.1)',
            tension: .4,
            fill: true
          },
          {
            label: 'البلاغات المغلقة',
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
  destroyChartByCanvasId('statusChart');

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
      // تحضير البيانات للرسم البياني
      const statusData = result.data;
      const labels = statusData.map(item => item.LabelAr);
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
    
    // في حالة الخطأ، استخدم بيانات وهمية كبديل
    statusChart = new Chart(statusCtx.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: ['مغلقة', 'مفتوحة', 'قيد المعالجة'],
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
    
    // جلب البيانات الحقيقية من API الجديد
    const response = await fetch(`${API_BASE}/api/dashboard/total/reports-by-type`, {
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
    
    // تحضير البيانات للرسم البياني
    const labels = hospitalsData.map(hospital => hospital.hospitalName);
    const openData = hospitalsData.map(hospital => hospital.openReports);
    const closedData = hospitalsData.map(hospital => hospital.closedReports);
    const criticalData = hospitalsData.map(hospital => hospital.criticalReports);

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
            text: 'عدد البلاغات حسب نوعها في كل مستشفى',
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
    
    const url = `${API_BASE}/api/dashboard/total/critical-ratio`;
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
      // تحضير البيانات للرسم البياني
      const criticalData = result.data;
      const labels = criticalData.map(item => item.hospitalName);
      const data = criticalData.map(item => item.criticalRatio);
      const colors = [
        'rgba(239,68,68,0.8)',
        'rgba(251,146,60,0.8)',
        'rgba(250,204,21,0.8)',
        'rgba(34,197,94,0.8)',
        'rgba(16,185,129,0.8)'
      ];
      
      new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'نسبة البلاغات الحرجة (%)',
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
              text: 'المستشفيات ذات النسبة الأعلى من البلاغات الحرجة',
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
    
    // في حالة الخطأ، استخدم بيانات وهمية كبديل
    new Chart(ctx.getContext('2d'), {
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

async function createDeptCountChart(hospitalId = 1) {
  const el = document.getElementById('deptCountChart');
  if (!el) return;

  try {
    let labels = [], values = [], titleText = '';
    // تجهيز الكاش لو فاضي
    if (!hospitalsCache.length) {
      hospitalsCache = await loadHospitals();
      hospitalsCache.forEach(h => hospitalsById.set(String(h.HospitalID), h.HospitalName));
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
      titleText = 'عدد البلاغات لكل قسم — جميع المستشفيات';
    } else {
      // ✅ وضع مستشفى واحد
      const response = await fetch(`${API_BASE}/api/dashboard/total/dept-count/${hospitalId}`);
      if (!response.ok) throw new Error('فشل في الاتصال بالخادم');
      const result = await response.json();
      if (!result.success) throw new Error('فشل في جلب البيانات');

      const deptData = result.data;
      labels = deptData.map(item => item.departmentName);
      values = deptData.map(item => item.complaintCount);

      const hospitalName = hospitalsById.get(String(hospitalId)) || 'مستشفى غير محدد';
      titleText = `عدد البلاغات لكل قسم — ${hospitalName}`;
    }

    if (deptCountChart) deptCountChart.destroy();

    deptCountChart = new Chart(el.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'عدد البلاغات',
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
    if (deptCountChart) deptCountChart.destroy();
    deptCountChart = new Chart(el.getContext('2d'), {
      type: 'bar',
      data: { labels, datasets: [{ label:'عدد البلاغات', data: values, backgroundColor: labels.map((_, i) => barColors[i % barColors.length]), borderColor:'#fff', borderWidth:1, borderRadius:8, barThickness:24, maxBarThickness:28 }]},
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

async function createTopEmployeesChart(hospitalId = 1, topN = 8) {
  const el = document.getElementById('topEmployeesChart');
  if (!el) return;

  // تدمير المخطط السابق إذا كان موجوداً
  destroyChart(topEmployeesChart);
  destroyChartByCanvasId('topEmployeesChart');

  try {
    // تجهيز الكاش لو فاضي
    if (!hospitalsCache.length) {
      hospitalsCache = await loadHospitals();
      hospitalsCache.forEach(h => hospitalsById.set(String(h.HospitalID), h.HospitalName));
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
      titleText = 'أكثر الموظفين تكرّرًا في البلاغات — جميع المستشفيات';
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

      const hospitalName = hospitalsById.get(String(hospitalId)) || 'مستشفى غير محدد';
      titleText = `أكثر الموظفين تكرّرًا في البلاغات — ${hospitalName}`;
    }

    if (topEmployeesChart) topEmployeesChart.destroy();

    topEmployeesChart = new Chart(el.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'عدد البلاغات',
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
          tooltip: { callbacks: { label: (ctx) => ` ${ctx.label} : ${ctx.raw} بلاغ ` } }
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
    if (topEmployeesChart) topEmployeesChart.destroy();
    topEmployeesChart = new Chart(el.getContext('2d'), {
      type: 'bar',
      data: { labels, datasets: [{ label:'عدد البلاغات', data: values, backgroundColor: labels.map((_, i) => empBarColors[i % empBarColors.length]), borderColor:'#fff', borderWidth:1, borderRadius:8, barThickness:24, maxBarThickness:28 }]},
      options: { indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, title:{ display:true, text:'أكثر الموظفين تكرّرًا في البلاغات — مستشفى الملك عبدالعزيز (بيانات افتراضية)', font:{family:'Tajawal', size:16}, color:'#002B5B', padding:{bottom:10} }}, scales:{ x:{ beginAtZero:true, ticks:{stepSize:10}, grid:{color:'rgba(0,0,0,0.05)'} }, y:{ ticks:{ font:{family:'Tajawal'} }, grid:{display:false} } }, animation:{duration:600} }
    });
  }
}

async function updateTopEmployeesChart(hospitalId, topN) {
  await createTopEmployeesChart(hospitalId, topN);
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await createMainCharts();
    await createHospitalChart();
    await createCriticalRatioChart();

    // 1) حمّل المستشفيات واملأ القوائم
    const hospitals = await loadHospitals();
    const defaultId  = 'all'; // اختيار "الكل" كافتراضي
    const funnelSel  = document.getElementById('funnelHospital');
    const deptSel    = document.getElementById('deptCountHospital');
    const empSel     = document.getElementById('topEmployeesHospital');

    if (funnelSel) fillHospitalSelect(funnelSel, hospitals, defaultId);
    if (deptSel)   fillHospitalSelect(deptSel, hospitals, defaultId);
    if (empSel)    fillHospitalSelect(empSel, hospitals, defaultId);

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
    
    console.log('🔐 فحص صلاحيات المستخدم:', { userRoleId, userHospitalId });
    
    // إذا كان مدير تجمع، اجلب جميع المستشفيات
    if (userRoleId === 1) {
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
  hospitals.forEach(h => {
    const opt = document.createElement('option');
    opt.value = String(h.HospitalID);
    opt.textContent = h.HospitalName;
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
        'topEmployeesHospital'
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
      hospitalsCache.forEach(h => hospitalsById.set(String(h.HospitalID), h.HospitalName));
    }

    const name = hospitalsById.get(String(hospitalId)) || '—';
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

    if (hospitalFunnelChart) hospitalFunnelChart.destroy();

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

    // اخفاء أي عنصر ليس مصرح به
    document.querySelectorAll('[data-perm]').forEach(el => {
      const key = el.getAttribute('data-perm');
      const map = {
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
      if (!map[key]) el.remove(); // أو el.style.display='none'
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
