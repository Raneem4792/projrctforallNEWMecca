// ========================================
// صفحة بلاغات سوء المعاملة - Misbehavior Reports Page
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

let misbehaviorData = [];
let currentTab = 'all';
let employeesChart = null; // لتخزين مثيل الرسم البياني
let currentFilter = 'all'; // الفلتر الحالي: 'all', 'A', 'B'

// مسار صفحة التفاصيل
const DETAILS_PAGE = '../public/complaints/history/complaint-details.html';

// تهيئة الصفحة عند التحميل
document.addEventListener('DOMContentLoaded', async () => {
  // انتظر تحميل نظام الترجمة
  await new Promise(resolve => {
    if (window.misbehaviorI18n) {
      resolve();
    } else {
      const checkInterval = setInterval(() => {
        if (window.misbehaviorI18n) {
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
  
  await loadMisbehaviorData();
  await renderMistreatmentTimeChart();
  initializeEventHandlers();
  initializeChartFilter();
  
  // الاستماع لتغييرات اللغة
  if (window.misbehaviorI18n) {
    window.misbehaviorI18n.onChange(() => {
      renderReports();
      updateMostFrequentByHospital();
      renderEmployeeTable();
      renderEmployeesChart();
      renderMistreatmentTimeChart();
    });
  }
});

/**
 * تحميل بيانات بلاغات سوء المعاملة من API
 */
async function loadMisbehaviorData() {
  try {
    const API_BASE = (location.hostname==='localhost'||location.hostname==='127.0.0.1') ? 'http://localhost:3001' : '';

    // حمّل هوية المستخدم أولاً
    if (!currentUser) await loadCurrentUser();

    const qs = (!isClusterManager && userHospitalId) ? `?hospitalId=${encodeURIComponent(userHospitalId)}` : '';
    const response = await authFetch(`${API_BASE}/api/dashboard/total/misbehavior-reports${qs}`);

    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    const result = await response.json();

    if (result.success && result.data) {
      misbehaviorData = result.data.reports || [];
      
      // التحقق من وجود SubTypeName في البيانات
      if (misbehaviorData.length > 0) {
        const sample = misbehaviorData[0];
        console.log('🔍 [MISBEHAVIOR] Sample report data:', {
          ComplaintID: sample.ComplaintID,
          TicketNumber: sample.TicketNumber,
          SubTypeID: sample.SubTypeID,
          SubTypeNameAr: sample.SubTypeNameAr,
          SubTypeNameEn: sample.SubTypeNameEn,
          TypeNameAr: sample.TypeNameAr,
          TypeNameEn: sample.TypeNameEn,
          FullReport: sample
        });
        
        // التحقق من عدد البلاغات التي لديها SubTypeName
        const withSubType = misbehaviorData.filter(r => r.SubTypeNameAr || r.SubTypeNameEn);
        console.log(`📊 [MISBEHAVIOR] Reports with SubTypeName: ${withSubType.length} / ${misbehaviorData.length}`);
      }
      
      // تصنيف البلاغات إلى A أو B
      misbehaviorData = misbehaviorData.map(r => ({
        ...r,
        category: classifyMisbehavior(r),
        employeeName: extractEmployeeName(r),
        employeeId: extractEmployeeId(r)
      }));
      
      // تحديث الإحصائيات
      updateSummaryCards(result.data.summary);
      
      // عرض البيانات مع الفلتر الافتراضي (الكل - أول 5)
      if (currentTab === 'all') {
        applyFilter('all');
      } else {
        renderReports();
      }
      
      // عرض جدول الموظفين
      renderEmployeeTable();
      
      // عرض الرسم البياني
      renderEmployeesChart();
      
      console.log('تم تحميل بلاغات سوء المعاملة:', misbehaviorData.length, 'بلاغ');
      
      // جلب أسماء المستشفيات إذا لم تكن متوفرة
      await loadHospitalNames();
    }
    
  } catch (error) {
    console.error('خطأ في تحميل بلاغات سوء المعاملة:', error);
    showErrorMessage('خطأ في تحميل البيانات');
  }
}

/**
 * تحديث كروت الإحصائيات
 */
function updateSummaryCards(summary) {
  // إجمالي بلاغات سوء المعاملة
  const totalElement = document.getElementById('misbehavior-total');
  if (totalElement) totalElement.textContent = summary?.totalMisbehavior || misbehaviorData.length;
  
  // عدد المستشفيات المتأثرة
  const hospitalsElement = document.getElementById('misbehavior-hospitals');
  if (hospitalsElement) {
    hospitalsElement.textContent = summary?.affectedHospitals || new Set(misbehaviorData.map(r => r.HospitalID).filter(Boolean)).size;
  }
  
  // أكثر تصنيف فرعي تكراراً
  const topTypeElement = document.getElementById('misbehavior-top-type');
  if (topTypeElement) {
    const lang = window.misbehaviorI18n?.getLanguage() || 'ar';
    
    // محاولة استخدام mostFrequentSubType من API
    let mostFrequentSubType = summary?.mostFrequentSubType;
    
    // إذا لم يكن موجوداً في summary، احسبه من البيانات المحلية
    if (!mostFrequentSubType || mostFrequentSubType === 'غير مصنف') {
      const subTypeCounts = misbehaviorData.reduce((acc, r) => {
        const k = r.SubTypeNameAr || r.SubTypeNameEn || null;
        if (k && k !== 'null' && k.trim() && k !== 'غير مصنف') {
          acc[k] = (acc[k] || 0) + 1;
        }
        return acc;
      }, {});
      
      if (Object.keys(subTypeCounts).length > 0) {
        mostFrequentSubType = Object.entries(subTypeCounts)
          .sort((a, b) => b[1] - a[1])[0][0];
      }
    }
    
    // البحث عن البلاغ الأول لهذا التصنيف الفرعي للحصول على الأسماء
    const sampleReport = misbehaviorData.find(r => 
      (r.SubTypeNameAr || r.SubTypeNameEn) === mostFrequentSubType
    );
    
    if (sampleReport && mostFrequentSubType && mostFrequentSubType !== 'غير مصنف') {
      const subTypeName = lang === 'ar'
        ? (sampleReport.SubTypeNameAr || sampleReport.SubTypeNameEn || mostFrequentSubType)
        : (sampleReport.SubTypeNameEn || sampleReport.SubTypeNameAr || mostFrequentSubType);
      topTypeElement.textContent = subTypeName;
    } else {
      // Fallback: استخدم التصنيف الرئيسي إذا لم يكن هناك تصنيف فرعي
      const mostFrequentType = summary?.mostFrequentType || 'غير محدد';
      const sampleReportType = misbehaviorData.find(r => 
        (r.TypeNameAr || r.TypeName) === mostFrequentType
      );
      
      if (sampleReportType) {
        const typeName = lang === 'ar'
          ? (sampleReportType.TypeNameAr || sampleReportType.TypeName || mostFrequentType)
          : (sampleReportType.TypeNameEn || sampleReportType.TypeNameAr || sampleReportType.TypeName || mostFrequentType);
        topTypeElement.textContent = typeName;
      } else {
        topTypeElement.textContent = mostFrequentType;
      }
    }
  }
  
  // عرض البلاغات الأكثر تكراراً لكل مستشفى
  updateMostFrequentByHospital();
}

/**
 * تحديث عرض البلاغات الأكثر تكراراً لكل مستشفى
 */
function updateMostFrequentByHospital() {
  const container = document.getElementById('misbehavior-top-table');
  if (!container || misbehaviorData.length === 0) return;
  
  // تجميع البيانات حسب المستشفى - بناءً على التصنيف الفرعي
  const hospitalStats = {};
  const lang = window.misbehaviorI18n?.getLanguage() || 'ar';
  misbehaviorData.forEach(report => {
    const hospitalId = report.HospitalID;
    // تحديد اسم المستشفى حسب اللغة
    const hospitalName = lang === 'ar'
      ? (report.HospitalNameAr || report.HospitalName || getHospitalDisplayName(report))
      : (report.HospitalNameEn || report.HospitalNameAr || report.HospitalName || getHospitalDisplayName(report));
    
    // استخدام التصنيف الفرعي للمفتاح (للتجميع)
    // إذا لم يكن هناك تصنيف فرعي، استخدم التصنيف الرئيسي كـ fallback
    const subTypeKey = report.SubTypeNameAr || report.SubTypeNameEn || null;
    const typeKey = subTypeKey && subTypeKey !== 'null' && subTypeKey.trim() && subTypeKey !== 'غير مصنف'
      ? subTypeKey
      : (report.TypeNameAr || report.TypeName || 'غير محدد');
    
    if (!hospitalStats[hospitalId]) {
      hospitalStats[hospitalId] = {
        name: hospitalName,
        subTypes: {} // تغيير الاسم من types إلى subTypes للوضوح
      };
    }
    
    hospitalStats[hospitalId].subTypes[typeKey] = (hospitalStats[hospitalId].subTypes[typeKey] || 0) + 1;
  });
  
  // إنشاء HTML للعرض كجدول
  if (Object.keys(hospitalStats).length === 0) {
    const t = window.misbehaviorI18n?.t || ((key) => key);
    container.innerHTML = `
      <tr>
        <td colspan="3" class="py-8 text-center text-gray-500">
          ${t('table-empty')}
        </td>
      </tr>
    `;
    return;
  }
  
  const html = Object.entries(hospitalStats).map(([hospitalId, hospital]) => {
    const mostFrequent = Object.entries(hospital.subTypes)
      .sort((a, b) => b[1] - a[1])[0];
    
    // العثور على البلاغ الأول لهذا المستشفى والتصنيف الفرعي للحصول على الأسماء
    const sampleReport = misbehaviorData.find(r => {
      const rSubType = r.SubTypeNameAr || r.SubTypeNameEn;
      const rType = r.TypeNameAr || r.TypeName;
      return r.HospitalID == hospitalId && (
        (rSubType && rSubType === mostFrequent[0]) ||
        (!rSubType && rType === mostFrequent[0])
      );
    });
    
    // تحديد اسم التصنيف الفرعي حسب اللغة (أو التصنيف الرئيسي كـ fallback)
    let subTypeName;
    if (sampleReport) {
      const subTypeAr = sampleReport.SubTypeNameAr;
      const subTypeEn = sampleReport.SubTypeNameEn;
      
      if (subTypeAr && subTypeAr !== 'null' && subTypeAr.trim() && subTypeAr !== 'غير مصنف') {
        subTypeName = lang === 'ar' ? subTypeAr : (subTypeEn || subTypeAr);
      } else if (subTypeEn && subTypeEn !== 'null' && subTypeEn.trim() && subTypeEn !== 'Unclassified') {
        subTypeName = lang === 'ar' ? subTypeAr : subTypeEn;
      } else {
        // Fallback: استخدم التصنيف الرئيسي
        subTypeName = lang === 'ar'
          ? (sampleReport.TypeNameAr || sampleReport.TypeName || mostFrequent[0])
          : (sampleReport.TypeNameEn || sampleReport.TypeNameAr || sampleReport.TypeName || mostFrequent[0]);
      }
    } else {
      subTypeName = mostFrequent[0];
    }
    
    const t = window.misbehaviorI18n?.t || ((key) => key);
    const countText = lang === 'ar' ? `${mostFrequent[1]} بلاغ` : `${mostFrequent[1]} report(s)`;
    
    return `
      <tr class="border-b border-gray-100 hover:bg-gray-50">
        <td class="py-3 px-4 font-medium text-gray-800">${hospital.name}</td>
        <td class="py-3 px-4 text-gray-600">${subTypeName}</td>
        <td class="py-3 px-4 text-center">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
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
    // استخدام الفلتر الحالي
    applyFilter(currentFilter);
  } else if (currentTab === 'by-hospital') {
    renderByHospital();
  }
}

/**
 * فلترة البلاغات حسب الفئة
 */
function applyFilter(category = 'all') {
  // التأكد من أننا في تبويب "الكل"
  if (currentTab !== 'all') {
    return;
  }
  
  currentFilter = category;
  
  // تحديث حالة الأزرار
  document.querySelectorAll('#filter-all, #filter-A, #filter-B').forEach(btn => {
    btn.classList.remove('bg-purple-100', 'text-purple-700', 'border-purple-200',
                         'bg-yellow-100', 'text-yellow-700', 'border-yellow-200',
                         'bg-red-100', 'text-red-700', 'border-red-200');
    btn.classList.add('bg-gray-50', 'text-gray-600', 'border-gray-200');
  });
  
  const activeBtn = document.getElementById(`filter-${category === 'all' ? 'all' : category}`);
  if (activeBtn) {
    if (category === 'all') {
      activeBtn.classList.remove('bg-gray-50', 'text-gray-600', 'border-gray-200');
      activeBtn.classList.add('bg-purple-100', 'text-purple-700', 'border-purple-200');
    } else if (category === 'A') {
      activeBtn.classList.remove('bg-gray-50', 'text-gray-600', 'border-gray-200');
      activeBtn.classList.add('bg-yellow-100', 'text-yellow-700', 'border-yellow-200');
    } else if (category === 'B') {
      activeBtn.classList.remove('bg-gray-50', 'text-gray-600', 'border-gray-200');
      activeBtn.classList.add('bg-red-100', 'text-red-700', 'border-red-200');
    }
  }
  
  // فلترة البيانات
  let filtered = misbehaviorData;
  
  if (category === 'A') {
    filtered = misbehaviorData.filter(r => r.category === 'A');
  } else if (category === 'B') {
    filtered = misbehaviorData.filter(r => r.category === 'B');
  }
  
  // عند "الكل" → نعرض فقط أول 5
  if (category === 'all') {
    showLimitedReports(filtered);
  } else {
    renderAllReports(filtered);
    document.getElementById('show-more-wrap')?.classList.add('hidden');
  }
}

/**
 * عرض أول 5 بلاغات فقط مع زر "عرض الكل"
 */
function showLimitedReports(list) {
  const limited = list.slice(0, 5);
  renderAllReports(limited);
  
  const showMoreWrap = document.getElementById('show-more-wrap');
  if (!showMoreWrap) return;
  
  if (list.length > 5) {
    showMoreWrap.classList.remove('hidden');
    const showMoreBtn = document.getElementById('show-more-btn');
    if (showMoreBtn) {
      showMoreBtn.onclick = () => {
        renderAllReports(list);
        showMoreWrap.classList.add('hidden');
      };
    }
  } else {
    showMoreWrap.classList.add('hidden');
  }
}

/**
 * عرض جميع البلاغات
 */
function renderAllReports(data = null) {
  const container = document.getElementById('misbehavior-list');
  if (!container) return;
  
  // استخدام البيانات الممررة أو البيانات الكاملة
  const reportsToRender = data !== null ? data : misbehaviorData;
  
  if (reportsToRender.length === 0) {
    const t = window.misbehaviorI18n?.t || ((key) => key);
    container.innerHTML = `
      <div class="col-span-full text-center py-12">
        <div class="text-gray-400 text-6xl mb-4">📋</div>
        <h3 class="text-xl font-bold text-gray-600 mb-2">${t('reports-empty-title')}</h3>
        <p class="text-gray-500">${t('reports-empty-subtitle')}</p>
      </div>
    `;
    return;
  }
  
  // الحصول على اللغة الحالية
  const lang = window.misbehaviorI18n?.getLanguage() || 'ar';
  
  container.innerHTML = reportsToRender.map(report => {
    const complaintId = report.ComplaintID;
    const hospitalId = report.HospitalID;
    const ticket = report.TicketNumber;
    
    const params = new URLSearchParams({
      complaintId: String(complaintId || ''),
      hospitalId: String(hospitalId || ''),
      ticket: ticket || ''
    }).toString();
    
    // تحديد اسم المستشفى حسب اللغة
    const hospitalName = lang === 'ar' 
      ? (report.HospitalNameAr || report.hospital || report.HospitalName || getHospitalDisplayName(report) || `#${hospitalId || ''}`)
      : (report.HospitalNameEn || report.HospitalNameAr || report.hospital || report.HospitalName || getHospitalDisplayName(report) || `#${hospitalId || ''}`);
    
    // تحديد اسم التصنيف حسب اللغة
    const typeName = lang === 'ar'
      ? (report.TypeNameAr || report.TypeName || ((window.misbehaviorI18n?.t('report-undefined')) || 'غير محدد'))
      : (report.TypeNameEn || report.TypeNameAr || report.TypeName || ((window.misbehaviorI18n?.t('report-undefined')) || 'Not specified'));

    return `
    <div class="bg-white rounded-xl p-6 shadow-lg border border-purple-100 hover:shadow-xl transition-shadow">
      <div class="flex items-start justify-between mb-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
            <svg class="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 8a6 6 0 11-12 0 6 6 0 0112 0zM6 14a6 6 0 0112 0v2a2 2 0 01-2 2H8a2 2 0 01-2-2v-2z" />
            </svg>
          </div>
          <div>
            <h4 class="font-bold text-gray-800">${ticket || `#${complaintId || ''}`}</h4>
            <p class="text-sm text-gray-600">${hospitalName}</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium">
            ${translatePriority(report.PriorityCode)}
          </span>
          <span class="px-3 py-1 rounded-full text-sm font-medium ${
            report.category === 'B' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
          }">
            ${(window.misbehaviorI18n?.t(report.category === 'B' ? 'category-b' : 'category-a')) || report.category}
          </span>
        </div>
      </div>
      
      <div class="space-y-2 mb-4">
        <div class="flex justify-between">
          <span class="text-gray-500 text-sm">${(window.misbehaviorI18n?.t('report-type-label')) || 'النوع:'}</span>
          <span class="text-gray-800 text-sm font-medium">${typeName}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-500 text-sm">${(window.misbehaviorI18n?.t('report-subtype-label')) || 'التصنيف الفرعي:'}</span>
          <span class="text-gray-800 text-sm font-medium">${
            (() => {
              // محاولة جلب SubTypeName بطرق متعددة
              const subTypeAr = report.SubTypeNameAr || report.SubTypeName || null;
              const subTypeEn = report.SubTypeNameEn || null;
              
              if (lang === 'ar') {
                return subTypeAr || subTypeEn || 'غير مصنف';
              } else {
                return subTypeEn || subTypeAr || 'Unclassified';
              }
            })()
          }</span>
        </div>
        ${report.employeeName && report.employeeName !== 'غير معروف' ? `
        <div class="flex justify-between">
          <span class="text-gray-500 text-sm">الموظف:</span>
          <span class="text-gray-800 text-sm font-medium">${report.employeeName}</span>
        </div>
        ` : ''}
        <div class="flex justify-between">
          <span class="text-gray-500 text-sm">${(window.misbehaviorI18n?.t('report-department-label')) || 'القسم:'}</span>
          <span class="text-gray-800 text-sm font-medium">${report.DepartmentName || ((window.misbehaviorI18n?.t('report-undefined')) || 'غير محدد')}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-500 text-sm">${(window.misbehaviorI18n?.t('report-status-label')) || 'الحالة:'}</span>
          <span class="text-gray-800 text-sm font-medium">${translateStatus(report.StatusCode)}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-500 text-sm">${(window.misbehaviorI18n?.t('report-date-label')) || 'التاريخ:'}</span>
          <span class="text-gray-800 text-sm font-medium">${formatDate(report.CreatedAt)}</span>
        </div>
      </div>
      
      <div class="pt-4 border-t border-gray-100">
        <a href="${DETAILS_PAGE}?${params}"
           class="block w-full text-center bg-purple-50 text-purple-700 py-2 px-4 rounded-lg hover:bg-purple-100 transition-colors text-sm font-medium">
          ${(window.misbehaviorI18n?.t('report-details-button')) || 'عرض التفاصيل'}
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
  const container = document.getElementById('misbehavior-hospitals-grid');
  if (!container) return;
  
  // تجميع البلاغات حسب المستشفى
  const lang = window.misbehaviorI18n?.getLanguage() || 'ar';
  let reportsByHospital = {};
  misbehaviorData.forEach(report => {
    const hospitalId = report.HospitalID;
    if (!reportsByHospital[hospitalId]) {
      // تحديد اسم المستشفى حسب اللغة
      const hospitalName = lang === 'ar'
        ? (report.HospitalNameAr || report.HospitalName || getHospitalDisplayName(report))
        : (report.HospitalNameEn || report.HospitalNameAr || report.HospitalName || getHospitalDisplayName(report));
      reportsByHospital[hospitalId] = {
        hospitalName: hospitalName,
        reports: []
      };
    }
    reportsByHospital[hospitalId].reports.push(report);
  });
  
  if (Object.keys(reportsByHospital).length === 0) {
    const t = window.misbehaviorI18n?.t || ((key) => key);
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
    const firstReport = hospital.reports[0];
    const complaintId = firstReport?.ComplaintID;
    const hospitalId = firstReport?.HospitalID;
    const ticket = firstReport?.TicketNumber;
    
    const params = new URLSearchParams({
      complaintId: String(complaintId || ''),
      hospitalId: String(hospitalId || ''),
      ticket: ticket || ''
    }).toString();
    
    return `
    <div class="bg-white rounded-xl p-6 shadow-lg border border-purple-100">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
          <svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16"/>
          </svg>
        </div>
        <div>
          <h3 class="font-bold text-gray-800">${hospital.hospitalName}</h3>
          <p class="text-sm text-gray-600">${(window.misbehaviorI18n?.t('reports-hospital-count', { count: hospital.reports.length })) || `${hospital.reports.length} بلاغ سوء معاملة`}</p>
        </div>
      </div>
      
      <div class="space-y-2">
        ${hospital.reports.slice(0, 3).map(report => {
          const reportComplaintId = report.ComplaintID;
          const reportHospitalId = report.HospitalID;
          const reportTicket = report.TicketNumber;
          
          const reportParams = new URLSearchParams({
            complaintId: String(reportComplaintId || ''),
            hospitalId: String(reportHospitalId || ''),
            ticket: reportTicket || ''
          }).toString();
          
          // تحديد اسم التصنيف حسب اللغة
          const typeName = lang === 'ar'
            ? (report.TypeNameAr || report.TypeName || ((window.misbehaviorI18n?.t('report-undefined')) || 'غير محدد'))
            : (report.TypeNameEn || report.TypeNameAr || report.TypeName || ((window.misbehaviorI18n?.t('report-undefined')) || 'Not specified'));
          
          return `
          <a href="${DETAILS_PAGE}?${reportParams}" class="block">
            <div class="flex items-center justify-between p-3 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors cursor-pointer">
              <div>
                <p class="font-medium text-gray-800 text-sm">${reportTicket || `#${reportComplaintId || ''}`}</p>
                <p class="text-xs text-gray-600">${typeName}</p>
              </div>
              <span class="text-xs text-purple-600 font-medium">${translatePriority(report.PriorityCode)}</span>
            </div>
          </a>
        `;
        }).join('')}
        
        ${hospital.reports.length > 3 ? `
          <div class="text-center pt-2">
            <span class="text-sm text-gray-500">${(window.misbehaviorI18n?.t('reports-more-count', { count: hospital.reports.length - 3 })) || `و ${hospital.reports.length - 3} بلاغات أخرى`}</span>
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
  
  // معالجات أزرار الفلترة
  const filterAllBtn = document.getElementById('filter-all');
  const filterABtn = document.getElementById('filter-A');
  const filterBBtn = document.getElementById('filter-B');
  
  if (filterAllBtn) {
    filterAllBtn.addEventListener('click', () => {
      if (currentTab === 'all') {
        applyFilter('all');
      }
    });
  }
  
  if (filterABtn) {
    filterABtn.addEventListener('click', () => {
      if (currentTab === 'all') {
        applyFilter('A');
      }
    });
  }
  
  if (filterBBtn) {
    filterBBtn.addEventListener('click', () => {
      if (currentTab === 'all') {
        applyFilter('B');
      }
    });
  }
}

/**
 * تبديل التبويبات
 */
function switchTab(tab) {
  currentTab = tab;
  
  // تحديث أزرار التبويب
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('bg-purple-50', 'text-purple-700', 'border-purple-200');
    btn.classList.add('bg-gray-50', 'border');
  });
  
  const activeBtn = document.querySelector(`[data-tab="${tab}"]`);
  if (activeBtn) {
    activeBtn.classList.remove('bg-gray-50', 'border');
    activeBtn.classList.add('bg-purple-50', 'text-purple-700', 'border-purple-200');
  }
  
  // إظهار/إخفاء أزرار الفلترة (تظهر فقط في تبويب "الكل")
  const filterContainer = document.getElementById('filter-buttons-container');
  if (filterContainer) {
    if (tab === 'all') {
      filterContainer.style.display = 'flex';
    } else {
      filterContainer.style.display = 'none';
    }
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
  if (tab === 'all') {
    // استخدام الفلتر الحالي عند العودة لتبويب "الكل"
    applyFilter(currentFilter);
  } else {
    renderReports();
  }
}

/**
 * تنسيق التاريخ
 */
function formatDate(dateString) {
  if (!dateString) return 'غير محدد';
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
  if (!window.misbehaviorI18n) {
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
  
  const t = window.misbehaviorI18n.t;
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
  if (!window.misbehaviorI18n) {
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
  
  const t = window.misbehaviorI18n.t;
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
    const hospitalIds = [...new Set(misbehaviorData.map(report => report.HospitalID).filter(Boolean))];
    
    if (hospitalIds.length === 0) return;
    
    const API_BASE = (location.hostname==='localhost'||location.hostname==='127.0.0.1') ? 'http://localhost:3001' : '';
    
    // جلب أسماء المستشفيات من API
    const response = await authFetch(`${API_BASE}/api/hospitals`);
    if (response.ok) {
      const hospitals = await response.json();
      const hospitalMap = new Map(hospitals.map(h => [h.HospitalID, h.NameAr]));
      
      // تحديث البيانات
      misbehaviorData.forEach(report => {
        const hospitalId = report.HospitalID;
        if (hospitalId && hospitalMap.has(hospitalId)) {
          report.HospitalName = hospitalMap.get(hospitalId);
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
  const lang = window.misbehaviorI18n?.getLanguage() || 'ar';
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
  const hospitalId = report.HospitalID;
  if (hospitalId) {
    return lang === 'ar' ? `مستشفى ${hospitalId}` : `Hospital ${hospitalId}`;
  }
  
  return lang === 'ar' ? 'غير محدد' : 'Not specified';
}

/**
 * عرض رسالة خطأ
 */
function showErrorMessage(message) {
  const container = document.getElementById('misbehavior-list');
  if (container) {
    const t = window.misbehaviorI18n?.t || ((key) => key);
    container.innerHTML = `
      <div class="col-span-full text-center py-12">
        <div class="text-red-400 text-6xl mb-4">⚠️</div>
        <h3 class="text-xl font-bold text-red-600 mb-2">${t('error-title')}</h3>
        <p class="text-gray-500">${message}</p>
      </div>
    `;
  }
}

/**
 * تصنيف البلاغ إلى فئة A أو B
 */
function classifyMisbehavior(report) {
  // أولاً: التحقق من SubTypeName (الأولوية للتصنيف الرسمي)
  const subTypeAr = (report.SubTypeNameAr || '').toLowerCase().trim();
  const subTypeEn = (report.SubTypeNameEn || '').toLowerCase().trim();
  const subType = subTypeAr || subTypeEn;
  
  // Category B - سوء معاملة جسيمة (تحرش فقط)
  const bKeywords = ['تحرش', 'harassment'];
  if (bKeywords.some(k => subType.includes(k.toLowerCase()))) {
    return 'B';
  }
  
  // ثانياً: التحقق من Description كـ fallback
  const desc = (report.Description || '').toLowerCase().trim();
  if (bKeywords.some(k => desc.includes(k.toLowerCase()))) {
    return 'B';
  }
  
  // Default: Category A (جميع الحالات الأخرى)
  return 'A';
}

/**
 * استخراج اسم الموظف من الوصف
 */
function extractEmployeeName(report) {
  const desc = report.Description || '';
  // محاولة استخراج اسم الموظف من الوصف (يمكن تحسين هذا)
  const nameMatch = desc.match(/(?:موظف|الموظف|اسم|الاسم)[\s:]+([أ-ي\s]+)/i);
  if (nameMatch && nameMatch[1]) {
    return nameMatch[1].trim();
  }
  return 'غير معروف';
}

/**
 * استخراج الرقم الوظيفي من الوصف
 */
function extractEmployeeId(report) {
  const desc = report.Description || '';
  // محاولة استخراج الرقم الوظيفي
  const idMatch = desc.match(/(?:رقم|الرقم|رقم وظيفي)[\s:]+(\d+)/i);
  if (idMatch && idMatch[1]) {
    return idMatch[1].trim();
  }
  return '—';
}

/**
 * استخراج الشهر من التاريخ
 */
function extractMonth(dateString) {
  if (!dateString) return '—';
  const date = new Date(dateString);
  const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
                  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  return months[date.getMonth()] || date.toLocaleDateString('ar-SA', { month: 'long' });
}

/**
 * عرض جدول الموظفين
 * يجلب البيانات من جدول complaint_targets
 */
async function renderEmployeeTable() {
  const tbody = document.getElementById('misbehavior-employees-tbody');
  if (!tbody) return;
  
  tbody.innerHTML = '<tr><td colspan="13" class="py-4 text-center text-gray-500">جاري التحميل...</td></tr>';
  
  try {
    const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'http://localhost:3001' : '';

    // حمّل هوية المستخدم أولاً إذا لم تكن محملة
    if (!currentUser) await loadCurrentUser();

    // بناء query string للفلترة حسب المستشفى
    let qs = '';
    if (!isClusterManager && userHospitalId) {
      qs = `?hospitalId=${encodeURIComponent(userHospitalId)}`;
    }

    // جلب البيانات من الـ endpoint الجديد
    const response = await authFetch(`${API_BASE}/api/dashboard/total/employee-complaints-table${qs}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    if (!result.success || !result.data || result.data.length === 0) {
      const t = window.misbehaviorI18n?.t || ((key) => key);
      tbody.innerHTML = `
        <tr>
          <td colspan="12" class="py-8 text-center text-gray-500">
            ${t('table-empty')}
          </td>
        </tr>
      `;
      return;
    }
    
    const employeesData = result.data;
    const t = window.misbehaviorI18n?.t || ((key) => key);
    
    tbody.innerHTML = '';
    
    employeesData.forEach(emp => {
      // تحديد لون الإجراء
      let actionClass = 'text-gray-400';
      if (emp.requiredAction.includes('🔴') || emp.requiredAction.includes('فورية')) {
        actionClass = 'text-red-600 font-bold';
      } else if (emp.requiredAction.includes('⚠️')) {
        actionClass = 'text-orange-600 font-medium';
      }
      
      // تحديد حالة البلاغ
      const status = (emp.caseStatus && (emp.caseStatus.includes('مكتمل') || emp.caseStatus.includes('محلول') || emp.caseStatus.toLowerCase().includes('closed')))
        ? t('completed')
        : t('incomplete');
      
      const row = document.createElement('tr');
      row.className = 'border-b border-gray-200 hover:bg-gray-50';
      row.innerHTML = `
        <td class="p-3 border border-gray-200 text-right">${emp.hospitalName || 'غير محدد'}</td>
        <td class="p-3 border border-gray-200 text-center">${emp.month || '—'}</td>
        <td class="p-3 border border-gray-200 font-medium">${emp.name || 'غير معروف'}</td>
        <td class="p-3 border border-gray-200 text-center">${emp.employeeId || '—'}</td>
        <td class="p-3 border border-gray-200">${emp.department || 'غير محدد'}</td>
        <td class="p-3 border border-gray-200 text-center font-bold">${emp.totalCount || 0}</td>
        <td class="p-3 border border-gray-200 text-center">${emp.didGuidanceSession === 1 ? t('yes') : t('no')}</td>
        <td class="p-3 border border-gray-200 text-center">${emp.didDirectorAction === 1 ? t('yes') : t('no')}</td>
        <td class="p-3 border border-gray-200 text-center">${emp.didLegalReferral === 1 ? t('yes') : t('no')}</td>
        <td class="p-3 border border-gray-200 text-center">${emp.didAnnualEvaluation === 1 ? t('yes') : t('no')}</td>
        <td class="p-3 border border-gray-200 text-center">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            status === t('completed') ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
          }">
            ${status}
          </span>
        </td>
        <td class="p-3 border border-gray-200 ${actionClass}">${emp.requiredAction || t('no-action')}</td>
      `;
      tbody.appendChild(row);
    });
    
    console.log('✅ تم تحميل جدول الموظفين من complaint_targets:', employeesData.length, 'موظف');
  } catch (error) {
    console.error('❌ خطأ في تحميل جدول الموظفين:', error);
    const t = window.misbehaviorI18n?.t || ((key) => key);
      tbody.innerHTML = `
        <tr>
          <td colspan="12" class="py-8 text-center text-red-500">
            <p>حدث خطأ في تحميل البيانات</p>
            <p class="text-sm text-gray-500 mt-2">${error.message}</p>
          </td>
        </tr>
      `;
  }
}

/**
 * تهيئة فلتر المستشفى للرسم البياني
 */
async function initializeChartFilter() {
  // حمّل هوية المستخدم أولاً
  if (!currentUser) await loadCurrentUser();

  const filterContainer = document.getElementById('chart-hospital-filter-container');
  const filterSelect = document.getElementById('chartHospitalFilter');
  
  if (!filterContainer || !filterSelect) return;

  // إظهار الفلتر فقط لمديري التجمع
  if (isClusterManager) {
    filterContainer.classList.remove('hidden');
    
    // تحميل قائمة المستشفيات
    try {
      const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
        ? 'http://localhost:3001' : '';

      const response = await authFetch(`${API_BASE}/api/hospitals?active=1`);
      if (response.ok) {
        const hospitals = await response.json();
        const hospitalsList = Array.isArray(hospitals) ? hospitals : (hospitals?.data || hospitals?.hospitals || []);
        
        // إضافة خيار "جميع المستشفيات"
        filterSelect.innerHTML = '<option value="">جميع المستشفيات</option>';
        
        // إضافة المستشفيات
        hospitalsList.forEach(hospital => {
          const option = document.createElement('option');
          option.value = hospital.HospitalID;
          option.textContent = hospital.NameAr || hospital.NameEn || `مستشفى ${hospital.HospitalID}`;
          filterSelect.appendChild(option);
        });
        
        // إضافة event listener للفلتر
        filterSelect.addEventListener('change', () => {
          renderEmployeesChart();
        });
      }
    } catch (error) {
      console.error('❌ خطأ في تحميل قائمة المستشفيات:', error);
    }
  } else {
    filterContainer.classList.add('hidden');
  }
}

/**
 * عرض الرسم البياني للموظفين
 * يجلب البيانات من جدول complaint_targets
 */
async function renderEmployeesChart() {
  const ctx = document.getElementById('employeesChart');
  if (!ctx) return;
  
  // تدمير الرسم السابق إن وجد
  if (employeesChart) {
    employeesChart.destroy();
  }
  
  try {
    const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'http://localhost:3001' : '';

    // حمّل هوية المستخدم أولاً إذا لم تكن محملة
    if (!currentUser) await loadCurrentUser();

    // بناء query string للفلترة حسب المستشفى
    let qs = '';
    const filterSelect = document.getElementById('chartHospitalFilter');
    
    if (isClusterManager && filterSelect && filterSelect.value) {
      // إذا كان مدير واختار مستشفى محدد
      qs = `?hospitalId=${encodeURIComponent(filterSelect.value)}`;
    } else if (!isClusterManager && userHospitalId) {
      // إذا كان موظف عادي
      qs = `?hospitalId=${encodeURIComponent(userHospitalId)}`;
    }

    // جلب البيانات من الـ endpoint الجديد
    const response = await authFetch(`${API_BASE}/api/dashboard/total/employee-complaints-chart${qs}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    if (!result.success || !result.data || result.data.length === 0) {
      // إذا لم توجد بيانات، اعرض رسالة
      ctx.parentElement.innerHTML = `
        <div class="text-center py-8 text-gray-500">
          <p>لا توجد بيانات متاحة للعرض</p>
        </div>
      `;
      return;
    }
    
    const employeesData = result.data;
    
    // استخراج البيانات للرسم البياني (عدد إجمالي فقط)
    const labels = employeesData.map(e => e.name || 'غير معروف');
    const counts = employeesData.map(e => e.count || 0);
    
    employeesChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'عدد البلاغات',
            data: counts,
            backgroundColor: '#9333EA',
            borderColor: '#7C3AED',
            borderWidth: 1
          }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false // إخفاء الليجند
          },
          title: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                return `عدد البلاغات: ${context.parsed.x}`;
              }
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'عدد البلاغات'
            }
          },
          y: {
            title: {
              display: true,
              text: 'اسم الموظف'
            },
            ticks: {
              maxRotation: 0, // عدم تدوير النصوص
              minRotation: 0,
              autoSkip: false // عرض جميع التسميات
            }
          }
        },
        // إضافة التمرير إذا كانت البيانات كثيرة
        plugins: [{
          id: 'chartjs-plugin-datalabels',
          afterDraw: (chart) => {
            // يمكن إضافة منطق إضافي هنا إذا لزم الأمر
          }
        }]
      }
    });
    
    console.log('✅ تم تحميل الرسم البياني للموظفين من complaint_targets:', employeesData.length, 'موظف');
    console.log('📊 بيانات الموظفين:', employeesData);
  } catch (error) {
    console.error('❌ خطأ في تحميل الرسم البياني للموظفين:', error);
    
    // عرض رسالة خطأ
    ctx.parentElement.innerHTML = `
      <div class="text-center py-8 text-red-500">
        <p>حدث خطأ في تحميل البيانات</p>
        <p class="text-sm text-gray-500 mt-2">${error.message}</p>
      </div>
    `;
  }
}

let mistreatmentTimeChart = null;
const FONT_FAMILY = 'Tajawal';

function formatArabicNumber(value) {
  return Number(value || 0).toLocaleString('ar-SA');
}

/**
 * رسم مخطط بلاغات سوء التعامل ومتوسط زمن الإغلاق لكل مستشفى
 */
async function renderMistreatmentTimeChart() {
  const canvas = document.getElementById('chartMistreatmentTime');
  if (!canvas) return;

  // تدمير الرسم السابق إن وجد
  if (mistreatmentTimeChart) {
    mistreatmentTimeChart.destroy();
    mistreatmentTimeChart = null;
  }

  try {
    const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'http://localhost:3001' : '';

    // جلب البيانات من API
    const response = await authFetch(`${API_BASE}/api/dashboard/urgent/all`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const mistreatmentSla = Array.isArray(data.mistreatmentSla) ? data.mistreatmentSla : [];

    if (mistreatmentSla.length === 0) {
      console.warn('⚠️ لا توجد بيانات لرسم مخطط بلاغات سوء التعامل');
      return;
    }

    const slaData = mistreatmentSla.map(h => ({
      name: h.name || 'غير محدد',
      within24: Number(h.within24 || 0),
      over24: Number(h.over24 || 0),
      id: h.id
    }));

    // التحقق من الوضع الداكن
    const isDark = document.documentElement.classList.contains('dark') || 
                   document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#FFFFFF' : '#1f2937';
    const axisTextColor = isDark ? '#FFFFFF' : '#374151';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(156, 163, 175, 0.3)';

    mistreatmentTimeChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: slaData.map(h => h.name),
        datasets: [
          {
            label: 'مغلقة خلال 24 ساعة',
            data: slaData.map(h => h.within24),
            backgroundColor: '#10b981',
            borderColor: '#059669',
            borderWidth: 2,
            borderRadius: 10,
            borderSkipped: false,
            barThickness: 40,
            maxBarThickness: 50
          },
          {
            label: 'متجاوزة 24 ساعة',
            data: slaData.map(h => h.over24),
            backgroundColor: '#ef4444',
            borderColor: '#dc2626',
            borderWidth: 2,
            borderRadius: 10,
            borderSkipped: false,
            barThickness: 40,
            maxBarThickness: 50
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'nearest',
          axis: 'x',
          intersect: true
        },
        onClick: async (event, elements) => {
          if (elements && elements.length > 0) {
            const element = elements[0];
            const index = element.index;
            const datasetIndex = element.datasetIndex;
            const hospital = slaData[index];
            if (hospital && hospital.id) {
              const within24 = datasetIndex === 0;
              const over24 = datasetIndex === 1;
              await openComplaintsModal(hospital.id, hospital.name, within24, over24);
            }
          }
        },
        onHover: (event, elements) => {
          event.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
        },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              font: { family: FONT_FAMILY, size: 14, weight: 600 },
              color: textColor,
              padding: 20,
              usePointStyle: true,
              pointStyle: 'rectRounded'
            }
          },
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            titleColor: '#ffffff',
            bodyColor: '#ffffff',
            borderColor: '#374151',
            borderWidth: 1,
            cornerRadius: 12,
            displayColors: true,
            callbacks: {
              title: (tooltipItems) => {
                return `🏥 ${tooltipItems[0].label}`;
              },
              label: (ctx) => {
                if (ctx.datasetIndex === 0) {
                  return `✅ مغلقة خلال 24 ساعة: ${formatArabicNumber(ctx.raw)} بلاغ`;
                }
                return `❌ متجاوزة 24 ساعة: ${formatArabicNumber(ctx.raw)} بلاغ`;
              },
              afterBody: () => '👆 انقر لعرض تفاصيل البلاغات'
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: axisTextColor,
              font: { family: FONT_FAMILY, size: 12, weight: 600 },
              maxRotation: 45,
              minRotation: 0
            }
          },
          y: {
            beginAtZero: true,
            grid: { 
              color: gridColor,
              drawBorder: false 
            },
            ticks: {
              color: axisTextColor,
              font: { family: FONT_FAMILY, size: 11, weight: 600 },
              stepSize: 1,
              callback: function(value) {
                return formatArabicNumber(value);
              }
            },
            title: {
              display: true,
              text: 'عدد البلاغات',
              color: axisTextColor,
              font: { family: FONT_FAMILY, size: 14, weight: 'bold' },
              padding: { bottom: 10 }
            }
          }
        },
        animation: {
          duration: 1000,
          easing: 'easeInOutQuart'
        }
      }
    });

    console.log('✅ تم رسم مخطط بلاغات سوء التعامل ومتوسط زمن الإغلاق');
  } catch (error) {
    console.error('❌ خطأ في رسم مخطط بلاغات سوء التعامل:', error);
  }
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * فتح نافذة منبثقة لعرض قائمة البلاغات
 */
async function openComplaintsModal(hospitalId, hospitalName, within24 = false, over24 = false) {
  const modal = document.getElementById('complaintsModal');
  const modalTitleElement = document.getElementById('modal-title');
  const loading = document.getElementById('complaintsModalLoading');
  const empty = document.getElementById('complaintsModalEmpty');
  const content = document.getElementById('complaintsModalContent');
  const list = document.getElementById('complaints-list');

  // تغيير عنوان الـ Modal لبلاغات سوء التعامل
  if (modalTitleElement) {
    let titleText = 'بلاغات سوء التعامل';
    if (within24) titleText += ' (مغلقة خلال 24 ساعة)';
    if (over24) titleText += ' (متجاوزة 24 ساعة)';
    modalTitleElement.innerHTML = `${titleText} - <span id="modal-hospital-name"></span>`;
  }

  // إظهار الـ Modal
  modal.classList.remove('hidden');
  // تحديث اسم المستشفى بعد إعادة إنشاء span
  const updatedTitle = document.getElementById('modal-hospital-name');
  if (updatedTitle) {
    updatedTitle.textContent = hospitalName || 'غير محدد';
  }

  // إخفاء المحتوى وإظهار التحميل
  loading.classList.remove('hidden');
  empty.classList.add('hidden');
  content.classList.add('hidden');
  list.innerHTML = '';

  try {
    // جلب البلاغات
    let complaints = await loadComplaintsForHospital(hospitalId);

    // تصفية حسب SLA إذا تم التحديد
    console.log(`🔍 [openComplaintsModal] تصفية البلاغات: within24=${within24}, over24=${over24}, عدد البلاغات قبل التصفية: ${complaints.length}`);
    
    if (within24 || over24) {
      complaints = complaints.filter(c => {
        const status = String(c.StatusCode || c.status || '').toUpperCase();
        const isClosed = ['CLOSED', 'RESOLVED', 'CANCELLED', 'مغلق', 'محلول', 'منتهي', 'مكتمل']
          .some(s => status.includes(s));

        // تحسين حساب الساعات لمطابقة المنطق في المخطط البياني
        let hours = 9999;
        const actualHours = Number(c.ActualClosingHours ?? c.actualClosingHours ?? 0);

        if (!isNaN(actualHours) && actualHours > 0) {
           hours = actualHours;
        } else {
           // حساب تقريبي في حال عدم توفر ActualClosingHours
           let createdStr = String(c.createdAt || c.CreatedAt || '');
           // إصلاح صيغة التاريخ للمتصفحات (استبدال المسافة بـ T)
           if (createdStr && createdStr.indexOf('T') === -1) createdStr = createdStr.replace(' ', 'T');
           
           const created = createdStr ? new Date(createdStr) : null;
           
           // استخدام تاريخ التحديث كتقريب لتاريخ الإغلاق للبلاغات المغلقة
           let endStr = String(c.lastUpdate || c.UpdatedAt || c.updatedAt || '');
           if (endStr && endStr.indexOf('T') === -1) endStr = endStr.replace(' ', 'T');
           
           const end = (isClosed && endStr) ? new Date(endStr) : new Date();
           
           if (created && !isNaN(created.getTime()) && !isNaN(end.getTime())) {
             const diffMs = end.getTime() - created.getTime();
             if (diffMs > 0) {
               hours = diffMs / (1000 * 60 * 60);
             }
           }
        }

        let matches = false;
        
        if (within24) {
          // يجب أن تكون مغلقة وخلال 24 ساعة
          matches = isClosed && hours <= 24;
          if (matches) {
            console.log(`✅ [within24] بلاغ مطابق:`, {
              TicketNumber: c.TicketNumber || c.ticket,
              Status: status,
              isClosed,
              hours: hours.toFixed(2)
            });
          }
        } else if (over24) {
          // إما غير مغلقة (مفتوحة) أو مغلقة وتجاوزت 24 ساعة
          matches = !isClosed || hours > 24;
          if (matches) {
            console.log(`✅ [over24] بلاغ مطابق:`, {
              TicketNumber: c.TicketNumber || c.ticket,
              Status: status,
              isClosed,
              hours: hours.toFixed(2)
            });
          }
        } else {
          matches = true;
        }
        
        return matches;
      });
      
      console.log(`✅ [openComplaintsModal] بعد التصفية: ${complaints.length} بلاغ`);
    }
    
    // إخفاء التحميل
    loading.classList.add('hidden');

    if (!complaints || complaints.length === 0) {
      empty.classList.remove('hidden');
    } else {
      content.classList.remove('hidden');
      renderComplaintsList(complaints);
    }
  } catch (error) {
    console.error('خطأ في جلب البلاغات:', error);
    loading.classList.add('hidden');
    empty.classList.remove('hidden');
    empty.innerHTML = '<p class="text-red-600">حدث خطأ في تحميل البلاغات</p>';
  }
}

function closeComplaintsModal() {
  const modal = document.getElementById('complaintsModal');
  modal.classList.add('hidden');
}

async function loadComplaintsForHospital(hospitalId) {
  try {
    const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'http://localhost:3001' : '';

    // ✅ API يحدد pageSize بحد أقصى 100، لذا نجلب البيانات على عدة صفحات
    let allComplaints = [];
    let page = 1;
    const pageSize = 100; // الحد الأقصى المسموح به من API
    let hasMore = true;

    while (hasMore) {
      const response = await authFetch(
        `${API_BASE}/api/complaints/history?hospitalId=${hospitalId}&pageSize=${pageSize}&page=${page}`
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const items = safeArray(data.items || []);
      
      if (items.length === 0) {
        hasMore = false;
      } else {
        allComplaints = allComplaints.concat(items);
        // إذا كان عدد الصفحات أقل من pageSize، يعني وصلنا للنهاية
        if (items.length < pageSize) {
          hasMore = false;
        } else {
          page++;
          // حد أقصى 10 صفحات (1000 بلاغ) لمنع الحلقات اللانهائية
          if (page > 10) {
            hasMore = false;
          }
        }
      }
    }

    console.log(`📊 [loadComplaintsForHospital] تم جلب ${allComplaints.length} بلاغ من المستشفى ${hospitalId} (${page} صفحة)`);

    // فلترة بلاغات سوء التعامل (ComplaintTypeID = 17 أو SubTypeID = 15, 29, 8)
    // ✅ يجب أن يكون سوء تعامل + عاجل (URGENT, CRITICAL, HIGH) - نفس منطق mistreatmentSla
    const mistreatmentComplaints = allComplaints.filter(complaint => {
      const typeId = Number(complaint.type || complaint.ComplaintTypeID || 0);
      const subTypeId = Number(complaint.subTypeId || complaint.SubTypeID || 0);
      
      // التحقق من PriorityCode - يجب أن يكون URGENT, CRITICAL, HIGH
      const priority = String(complaint.priority || complaint.PriorityCode || '').toUpperCase();
      const isUrgent = priority === 'URGENT' || priority === 'CRITICAL' || priority === 'HIGH' ||
                       priority === 'حرجة' || priority === 'عاجلة' || priority === 'عالية' ||
                       priority === 'حرج' || priority === 'عاجل';

      const isMistreatment = typeId === 17 || subTypeId === 15 || subTypeId === 29 || subTypeId === 8;
      
      // يجب أن يكون سوء تعامل + عاجل (نفس منطق mistreatmentSla في backend)
      const result = isMistreatment && isUrgent;
      
      return result;
    });

    console.log(`✅ [loadComplaintsForHospital] تم تصفية ${mistreatmentComplaints.length} بلاغ سوء تعامل عاجل من إجمالي ${allComplaints.length} بلاغ`);

    return mistreatmentComplaints;
  } catch (error) {
    console.error('❌ خطأ في loadComplaintsForHospital:', error);
    throw error;
  }
}

function renderComplaintsList(complaints) {
  const list = document.getElementById('complaints-list');
  list.innerHTML = '';

  if (complaints.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'text-center py-8 text-gray-500';
    emptyDiv.textContent = 'لا توجد بلاغات';
    list.appendChild(emptyDiv);
    return;
  }

  complaints.forEach((complaint, index) => {
    const item = document.createElement('div');
    item.className = 'border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-md cursor-pointer transition-all bg-white';
    item.onclick = () => openComplaintDetails(complaint);

    const ticket = complaint.ticket || complaint.TicketNumber || `#${complaint.id || complaint.ComplaintID}`;
    const patientName = complaint.fullName || complaint.PatientFullName || 'غير محدد';
    const status = (complaint.status || complaint.StatusCode || 'open').toLowerCase();
    const createdAt = complaint.createdAt || complaint.CreatedAt || '';
    const description = complaint.Description || complaint.description || '';
    const priority = complaint.priority || complaint.PriorityCode || 'MEDIUM';

    const statusColors = {
      'open': 'bg-blue-100 text-blue-800',
      'closed': 'bg-gray-100 text-gray-800',
      'in_progress': 'bg-yellow-100 text-yellow-800',
      'resolved': 'bg-green-100 text-green-800',
      'مفتوح': 'bg-blue-100 text-blue-800',
      'مغلق': 'bg-gray-100 text-gray-800',
      'قيد المعالجة': 'bg-yellow-100 text-yellow-800',
      'محلول': 'bg-green-100 text-green-800'
    };

    const statusText = {
      'open': 'مفتوح',
      'closed': 'مغلق',
      'in_progress': 'قيد المعالجة',
      'resolved': 'محلول',
      'مفتوح': 'مفتوح',
      'مغلق': 'مغلق',
      'قيد المعالجة': 'قيد المعالجة',
      'محلول': 'محلول'
    };

    const statusClass = statusColors[status] || 'bg-gray-100 text-gray-800';
    const statusLabel = statusText[status] || status;

    const priorityBadge = priority && priority.toUpperCase() === 'URGENT' 
      ? '<span class="text-xs px-2 py-1 rounded-full bg-red-100 text-red-800 mr-2">عاجل</span>'
      : '';

    item.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-2 flex-wrap">
            <span class="font-bold text-gray-900" style="color:#002B5B">${ticket}</span>
            ${priorityBadge}
            <span class="text-xs px-2 py-1 rounded-full ${statusClass}">${statusLabel}</span>
          </div>
          <p class="text-sm font-medium text-gray-800 mb-1">${patientName}</p>
          ${description ? `<p class="text-xs text-gray-600 mb-2 line-clamp-2">${description.substring(0, 100)}${description.length > 100 ? '...' : ''}</p>` : ''}
          ${createdAt ? `<p class="text-xs text-gray-500 flex items-center gap-1">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            ${createdAt}
          </p>` : ''}
        </div>
        <svg class="w-5 h-5 text-gray-400 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </div>
    `;

    list.appendChild(item);
  });
}

function openComplaintDetails(complaint) {
  // إغلاق الـ Modal أولاً
  closeComplaintsModal();

  // فتح صفحة تفاصيل البلاغ
  const ticket = complaint.ticket || complaint.TicketNumber || '';
  const hospitalId = complaint.hospitalId || complaint.HospitalID || complaint.hospitalId;

  // التأكد من وجود ticket (مطلوب لصفحة complaint-details.html)
  if (!ticket) {
    console.error('لا يمكن فتح التفاصيل: لا يوجد رقم البلاغ (TicketNumber)');
    alert('خطأ: لا يمكن العثور على رقم البلاغ');
    return;
  }

  // بناء رابط صفحة complaint-details.html
  // المسار النسبي: من dashboard/ إلى public/complaints/history/
  let detailsUrl = '../public/complaints/history/complaint-details.html';
  const params = new URLSearchParams();
  params.set('ticket', ticket);
  
  if (hospitalId) {
    params.set('hid', String(hospitalId));
  }

  detailsUrl += '?' + params.toString();
  
  console.log('🔗 فتح صفحة تفاصيل البلاغ:', detailsUrl);
  
  // الانتقال لصفحة التفاصيل
  window.location.href = detailsUrl;
}

// جعل الدوال متاحة بشكل عام
window.openComplaintsModal = openComplaintsModal;
window.closeComplaintsModal = closeComplaintsModal;
