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
    $('#kpiSLA').textContent = `${h.slaRate || 0}%`;
    $('#kpiRepeated30d').textContent = h.repeated30Days || 0;

    // إضافة event listeners للكروت
    setupKpiCardClickHandlers(id);

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

// إعداد event listeners للكروت
function setupKpiCardClickHandlers(hospitalId) {
  const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'http://localhost:3001' : '';

  // كرت إجمالي البلاغات
  const kpiTotalCard = document.getElementById('kpiTotal')?.closest('.card-hover');
  if (kpiTotalCard) {
    kpiTotalCard.style.cursor = 'pointer';
    kpiTotalCard.addEventListener('click', () => showKpiModal(hospitalId, 'all', 'إجمالي البلاغات'));
  }

  // كرت المفتوحة
  const kpiOpenCard = document.getElementById('kpiOpen')?.closest('.card-hover');
  if (kpiOpenCard) {
    kpiOpenCard.style.cursor = 'pointer';
    kpiOpenCard.addEventListener('click', () => showKpiModal(hospitalId, 'open', 'البلاغات المفتوحة'));
  }

  // كرت المغلقة
  const kpiClosedCard = document.getElementById('kpiClosed')?.closest('.card-hover');
  if (kpiClosedCard) {
    kpiClosedCard.style.cursor = 'pointer';
    kpiClosedCard.addEventListener('click', () => showKpiModal(hospitalId, 'closed', 'البلاغات المغلقة'));
  }

  // كرت معدل الحل
  const kpiRateCard = document.getElementById('kpiRate')?.closest('.card-hover');
  if (kpiRateCard) {
    kpiRateCard.style.cursor = 'pointer';
    kpiRateCard.addEventListener('click', () => showKpiModal(hospitalId, 'closed', 'البلاغات المغلقة'));
  }

  // كرت SLA
  const kpiSLACard = document.getElementById('kpiSLA')?.closest('.card-hover');
  if (kpiSLACard) {
    kpiSLACard.style.cursor = 'pointer';
    kpiSLACard.addEventListener('click', () => showKpiModal(hospitalId, 'sla', 'بلاغات SLA (≤ 3 أيام)'));
  }

  // كرت التكرارات
  const kpiRepeatedCard = document.getElementById('kpiRepeated30d')?.closest('.card-hover');
  if (kpiRepeatedCard) {
    kpiRepeatedCard.style.cursor = 'pointer';
    kpiRepeatedCard.addEventListener('click', () => showKpiModal(hospitalId, 'repeated', 'تكرارات 30 يوم'));
  }

  // زر إغلاق Modal
  const closeModalBtn = document.getElementById('close-modal');
  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', closeKpiModal);
  }

  // إغلاق Modal عند النقر خارجها
  const modal = document.getElementById('kpi-complaints-modal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeKpiModal();
      }
    });
  }
}

// عرض Modal مع البلاغات
async function showKpiModal(hospitalId, kpiType, title) {
  const modal = document.getElementById('kpi-complaints-modal');
  const modalTitle = document.getElementById('modal-title');
  const modalSubtitle = document.getElementById('modal-subtitle');
  const modalCount = document.getElementById('modal-count');
  const modalContent = document.getElementById('modal-content');

  if (!modal) return;

  // إظهار Modal
  modal.classList.remove('hidden');
  modal.style.display = 'flex';
  modalTitle.textContent = title;
  modalContent.innerHTML = '<div class="text-center py-8 text-gray-500">جاري تحميل البيانات...</div>';

  try {
    const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'http://localhost:3001' : '';

    let url = `${API_BASE}/api/dashboard/total/hospital/${hospitalId}/complaints`;
    if (kpiType === 'open') {
      url += '?status=open';
    } else if (kpiType === 'closed') {
      url += '?status=closed';
    } else if (kpiType === 'sla') {
      url += '?sla=true';
    } else if (kpiType === 'repeated') {
      url += '?repeated=true';
    } else {
      // all - لا نضيف query parameter
      url += '';
    }

    const token = localStorage.getItem('authToken');
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    const complaints = result.data || [];

    modalCount.textContent = complaints.length;

    if (complaints.length === 0) {
      modalContent.innerHTML = '<div class="text-center py-8 text-gray-500">لا توجد بلاغات</div>';
      const categoriesSection = document.getElementById('modal-categories');
      if (categoriesSection) categoriesSection.style.display = 'none';
      return;
    }

    // حساب التصنيفات الأكثر تكراراً
    const categoryCounts = {};
    complaints.forEach(c => {
      const category = c.typeName || 'غير محدد';
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    });

    // ترتيب التصنيفات حسب التكرار (الأكثر تكراراً أولاً)
    const sortedCategories = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5); // أعلى 5 تصنيفات

    // عرض التصنيفات الأكثر تكراراً
    const categoriesSection = document.getElementById('modal-categories');
    const categoriesList = document.getElementById('categories-list');
    if (categoriesSection && categoriesList) {
      if (sortedCategories.length > 0) {
        categoriesSection.style.display = 'block';
        categoriesList.innerHTML = sortedCategories.map(([category, count]) => `
          <span class="px-3 py-1 rounded-full text-sm font-semibold bg-blue-100 text-blue-800 border border-blue-200">
            ${category} (${count})
          </span>
        `).join('');
      } else {
        categoriesSection.style.display = 'none';
      }
    }

    // عرض البلاغات
    modalContent.innerHTML = complaints.map(c => {
      const date = new Date(c.createdAt).toLocaleString('ar-SA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });

      return `
        <div class="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-colors" 
             onclick="window.location.href='/NewProjectMecca/public/complaints/history/complaint-details.html?ticket=${encodeURIComponent(c.ticket)}'">
          <div class="flex items-center justify-between">
            <div class="flex-1">
              <div class="font-semibold text-lg" style="color:#002B5B;">${c.ticket}</div>
              <div class="text-gray-600 mt-1">${c.patientName}</div>
              <div class="text-sm text-gray-500 mt-1">${c.typeName} - ${c.departmentName}</div>
            </div>
            <div class="text-left ml-4">
              <div class="text-sm text-gray-500">${date}</div>
              <div class="mt-1">
                <span class="px-2 py-1 rounded text-xs ${c.status === 'CLOSED' || c.status === 'مغلقة' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}">
                  ${c.status}
                </span>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('خطأ في جلب البلاغات:', error);
    modalContent.innerHTML = `<div class="text-center py-8 text-red-500">حدث خطأ أثناء تحميل البيانات: ${error.message}</div>`;
  }
}

// إغلاق Modal
function closeKpiModal() {
  const modal = document.getElementById('kpi-complaints-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
}
