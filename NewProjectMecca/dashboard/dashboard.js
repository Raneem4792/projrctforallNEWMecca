/* ========================================
   ملف JavaScript الخاص بلوحة تحكم البلاغات
   Dashboard JavaScript File
   ======================================== */

// ===== App Namespace Protection =====
if (!window.App) window.App = {};
const App = window.App;

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

if (typeof App.loadHospitalsSelectForMystery !== 'function') {
  App.loadHospitalsSelectForMystery = async function () {
    if (!App.isClusterManager()) return;
    document.getElementById('mystery-hospital-wrap')?.classList.remove('hidden');

    const sel = document.getElementById('mystery-hospital-select');
    if (!sel) return;

    // جرّبي تستخدم نفس API اللي عملناه سابقًا
    const token = localStorage.getItem('token') || localStorage.getItem('authToken');
    const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'http://localhost:3001' : '';
    
    const res = await fetch(`${API_BASE}/api/central/hospitals?active=1`, {
      headers: { 'Authorization': `Bearer ${token||''}` }
    });
    if (!res.ok) return;

    const list = await res.json(); // [{HospitalID,NameAr,NameEn,Code,SortOrder...}]
    list.sort((a,b)=>(a.SortOrder??999)-(b.SortOrder??999) || (a.NameAr||'').localeCompare(b.NameAr||'', 'ar'));

    const frag = document.createDocumentFragment();
    for (const h of list) {
      const opt = document.createElement('option');
      opt.value = h.HospitalID;
      opt.textContent = `${h.NameAr || h.NameEn}${h.Code ? ` (${h.Code})` : ''}`;
      frag.appendChild(opt);
    }
    sel.appendChild(frag);

    // استرجاع آخر اختيار إن وُجد
    const saved = localStorage.getItem('mysteryDashHospitalId');
    if (saved) sel.value = saved;

    sel.addEventListener('change', () => {
      localStorage.setItem('mysteryDashHospitalId', sel.value || '');
      App.renderMysteryByDepartment(); // أعد الرسم
    });
  };
}

// ===== Theme Helpers for Charts =====
function isDarkTheme() {
  return document.documentElement.classList.contains('dark');
}

function getChartAxisColor() {
  return isDarkTheme() ? '#E2E8F0' : '#475569';
}

function getChartSecondaryTextColor() {
  return isDarkTheme() ? '#E2E8F0' : '#333333';
}

function getChartGridColor() {
  return isDarkTheme() ? 'rgba(148, 163, 184, 0.25)' : 'rgba(107, 114, 128, 0.1)';
}

function getChartLegendColor() {
  return isDarkTheme() ? '#E2E8F0' : '#374151';
}

function getChartDataLabelColor() {
  return isDarkTheme() ? '#F8FAFC' : '#111827';
}

if (typeof App.renderMysteryByDepartment !== 'function') {
  App.renderMysteryByDepartment = async function () {
    const canvas = document.getElementById('mystery-depts');
    if (!canvas) return;

    await window.loadCurrentUser?.();
    const me = App.getCurrentUser();

    const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'http://localhost:3001' : '';

    const params = new URLSearchParams();

    if (App.isClusterManager()) {
      const hid = document.getElementById('mystery-hospital-select')?.value || localStorage.getItem('mysteryDashHospitalId');
      if (!hid) {
        // رسالة توجيهية
        const wrap = canvas.parentElement;
        if (wrap) {
          wrap.innerHTML = `<div class="text-center py-10 text-gray-600">
          اختر مستشفى من القائمة لعرض بيانات الزائر السري.
        </div>`;
        } else {
          console.warn('Mystery canvas is missing a wrapper element.');
        }
        return;
      }
      params.set('hospitalId', hid);
    } else if (me?.HospitalID) {
      params.set('hospitalId', me.HospitalID);
    }

    const url = `${API_BASE}/api/dashboard/mystery/by-department?${params.toString()}`;
    console.log('🔍 Mystery API URL:', url); // للتشخيص
    
    const res = await authFetch(url);

    if (!res.ok) {
      console.warn('Mystery API failed', res.status, url);
      const wrap = canvas.parentElement;
      if (wrap) {
        wrap.innerHTML =
          `<div class="text-center py-8">
             <div class="text-red-600 text-lg mb-2">تعذّر تحميل بيانات الزائر السري</div>
             <div class="text-gray-600">تحقّق من الصلاحيات/المسار</div>
           </div>`;
      } else {
        console.warn('Mystery canvas is missing a wrapper element.');
      }
      return;
    }

    const js = await res.json();
    const rows = js?.data || [];
    if (!rows.length) {
      const wrap = canvas.parentElement;
      if (wrap) {
        wrap.innerHTML = `<div class="text-center py-8 text-gray-600">لا توجد بيانات</div>`;
      } else {
        console.warn('Mystery canvas is missing a wrapper element.');
      }
      return;
    }

    const labels = rows.map(r => r.DepartmentName);
    const open   = rows.map(r => Number(r.OpenCount||0));
    const closed = rows.map(r => Number(r.ClosedCount||0));

    // ميتا أعلى الكارت
    const meta = document.getElementById('mystery-meta');
    if (meta) {
      const total = rows.reduce((s,r)=> s+Number(r.TotalCount||0), 0);
      meta.textContent = `الأقسام الأعلى (${rows.length}) — إجمالي البلاغات: ${total}`;
    }

    Chart.helpers.each(Chart.instances, inst => {
      if (inst.canvas && inst.canvas.id === 'mystery-depts') inst.destroy();
    });

    const axisColor = getChartAxisColor();

    new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'مغلقة', data: closed, backgroundColor: '#10B981', stack: 'm', borderRadius: 6, barThickness: 14 },
          { label: 'مفتوحة', data: open,   backgroundColor: '#F59E0B', stack: 'm', borderRadius: 6, barThickness: 14 }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { 
          legend: { position: 'bottom', labels: { font: { family: 'Tajawal' } } },
          tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.formattedValue}` } }
        },
        scales: { 
          x: { beginAtZero: true, grid: { display: false }, ticks: { color: axisColor } }, 
          y: { grid: { display: false }, ticks: { color: axisColor, font: { family: 'Tajawal' } } } 
        },
        onHover: (evt, activeEls, chart) => {
          const pts = chart.getElementsAtEventForMode(evt, 'nearest', {intersect: true}, true);
          chart.canvas.style.cursor = pts.length ? 'pointer' : 'default';
        },
        onClick: (evt, els, chart) => {
          const pts = chart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true);
          if (!pts.length) return;
          const idx = pts[0].index;
          const dept = labels[idx];

          const q = new URLSearchParams({ department: dept });
          const hid = params.get('hospitalId');
          if (hid) q.set('hospitalId', hid);

          location.href = `../public/complaints/mystery/mystery-complaints.html?${q.toString()}`;
        }
      }
    });

    // تمييز الكارت إذا فيه أقسام مفتوحة كثيرة (بسيط اختياري)
    if (open.some(v => v >= 3)) {
      canvas.closest('.bg-white')?.classList.add('chart-bar-red');
    }
  };
}

// ===== Auth Context =====
let currentUser = null;
let isClusterManager = false;
let userHospitalId = null;

// === Priority helpers (تعتمد مباشرة على PriorityCode) ===
function isHighOrCritical(row) {
  // أكواد نصية
  const code   = (row.PriorityCode ?? row.priority ?? row.Priority ?? '').toString().trim().toUpperCase();
  const nameAr = (row.PriorityNameAr ?? row.PriorityAr ?? '').toString().trim();
  const nameEn = (row.PriorityName ?? row.PriorityNameEn ?? '').toString().trim().toUpperCase();
  const color  = (row.StatusColor ?? row.Color ?? row.PriorityColor ?? '').toString().trim().toUpperCase();

  // أرقام/رتب محتملة
  const level  = Number(row.PriorityLevel ?? row.PriorityRank ?? row.PriorityID ?? row.PriorityId ?? NaN);

  // عدّادات تجميعية محتملة من الـ API
  const urgentCount   = Number(row.UrgentCount ?? row.urgentCount ?? row.CRITICAL ?? row.CRITICAL_COUNT ?? row.HighCount ?? 0);
  const criticalCount = Number(row.CriticalCount ?? row.criticalCount ?? 0);
  const redCount      = Number(row.RedCount ?? row.redCount ?? 0);
  const isUrgentFlag  = (row.IsUrgent ?? row.isUrgent ?? row.Urgent ?? row.urgent) ? true : false;

  // 1) تطابق صريح مع الأكواد النصية
  if (['URGENT','CRITICAL','HIGH','RED'].includes(code)) return true;

  // 2) أسماء بالعربي/الإنجليزي
  if (/(حرج|عاجل|عالية|عال|أحمر)/.test(nameAr)) return true;
  if (/(CRITICAL|URGENT|HIGH|RED)/.test(nameEn)) return true;

  // 3) ألوان
  if (color === 'RED') return true;

  // 4) مستويات رقمية (اعتبر 3 أو أعلى = حرج)
  if (!Number.isNaN(level) && level >= 3) return true;

  // 5) الحالة التجميعية: وجود عدّاد حرج > 0 أو فلاج
  if ((urgentCount + criticalCount + redCount) > 0 || isUrgentFlag) return true;

  return false;
}

function isMedium(row) {
  const code = (row.PriorityCode ?? row.priority ?? row.Priority ?? '').toString().trim().toUpperCase();
  const nameAr = (row.PriorityNameAr ?? row.PriorityAr ?? '').toString().trim();
  const nameEn = (row.PriorityName ?? row.PriorityNameEn ?? '').toString().trim().toUpperCase();
  return code === 'MEDIUM' || /متوسط/.test(nameAr) || /MEDIUM/.test(nameEn);
}

function getAuthToken() {
  // حدّثها حسب مشروعك (localStorage أو cookie)
  return localStorage.getItem('authToken');
}

// ✅ أحدث بلاغ (أي أولوية) لنفس المستشفى + القسم
async function getLatestTicketByHospitalDept(hospitalName, departmentName) {
  const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'http://localhost:3001' : '';

  // جرّب كل النقاط المحتملة (نفس اللي تستخدمها صفحات open/history إن وجدت)
  const tryUrls = [
    // 🔸 نفس مصدر صفحة البلاغات المفتوحة (الأفضل)
    `${API_BASE}/api/dashboard/total/open-reports?hospital=${encodeURIComponent(hospitalName)}&department=${encodeURIComponent(departmentName)}&limit=1`,
    
    // تفاصيل جاهزة
    `${API_BASE}/api/complaints/latest-ticket?hospital=${encodeURIComponent(hospitalName)}&department=${encodeURIComponent(departmentName)}`,

    // بحث عام بحد 1 وأحدث تاريخ
    `${API_BASE}/api/complaints/search?hospital=${encodeURIComponent(hospitalName)}&department=${encodeURIComponent(departmentName)}&limit=1&sort=-CreatedAt`,

    // 🔸 نفس مصدر صفحة البلاغات المفتوحة (أضف مثل اللي عندك في open.js)
    `${API_BASE}/api/complaints/open?hospital=${encodeURIComponent(hospitalName)}&department=${encodeURIComponent(departmentName)}&limit=1&sort=-CreatedAt`,
    `${API_BASE}/api/dashboard/open?hospital=${encodeURIComponent(hospitalName)}&department=${encodeURIComponent(departmentName)}&limit=1&sort=-CreatedAt`,

    // احتياطي من endpoint الأقسام لو يُرجّع تذاكر
    `${API_BASE}/api/dashboard/total/departments?hospital=${encodeURIComponent(hospitalName)}&department=${encodeURIComponent(departmentName)}&includeTickets=1&limit=1`
  ];

  for (const url of tryUrls) {
    try {
      console.log('🔍 جاري تجربة URL:', url);
      const res = await authFetch(url);
      if (!res.ok) {
        console.log('❌ فشل:', res.status, res.statusText);
        continue;
      }
      const js = await res.json();
      console.log('✅ نجح الاستدعاء:', js);

      // خذ أول عنصر مهما تغيّر الشكل
      const item =
        js?.data?.items?.[0] || js?.items?.[0] ||
        js?.data?.reports?.[0] || js?.reports?.[0] ||
        js?.data?.[0] || js?.results?.[0] ||
        js?.data || js;

      const ticket      = item?.TicketNumber || item?.ticket || js?.ticket || js?.TicketNumber;
      const complaintId = item?.ComplaintID  || item?.complaintId || js?.complaintId;
      const hospitalId  = item?.HospitalID   || item?.hospitalId  || js?.hospitalId;

      console.log('🎯 البيانات المستخرجة:', { ticket, complaintId, hospitalId });

      if (ticket) {
        console.log('✅ تم العثور على تذكرة:', ticket);
        return { ticket, complaintId, hospitalId };
      }
    } catch (err) {
      console.log('❌ خطأ في الاستدعاء:', err.message);
    }
  }
  console.log('❌ لم يتم العثور على أي تذكرة');
  return null;
}

// fetch يضيف Authorization تلقائياً
async function authFetch(url, options = {}) {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  // بعض الـ APIs تعتمد على الكوكيز أيضاً
  return fetch(url, { credentials: 'include', ...options, headers });
}

// جب لي /api/auth/me لمعرفة الدور والمستشفى
async function loadCurrentUser() {
  const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'http://localhost:3001'
    : '';
  const res = await authFetch(`${API_BASE}/api/auth/me`);
  if (!res.ok) throw new Error(`Auth failed: ${res.status}`);
  const me = await res.json();
  currentUser = me;
  // عدّل هذي المفاتيح حسب استجابتك الفعلية
  isClusterManager = !!(me?.role?.isClusterManager || me?.isClusterManager || me?.role === 'cluster_admin');
  userHospitalId = me?.hospitalId || me?.HospitalID || me?.hospital?.id || null;
  
  // إظهار رابط "ملفي" إذا كان المستخدم مسجل دخول
  if (me?.authenticated || me?.UserID) {
    const profileLink = document.getElementById('nav-profile');
    if (profileLink) {
      profileLink.classList.remove('hidden');
    }
  }
}

// ========================================
// بيانات المستشفيات والبلاغات
// Hospitals and Reports Data
// ========================================

/**
 * بيانات المستشفيات مع إحصائيات البلاغات
 * سيتم تحميلها من API
 */
let hospitalsData = [];

// ========================================
// تحميل بيانات المستشفيات من API
// Load Hospitals Data from API
// ========================================

/**
 * تحميل بيانات المستشفيات من API
 */
async function loadHospitalsData() {
  try {
    const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'http://localhost:3001'
      : '';

    // 1) لازم نعرف المستخدم أول
    if (!currentUser) {
      await loadCurrentUser();
    }

    // 2) ابنِ رابط الجلب بحسب الدور:
    //    - مدير التجمع: بدون hospitalId (يشوف الجميع)
    //    - غير ذلك: نرسل hospitalId ليقصر البيانات على مستشفاه
    const qs = (!isClusterManager && userHospitalId) ? `?hospitalId=${encodeURIComponent(userHospitalId)}` : '';
    const url = `${API_BASE}/api/dashboard/total/by-hospital${qs}`;

    const response = await authFetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

    const apiData = await response.json();

    // 3) إذا رجّع الـ API كل المستشفيات بالغلط، فلترها هنا كشبكة أمان
    const scoped = (!isClusterManager && userHospitalId)
      ? apiData.filter(h => (h.HospitalID === userHospitalId || h.HospitalId === userHospitalId))
      : apiData;

    // 4) حوّل للتنسيق الداخلي المستخدم لاحقاً
    hospitalsData = scoped.map(hospital => {
      const totalReports   = Number(hospital.counts.total  ?? 0);
      const openReports    = Number(hospital.counts.open   ?? 0);
      const closedReports  = Number(hospital.counts.closed ?? 0);
      const resolutionRate = totalReports > 0 ? Math.round((closedReports / totalReports) * 100) : 0;

      return {
        id: hospital.HospitalID,
        name: hospital.HospitalName,
        type: 'عام',
        beds: 0,
        totalReports,
        openReports,
        closedReports,
        resolutionRate,
        priorityCounts: {
          red: hospital.counts.critical ?? hospital.counts.urgent ?? 0,
          orange: hospital.counts.complaint ?? hospital.counts.medium ?? 0,
          yellow: hospital.counts.suggestion ?? hospital.counts.low ?? 0
        },
        redReports: (hospital.latest || [])
          .filter(r => r.priority === 'red' || r.priority === 'urgent' || r.PriorityCode === 'urgent')
          .map(r => ({ id: r.ticket || r.TicketNumber, dept: r.department || r.DepartmentName || 'غير محدد', createdAt: r.createdAt || r.CreatedAt }))
      };
    });

    updateMainStatsCards();

    // Fallback: إن لم توجد redReports لكن يوجد عدّ حرِج، جيب قائمة حرجة من API
    const totalCritical = hospitalsData.reduce((s,h)=> s + (h.priorityCounts?.red||0), 0);
    const hasAnyLatest = hospitalsData.some(h => (h.redReports||[]).length > 0);
    if (totalCritical > 0 && !hasAnyLatest) {
      try {
        const API_BASE = (location.hostname==='localhost'||location.hostname==='127.0.0.1') ? 'http://localhost:3001' : '';
        const qs = (!isClusterManager && userHospitalId) ? `?hospitalId=${encodeURIComponent(userHospitalId)}` : '';
        const res = await authFetch(`${API_BASE}/api/dashboard/total/critical-reports${qs}`);
        const js  = await res.json();
        if (js?.success && js?.data?.reports?.length) {
          // وزّع التقارير على المستشفيات حسب HospitalID
          const byHosp = {};
          js.data.reports.forEach(r=>{
            const k = r.HospitalID ?? r.hospitalId;
            (byHosp[k] ||= []).push(r);
          });
          hospitalsData.forEach(h=>{
            const list = (byHosp[h.id]||[])
              .sort((a,b)=> new Date(b.CreatedAt)-new Date(a.CreatedAt))
              .slice(0,6)
              .map(r=>({ id:r.TicketNumber, dept:r.DepartmentName||'غير محدد', createdAt:r.CreatedAt }));
            h.redReports = list;
          });
          console.log('✅ تم تحميل البلاغات الحمراء من fallback API');
        }
      } catch(e) {
        console.warn('Fallback critical list failed:', e);
      }
    }
    
    return hospitalsData;
  } catch (error) {
    console.error('خطأ في تحميل بيانات المستشفيات:', error);
    throw error;
  }
}

/**
 * تحديث الكروت الرئيسية بالإحصائيات
 */
function updateMainStatsCards() {
  // حساب الإحصائيات الإجمالية
  const totalReports = hospitalsData.reduce((sum, hospital) => sum + hospital.totalReports, 0);
  const openReports = hospitalsData.reduce((sum, hospital) => sum + hospital.openReports, 0);
  const closedReports = hospitalsData.reduce((sum, hospital) => sum + hospital.closedReports, 0);
  const criticalReports = hospitalsData.reduce((sum, hospital) => sum + hospital.priorityCounts.red, 0);

  // تحديث الكروت
  const totalElement = document.getElementById('card-total');
  if (totalElement) totalElement.textContent = totalReports;

  const openElement = document.getElementById('card-open');
  if (openElement) openElement.textContent = openReports;

  const closedElement = document.getElementById('card-closed');
  if (closedElement) closedElement.textContent = closedReports;

  const criticalElement = document.getElementById('card-critical');
  if (criticalElement) criticalElement.textContent = criticalReports;

  // حساب الإحصائيات الجديدة
  const avgResolutionRate = totalReports > 0 ? Math.round((closedReports / totalReports) * 100) : 0;
  const hospitalsCount = hospitalsData.length; // عدد المستشفيات من البيانات

  // تحديث الكروت الجديدة
  const resolutionElement = document.getElementById('card-resolution');
  if (resolutionElement) resolutionElement.textContent = avgResolutionRate + '%';

  const hospitalsElement = document.getElementById('card-hospitals');
  if (hospitalsElement) hospitalsElement.textContent = hospitalsCount;

  console.log('تم تحديث الكروت الرئيسية:', {
    total: totalReports,
    open: openReports,
    closed: closedReports,
    critical: criticalReports,
    resolutionRate: avgResolutionRate,
    hospitalsCount: hospitalsCount
  });
  
  // تحديث قسم "لوحة البيانات خلال أسبوع"
  updateWeeklyBoardCards(totalReports, openReports, closedReports, criticalReports);
  
  // تحديث قسم "أعلى العيادات"
  updateTopDepartmentsChart();
  
  // تحديث قسم "الاشكاليات"
  updateComplaintTypesChart();
  
  // تحديث الرسم البياني اليومي
  updateDailyComplaintsChart();
}

/**
 * تحديث قسم "لوحة البيانات خلال أسبوع"
 */
function updateWeeklyBoardCards(totalReports, openReports, closedReports, criticalReports) {
  // تحديث الكروت الصغيرة
  const wkTotalSmall = document.getElementById('wk-total-small');
  if (wkTotalSmall) wkTotalSmall.textContent = totalReports;

  const wkClosedSmall = document.getElementById('wk-closed-small');
  if (wkClosedSmall) wkClosedSmall.textContent = closedReports;

  const wkOpenSmall = document.getElementById('wk-open-small');
  if (wkOpenSmall) wkOpenSmall.textContent = openReports;

  const wkRateSmall = document.getElementById('wk-rate-small');
  if (wkRateSmall) {
    const rate = totalReports > 0 ? Math.round((closedReports / totalReports) * 100) : 0;
    wkRateSmall.textContent = `${rate}%`;
  }

  // تحديث الكرت الكبير
  const wkTotal = document.getElementById('wk-total');
  if (wkTotal) wkTotal.textContent = totalReports;

  console.log('تم تحديث لوحة البيانات الأسبوعية:', {
    total: totalReports,
    open: openReports,
    closed: closedReports,
    rate: totalReports > 0 ? Math.round((closedReports / totalReports) * 100) : 0
  });
}

/**
 * تحديث قسم "أعلى العيادات" بالبيانات الحقيقية
 */
async function updateTopDepartmentsChart() {
  try {
    const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'http://localhost:3001' : '';

    if (!currentUser) await loadCurrentUser();
    
    // تحديد المعاملات حسب دور المستخدم
    let qs = "";
    if (!isClusterManager && userHospitalId) {
      // موظف عادي: فقط مستشفاه
      qs = `?hospitalId=${encodeURIComponent(userHospitalId)}`;
      console.log(`🔍 الموظف العادي - جلب أعلى الأقسام من مستشفى ${userHospitalId} فقط`);
    } else {
      // مدير التجمع: كل المستشفيات (بدون فلتر)
      console.log(`🔍 مدير التجمع - جلب أعلى الأقسام من كل المستشفيات`);
    }
    
    const response = await authFetch(`${API_BASE}/api/dashboard/total/departments${qs}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

    const result = await response.json();
    if (result.success && result.data) {
      const departmentCounts = {};
      result.data.forEach(dept => {
        // استخدم العدّاد الحقيقي من API بدلاً من عد الصفوف
        const inc = Number(dept.TotalCount ?? dept.Count ?? dept.count ?? 1);
        departmentCounts[dept.DepartmentName] = (departmentCounts[dept.DepartmentName] || 0) + inc;
      });
      const sortedDepartments = Object.entries(departmentCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a,b) => b.count - a.count)
        .slice(0, 10);
      updateDepartmentsChart(sortedDepartments);
    }
  } catch (error) {
    console.error('خطأ في تحميل بيانات الأقسام:', error);
  }
}

/**
 * تحديث قسم "أعلى العيادات" مقسم حسب المستشفى
 */
async function updateDepartmentsChart() {
  try {
    const API_BASE =
      location.hostname === "localhost" || location.hostname === "127.0.0.1"
        ? "http://localhost:3001"
        : "";

    if (!currentUser) await loadCurrentUser();
    
    // تحديد المعاملات حسب دور المستخدم
    let qs = "";
    if (!isClusterManager && userHospitalId) {
      // موظف عادي: فقط مستشفاه
      qs = `?hospitalId=${encodeURIComponent(userHospitalId)}`;
      console.log(`🔍 الموظف العادي - جلب الأقسام من مستشفى ${userHospitalId} فقط`);
    } else {
      // مدير التجمع: كل المستشفيات (بدون فلتر)
      console.log(`🔍 مدير التجمع - جلب الأقسام من كل المستشفيات`);
    }

    const response = await authFetch(`${API_BASE}/api/dashboard/total/departments${qs}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    const result = await response.json();
    if (!result.success || !result.data) return;

    // جلب قائمة البلاغات الحرجة لتحديد الأقسام + معرفة رقم التذكرة
    const critRes = await authFetch(`${API_BASE}/api/dashboard/total/critical-reports${qs}`);
    let criticalPairs = new Set();
    let criticalMap = new Map(); // ← كائن كامل بدل رقم التذكرة فقط

    if (critRes.ok) {
      const crit = await critRes.json();
      const list = (crit?.data?.reports ?? crit?.reports ?? []);
      list.forEach(r => {
        const hosp = (r.HospitalName ?? r.hospital ?? '').trim();
        const dept = (r.DepartmentName ?? r.department ?? '').trim();
        const code = (r.PriorityCode ?? r.priority ?? '').toString().toUpperCase();
        if ((hosp && dept) && (code === 'URGENT' || code === 'CRITICAL' || code === 'RED' || code === 'HIGH')) {
          const key = `${hosp}|||${dept}`;
          criticalPairs.add(key);
          criticalMap.set(key, {
            ticket: (r.TicketNumber ?? r.ticket),
            complaintId: (r.ComplaintID ?? r.complaintId),
            hospitalId: (r.HospitalID ?? r.hospitalId)
          });
        }
      });
    }

    // طباعة مثال من البيانات الخام للتأكد من أسماء الحقول
    console.log('مثال من البيانات الخام:', result.data[0]);
    console.log('🔍 حقول العدد المتاحة في البيانات:', Object.keys(result.data[0] || {}));
    console.log('🔴 البلاغات الحرجة المكتشفة:', Array.from(criticalPairs));

    const REPEAT_THRESHOLD = 3;

    const grouped = {};
    result.data.forEach(row => {
      const hosp = row.HospitalName || "مستشفى غير محدد";
      const dept = row.DepartmentName || "عيادة غير محددة";

      if (!grouped[hosp]) grouped[hosp] = {};
      if (!grouped[hosp][dept]) {
        grouped[hosp][dept] = { name: dept, count: 0, hasHigh: false, mediumCount: 0 };
      }

      // التقط الحقول المحتملة للعدد الإجمالي من الـ API
      const total = Number(row.TotalCount ?? row.total ?? row.Count ?? row.count ?? 
                           row.ReportsCount ?? row.ComplaintsCount ?? 1);
      
      // زوّدي العداد بالقيمة الحقيقية بدل 1 ثابتة
      grouped[hosp][dept].count += total;

      // 1) لو وصل PriorityCode مع الصف (نادر عندك)
      if (isHighOrCritical(row)) {
        grouped[hosp][dept].hasHigh = true;
      }

      // 2) لو الـ API تجميعي ومعه عدّاد حرِج
      const aggUrgent = Number(row.UrgentCount ?? row.urgentCount ?? row.CriticalCount ?? row.RedCount ?? 0);
      if (aggUrgent > 0) grouped[hosp][dept].hasHigh = true;

      // 3) 🔴 الأهم: علّم من قائمة البلاغات الحرجة الفعلية
      if (criticalPairs.has(`${hosp}|||${dept}`)) {
        grouped[hosp][dept].hasHigh = true;
      }

      // متوسطات - استخدم العدّاد الحقيقي من API
      const aggMedium = Number(row.MediumCount ?? row.mediumCount ?? 
                               row.ByPriority?.MEDIUM ?? row.byPriority?.MEDIUM ?? 0);
      if (aggMedium > 0) grouped[hosp][dept].mediumCount += aggMedium;
      else if (isMedium(row)) grouped[hosp][dept].mediumCount += total;

      // لوج للتشخيص السريع
      console.debug('🧪 PRIORITY CHECK', {
        hosp, dept,
        code: row.PriorityCode,
        level: row.PriorityLevel,
        urgentCount: row.UrgentCount,
        criticalCount: row.CriticalCount,
        redCount: row.RedCount,
        gotRed: isHighOrCritical(row),
        fromCriticalList: criticalPairs.has(`${hosp}|||${dept}`)
      });
    });

    // طباعة قيم الأولوية للتأكد
    console.table(
      Object.entries(grouped).flatMap(([h, m]) =>
        Object.values(m).map(d => ({
          hospital: h,
          dept: d.name,
          count: d.count,
          hasHigh: d.hasHigh,
          mediumCount: d.mediumCount
        }))
      )
    );

    const container = document.getElementById("hospitals-depts-container");
    container.innerHTML = "";

    // 🎨 إنشاء كرت لكل مستشفى
    Object.entries(grouped).forEach(([hospital, deptMap]) => {
      const deptsArr = Object.values(deptMap);     // ← مصفوفة الأقسام
      const sorted   = [...deptsArr].sort((a,b)=> b.count - a.count).slice(0, 5);
      const safeId   = hospital.replace(/[^a-zA-Z0-9\-ا-ي]+/g, '-');

      const card = document.createElement("div");
      card.className = "bg-white border border-gray-100 shadow-sm rounded-xl p-5";
      card.innerHTML = `
        <h4 class="font-bold text-lg mb-3 text-blue-900">${hospital}</h4>
        <div class="mb-4" style="height:220px"><canvas id="depts-chart-${safeId}"></canvas></div>
        <table class="min-w-full text-sm text-center border-collapse">
          <thead>
            <tr class="bg-gray-100 text-gray-700">
              <th class="py-2 px-4 border">العيادة</th>
              <th class="py-2 px-4 border">عدد البلاغات</th>
              <th class="py-2 px-4 border">الحالة</th>
              <th class="py-2 px-4 border">مشروع تحسيني</th>
            </tr>
          </thead>
          <tbody id="body-${safeId}"></tbody>
        </table>
      `;
      container.appendChild(card);

      const tbody = card.querySelector("tbody");
      const REPEAT_THRESHOLD = 3;

      sorted.forEach(dept => {
        const isRed = dept.hasHigh || (dept.mediumCount >= REPEAT_THRESHOLD);
        const rowClass = isRed ? 'table-row-red' :
                         dept.count >= REPEAT_THRESHOLD ? 'table-row-orange' :
                         'table-row-green';
        const status = isRed ? '🔴 حرجة' :
                       dept.count >= REPEAT_THRESHOLD ? '🟠 متكررة' :
                       '🟢 طبيعية';
        const improve = isRed
          ? `<button class="px-3 py-1 text-xs bg-red-600 text-white rounded-full hover:bg-red-700"
               onclick="window.location.href='improvements/new.html?hospital=${encodeURIComponent(hospital)}&department=${encodeURIComponent(dept.name)}'">
               🚀 مشروع تحسيني
             </button>`
          : '-';

        const key = `${hospital}|||${dept.name}`;
        const crit = criticalMap.get(key);

        const makeDetailsHref = (obj) => {
          const q = new URLSearchParams({
            ticket: obj.ticket,
            ...(obj.hospitalId  ? { hid: obj.hospitalId } : {}),
            ...(obj.complaintId ? { complaintId: obj.complaintId } : {})
          });
          return `../public/complaints/history/complaint-details.html?${q.toString()}`;
        };

        const deptCell = crit?.ticket
          ? `<a class="underline ${isRed ? 'text-red-700 hover:text-red-900' : 'text-blue-700 hover:text-blue-900'}"
               href="${makeDetailsHref(crit)}">${dept.name}</a>`
          : `<a class="underline text-blue-700 hover:text-blue-900"
               href="javascript:void(0)"
               onclick="(async()=>{
                 const res = await getLatestTicketByHospitalDept('${hospital.replace(/'/g,"\\'")}','${dept.name.replace(/'/g,"\\'")}');
                 if (res?.ticket) {
                   const q = new URLSearchParams({
                     ticket: res.ticket,
                     ...(res.hospitalId ? { hid: res.hospitalId } : {}),
                     ...(res.complaintId ? { complaintId: res.complaintId } : {})
                   });
                   location.href = '../public/complaints/history/complaint-details.html?' + q.toString();
                 } else {
                   location.href = 'open.html?hospital=${encodeURIComponent(hospital)}&department=${encodeURIComponent(dept.name)}';
                 }
               })()">${dept.name}</a>`;

        tbody.insertAdjacentHTML('beforeend', `
          <tr class="${rowClass}">
            <td class="py-2 px-4 border">${deptCell}</td>
            <td class="py-2 px-4 border">${dept.count}</td>
            <td class="py-2 px-4 border">${status}</td>
            <td class="py-2 px-4 border">${improve}</td>
          </tr>
        `);
      });

      // الرسم المصغّر فوق الجدول
      createMiniDeptsChart(`depts-chart-${safeId}`, sorted, hospital, criticalMap);
    });
  } catch (err) {
    console.error("خطأ في تحميل بيانات الأقسام حسب المستشفى:", err);
  }
}

/**
 * إنشاء رسم مصغّر للعيادات داخل كل مستشفى
 */
function createMiniDeptsChart(canvasId, deptsSorted, hospitalName, criticalMap) {
  const el = document.getElementById(canvasId);
  if (!el) return;

  const REPEAT_THRESHOLD = 3; // نفس العتبة

  // ألوان حسب: hasHigh أو (mediumCount >= threshold) => أحمر
  const colors = deptsSorted.map(d => {
    const isRed = d.hasHigh || (d.mediumCount >= REPEAT_THRESHOLD);
    return isRed ? '#DC2626'
                 : (d === deptsSorted[deptsSorted.length - 1] ? '#10B981' : '#3B82F6');
  });

  // تدمير أي رسم سابق على نفس الـ canvas
  Chart.helpers.each(Chart.instances, inst => {
    if (inst.canvas && inst.canvas.id === canvasId) inst.destroy();
  });

  // إضافة تمييز أحمر للرسم البياني إذا كان يحتوي على أقسام حرجة
  if (deptsSorted.some(d => d.hasHigh || (d.mediumCount >= REPEAT_THRESHOLD))) {
    el.closest('.bg-white')?.classList.add('chart-bar-red');
  }

  const axisColor = getChartAxisColor();

  const chart = new Chart(el.getContext('2d'), {
    type: 'bar',
    data: {
      labels: deptsSorted.map(d => d.name),
      datasets: [{
        data: deptsSorted.map(d => d.count),
        backgroundColor: colors,
        borderRadius: 8,
        barThickness: 14
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { 
        legend: { display: false },
        tooltip: { callbacks: { label: c => `${c.label}: ${c.formattedValue} بلاغ` } }
      },
      scales: {
        x: { beginAtZero: true, grid: { display: false }, ticks: { color: axisColor } },
        y: { grid: { display: false }, ticks: { color: axisColor, font: { family: 'Tajawal' } } }
      },
      // 🔎 خلي المؤشر "يد" فوق جميع الأعمدة
      onHover: (evt, activeEls, chart) => {
        const pts = chart.getElementsAtEventForMode(evt, 'nearest', {intersect: true}, true);
        if (!pts.length) { chart.canvas.style.cursor = 'default'; return; }
        chart.canvas.style.cursor = 'pointer';
      },
      // ✅ نقر مضمون باستخدام getElementsAtEventForMode - جميع الأعمدة تفتح صفحة التفاصيل مباشرة
      onClick: async (evt, activeEls, chart) => {
        const points = chart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true);
        if (!points.length) return;

        const index = points[0].index;
        const d = deptsSorted[index];
        const key = `${hospitalName}|||${d.name}`;
        const crit = criticalMap.get(key); // الآن كائن {ticket, complaintId, hospitalId}

        // 1) لو لدينا بلاغ حرج معرّف
        if (crit?.ticket) {
          const q = new URLSearchParams({
            ticket: crit.ticket,
            ...(crit.hospitalId ? { hid: crit.hospitalId } : {}),
            ...(crit.complaintId ? { complaintId: crit.complaintId } : {})
          });
          window.location.href = `../public/complaints/history/complaint-details.html?${q.toString()}`;
          return;
        }

        // 2) غير حرج: جيب أحدث بلاغ لنفس المستشفى+القسم وافتح التفاصيل به
        const latest = await getLatestTicketByHospitalDept(hospitalName, d.name);
        if (latest?.ticket) {
          const q = new URLSearchParams({
            ticket: latest.ticket,
            ...(latest.hospitalId ? { hid: latest.hospitalId } : {}),
            ...(latest.complaintId ? { complaintId: latest.complaintId } : {})
          });
          window.location.href = `../public/complaints/history/complaint-details.html?${q.toString()}`;
        } else {
          // (نادر) ما لقينا أي بلاغ — افتح قائمة البلاغات مفلترة كحل أخير
          window.location.href = `open.html?hospital=${encodeURIComponent(hospitalName)}&department=${encodeURIComponent(d.name)}`;
        }
      }
    }
  });
}

/**
 * تحديث قسم "الاشكاليات" بالبيانات الحقيقية
 */
async function updateComplaintTypesChart() {
  try {
    const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'http://localhost:3001' : '';

    if (!currentUser) await loadCurrentUser();
    
    // تحديد المعاملات حسب دور المستخدم
    let qs = "";
    if (!isClusterManager && userHospitalId) {
      // موظف عادي: فقط مستشفاه
      qs = `?hospitalId=${encodeURIComponent(userHospitalId)}`;
      console.log(`🔍 الموظف العادي - جلب أنواع البلاغات من مستشفى ${userHospitalId} فقط`);
    } else {
      // مدير التجمع: كل المستشفيات (بدون فلتر)
      console.log(`🔍 مدير التجمع - جلب أنواع البلاغات من كل المستشفيات`);
    }
    
    const response = await authFetch(`${API_BASE}/api/dashboard/total/complaint-types${qs}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

    const result = await response.json();
    if (result.success && result.data) {
      const typeMap = new Map();
      result.data.forEach(type => {
        const key = (type.TypeCode || type.TypeName || '').trim();
        const displayName = (type.TypeName || type.TypeCode || '').trim();
        if (!key || !displayName) return;

        const inc = Number(type.TotalCount ?? type.Count ?? type.count ?? 1);
        if (!typeMap.has(key)) {
          typeMap.set(key, {
            key,
            code: type.TypeCode || null,
            name: displayName,
            count: 0
          });
        }
        const entry = typeMap.get(key);
        entry.count += inc;
      });

      const sortedTypes = Array.from(typeMap.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);

      updateComplaintTypesChartCanvas(sortedTypes);
    }
  } catch (error) {
    console.error('خطأ في تحميل بيانات أنواع البلاغات:', error);
  }
}

/**
 * تحديث الرسم البياني لأنواع البلاغات
 */
function updateComplaintTypesChartCanvas(complaintTypesData) {
  const ctx = document.getElementById('categories-chart');
  if (!ctx) return;

  Chart.helpers.each(Chart.instances, function(ins) {
    if (ins.canvas.id === 'categories-chart') ins.destroy();
  });

  const labels = complaintTypesData.map(t => t.name);
  const data = complaintTypesData.map(t => t.count);
  const axisColor = getChartSecondaryTextColor();
  const dataLabelColor = getChartDataLabelColor();

  new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: (c) => (c.dataIndex < 2 ? '#b30000' : '#2d75c7'),
        borderRadius: 6,
        barThickness: 28,
        complaintTypes: complaintTypesData
      }]
    },
    const axisColor = getChartSecondaryTextColor();
    const gridColor = getChartGridColor();

    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'x',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: c => `${c.label}: ${c.formattedValue}`
          }
        },
        datalabels: {
          anchor: 'end',
          align: 'end',
          color: dataLabelColor,
          font: {
            size: 14,
            weight: 'bold'
          },
          formatter: value => value
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: axisColor,
            font: { size: 13 }
          }
        },
        y: {
          beginAtZero: true,
          grid: { display: false },
          ticks: {
            color: axisColor,
            font: { size: 12 }
          }
        }
      },
      onClick: (evt, elements, chart) => {
        if (!elements || !elements.length) return;
        const { datasetIndex, index } = elements[0];
        const dataset = chart.data.datasets?.[datasetIndex];
        const meta = dataset?.complaintTypes || [];
        const selected = meta[index];
        if (!selected) return;
        const typeKey = selected.code || selected.key || selected.name;
        const label = selected.name;
        if (!typeKey) return;
        const url = `classification-details.html?type=${encodeURIComponent(typeKey)}&label=${encodeURIComponent(label)}`;
        window.location.href = url;
      }
    },
    plugins: [ChartDataLabels]
  });
}

/**
 * تحديث الرسم البياني اليومي بالبيانات الحقيقية
 */
async function updateDailyComplaintsChart() {
  try {
    const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'http://localhost:3001' : '';

    if (!currentUser) await loadCurrentUser();
    
    // إرسال hospitalId دائماً إذا كان معروفاً (حتى لمدير التجمع)
    const qs = userHospitalId ? `?hospitalId=${encodeURIComponent(userHospitalId)}` : '';
    
    if (userHospitalId) {
      console.log(`🔍 جلب البيانات اليومية من مستشفى ${userHospitalId}`);
    } else {
      console.log(`🔍 جلب البيانات اليومية من كل المستشفيات`);
    }
    
    const response = await authFetch(`${API_BASE}/api/dashboard/total/daily-complaints${qs}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

    const result = await response.json();
    console.log('🔍 استجابة API البيانات اليومية:', result);
    
    if (result.success && result.data) {
      updateDailyComplaintsChartCanvas(result.data);
    } else {
      console.warn('❌ لا توجد بيانات يومية في الاستجابة:', result);
      updateDailyComplaintsChartCanvas([]);
    }
  } catch (error) {
    console.error('خطأ في تحميل البيانات اليومية:', error);
    updateDailyComplaintsChartCanvas([]);
  }
}

/**
 * تحديث الرسم البياني اليومي
 */
function updateDailyComplaintsChartCanvas(dailyData) {
  const ctx = document.getElementById('wk-trend');
  if (!ctx) return;
  
  // البحث عن جميع الرسوم البيانية الموجودة على هذا Canvas وتدميرها
  Chart.helpers.each(Chart.instances, function(instance) {
    if (instance.canvas.id === 'wk-trend') {
      instance.destroy();
    }
  });
  
  // أيضاً تدمير المتغير المحلي إذا كان موجوداً
  if (window.dailyChart) {
    window.dailyChart.destroy();
    window.dailyChart = null;
  }
  
  // تطبيع أسماء الحقول المرن
  const labels = dailyData.map(d =>
    (d.day ?? d.Day ?? d.date ?? d.Date ?? d.label ?? d.d ?? '').toString()
  );
  const data = dailyData.map(d =>
    Number(
      d.count ?? d.Count ?? d.total ?? d.Total ?? d.TotalCount ??
      d.cnt ?? d.value ?? 0
    )
  );
  
  console.log('🔍 بيانات الرسم البياني اليومي:', { labels, data, dailyData });
  
  // لو بعد التطبيع طلع كله أصفار/فاضي، اظهري رسالة عدم توفّر
  if (!labels.length || data.every(v => v === 0)) {
    ctx.parentElement.innerHTML = `
      <div class="text-center py-8">
        <div class="text-gray-600 text-lg mb-2">📊 لا توجد بيانات يومية</div>
        <div class="text-gray-500">لم يتم العثور على بيانات البلاغات اليومية للفترة المحددة</div>
      </div>`;
    return;
  }
  
  // تحسين مقياس الـ Y
  const max = Math.max(...data);
  const yMax = max < 5 ? 5 : max + 2;
  
  // إنشاء الرسم البياني الجديد
  window.dailyChart = new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'عدد البلاغات',
        data: data,
        borderColor: '#3B82F6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderWidth: 3,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#3B82F6',
        pointBorderColor: '#FFFFFF',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        x: {
          grid: {
            display: false
          },
          ticks: {
            color: axisColor,
            font: {
              size: 12
            }
          }
        },
        y: {
          beginAtZero: true,
          suggestedMax: yMax,
          grid: {
            color: gridColor
          },
          ticks: {
            color: axisColor,
            font: {
              size: 12
            }
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

// ========================================
// متغيرات الرسوم البيانية
// Chart Variables
// ========================================

/**
 * متغيرات الرسوم البيانية
 * يتم استخدامها لتخزين مراجع الرسوم البيانية
 */
let reportsChart, statusChart, hospitalChart;

// ========================================
// وظائف إدارة بطاقات المستشفيات
// Hospital Cards Management Functions
// ========================================

/**
 * إنشاء بطاقات المستشفيات
 * @param {boolean} filterRedOnly - عرض المستشفيات ذات البلاغات الحمراء فقط
 */
function generateHospitalCards(filterRedOnly = false) {
  const grid = document.getElementById('hospitals-grid');
  if (!grid) return;
  
  grid.innerHTML = '';

  // فرز المستشفيات حسب الأولوية: الأحمر -> البرتقالي -> الأصفر
  const sorted = [...hospitalsData].sort((a, b) => {
    const ar = a.priorityCounts?.red || 0, br = b.priorityCounts?.red || 0;
    const ao = a.priorityCounts?.orange || 0, bo = b.priorityCounts?.orange || 0;
    const ay = a.priorityCounts?.yellow || 0, by = b.priorityCounts?.yellow || 0;
    return (br - ar) || (bo - ao) || (by - ay);
  });

  // فلترة المستشفيات حسب المعامل
  const list = filterRedOnly ? sorted.filter(h => (h.priorityCounts?.red || 0) > 0) : sorted;

  // إنشاء بطاقة لكل مستشفى
  list.forEach(h => {
    const redCount = h.priorityCounts?.red || 0;
    const orangeCount = h.priorityCounts?.orange || 0;
    const yellowCount = h.priorityCounts?.yellow || 0;

    const card = document.createElement('div');
    card.className = 'relative card-hover bg-white rounded-2xl p-8 shadow-xl border border-gray-100 cursor-pointer';

    // إضافة شارة حمراء للمستشفيات ذات البلاغات الحرجة
    if (redCount > 0) {
      const badge = document.createElement('div');
      badge.className = 'badge-red';
      badge.textContent = `🔴 ${redCount} حرجة`;
      card.appendChild(badge);

      // إضافة حافة حمراء للبطاقة
      card.classList.add('ring-1', 'ring-red-200');
    }

    // إضافة وظيفة النقر لفتح تفاصيل المستشفى
    card.onclick = () => showHospitalDetail(h);

    // إضافة محتوى البطاقة
    card.innerHTML += `
      <div class="service-icon w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mb-6 mx-auto">
        <svg class="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16"/>
        </svg>
      </div>
      <h3 class="text-xl font-bold mb-2 text-center" style="color:#002B5B;">${h.name}</h3>
      <p class="text-gray-600 text-center mb-6 font-medium">${h.type} - ${h.beds} سرير</p>

      <div class="grid grid-cols-3 gap-4 mb-4">
        <div class="text-center p-3 bg-blue-50 rounded-xl">
          <div class="text-2xl font-bold text-blue-600 mb-1">${h.totalReports}</div>
          <div class="text-xs text-gray-600 font-medium">إجمالي</div>
        </div>
        <div class="text-center p-3 bg-yellow-50 rounded-xl">
          <div class="text-2xl font-bold text-yellow-600 mb-1">${h.openReports}</div>
          <div class="text-xs text-gray-600 font-medium">مفتوحة</div>
        </div>
        <div class="text-center p-3 bg-green-50 rounded-xl">
          <div class="text-2xl font-bold text-green-600 mb-1">${h.resolutionRate}%</div>
          <div class="text-xs text-gray-600 font-medium">معدل الحل</div>
        </div>
      </div>

      <!-- شريط مستويات البلاغات -->
      <div class="flex items-center justify-center gap-2 mb-6">
        <span class="pill pill-red">🔴 ${redCount}</span>
        <span class="pill pill-orange">🟠 ${orangeCount}</span>
        <span class="pill pill-yellow">🟡 ${yellowCount}</span>
      </div>

      <div class="text-center">
        <span class="inline-flex items-center px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-full text-sm font-medium">
          عرض التفاصيل
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
          </svg>
        </span>
      </div>
    `;
    
    grid.appendChild(card);
  });
}

// ========================================
// وظائف إدارة البلاغات الحمراء
// Red Reports Management Functions
// ========================================

/**
 * عرض قائمة مختصرة بأحدث البلاغات الحمراء
 */
function renderTopRedList() {
  const container = document.getElementById('red-list');
  const totalSpan = document.getElementById('red-total');
  if (!container || !totalSpan) return;

  // جمع جميع البلاغات الحمراء من كل المستشفيات
  const allRed = hospitalsData.flatMap(h =>
    (h.redReports || []).map(r => ({ ...r, hospitalId: h.id, hospital: h.name }))
  );

  // تحديث العدد الإجمالي
  totalSpan.textContent = allRed.length;

  // عرض آخر 6 بلاغات
  const latest = allRed.slice(0, 6);
  container.innerHTML = '';

  latest.forEach(item => {
    const card = document.createElement('div');
    card.className = 'bg-red-50 border border-red-100 rounded-xl p-4 hover:bg-red-100 transition cursor-pointer';
    card.innerHTML = `
      <div class="flex items-center justify-between">
        <div>
          <div class="font-bold text-red-800">${item.id}</div>
          <div class="text-xs text-red-700">${item.dept}</div>
        </div>
        <div class="text-right">
          <div class="text-xs text-red-800">${item.createdAt}</div>
          <div class="mt-1 text-xs text-gray-600">${item.hospital}</div>
        </div>
      </div>
    `;
    
    // إضافة وظيفة النقر لفتح المستشفى المعني
    card.onclick = () => {
      const h = hospitalsData.find(x => x.id === item.hospitalId);
      if (h) showHospitalDetail(h);
    };
    
    container.appendChild(card);
  });
}

// ========================================
// وظائف تفاصيل المستشفى
// Hospital Detail Functions
// ========================================

/**
 * عرض تفاصيل المستشفى
 * @param {Object} h - بيانات المستشفى
 */
function showHospitalDetail(h) {
  // توجيه إلى الداشبورد المستقل للمستشفى
  window.location.href = `hospital/hospital.html?id=${h.id}`;
}

/**
 * إنشاء البلاغات الحديثة (وهمية)
 */
function generateRecentReports() {
  const container = document.getElementById('recent-reports');
  if (!container) return;

  // بيانات نموذجية للبلاغات
  const sampleReports = [
    { id:'RPT-2025-101', type:'انقطاع نظام',        hospital:'مستشفى الملك فيصل',    priority:'red',     date:'2025-01-16 09:40' },
    { id:'RPT-2025-095', type:'تعثّر خدمة مختبر',   hospital:'مستشفى الهدى العام',   priority:'red',     date:'2025-01-15 18:20' },
    { id:'RPT-2025-088', type:'تأخر صرف أدوية',     hospital:'مستشفى الملك عبدالعزيز', priority:'orange',  date:'2025-01-15 14:10' },
    { id:'RPT-2025-076', type:'تعطل جهاز أشعة',     hospital:'مستشفى النور التخصصي',  priority:'orange',  date:'2025-01-14 11:05' },
    { id:'RPT-2025-069', type:'طلب تحسين مسار',     hospital:'مركز العزيزية',          priority:'yellow',  date:'2025-01-13 16:32' },
    { id:'RPT-2025-063', type:'طلب معلومات',        hospital:'مركز الشرائع',           priority:'yellow',  date:'2025-01-12 09:50' },
  ];

  // فرز البلاغات حسب الأولوية ثم التاريخ
  const weight = { red: 3, orange: 2, yellow: 1 };
  const sorted = [...sampleReports].sort((a, b) =>
    (weight[b.priority] - weight[a.priority]) ||
    (new Date(b.date) - new Date(a.date))
  );

  // إنشاء عناصر البلاغات
  container.innerHTML = '';
  sorted.forEach(r => {
    const chipClass =
      r.priority === 'red'    ? 'priority-chip priority-red' :
      r.priority === 'orange' ? 'priority-chip priority-orange' :
                                'priority-chip priority-yellow';

    const chipLabel =
      r.priority === 'red'    ? '🔴 أولوية حرجة' :
      r.priority === 'orange' ? '🟠 أولوية متوسطة' :
                                '🟡 طلب/منخفضة';

    const div = document.createElement('div');
    div.className = 'report-item';
    div.innerHTML = `
      <div class="report-left">
        <div class="id">#${r.id}</div>
        <div class="type">${r.type}</div>
      </div>
      <div class="report-right">
        <div class="${chipClass}">${chipLabel}</div>
        <div class="hospital">${r.hospital}</div>
        <div class="date">${r.date}</div>
      </div>
    `;
    container.appendChild(div);
  });
}

// ========================================
// وظائف الرسوم البيانية
// Charts Functions
// ========================================

/**
 * إنشاء الرسوم البيانية الرئيسية
 */
function createMainCharts() {
  // رسم اتجاه البلاغات
  const reportsCtx = document.getElementById('reportsChart');
  if (reportsCtx) {
    reportsChart = new Chart(reportsCtx.getContext('2d'), {
      type: 'line',
      data: {
        labels: ['أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر', 'يناير'],
        datasets: [
          {
            label: 'البلاغات الجديدة', 
            data: [1200, 1350, 1100, 1400, 1250, 1500], 
            borderColor: '#004A9F', 
            backgroundColor: 'rgba(0,74,159,.1)', 
            tension: .4, 
            fill: true
          },
          {
            label: 'البلاغات المغلقة', 
            data: [1100, 1250, 1050, 1300, 1200, 1400], 
            borderColor: '#0FA47A', 
            backgroundColor: 'rgba(15,164,122,.1)', 
            tension: .4, 
            fill: true
          },
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
          y: { beginAtZero: true }
        } 
      }
    });
  }

  // رسم توزيع حالات البلاغات
  const statusCtx = document.getElementById('statusChart');
  if (statusCtx) {
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

/**
 * إنشاء الرسم البياني للمستشفى
 */
function createHospitalChart() {
  if (hospitalChart) hospitalChart.destroy();
  
  const ctx = document.getElementById('hospitalChart');
  if (ctx) {
    hospitalChart = new Chart(ctx.getContext('2d'), {
      type: 'bar',
      data: { 
        labels: ['أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر', 'يناير'], 
        datasets: [{
          label: 'البلاغات الشهرية', 
          data: [35, 42, 28, 48, 38, 52], 
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
  }
}

// ========================================
// معالجات الأحداث
// Event Handlers
// ========================================

/**
 * تهيئة معالجات الأحداث
 */
function initializeEventHandlers() {
  // زر العودة للقائمة الرئيسية
  const backBtn = document.getElementById('back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      document.getElementById('hospital-detail').style.display = 'none';
      document.getElementById('hospitals-section').style.display = 'block';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // معالجات أزرار الفلترة
  document.addEventListener('click', (e) => {
    if (e.target.id === 'filter-red') {
      // توجيه إلى صفحة المستشفيات مع فلترة البلاغات الحمراء
      window.location.href = 'hospitals.html?filter=red';
    }
    if (e.target.id === 'filter-all') {
      // توجيه إلى صفحة المستشفيات
      window.location.href = 'hospitals.html';
    }
  });
}

// ========================================
// وظائف التهيئة
// Initialization Functions
// ========================================

/**
 * تحديث وقت آخر تحديث
 */
function updateLastUpdateTime() {
  const now = new Date();
  const timeElement = document.getElementById('last-update');
  if (timeElement) {
    timeElement.textContent = 'اليوم ' + now.toLocaleTimeString('ar-SA', {
      hour: '2-digit', 
      minute: '2-digit', 
      hour12: true
    });
  }
}

/**
 * تطبيق صلاحيات لوحة التحكم على العناصر
 */
async function applyDashboardPermissions() {
  try {
    const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1') ? 'http://localhost:3001' : '';
    const token = localStorage.getItem('token') || localStorage.getItem('authToken');
    
    if (!token) {
      console.warn('No auth token found, hiding dashboard content');
      hideDashboardContent();
      return;
    }

    const res = await fetch(`${API_BASE}/api/permissions/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!res.ok) {
      console.warn('Failed to fetch permissions:', res.status);
      hideDashboardContent();
      return;
    }
    
    const js = await res.json();
    const p = js?.data || {};

    // ====== فحص صلاحية عرض لوحة التحكم ======
    // إذا لم تكن هناك صلاحية DASH_PAGE، أخفي الصفحة بالكامل
    if (!p.dashPage) {
      console.log('🔒 لا توجد صلاحية DASH_PAGE - إخفاء لوحة التحكم');
      hideDashboardContent();
      return;
    }

    // إذا كانت الصلاحية موجودة، أظهر المحتوى
    showDashboardContent();

    // تحقق من أن المستخدم مدير تجمع - إذا كان كذلك، أظهر جميع العناصر
    if (isClusterManager) {
      console.log('Cluster manager detected - showing all dashboard elements');
      showAllElementsForClusterManager();
      return;
    }

    // مُحوِّل اسم فلاغ -> PermissionKey
    const allow = new Set();
    if (p.dashPage)             allow.add('DASH_PAGE');
    if (p.dashCardTotals)       allow.add('DASH_CARD_TOTALS');
    if (p.dashCardOpen)         allow.add('DASH_CARD_OPEN');
    if (p.dashCardClosed)       allow.add('DASH_CARD_CLOSED');
    if (p.dashCardUrgent)       allow.add('DASH_CARD_URGENT');
    if (p.dashCardCloseRate)    allow.add('DASH_CARD_CLOSE_RATE');
    if (p.dashCardHospCount)    allow.add('DASH_CARD_HOSPITAL_COUNT');
    if (p.dashChartMystery || p.mysteryModule)     allow.add('DASH_CHART_MYSTERY_BY_DEPT');
    if (p.dashChartClasses)     allow.add('DASH_CHART_CLASSIFICATIONS');
    if (p.dashChartTopClinics)  allow.add('DASH_CHART_TOP_CLINICS');
    if (p.dashChartDailyTrend)  allow.add('DASH_CHART_DAILY_TREND');
    if (p.dashUrgentList)       allow.add('DASH_URGENT_LIST');

    // أظهر كل عنصر يحمل data-perm ضمن القائمة المسموحة
    document.querySelectorAll('[data-perm]').forEach(el => {
      const perm = el.getAttribute('data-perm');
      if (allow.has(perm)) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    });

    console.log('Dashboard permissions applied:', Array.from(allow));
  } catch (error) {
    console.error('Error applying dashboard permissions:', error);
    hideDashboardContent(); // إخفاء كإجراء أمان في حالة الخطأ
  }
}

/**
 * إخفاء محتوى لوحة التحكم وإظهار رسالة عدم الصلاحية
 */
function hideDashboardContent() {
  const main = document.querySelector('main');
  if (main) {
    main.innerHTML = `
      <div class="pt-20 flex items-center justify-center min-h-screen">
        <div class="bg-white rounded-2xl shadow-xl p-8 max-w-md text-center">
          <div class="mb-6">
            <svg class="w-24 h-24 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
            </svg>
          </div>
          <h2 class="text-2xl font-bold mb-4" style="color:#002B5B;">لا تملك صلاحية عرض لوحة التحكم</h2>
          <p class="text-gray-600 mb-6">عذراً، ليس لديك صلاحية للوصول إلى هذه الصفحة.</p>
          <a href="../index/index.html" class="inline-block px-6 py-3 rounded-xl text-white font-medium hover:opacity-90 transition-opacity" style="background: linear-gradient(135deg, #002B5B, #004A9F);">
            العودة للصفحة الرئيسية
          </a>
        </div>
      </div>
    `;
  }
}

/**
 * إظهار محتوى لوحة التحكم
 */
function showDashboardContent() {
  // إذا كان المحتوى مخفي، لا نفعل شيء لأن الصفحة لم يتم تحميلها بعد
  // هذه الدالة موجودة للتناسق مع منطق التقارير
  console.log('✅ صلاحية DASH_PAGE موجودة - عرض لوحة التحكم');
}

/**
 * إظهار جميع العناصر لمدير التجمع
 */
function showAllElementsForClusterManager() {
  console.log('Showing all elements for cluster manager');
  
  // إظهار جميع العناصر مع data-perm
  document.querySelectorAll('[data-perm]').forEach(el => {
    el.classList.remove('hidden');
  });
  
  // إظهار جميع العناصر المخفية
  document.querySelectorAll('.hidden').forEach(el => {
    el.classList.remove('hidden');
  });
  
  // إظهار جميع العناصر المخفية بعد فترة قصيرة
  setTimeout(() => {
    document.querySelectorAll('.hidden').forEach(el => {
      el.classList.remove('hidden');
    });
  }, 100);
}

/**
 * تحميل جميع الرسوم البيانية للداشبورد
 */
async function loadAllDashboardCharts() {
  try {
    console.log('Loading all dashboard charts for cluster manager');
    
    // إظهار جميع العناصر
    showAllElementsForClusterManager();
    
    // تحميل رسوم بيانية إضافية إذا كانت موجودة
    const chartElements = document.querySelectorAll('canvas[id]');
    console.log('Found chart elements:', chartElements.length);
    
    // إعادة تحميل الرسوم البيانية الموجودة
    if (typeof App.renderMysteryByDepartment === 'function') {
      await App.renderMysteryByDepartment();
    }
    
    // يمكن إضافة تحميل رسوم بيانية أخرى هنا
    // مثل: await loadChart1(), await loadChart2(), etc.
    
    // إظهار جميع العناصر مرة أخيرة
    setTimeout(() => {
      showAllElementsForClusterManager();
    }, 100);
    
  } catch (error) {
    console.error('Error loading dashboard charts:', error);
  }
}

/**
 * تهيئة الداشبورد
 */
async function initializeDashboard() {
  try {
    // 1) هوية المستخدم ودوره
    await loadCurrentUser();

    // 2) تطبيق صلاحيات لوحة التحكم
    await applyDashboardPermissions();

    // إخفاء مخطط المستشفيات إذا المستخدم ليس مدير تجمع
    if (!isClusterManager) {
      const hf = document.getElementById('health-facilities-charts');
      if (hf) hf.style.display = 'none';
    }

    // 2) بيانات المستشفيات (ستتقيّد بالدور تلقائياً)
    await loadHospitalsData();

    // 🔹 تحميل قائمة المستشفيات لمدير التجمع
    await App.loadHospitalsSelectForMystery();
    
    // 🔹 استدعاء رسم الزائر السري
    App.renderMysteryByDepartment();

    // 3) باقي الأقسام
    renderTopRedList();
    initializeEventHandlers();
    updateLastUpdateTime();

    // 4) تحميل جميع الرسوم البيانية لمدير التجمع
    if (isClusterManager) {
      console.log('Loading all charts for cluster manager');
      // تحميل الرسوم البيانية الأخرى إذا كانت موجودة
      await loadAllDashboardCharts();
      
      // إظهار جميع العناصر المخفية
      showAllElementsForClusterManager();
    }
    
    // 5) إظهار جميع العناصر لمدير التجمع مرة أخيرة
    if (isClusterManager) {
      setTimeout(() => {
        showAllElementsForClusterManager();
      }, 200);
    }
  } catch (error) {
    console.error('خطأ في تهيئة لوحة التحكم:', error);
  }
}

// ========================================
// تشغيل التهيئة عند تحميل الصفحة
// Run Initialization on Page Load
// ========================================

document.addEventListener('DOMContentLoaded', async () => {
  await initializeDashboard();
});

// ========================================
// ربط كارت البلاغات المغلقة بصفحة closed.html
// Link Closed Reports Card to closed.html page
// ========================================

document.getElementById('card-closed')?.addEventListener('click', () => {
  window.location.href = 'closed.html';
});

// ========================================
// ربط كارت البلاغات المفتوحة بصفحة open.html
// Link Open Reports Card to open.html page
// ========================================

document.getElementById('card-open')?.addEventListener('click', () => {
  window.location.href = 'open.html';
});

// ========================================
// ربط كارت إجمالي البلاغات بصفحة total.html
// Link Total Reports Card to total.html page
// ========================================

document.getElementById('card-total')?.addEventListener('click', () => {
  window.location.href = 'total.html';
});

/* ===============================
   Health Facilities Charts
   =============================== */
document.addEventListener('DOMContentLoaded', () => {
  // ألوان متناسقة مع صفحتك
  const cPrimary = '#004A9F';   // أزرق غامق (من صفحتك)
  const cBlue50  = 'rgba(0,74,159,.10)';
  const cGreen   = '#0FA47A';
  const cYellow  = '#F59E0B';
  const cRed     = '#EF4444';
  const cGrayTxt = getChartAxisColor();

  // رسم المستشفيات - جلب البيانات الحقيقية من API
  const hospitalsCtx = document.getElementById('hospitals-chart');
  if (hospitalsCtx) {
    // جلب البيانات الحقيقية من API
    const API_BASE = location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? 'http://localhost:3001' : '';
    
    // تحميل المستخدم أولاً إذا لم يكن محملاً
    loadCurrentUser().then(() => {
      const qs = (!isClusterManager && userHospitalId) ? `?hospitalId=${encodeURIComponent(userHospitalId)}` : '';
      return authFetch(`${API_BASE}/api/dashboard/total/by-hospital${qs}`);
    }).then(response => response.json())
      .then(apiData => {
        console.log('بيانات المستشفيات من قاعدة البيانات:', apiData);
        
        // فلترة البيانات إذا لم يكن مدير تجمع
        const hospitalsData = (!isClusterManager && userHospitalId)
          ? apiData.filter(h => (h.HospitalID === userHospitalId || h.HospitalId === userHospitalId))
          : apiData;
        
        console.log('بيانات المستشفيات بعد الفلترة:', hospitalsData);
        
        // تحضير البيانات للرسم البياني
        const labels = hospitalsData.map(hospital => hospital.HospitalName);
        const data = hospitalsData.map(hospital => {
          const totalReports = Number(hospital.counts?.total ?? 0);
          console.log(`مستشفى: ${hospital.HospitalName}, عدد البلاغات: ${totalReports}`);
          return totalReports;
        });
        
        console.log('تسميات المستشفيات:', labels);
        console.log('بيانات البلاغات:', data);

        // البحث عن جميع الرسوم البيانية الموجودة على هذا Canvas وتدميرها
        Chart.helpers.each(Chart.instances, function(instance) {
          if (instance.canvas.id === 'hospitals-chart') {
            instance.destroy();
          }
        });

        // التحقق من وجود بيانات
        if (labels.length === 0 || data.every(val => val === 0)) {
          console.warn('لا توجد بيانات للمستشفيات أو جميع القيم صفر');
          hospitalsCtx.parentElement.innerHTML = `
            <div class="text-center py-8">
              <div class="text-gray-600 text-lg mb-2">📊 لا توجد بيانات للمستشفيات</div>
              <div class="text-gray-500">لم يتم العثور على بيانات البلاغات للمستشفيات</div>
            </div>
          `;
          return;
        }

        // ألوان مختلفة لكل مستشفى
        const colors = [
          '#3B82F6', '#F97316', '#10B981', '#8B5CF6', '#F59E0B', '#06B6D4',
          '#DC2626', '#0EA5E9', '#14B8A6', '#6366F1'
        ].slice(0, labels.length);

        console.log('إنشاء الرسم الدائري مع البيانات:', { labels, data, colors });

        new Chart(hospitalsCtx.getContext('2d'), {
          type: 'pie',
          data: {
            labels: labels,
            datasets: [{
              label: 'عدد البلاغات',
              data: data,
              backgroundColor: colors,
              borderColor: '#fff',
              borderWidth: 2
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'right',
                labels: {
                  font: { family: 'Tajawal', size: 13 },
                  color: getChartLegendColor()
                }
              },
              tooltip: {
                callbacks: {
                  label: ctx => `${ctx.label}: ${ctx.formattedValue}`
                }
              }
            }
          }
        });
      })
      .catch(error => {
        console.error('خطأ في تحميل بيانات المستشفيات من قاعدة البيانات:', error);
        console.error('تفاصيل الخطأ:', {
          message: error.message,
          status: error.status,
          url: `${API_BASE}/api/dashboard/total/by-hospital${qs}`
        });
        
        // في حالة الخطأ، اعرض رسالة خطأ
        hospitalsCtx.parentElement.innerHTML = `
          <div class="text-center py-8">
            <div class="text-red-600 text-lg mb-2">⚠️ تعذر تحميل بيانات المستشفيات</div>
            <div class="text-gray-600 mb-2">خطأ في الاتصال بقاعدة البيانات</div>
            <div class="text-sm text-gray-500 mb-4">${error.message || 'خطأ غير معروف'}</div>
            <button onclick="location.reload()" 
                    class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
              إعادة المحاولة
            </button>
          </div>
        `;
    });
  }

  // تم حذف كود المراكز الصحية - المستشفيات فقط

});

/* ===============================
   Weekly 937 Board - Demo Charts
   =============================== */
document.addEventListener('DOMContentLoaded', () => {
  // ألوان متناسقة مع صفحتك
  const cPrimary = '#004A9F';   // أزرق غامق (من صفحتك)
  const cBlue50  = 'rgba(0,74,159,.10)';
  const cGreen   = '#0FA47A';
  const cYellow  = '#F59E0B';
  const cRed     = '#EF4444';
  const cGrayTxt = getChartAxisColor();

  // 1) أعلى العيادات (بار أفقي طويل)
  const deptsCtx = document.getElementById('wk-depts');
  if (deptsCtx) {
    new Chart(deptsCtx.getContext('2d'), {
      type: 'bar',
      data: {
        labels: [
          'عيادة طب أسرة','عيادة الدم والأعصاب','عيادة العظام','تخصص: الجلدي - العيون',
          'عيادة الأطفال','عيادة الأنف والأذن والحنجرة','عيادة أمراض النساء والولادة','عيادة الباطنة',
          'الأسنان','عيادة الجراحة','عيادة الرعاية العامة','عيادة التحصينات للأطفال السليم',
          'عيادة المتابعة الوقائية (استشاري)','عيادة الجهاز الهضمي'
        ],
        datasets: [{
          label: '',
          data: [347,61,50,50,50,47,43,38,37,37,34,26,25,23],
          backgroundColor: cPrimary,
          borderRadius: 6,
          barThickness: 12
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks:{ color:cGrayTxt } },
          y: { grid: { display: false }, ticks:{ color:cGrayTxt } }
        }
      }
    });
  }

  // 3) خط الاتجاه اليومي (سبتمبر/أكتوبر)
  const trendCtx = document.getElementById('wk-trend');
  if (trendCtx) {
    const labels = Array.from({length: 31}, (_,i)=> i<20 ? (i+11).toString() : (i-19).toString()); // 11..30 ثم 1..11 تقريبية
    const data = [389,519,411,632,456,595,525,382,403,440,345,223,102,189,108,240,383,456,535,507,489,549,536,489,464,484,403,345,223,112,122];
    new Chart(trendCtx.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'البلاغات اليومية',
          data,
          borderColor: cPrimary,
          backgroundColor: cBlue50,
          fill:true,
          tension:.4,
          pointRadius:3
        }]
      },
      options: {
        responsive:true,
        maintainAspectRatio:false,
        plugins:{
          legend:{ display:false }
        },
        scales:{
          x:{ grid:{ display:false }, ticks:{ color:cGrayTxt }},
          y:{ grid:{ color:'rgba(0,0,0,.05)' }, beginAtZero:true, ticks:{ color:cGrayTxt } }
        }
      }
    });
  }
});
