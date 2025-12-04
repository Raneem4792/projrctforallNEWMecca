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
  initializeEventHandlers();
  
  // الاستماع لتغييرات اللغة
  if (window.misbehaviorI18n) {
    window.misbehaviorI18n.onChange(() => {
      renderReports();
      updateMostFrequentByHospital();
      renderEmployeeTable();
      renderEmployeesChart();
      renderAlerts();
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
      
      // عرض الإشعارات
      renderAlerts();
      
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
 */
function renderEmployeeTable() {
  const tbody = document.getElementById('misbehavior-employees-tbody');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  // تجميع البيانات حسب الموظف
  const employees = {};
  const lang = window.misbehaviorI18n?.getLanguage() || 'ar';
  
  misbehaviorData.forEach(r => {
    const empKey = `${r.employeeName || 'غير معروف'}_${r.HospitalID || 'unknown'}`;
    if (!employees[empKey]) {
      employees[empKey] = {
        name: r.employeeName || 'غير معروف',
        employeeId: r.employeeId || '—',
        hospitalId: r.HospitalID,
        hospitalName: lang === 'ar'
          ? (r.HospitalNameAr || r.HospitalName || `مستشفى ${r.HospitalID}`)
          : (r.HospitalNameEn || r.HospitalNameAr || r.HospitalName || `Hospital ${r.HospitalID}`),
        department: r.DepartmentName || 'غير محدد',
        reports: [],
        countA: 0,
        countB: 0
      };
    }
    
    employees[empKey].reports.push(r);
    if (r.category === 'A') employees[empKey].countA++;
    if (r.category === 'B') employees[empKey].countB++;
  });
  
  // ترتيب حسب عدد البلاغات
  const sortedEmployees = Object.values(employees).sort((a, b) => {
    const totalA = a.countA + a.countB;
    const totalB = b.countA + b.countB;
    return totalB - totalA;
  });
  
  const t = window.misbehaviorI18n?.t || ((key) => key);
  
  sortedEmployees.forEach(emp => {
    const total = emp.countA + emp.countB;
    const category = emp.countB > 0 ? 'B' : 'A';
    const categoryLabel = category === 'B' ? t('category-b') : t('category-a');
    
    // تحديد الإجراء المطلوب
    let action = '';
    let actionClass = '';
    if (emp.countB >= 1) {
      action = t('alert-b-immediate');
      actionClass = 'text-red-600 font-bold';
    } else if (emp.countA >= 8) {
      action = t('alert-a-8');
      actionClass = 'text-red-600 font-bold';
    } else if (total >= 5) {
      action = t('alert-repeated');
      actionClass = 'text-red-600 font-bold';
    } else if (emp.countA >= 3) {
      action = t('alert-a-3');
      actionClass = 'text-orange-600 font-medium';
    } else {
      action = t('no-action');
      actionClass = 'text-gray-400';
    }
    
    // الحصول على أحدث بلاغ لتحديد الشهر
    const latestReport = emp.reports.sort((a, b) => 
      new Date(b.CreatedAt) - new Date(a.CreatedAt)
    )[0];
    const month = extractMonth(latestReport?.CreatedAt);
    
    // حالة البلاغ (افتراضياً غير مكتمل)
    const status = latestReport?.StatusCode === 'CLOSED' || latestReport?.StatusCode === 'RESOLVED'
      ? t('completed')
      : t('incomplete');
    
    const row = document.createElement('tr');
    row.className = 'border-b border-gray-200 hover:bg-gray-50';
    row.innerHTML = `
      <td class="p-3 border border-gray-200 text-right">${emp.hospitalName}</td>
      <td class="p-3 border border-gray-200 text-center">${month}</td>
      <td class="p-3 border border-gray-200 font-medium">${emp.name}</td>
      <td class="p-3 border border-gray-200 text-center">${emp.employeeId}</td>
      <td class="p-3 border border-gray-200">${emp.department}</td>
      <td class="p-3 border border-gray-200 text-center font-bold">${total}</td>
      <td class="p-3 border border-gray-200 text-center">
        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
          category === 'B' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
        }">
          ${categoryLabel}
        </span>
      </td>
      <td class="p-3 border border-gray-200 text-center">${t('no')}</td>
      <td class="p-3 border border-gray-200 text-center">${t('no')}</td>
      <td class="p-3 border border-gray-200 text-center">${t('no')}</td>
      <td class="p-3 border border-gray-200 text-center">${t('no')}</td>
      <td class="p-3 border border-gray-200 text-center">
        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
          status === t('completed') ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
        }">
          ${status}
        </span>
      </td>
      <td class="p-3 border border-gray-200 ${actionClass}">${action}</td>
    `;
    tbody.appendChild(row);
  });
  
  if (sortedEmployees.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="13" class="py-8 text-center text-gray-500">
          ${t('table-empty')}
        </td>
      </tr>
    `;
  }
}

/**
 * عرض الرسم البياني للموظفين
 */
function renderEmployeesChart() {
  const ctx = document.getElementById('employeesChart');
  if (!ctx) return;
  
  // تدمير الرسم السابق إن وجد
  if (employeesChart) {
    employeesChart.destroy();
  }
  
  // تجميع البيانات حسب الموظف
  const employees = {};
  misbehaviorData.forEach(r => {
    const name = r.employeeName || 'غير معروف';
    if (!employees[name]) {
      employees[name] = { countA: 0, countB: 0 };
    }
    if (r.category === 'A') employees[name].countA++;
    if (r.category === 'B') employees[name].countB++;
  });
  
  // ترتيب حسب إجمالي البلاغات
  const sorted = Object.entries(employees)
    .map(([name, data]) => ({
      name,
      total: data.countA + data.countB,
      countA: data.countA,
      countB: data.countB
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 20); // أعلى 20 موظف
  
  const labels = sorted.map(e => e.name);
  const dataA = sorted.map(e => e.countA);
  const dataB = sorted.map(e => e.countB);
  
  employeesChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'فئة A (عادية)',
          data: dataA,
          backgroundColor: '#9333EA',
          borderColor: '#7C3AED',
          borderWidth: 1
        },
        {
          label: 'فئة B (جسيمة)',
          data: dataB,
          backgroundColor: '#DC2626',
          borderColor: '#B91C1C',
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
          position: 'top',
          rtl: true
        },
        title: {
          display: false
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          stacked: false
        },
        y: {
          stacked: false
        }
      }
    }
  });
}

/**
 * عرض الإشعارات والإجراءات المطلوبة
 */
function renderAlerts() {
  const container = document.getElementById('misbehavior-alerts');
  if (!container) return;
  
  container.innerHTML = '';
  
  // تجميع البيانات حسب الموظف
  const employees = {};
  misbehaviorData.forEach(r => {
    const empKey = `${r.employeeName || 'غير معروف'}_${r.HospitalID || 'unknown'}`;
    if (!employees[empKey]) {
      employees[empKey] = {
        name: r.employeeName || 'غير معروف',
        hospitalName: r.HospitalNameAr || r.HospitalName || `مستشفى ${r.HospitalID}`,
        countA: 0,
        countB: 0
      };
    }
    if (r.category === 'A') employees[empKey].countA++;
    if (r.category === 'B') employees[empKey].countB++;
  });
  
  const alerts = [];
  const t = window.misbehaviorI18n?.t || ((key) => key);
  
  Object.values(employees).forEach(emp => {
    const total = emp.countA + emp.countB;
    
    // Category B - إفادة فورية
    if (emp.countB >= 1) {
      alerts.push({
        type: 'critical',
        message: `${emp.name} (${emp.hospitalName}): ${t('alert-b-immediate')}`,
        icon: '🔴'
      });
    }
    // Category A >= 8 - إفادة مطلوبة
    else if (emp.countA >= 8) {
      alerts.push({
        type: 'warning',
        message: `${emp.name} (${emp.hospitalName}): ${t('alert-a-8')}`,
        icon: '⚠️'
      });
    }
    // 5+ بلاغات - مكرر جدًا
    else if (total >= 5) {
      alerts.push({
        type: 'critical',
        message: `${emp.name} (${emp.hospitalName}): ${t('alert-repeated')}`,
        icon: '🔴'
      });
    }
    // Category A >= 3 - تنبيه متوسط
    else if (emp.countA >= 3) {
      alerts.push({
        type: 'info',
        message: `${emp.name} (${emp.hospitalName}): ${t('alert-a-3')}`,
        icon: '⚠️'
      });
    }
  });
  
  // ترتيب حسب الأولوية
  alerts.sort((a, b) => {
    const priority = { critical: 3, warning: 2, info: 1 };
    return priority[b.type] - priority[a.type];
  });
  
  if (alerts.length === 0) {
    container.innerHTML = `
      <div class="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
        <p class="text-green-700">✅ لا توجد إجراءات مطلوبة حالياً</p>
      </div>
    `;
    return;
  }
  
  alerts.forEach(alert => {
    const alertDiv = document.createElement('div');
    const bgClass = alert.type === 'critical' ? 'bg-red-50 border-red-200 text-red-800'
      : alert.type === 'warning' ? 'bg-orange-50 border-orange-200 text-orange-800'
      : 'bg-blue-50 border-blue-200 text-blue-800';
    
    alertDiv.className = `border rounded-lg p-4 ${bgClass}`;
    alertDiv.innerHTML = `
      <div class="flex items-center gap-3">
        <span class="text-2xl">${alert.icon}</span>
        <p class="font-medium">${alert.message}</p>
      </div>
    `;
    container.appendChild(alertDiv);
  });
}

