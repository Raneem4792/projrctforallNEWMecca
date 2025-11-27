// === جلب بيانات المستشفى من API ===
async function loadHospitalData(hospitalId) {
  try {
    // تحديد عنوان API حسب البيئة
    const API_BASE = 
      location.hostname === 'localhost' || location.hostname === '127.0.0.1'
        ? 'http://localhost:3001'
        : '';

    const response = await fetch(`${API_BASE}/api/dashboard/total/hospital/${hospitalId}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('خطأ في تحميل بيانات المستشفى:', error);
    throw error;
  }
}

// === أدوات مساعدة ===
const $ = (s, p = document) => p.querySelector(s);
function getParam(name) {
  const url = new URL(location.href);
  return url.searchParams.get(name);
}
function chip(priority) {
  const base = 'priority-chip ';
  if (priority === 'red') return base + 'priority-red';
  if (priority === 'orange') return base + 'priority-orange';
  return base + 'priority-yellow';
}

// === قراءة اللغة من localStorage =====
const currentLang = localStorage.getItem("siteLanguage") || "ar";

// === تعبئة الصفحة ===
let hospitalChart;
let currentHospital; // لحفظ المستشفى الحالي للفلترة

document.addEventListener('DOMContentLoaded', async () => {
  // قراءة اللغة من localStorage وتطبيقها
  const lang = localStorage.getItem("siteLanguage") || "ar";
  document.documentElement.setAttribute("lang", lang);
  document.documentElement.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
  
  try {
    // لو فيه مستخدم في localStorage، تجاهل ?id واستخدم HospitalID الخاص به
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    const forcedHospitalId = Number(user?.HospitalID) || null;
    const id = forcedHospitalId ?? parseInt(getParam('id') || '0', 10);
    
    if (!id || isNaN(id)) {
      const t = window.hospitalI18n?.t || ((key) => key);
      throw new Error(t('error-invalid-id') || 'معرف المستشفى غير صحيح');
    }

    // جلب بيانات المستشفى من API
    const h = await loadHospitalData(id);
    currentHospital = h; // حفظ المستشفى الحالي

    // العنوان والوصف
    const t = window.hospitalI18n?.t || ((key) => key);
    
    // استخدام اسم المستشفى حسب اللغة
    const hospitalName = lang === 'en'
      ? (h.HospitalNameEn || h.HospitalNameAr || h.HospitalName)
      : (h.HospitalNameAr || h.HospitalName);
    
    $('#hName').textContent = hospitalName;
    
    // ترجمة النوع وعدد الأسرة
    const typeText = h.type || (lang === 'en' ? 'General' : 'عام');
    const bedsText = h.beds > 0 
      ? (lang === 'en' ? ` - ${h.beds} beds` : ` - ${h.beds} سرير`)
      : '';
    $('#hDesc').textContent = `${typeText}${bedsText}`;

    // الشارات
    $('#cRed').textContent = h.priorityCounts?.red ?? 0;
    $('#cOrange').textContent = h.priorityCounts?.orange ?? 0;
    $('#cYellow').textContent = h.priorityCounts?.yellow ?? 0;

    // KPIs
    $('#kpiTotal').textContent = h.totalReports;
    $('#kpiOpen').textContent = h.openReports;
    $('#kpiClosed').textContent = h.closedReports;
    $('#kpiRate').textContent = `${h.resolutionRate}%`;
    $('#kpiSLA').textContent = '0%'; // يمكن إضافة هذا الحقل لاحقاً
    $('#kpiRepeated30d').textContent = 0; // يمكن إضافة هذا الحقل لاحقاً

  // Critical Banner - دائمًا ظاهر
  const criticalBanner = $('#criticalBanner');
  const criticalCount = (h.priorityCounts?.red ?? 0);
  if (criticalBanner) {
    // نخلي البانر دائمًا ظاهر، حتى لو ما فيه بلاغات
    const alertText = criticalBanner.querySelector('.alert-text');
    if (alertText) {
      if (criticalCount > 0) {
        if (lang === 'en') {
          alertText.innerHTML = `You have <b id="criticalCount">${criticalCount}</b> critical report${criticalCount === 1 ? '' : 's'} requiring immediate follow-up.`;
        } else {
          alertText.innerHTML = `لديك <b id="criticalCount">${criticalCount}</b> بلاغ${criticalCount === 1 ? '' : 'ات'} حمراء تتطلب متابعة فورية.`;
        }
      } else {
        alertText.innerHTML = t('critical-banner-none');
      }
    }
    criticalBanner.classList.remove('hidden');
  }

  // اربط رابط "عرض المزيد" بصفحة البلاغات الحرجة للمستشفى الحالي
  const viewAllLink = document.getElementById('criticalViewAll');
  if (viewAllLink && typeof id !== 'undefined') {
    viewAllLink.href = `/NewProjectMecca/dashboard/critical.html?hid=${id}`;
  }

    // اربط زر "عرض المزيد" للبلاغات الحديثة بسجل البلاغات مفلتر على المستشفى
    const recentViewAll = document.getElementById('recentViewAll');
    if (recentViewAll) {
      recentViewAll.href = `/NewProjectMecca/public/complaints/history/complaints-history.html?hname=${encodeURIComponent(hospitalName)}`;
    }

  // Overdue > 3 days
  const overdueBlock = $('#overdueBlock');
  const overdueList = $('#overdueList');
  if (overdueBlock && overdueList) {
    const now = new Date();
    const overdue = (h.recent || []).filter(r => {
      if (r.status !== 'open') return false;
      const d = new Date(r.date.replace(' ', 'T'));
      const diffDays = (now - d) / (1000*60*60*24);
      return diffDays > 3;
    });
    if (overdue.length) {
      overdueList.innerHTML = overdue.map(r => {
        const days = Math.floor((now - new Date(r.date.replace(' ','T'))) / (1000*60*60*24));
        const priorityText = r.priority === 'red' 
          ? t('priority-critical-short')
          : r.priority === 'orange' 
          ? t('priority-medium-short')
          : t('priority-low-short');
        
        return `
        <li class="report-item">
          <div class="report-left">
            <div class="id">#${r.id}</div>
            <div class="type">${r.type}</div>
          </div>
          <div class="report-right">
            <span class="badge">${t('open-since-days', { days })}</span>
            <span class="${chip(r.priority)}">${priorityText}</span>
          </div>
        </li>
      `;
      }).join('');
      overdueBlock.classList.remove('hidden');
    } else {
      overdueBlock.classList.add('hidden');
    }
  }

  // أحدث البلاغات (مع الشارات)
  const recent = $('#recent');
  recent.innerHTML = '';
  (h.recent || []).forEach(r => {
    const div = document.createElement('div');
    div.className = 'report-item cursor-pointer hover:bg-gray-50 transition-colors';
    const patientBadge = r.isPatientRelated 
      ? `<span class="badge" title="${lang === 'en' ? 'Patient related' : 'يمس المريض'}">${t('patient-badge')}</span>` 
      : '';
    
    const priorityText = r.priority === 'red' 
      ? t('priority-critical')
      : r.priority === 'orange' 
      ? t('priority-medium')
      : t('priority-low');
    
    div.innerHTML = `
      <div class="report-left">
        <div class="id">#${r.ticket || r.id}</div>
        <div class="type">${r.type}</div>
      </div>
      <div class="report-right">
        ${patientBadge}
        <span class="${chip(r.priority)}">
          ${priorityText}
        </span>
        <div class="date">${r.date}</div>
      </div>
    `;
    
    // فتح تفاصيل البلاغ عند النقر
    div.addEventListener('click', () => {
      const ticket = r.ticket || r.id;
      window.location.href = `/NewProjectMecca/public/complaints/history/complaint-details.html?ticket=${encodeURIComponent(ticket)}`;
    });
    
    recent.appendChild(div);
  });

  // المخطط الشهري
  const monthNamesAr = ['أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر', 'يناير'];
  const monthNamesEn = ['August', 'September', 'October', 'November', 'December', 'January'];
  const monthLabels = lang === 'en' ? monthNamesEn : monthNamesAr;
  
  const ctx = document.getElementById('hospitalChart').getContext('2d');
  hospitalChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: monthLabels,
      datasets: [{
        label: t('chart-monthly-label'),
        data: h.monthly || [0, 0, 0, 0, 0, 0],
        backgroundColor: '#004A9F',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true, 
      maintainAspectRatio: false,
      plugins: { 
        legend: { display: false } 
      },
      scales: { 
        y: { beginAtZero: true } 
      }
    }
  });

  // Filters
  const fPriority = $('#fPriority');
  const applyBtn = $('#applyFiltersBtn');

  function renderRecentFiltered() {
    const currentLang = localStorage.getItem("siteLanguage") || "ar";
    const t = window.hospitalI18n?.t || ((key) => key);
    
    const pri = fPriority?.value || '';
    const list = (currentHospital.recent || []).filter(r => {
      const okPri = !pri || r.priority === pri;
      return okPri;
    });
    recent.innerHTML = '';
    list.forEach(r => {
      const div = document.createElement('div');
      div.className = 'report-item cursor-pointer hover:bg-gray-50 transition-colors';
      const patientBadge = r.isPatientRelated 
        ? `<span class="badge" title="${currentLang === 'en' ? 'Patient related' : 'يمس المريض'}">${t('patient-badge')}</span>` 
        : '';
      
      const priorityText = r.priority === 'red' 
        ? t('priority-critical')
        : r.priority === 'orange' 
        ? t('priority-medium')
        : t('priority-low');
      
      div.innerHTML = `
        <div class="report-left">
          <div class="id">#${r.ticket || r.id}</div>
          <div class="type">${r.type}</div>
        </div>
        <div class="report-right">
          ${patientBadge}
          <span class="${chip(r.priority)}">
            ${priorityText}
          </span>
          <div class="date">${r.date}</div>
        </div>
      `;
      
      // فتح تفاصيل البلاغ عند النقر
      div.addEventListener('click', () => {
        const ticket = r.ticket || r.id;
        window.location.href = `/NewProjectMecca/public/complaints/history/complaint-details.html?ticket=${encodeURIComponent(ticket)}`;
      });
      
      recent.appendChild(div);
    });
  }

    applyBtn?.addEventListener('click', renderRecentFiltered);

    // الاستماع لتغييرات اللغة
    if (window.hospitalI18n) {
      window.hospitalI18n.onChange((newLang) => {
        // تحديث dir و lang
        document.documentElement.setAttribute("lang", newLang);
        document.documentElement.setAttribute("dir", newLang === "ar" ? "rtl" : "ltr");
        
        // إعادة تحميل الصفحة لإعادة عرض البيانات مع الترجمة الجديدة
        location.reload();
      });
    }

  } catch (error) {
    console.error('خطأ في تحميل صفحة المستشفى:', error);
    
    // عرض رسالة خطأ للمستخدم
    const t = window.hospitalI18n?.t || ((key) => key);
    
    const mainContent = document.querySelector('main');
    if (mainContent) {
      mainContent.innerHTML = `
        <div class="text-center py-12">
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
});
