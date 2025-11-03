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

// === تعبئة الصفحة ===
let hospitalChart;
let currentHospital; // لحفظ المستشفى الحالي للفلترة

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // لو فيه مستخدم في localStorage، تجاهل ?id واستخدم HospitalID الخاص به
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    const forcedHospitalId = Number(user?.HospitalID) || null;
    const id = forcedHospitalId ?? parseInt(getParam('id') || '0', 10);
    
    if (!id || isNaN(id)) {
      throw new Error('معرف المستشفى غير صحيح');
    }

    // جلب بيانات المستشفى من API
    const h = await loadHospitalData(id);
    currentHospital = h; // حفظ المستشفى الحالي

    // العنوان والوصف
    $('#hName').textContent = h.HospitalName;
    $('#hDesc').textContent = `${h.type}${h.beds > 0 ? ` - ${h.beds} سرير` : ''}`;

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
      alertText.innerHTML = criticalCount > 0
        ? `لديك <b>${criticalCount}</b> بلاغ${criticalCount === 1 ? '' : 'ات'} حمراء تتطلب متابعة فورية.`
        : 'لا توجد بلاغات حرجة حالياً ✅';
    }
    criticalBanner.classList.remove('hidden');
  }

  // اربط رابط "عرض المزيد" بصفحة البلاغات الحرجة للمستشفى الحالي
  const viewAllLink = document.getElementById('criticalViewAll');
  if (viewAllLink && typeof id !== 'undefined') {
    viewAllLink.href = `/NewProjectMecca/dashboard/critical.html?hid=${id}`;
  }

    // اربط زر "عرض المزيد" للبلاغات الحديثة بسجل البلاغات مفلتر على المستشفى
    const hospitalName = h?.HospitalName || document.querySelector('#hName')?.textContent?.trim() || '';
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
      overdueList.innerHTML = overdue.map(r => `
        <li class="report-item">
          <div class="report-left">
            <div class="id">#${r.id}</div>
            <div class="type">${r.type}</div>
          </div>
          <div class="report-right">
            <span class="badge">مفتوح منذ ${Math.floor((now - new Date(r.date.replace(' ','T'))) / (1000*60*60*24))} يوم</span>
            <span class="${chip(r.priority)}">${r.priority==='red'?'🔴 حرجة':r.priority==='orange'?'🟠 متوسطة':'🟡 منخفضة'}</span>
          </div>
        </li>
      `).join('');
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
    const patientBadge = r.isPatientRelated ? `<span class="badge" title="يمس المريض">PATIENT</span>` : '';
    div.innerHTML = `
      <div class="report-left">
        <div class="id">#${r.ticket || r.id}</div>
        <div class="type">${r.type}</div>
      </div>
      <div class="report-right">
        ${patientBadge}
        <span class="${chip(r.priority)}">
          ${r.priority === 'red' ? '🔴 أولوية حرجة' : r.priority === 'orange' ? '🟠 أولوية متوسطة' : '🟡 طلب/منخفضة'}
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
  const ctx = document.getElementById('hospitalChart').getContext('2d');
  hospitalChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر', 'يناير'],
      datasets: [{
        label: 'البلاغات الشهرية',
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
    const pri = fPriority?.value || '';
    const list = (currentHospital.recent || []).filter(r => {
      const okPri = !pri || r.priority === pri;
      return okPri;
    });
    recent.innerHTML = '';
    list.forEach(r => {
      const div = document.createElement('div');
      div.className = 'report-item cursor-pointer hover:bg-gray-50 transition-colors';
      const patientBadge = r.isPatientRelated ? `<span class="badge" title="يمس المريض">PATIENT</span>` : '';
      div.innerHTML = `
        <div class="report-left">
          <div class="id">#${r.ticket || r.id}</div>
          <div class="type">${r.type}</div>
        </div>
        <div class="report-right">
          ${patientBadge}
          <span class="${chip(r.priority)}">
            ${r.priority === 'red' ? '🔴 أولوية حرجة' : r.priority === 'orange' ? '🟠 أولوية متوسطة' : '🟡 طلب/منخفضة'}
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

  } catch (error) {
    console.error('خطأ في تحميل صفحة المستشفى:', error);
    
    // عرض رسالة خطأ للمستخدم
    const mainContent = document.querySelector('main');
    if (mainContent) {
      mainContent.innerHTML = `
        <div class="text-center py-12">
          <div class="text-red-600 text-xl mb-4">⚠️ تعذر تحميل بيانات المستشفى</div>
          <div class="text-gray-600 mb-4">${error.message}</div>
          <button onclick="location.reload()" 
                  class="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
            إعادة المحاولة
          </button>
        </div>
      `;
    }
  }
});
