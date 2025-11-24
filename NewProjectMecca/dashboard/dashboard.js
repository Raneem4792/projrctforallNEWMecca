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

if (typeof App.renderMysteryByDepartment !== 'function') {
  App.renderMysteryByDepartment = async function () {
    const canvas = document.getElementById('mystery-depts');
    if (!canvas) return;

    await window.loadCurrentUser?.();
    const me = App.getCurrentUser();

    const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'http://localhost:3001' : '';

    const params = new URLSearchParams();

    // التحقق من وجود تصفية نشطة أولاً
    const filteredId = window.filteredHospitalId;
    if (filteredId) {
      params.set('hospitalId', filteredId);
      console.log('🔍 التصفية النشطة - استخدام hospitalId المفلتر للزائر السري:', filteredId);
    } else if (App.isClusterManager()) {
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

    new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'مغلقة', data: closed, backgroundColor: '#0FA47A', stack: 'm', borderRadius: 6, barThickness: 14 },
          { label: 'مفتوحة', data: open,   backgroundColor: '#1D9BF0', stack: 'm', borderRadius: 6, barThickness: 14 }
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
          x: { beginAtZero: true, grid: { display: false }, ticks: { color: '#475569' } }, 
          y: { grid: { display: false }, ticks: { color: '#475569', font: { family: 'Tajawal' } } } 
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
        FacilityType: hospital.FacilityType || 'Hospital', // إضافة نوع المنشأة
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

    // ⭐ إذا كان هناك تصفية نشطة، لا نحدث الكروت العامة لأنها ستُحدث عبر filterDashboardByFacility
    if (!window.filteredHospitalId) {
      updateMainStatsCards();
    } else {
      console.log(`⛔ تم منع استدعاء updateMainStatsCards() في loadHospitalsData() - تصفية نشطة للمستشفى ${window.filteredHospitalId}`);
    }

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
 * توليد قائمة المستشفيات للفلترة
 */
function generateHospitalFilterList() {
  const list = document.getElementById('hospital-filter-list');
  if (!list) return;

  // فلترة فقط المستشفيات (FacilityType = 'hospital')
  const hospitalsOnly = hospitalsData.filter(h =>
    (h.FacilityType || '').toLowerCase() === 'hospital'
  );

  list.innerHTML = '';

  // إذا لم يكن مدير تجمع، لا نعرض القائمة (لأنه مستشفى واحد فقط)
  if (!isClusterManager && hospitalsOnly.length <= 1) {
    return;
  }

  hospitalsOnly.forEach(h => {
    const btn = document.createElement('button');
    btn.className = 'px-4 py-2 rounded-full border text-sm font-medium hover:bg-blue-600 hover:text-white transition';
    btn.style.borderColor = '#004A9F';
    btn.style.color = '#004A9F';
    btn.dataset.hospitalId = h.id;

    btn.textContent = h.name;

    btn.onclick = () => {
      window.location.href = `dashboard.html?hospitalId=${h.id}`;
    };

    list.appendChild(btn);
  });
}

/**
 * توليد قائمة المراكز الصحية للفلترة
 */
function generateCenterFilterList() {
  const list = document.getElementById('center-filter-list');
  if (!list) return;

  // فلترة فقط المراكز الصحية (FacilityType = 'center')
  const centersOnly = hospitalsData.filter(h =>
    (h.FacilityType || '').toLowerCase() === 'center'
  );

  list.innerHTML = '';

  // إذا لم يكن مدير تجمع، لا نعرض القائمة (لأنه مركز واحد فقط)
  if (!isClusterManager && centersOnly.length <= 1) {
    return;
  }

  centersOnly.forEach(c => {
    const btn = document.createElement('button');
    btn.className = 'px-4 py-2 rounded-full border text-sm font-medium hover:bg-green-600 hover:text-white transition';
    btn.style.borderColor = '#0FA47A';
    btn.style.color = '#0FA47A';
    btn.dataset.centerId = c.id;

    btn.textContent = c.name;

    btn.onclick = () => {
      window.location.href = `dashboard.html?centerId=${c.id}`;
    };

    list.appendChild(btn);
  });
}

/**
 * فلترة لوحة التحكم بناءً على مستشفى أو مركز صحي محدد
 */
async function filterDashboardByFacility(type, id) {
  console.log('🔍 Filtering dashboard by:', type, id);

  // جلب البيانات من hospitalsData
  const item = hospitalsData.find(h => h.id == id);
  if (!item) {
    console.error('❌ Facility not found:', id);
    return;
  }

  // حفظ معرف المستشفى/المركز المحدد للاستخدام في جميع الدوال
  window.filteredHospitalId = id;
  window.isFiltered = true;

  // ========================================
  // 1) تحديث الكروت الأساسية
  // ========================================
  const totalCard = document.getElementById('card-total');
  const openCard = document.getElementById('card-open');
  const closedCard = document.getElementById('card-closed');
  const criticalCard = document.getElementById('card-critical');
  const resolutionCard = document.getElementById('card-resolution');

  if (totalCard) totalCard.textContent = item.totalReports || 0;
  if (openCard) openCard.textContent = item.openReports || 0;
  if (closedCard) closedCard.textContent = item.closedReports || 0;
  if (criticalCard) criticalCard.textContent = item.priorityCounts?.red || 0;
  if (resolutionCard) resolutionCard.textContent = `${item.resolutionRate || 0}%`;

  // ========================================
  // 2) تحديث لوحة 937 (Weekly Board)
  // ========================================
  updateWeeklyBoardCards(
    item.totalReports || 0,
    item.openReports || 0,
    item.closedReports || 0,
    item.priorityCounts?.red || 0
  );

  // ========================================
  // 3) إعادة تحميل البيانات المفلترة
  // ========================================
  // إعادة تحميل الأقسام الأعلى للمستشفى المحدد
  await reloadFilteredData(id);

  // تحديث البلاغات الحرجة
  await renderTopRedList();

  // ========================================
  // 4) إخفاء الأقسام غير المرتبطة
  // ========================================
  // إخفاء قسم المستشفيات والمراكز الصحية (الرسوم العامة)
  const healthCharts = document.getElementById('health-facilities-charts');
  if (healthCharts) healthCharts.style.display = 'none';

  // ⭐ لا نخفي أقسام التصنيفات والزائر السري لأنها تعمل مع أو بدون تصفية
  // document.querySelectorAll('#categories-section, #mystery-section').forEach(el => {
  //   if (el) el.style.display = 'none';
  // });

  // إخفاء قوائم الفلترة نفسها
  const filterSection = document.getElementById('facility-filter-section');
  if (filterSection) filterSection.style.display = 'none';

  // ========================================
  // 5) إظهار زر "العودة" أو "عرض الكل"
  // ========================================
  showBackButton();

  // ========================================
  // 6) تحديث العنوان لإظهار اسم المستشفى/المركز
  // ========================================
  updatePageTitle(item.name);

  // ========================================
  // 7) إظهار قسم التصدير
  // ========================================
  showExportSection(id, item.name);

  console.log('✅ تم تطبيق التصفية بنجاح');
}

/**
 * إعادة تحميل البيانات المفلترة للمستشفى/المركز المحدد
 */
async function reloadFilteredData(hospitalId) {
  try {
    console.log('🔄 إعادة تحميل البيانات المفلترة للمستشفى:', hospitalId);

    // 1) تحديث الأقسام الأعلى
    await updateTopDepartmentsChartFiltered(hospitalId);

    // 2) تحديث أنواع البلاغات
    await updateComplaintTypesChartFiltered(hospitalId);

    // 3) تحديث الرسم البياني اليومي
    await updateDailyComplaintsChartFiltered(hospitalId);

    // 4) تحديث البلاغات الحرجة
    await updateCriticalReportsFiltered(hospitalId);

    // 5) تحديث الزائر السري
    if (typeof App.renderMysteryByDepartment === 'function') {
      await App.renderMysteryByDepartment();
    }

    // 6) تحديث الرسوم البيانية الجديدة
    await loadStatusChart();
    await loadCategoriesChart();

    // 7) تحديث جدول تكرار الشكاوى حسب رقم الهوية
    await loadPatientFrequencyTable(1);

    console.log('✅ تم إعادة تحميل جميع البيانات المفلترة');
  } catch (error) {
    console.error('❌ خطأ في إعادة تحميل البيانات المفلترة:', error);
  }
}

/**
 * تحديث الأقسام الأعلى مع فلترة المستشفى
 */
async function updateTopDepartmentsChartFiltered(hospitalId) {
  try {
    const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'http://localhost:3001' : '';

    // تحويل hospitalId إلى رقم للتأكد من المقارنة الصحيحة
    const targetHospitalId = Number(hospitalId);
    const qs = `?hospitalId=${encodeURIComponent(targetHospitalId)}`;
    
    console.log(`🔍 جلب بيانات الأقسام للمستشفى: ${targetHospitalId}`);
    
    const response = await authFetch(`${API_BASE}/api/dashboard/total/departments${qs}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

    const result = await response.json();
    if (result.success && result.data) {
      console.log(`✅ تم جلب ${result.data.length} قسم من API`);
      console.log(`📊 معلومات API:`, {
        total: result.total,
        hospitals: result.hospitals,
        hospitalId: result.hospitalId
      });
      
      // طباعة عينة من البيانات للتأكد من بنيتها
      if (result.data.length > 0) {
        console.log(`📋 عينة من البيانات القادمة من API:`, result.data.slice(0, 2).map(r => ({
          HospitalID: r.HospitalID,
          HospitalName: r.HospitalName,
          DepartmentName: r.DepartmentName
        })));
      }
      
      // استخدام نفس منطق updateDepartmentsChart لكن مع البيانات المفلترة
      await updateDepartmentsChartWithData(result.data, targetHospitalId);
    } else {
      console.warn('⚠️ API لم يرجع بيانات صحيحة:', result);
    }
  } catch (error) {
    console.error('❌ خطأ في تحميل بيانات الأقسام المفلترة:', error);
  }
}

/**
 * تحديث أنواع البلاغات مع فلترة المستشفى
 */
async function updateComplaintTypesChartFiltered(hospitalId) {
  try {
    const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'http://localhost:3001' : '';

    const qs = `?hospitalId=${encodeURIComponent(hospitalId)}`;
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
    console.error('خطأ في تحميل بيانات أنواع البلاغات المفلترة:', error);
  }
}

/**
 * تحديث الرسم البياني اليومي مع فلترة المستشفى
 */
async function updateDailyComplaintsChartFiltered(hospitalId) {
  try {
    const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'http://localhost:3001' : '';

    const qs = `?hospitalId=${encodeURIComponent(hospitalId)}`;
    const response = await authFetch(`${API_BASE}/api/dashboard/total/daily-complaints${qs}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

    const result = await response.json();
    if (result.success && result.data) {
      updateDailyComplaintsChartCanvas(result.data);
    } else {
      updateDailyComplaintsChartCanvas([]);
    }
  } catch (error) {
    console.error('خطأ في تحميل البيانات اليومية المفلترة:', error);
    updateDailyComplaintsChartCanvas([]);
  }
}

/**
 * تحديث البلاغات الحرجة مع فلترة المستشفى
 */
async function updateCriticalReportsFiltered(hospitalId) {
  try {
    const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'http://localhost:3001' : '';

    const qs = `?hospitalId=${encodeURIComponent(hospitalId)}`;
    const response = await authFetch(`${API_BASE}/api/dashboard/total/critical-reports${qs}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

    const result = await response.json();
    if (result.success && result.data && result.data.reports) {
      // تحديث قائمة البلاغات الحرجة
      const container = document.getElementById('red-list');
      const totalSpan = document.getElementById('red-total');
      
      if (container && totalSpan) {
        const reports = result.data.reports.slice(0, 6);
        totalSpan.textContent = result.data.reports.length;
        container.innerHTML = '';

        reports.forEach(r => {
          const card = document.createElement('div');
          card.className = 'bg-red-50 border border-red-100 rounded-xl p-4 hover:bg-red-100 transition cursor-pointer';
          card.innerHTML = `
            <div class="flex items-center justify-between">
              <div>
                <div class="font-bold text-red-800">${r.TicketNumber || r.ticket || 'N/A'}</div>
                <div class="text-xs text-red-700">${r.DepartmentName || r.department || 'غير محدد'}</div>
              </div>
              <div class="text-right">
                <div class="text-xs text-red-800">${r.CreatedAt || r.createdAt || ''}</div>
                <div class="mt-1 text-xs text-gray-600">${r.HospitalName || r.hospital || ''}</div>
              </div>
            </div>
          `;
          
          card.onclick = () => {
            const q = new URLSearchParams({
              ticket: r.TicketNumber || r.ticket,
              ...(r.HospitalID ? { hid: r.HospitalID } : {}),
              ...(r.ComplaintID ? { complaintId: r.ComplaintID } : {})
            });
            window.location.href = `../public/complaints/history/complaint-details.html?${q.toString()}`;
          };
          
          container.appendChild(card);
        });
      }
    }
  } catch (error) {
    console.error('خطأ في تحميل البلاغات الحرجة المفلترة:', error);
  }
}

/**
 * تحديث الأقسام مع البيانات المفلترة
 */
async function updateDepartmentsChartWithData(data, hospitalId) {
  try {
    // نفس منطق updateDepartmentsChart لكن مع البيانات المفلترة
    const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'http://localhost:3001' : '';

    // ========================================
    // 🔍 فلترة البيانات حسب المستشفى المحدد
    // ========================================
    // الحصول على اسم المستشفى من hospitalsData
    const selectedHospital = hospitalsData.find(h => h.id == hospitalId);
    const hospitalName = selectedHospital?.name || null;
    
    // فلترة البيانات حسب HospitalID أو HospitalName
    let filteredData = data;
    if (hospitalId) {
      // تحويل hospitalId إلى عدد للتأكد من المقارنة الصحيحة
      const targetHospitalId = Number(hospitalId);
      
      filteredData = data.filter(row => {
        const rowHospitalId = Number(row.HospitalID ?? row.hospitalId ?? row.hospital_id ?? 0);
        const rowHospitalName = (row.HospitalName ?? row.hospitalName ?? row.hospital ?? '').trim();
        
        // المقارنة حسب ID (الأولوية) أو Name (كبديل)
        if (rowHospitalId && rowHospitalId === targetHospitalId) {
          return true;
        }
        if (hospitalName && rowHospitalName && rowHospitalName === hospitalName.trim()) {
          return true;
        }
        
        return false;
      });
      
      console.log(`🔍 فلترة الأقسام حسب المستشفى: ID=${hospitalId} (${hospitalName || 'غير معروف'})`);
      console.log(`📊 عدد الصفوف قبل الفلترة: ${data.length}, بعد الفلترة: ${filteredData.length}`);
      
      // طباعة عينة من البيانات المفلترة للتأكد
      if (filteredData.length > 0) {
        console.log(`✅ عينة من البيانات المفلترة:`, filteredData.slice(0, 3).map(r => ({
          HospitalID: r.HospitalID,
          HospitalName: r.HospitalName,
          DepartmentName: r.DepartmentName
        })));
      }
    }

    // إذا لم توجد بيانات بعد الفلترة
    if (!filteredData || filteredData.length === 0) {
      const container = document.getElementById("hospitals-depts-container");
      if (container) {
        container.innerHTML = `
          <div class="text-center text-gray-500 p-6 bg-white rounded-xl border border-gray-100">
            <p class="text-lg mb-2">لا توجد بيانات للعيادات الخاصة بهذا المستشفى.</p>
            <p class="text-sm text-gray-400">${hospitalName || 'المستشفى المحدد'}</p>
          </div>
        `;
      }
      return;
    }

    // جلب البلاغات الحرجة للمستشفى المحدد
    const critRes = await authFetch(`${API_BASE}/api/dashboard/total/critical-reports?hospitalId=${encodeURIComponent(hospitalId)}`);
    let criticalPairs = new Set();
    let criticalMap = new Map();

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

    const REPEAT_THRESHOLD = 3;
    const grouped = {};
    
    // استخدام البيانات المفلترة
    // تأكيد: عند التصفية، يجب أن يكون هناك مستشفى واحد فقط
    if (hospitalId && filteredData.length > 0) {
      // التحقق من أن جميع البيانات تنتمي لنفس المستشفى
      const uniqueHospitals = new Set(filteredData.map(r => {
        const id = r.HospitalID ?? r.hospitalId ?? r.hospital_id;
        const name = r.HospitalName ?? r.hospitalName ?? r.hospital;
        return `${id}|${name}`;
      }));
      
      if (uniqueHospitals.size > 1) {
        console.warn(`⚠️ تحذير: البيانات المفلترة تحتوي على ${uniqueHospitals.size} مستشفى مختلف!`);
        console.warn('المستشفيات المكتشفة:', Array.from(uniqueHospitals));
        // فلترة إضافية حسب hospitalId المحدد
        const targetId = Number(hospitalId);
        filteredData = filteredData.filter(r => {
          const id = Number(r.HospitalID ?? r.hospitalId ?? r.hospital_id ?? 0);
          return id === targetId;
        });
        console.log(`✅ بعد الفلترة الإضافية: ${filteredData.length} صف`);
      }
    }
    
    // ⚠️ تحذير: التحقق من أن filteredData تحتوي فقط على المستشفى المحدد
    if (hospitalId) {
      const targetHospitalId = Number(hospitalId);
      const hospitalsInFilteredData = new Set(filteredData.map(r => {
        const id = Number(r.HospitalID ?? r.hospitalId ?? r.hospital_id ?? 0);
        const name = r.HospitalName ?? r.hospitalName ?? r.hospital;
        return { id, name };
      }));
      
      const uniqueHospitalIds = new Set(Array.from(hospitalsInFilteredData).map(h => h.id));
      if (uniqueHospitalIds.size > 1) {
        console.error(`❌ خطأ: البيانات المفلترة تحتوي على ${uniqueHospitalIds.size} مستشفى مختلف!`);
        console.error('المستشفيات في filteredData:', Array.from(hospitalsInFilteredData));
        console.error('المستشفى المطلوب:', targetHospitalId);
        
        // فلترة إضافية قوية
        filteredData = filteredData.filter(r => {
          const id = Number(r.HospitalID ?? r.hospitalId ?? r.hospital_id ?? 0);
          return id === targetHospitalId;
        });
        console.log(`✅ بعد الفلترة الإضافية القوية: ${filteredData.length} صف`);
      } else {
        console.log(`✅ البيانات المفلترة تحتوي على مستشفى واحد فقط: ${Array.from(uniqueHospitalIds)[0]}`);
      }
    }
    
    filteredData.forEach(row => {
      const hosp = row.HospitalName || "مستشفى غير محدد";
      const dept = row.DepartmentName || "عيادة غير محددة";

      if (!grouped[hosp]) grouped[hosp] = {};
      if (!grouped[hosp][dept]) {
        grouped[hosp][dept] = { name: dept, count: 0, hasHigh: false, mediumCount: 0 };
      }

      const total = Number(row.TotalCount ?? row.total ?? row.Count ?? row.count ?? 
                           row.ReportsCount ?? row.ComplaintsCount ?? 1);
      grouped[hosp][dept].count += total;

      if (isHighOrCritical(row)) {
        grouped[hosp][dept].hasHigh = true;
      }

      const aggUrgent = Number(row.UrgentCount ?? row.urgentCount ?? row.CriticalCount ?? row.RedCount ?? 0);
      if (aggUrgent > 0) grouped[hosp][dept].hasHigh = true;

      if (criticalPairs.has(`${hosp}|||${dept}`)) {
        grouped[hosp][dept].hasHigh = true;
      }

      const aggMedium = Number(row.MediumCount ?? row.mediumCount ?? 
                               row.ByPriority?.MEDIUM ?? row.byPriority?.MEDIUM ?? 0);
      if (aggMedium > 0) grouped[hosp][dept].mediumCount += aggMedium;
      else if (isMedium(row)) grouped[hosp][dept].mediumCount += total;
    });

    // ========================================
    // 📝 تحديث عنوان القسم لإظهار اسم المستشفى المحدد
    // ========================================
    if (hospitalId && hospitalName) {
      // البحث عن العنوان - قد يكون داخل div أو مباشرًا
      const container = document.getElementById("hospitals-depts-container");
      if (container) {
        const parent = container.parentElement;
        const titleElement = parent?.querySelector('h3');
        if (titleElement) {
          // حفظ العنوان الأصلي إذا لم يكن محفوظًا مسبقًا
          if (!titleElement.dataset.originalTitle) {
            titleElement.dataset.originalTitle = titleElement.textContent || 'أعلى العيادات حسب المستشفى';
          }
          // تحديث العنوان ليعرض اسم المستشفى المحدد
          titleElement.textContent = `أعلى العيادات – ${hospitalName}`;
          console.log(`✅ تم تحديث عنوان القسم: أعلى العيادات – ${hospitalName}`);
        }
      }
    }

    const container = document.getElementById("hospitals-depts-container");
    if (!container) return;
    
    container.innerHTML = "";
    
    // ملء قائمة المستشفيات في القائمة المنسدلة
    populateWeeklyHospitalFilter();

    // عند الفلترة، يجب أن يكون هناك مستشفى واحد فقط
    // فلترة إضافية قوية للتأكد من أن grouped يحتوي فقط على المستشفى المحدد
    if (hospitalId) {
      const targetHospitalId = Number(hospitalId);
      
      // البحث عن المستشفى المطابق في grouped حسب ID أو Name
      let matchingHospitalName = null;
      
      // أولاً: البحث حسب الاسم من hospitalsData
      if (hospitalName) {
        matchingHospitalName = Object.keys(grouped).find(hospName => {
          return hospName.trim() === hospitalName.trim();
        });
      }
      
      // ثانياً: إذا لم نجد بالاسم، نبحث في البيانات المفلترة عن HospitalID
      if (!matchingHospitalName && filteredData.length > 0) {
        // البحث عن HospitalID في البيانات المفلترة
        const matchingRow = filteredData.find(r => {
          const id = Number(r.HospitalID ?? r.hospitalId ?? r.hospital_id ?? 0);
          return id === targetHospitalId;
        });
        
        if (matchingRow) {
          const matchingName = matchingRow.HospitalName ?? matchingRow.hospitalName ?? matchingRow.hospital;
          matchingHospitalName = Object.keys(grouped).find(hospName => {
            return hospName.trim() === matchingName?.trim();
          });
        }
      }
      
      // ثالثاً: إذا لم نجد، نستخدم أول مستشفى في grouped (يجب أن يكون واحد فقط بعد الفلترة)
      if (!matchingHospitalName && Object.keys(grouped).length > 0) {
        // التحقق من أن جميع المستشفيات في grouped تنتمي لنفس HospitalID
        const hospitalsInGrouped = Object.keys(grouped);
        const hospitalIdsInGrouped = new Set();
        
        filteredData.forEach(r => {
          const hospName = r.HospitalName || "مستشفى غير محدد";
          if (hospitalsInGrouped.includes(hospName)) {
            const id = Number(r.HospitalID ?? r.hospitalId ?? r.hospital_id ?? 0);
            if (id === targetHospitalId) {
              hospitalIdsInGrouped.add(hospName);
            }
          }
        });
        
        if (hospitalIdsInGrouped.size > 0) {
          matchingHospitalName = Array.from(hospitalIdsInGrouped)[0];
        } else {
          // إذا لم نجد أي مستشفى يطابق، نستخدم أول مستشفى
          matchingHospitalName = hospitalsInGrouped[0];
          console.warn(`⚠️ لم يتم العثور على مستشفى مطابق لـ ID=${targetHospitalId}, سيتم استخدام: ${matchingHospitalName}`);
        }
      }
      
      // مسح grouped وإعادة تعبئته بالمستشفى المطابق فقط
      if (matchingHospitalName) {
        const matchingData = grouped[matchingHospitalName];
        // مسح جميع المستشفيات الأخرى
        Object.keys(grouped).forEach(key => {
          if (key !== matchingHospitalName) {
            delete grouped[key];
          }
        });
        console.log(`✅ تم التأكد من أن grouped يحتوي فقط على: ${matchingHospitalName} (ID: ${targetHospitalId})`);
      } else {
        console.error(`❌ خطأ: لم يتم العثور على مستشفى مطابق لـ ID=${targetHospitalId}`);
        // في حالة الخطأ، نمسح كل شيء ونعرض رسالة
        Object.keys(grouped).forEach(key => delete grouped[key]);
      }
    }

    const hospitalsList = Object.entries(grouped);
    if (hospitalsList.length === 0) {
      container.innerHTML = `
        <div class="text-center text-gray-500 p-6 bg-white rounded-xl border border-gray-100 col-span-full">
          <p class="text-lg mb-2">لا توجد بيانات للعيادات الخاصة بهذا المستشفى.</p>
          <p class="text-sm text-gray-400">${hospitalName || 'المستشفى المحدد'}</p>
        </div>
      `;
      return;
    }

    // التأكد من أن هناك مستشفى واحد فقط عند التصفية
    if (hospitalId && hospitalsList.length > 1) {
      console.error(`❌ خطأ: لا تزال هناك ${hospitalsList.length} مستشفى في grouped بعد الفلترة!`);
      console.error('المستشفيات:', hospitalsList.map(([name]) => name));
      console.error('المستشفى المطلوب:', hospitalId, hospitalName);
      
      // فلترة نهائية قوية: استخدام فقط المستشفى المطابق
      const targetHospitalId = Number(hospitalId);
      const finalFilteredGrouped = {};
      
      // البحث عن المستشفى المطابق في filteredData
      const matchingRow = filteredData.find(r => {
        const id = Number(r.HospitalID ?? r.hospitalId ?? r.hospital_id ?? 0);
        return id === targetHospitalId;
      });
      
      if (matchingRow) {
        const matchingHospitalName = matchingRow.HospitalName ?? matchingRow.hospitalName ?? matchingRow.hospital;
        if (grouped[matchingHospitalName]) {
          finalFilteredGrouped[matchingHospitalName] = grouped[matchingHospitalName];
          console.log(`✅ تم تطبيق فلترة نهائية: ${matchingHospitalName}`);
        }
      }
      
      // استبدال grouped بالنسخة المفلترة
      Object.keys(grouped).forEach(key => delete grouped[key]);
      Object.assign(grouped, finalFilteredGrouped);
    }

    console.log(`📋 عدد المستشفيات المعروضة: ${Object.keys(grouped).length}`);
    if (hospitalId) {
      console.log(`🎯 المستشفى المحدد: ${hospitalName || 'غير معروف'} (ID: ${hospitalId})`);
      console.log(`📊 المستشفيات في grouped:`, Object.keys(grouped));
    }
    
    // تحديد إذا كان هناك مستشفى واحد فقط (عند التصفية)
    const isSingleHospital = hospitalId && Object.keys(grouped).length === 1;
    
    // تعديل grid layout عند وجود مستشفى واحد فقط
    if (isSingleHospital) {
      container.className = "grid grid-cols-1 gap-6";
    } else {
      container.className = "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6";
    }
    
    Object.entries(grouped).forEach(([hospital, deptMap]) => {
      const deptsArr = Object.values(deptMap);
      const sorted = [...deptsArr].sort((a,b)=> b.count - a.count).slice(0, 5);
      const safeId = hospital.replace(/[^a-zA-Z0-9\-ا-ي]+/g, '-');

      // ارتفاع أكبر للرسم عند وجود مستشفى واحد فقط
      const chartHeight = isSingleHospital ? '500px' : '220px';

      const card = document.createElement("div");
      card.className = "bg-white border border-gray-100 shadow-sm rounded-xl p-5";
      card.innerHTML = `
        <h4 class="font-bold text-lg mb-3 text-blue-900">${hospital}</h4>
        <div class="mb-4" style="height:${chartHeight}"><canvas id="depts-chart-${safeId}"></canvas></div>
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
               onclick="window.location.href='improvements/improvement_937.html?hospital=${encodeURIComponent(hospital)}&department=${encodeURIComponent(dept.name)}'">
               🚀 مشروع تحسيني
             </button>`
          : '-';

        const key = `${hospital}|||${dept.name}`;
        const crit = criticalMap.get(key);

        const makeDetailsHref = (obj) => {
          const q = new URLSearchParams({
            ticket: obj.ticket,
            ...(obj.hospitalId ? { hid: obj.hospitalId } : {}),
            ...(obj.complaintId ? { complaintId: obj.complaintId } : {})
          });
          return `../public/complaints/history/complaint-details.html?${q.toString()}`;
        };

        const deptCell = `<a class="underline ${isRed ? 'text-red-700 hover:text-red-900' : 'text-blue-700 hover:text-blue-900'} cursor-pointer"
               href="javascript:void(0)"
               onclick="openDepartmentComplaintsModal('${hospital.replace(/'/g,"\\'")}','${dept.name.replace(/'/g,"\\'")}')">${dept.name}</a>`;

        tbody.insertAdjacentHTML('beforeend', `
          <tr class="${rowClass}">
            <td class="py-2 px-4 border">${deptCell}</td>
            <td class="py-2 px-4 border">${dept.count}</td>
            <td class="py-2 px-4 border">${status}</td>
            <td class="py-2 px-4 border">${improve}</td>
          </tr>
        `);
      });

      createMiniDeptsChart(`depts-chart-${safeId}`, sorted, hospital, criticalMap);
    });
  } catch (err) {
    console.error("خطأ في تحديث الأقسام المفلترة:", err);
  }
}

/**
 * إظهار زر "العودة" أو "عرض الكل"
 */
function showBackButton() {
  // إزالة أي زر عودة موجود مسبقاً
  const existingBtn = document.getElementById('filter-back-btn');
  if (existingBtn) existingBtn.remove();

  // إنشاء زر جديد
  const backBtn = document.createElement('button');
  backBtn.id = 'filter-back-btn';
  backBtn.className = 'fixed top-20 left-4 z-50 px-6 py-3 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-all flex items-center gap-2';
  backBtn.innerHTML = `
    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
    </svg>
    <span>عرض الكل</span>
  `;
  backBtn.onclick = () => {
    // إزالة التصفية وإعادة تحميل الصفحة
    window.filteredHospitalId = null;
    window.isFiltered = false;
    hideExportSection(); // إخفاء قسم التصدير
    window.location.href = 'dashboard.html';
  };

  document.body.appendChild(backBtn);
}

/**
 * تحديث عنوان الصفحة لإظهار اسم المستشفى/المركز
 */
function updatePageTitle(facilityName) {
  // تحديث العنوان في الصفحة
  const titleElement = document.querySelector('h1, .page-title, #page-title');
  if (titleElement) {
    const originalTitle = titleElement.dataset.originalTitle || titleElement.textContent;
    titleElement.dataset.originalTitle = originalTitle;
    titleElement.textContent = `${originalTitle} - ${facilityName}`;
  }

  // تحديث عنوان المتصفح
  document.title = `لوحة التحكم - ${facilityName}`;
}

/**
 * إظهار قسم التصدير عند تحديد مستشفى
 */
function showExportSection(hospitalId, hospitalName) {
  const exportSection = document.getElementById('hospital-export-section');
  const exportTitle = document.getElementById('hospital-export-title');
  
  if (!hospitalId || !hospitalName) {
    // لا تظهر القسم إذا لم يكن هناك مستشفى محدد
    hideExportSection();
    return;
  }
  
  if (exportSection) {
    exportSection.classList.remove('hidden');
    exportSection.style.display = 'block'; // تأكد من إظهاره
    if (exportTitle) {
      exportTitle.textContent = `تقرير: ${hospitalName}`;
    }
    
    // ربط الأزرار
    const excelBtn = document.getElementById('export-excel-btn');
    const pdfBtn = document.getElementById('export-pdf-btn');
    
    if (excelBtn) {
      excelBtn.onclick = () => exportHospitalReport(hospitalId, hospitalName, 'excel');
    }
    
    if (pdfBtn) {
      pdfBtn.onclick = () => exportHospitalReport(hospitalId, hospitalName, 'pdf');
    }
  }
}

/**
 * إخفاء قسم التصدير
 */
function hideExportSection() {
  const exportSection = document.getElementById('hospital-export-section');
  if (exportSection) {
    exportSection.classList.add('hidden');
    exportSection.style.display = 'none'; // تأكد من إخفائه
  }
}

/**
 * تحديث قوائم الفلترة لإظهار المحدد وإضافة زر "عرض الكل"
 */
function updateFilterLists() {
  const urlParams = new URLSearchParams(window.location.search);
  const hospitalId = urlParams.get('hospitalId');
  const centerId = urlParams.get('centerId');

  // تحديث قائمة المستشفيات
  const hospitalList = document.getElementById('hospital-filter-list');
  if (hospitalList) {
    // إضافة زر "عرض الكل" إذا كان هناك فلترة
    const existingAllBtn = hospitalList.querySelector('.show-all-btn');
    if ((hospitalId || centerId) && !existingAllBtn) {
      const allBtn = document.createElement('button');
      allBtn.className = 'show-all-btn px-4 py-2 rounded-full border text-sm font-medium hover:bg-gray-100 transition';
      allBtn.style.borderColor = '#6B7280';
      allBtn.style.color = '#6B7280';
      allBtn.textContent = 'عرض الكل';
      allBtn.onclick = () => {
        window.location.href = 'dashboard.html';
      };
      hospitalList.insertBefore(allBtn, hospitalList.firstChild);
    }

    // تحديث زر المستشفى المحدد
    if (hospitalId) {
      hospitalList.querySelectorAll('button').forEach(btn => {
        if (btn.textContent !== 'عرض الكل' && btn.dataset.hospitalId == hospitalId) {
          btn.style.backgroundColor = '#004A9F';
          btn.style.color = '#fff';
        } else if (btn.textContent !== 'عرض الكل') {
          btn.style.backgroundColor = '';
          btn.style.color = '#004A9F';
        }
      });
    }
  }

  // تحديث قائمة المراكز الصحية
  const centerList = document.getElementById('center-filter-list');
  if (centerList) {
    // إضافة زر "عرض الكل" إذا كان هناك فلترة
    const existingAllBtn = centerList.querySelector('.show-all-btn');
    if ((hospitalId || centerId) && !existingAllBtn) {
      const allBtn = document.createElement('button');
      allBtn.className = 'show-all-btn px-4 py-2 rounded-full border text-sm font-medium hover:bg-gray-100 transition';
      allBtn.style.borderColor = '#6B7280';
      allBtn.style.color = '#6B7280';
      allBtn.textContent = 'عرض الكل';
      allBtn.onclick = () => {
        window.location.href = 'dashboard.html';
      };
      centerList.insertBefore(allBtn, centerList.firstChild);
    }

    // تحديث زر المركز المحدد
    if (centerId) {
      centerList.querySelectorAll('button').forEach(btn => {
        if (btn.textContent !== 'عرض الكل' && btn.dataset.centerId == centerId) {
          btn.style.backgroundColor = '#0FA47A';
          btn.style.color = '#fff';
        } else if (btn.textContent !== 'عرض الكل') {
          btn.style.backgroundColor = '';
          btn.style.color = '#0FA47A';
        }
      });
    }
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
  
  // تحديث قسم "أعلى العيادات" (فقط إذا لم تكن هناك تصفية نشطة)
  // ⭐ إذا كان هناك تصفية، لا نستدعي updateTopDepartmentsChart() لأنها ستعيد تحميل كل المستشفيات
  if (!window.filteredHospitalId) {
    updateTopDepartmentsChart();
  } else {
    console.log(`⛔ تم منع استدعاء updateTopDepartmentsChart() في updateMainStatsCards() - تصفية نشطة للمستشفى ${window.filteredHospitalId}`);
  }
  
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
  // ⭐ إذا كان هناك تصفية نشطة، استخدم الدالة المخصصة للتصفية
  const filteredId = window.filteredHospitalId;
  if (filteredId) {
    console.log(`✅ تصفية نشطة - استخدام updateTopDepartmentsChartFiltered للمستشفى ${filteredId}`);
    await updateTopDepartmentsChartFiltered(filteredId);
    return;
  }

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
      // بدون تصفية، استخدم الدالة العادية
      if (false) { // تم نقل منطق التصفية للأعلى
        await updateDepartmentsChartWithData(result.data, filteredId);
      } else {
        const departmentCounts = {};
        result.data.forEach(dept => {
          const inc = Number(dept.TotalCount ?? dept.Count ?? dept.count ?? 1);
          departmentCounts[dept.DepartmentName] = (departmentCounts[dept.DepartmentName] || 0) + inc;
        });
        const sortedDepartments = Object.entries(departmentCounts)
          .map(([name, count]) => ({ name, count }))
          .sort((a,b) => b.count - a.count)
          .slice(0, 10);
        updateDepartmentsChart(sortedDepartments);
      }
    }
  } catch (error) {
    console.error('خطأ في تحميل بيانات الأقسام:', error);
  }
}

/**
 * تحديث قسم "أعلى العيادات" مقسم حسب المستشفى
 */
async function updateDepartmentsChart() {
  // ⭐ لو فيه تصفية لا تشتغل هذه الدالة أبداً (منع الكتابة فوق التصفية)
  // إلا إذا كانت التصفية من القائمة المنسدلة للأسبوع
  if (window.filteredHospitalId && !document.getElementById('weekly-hospital-filter')?.value) {
    console.log(`⛔ منع updateDepartmentsChart() من التشغيل - تصفية نشطة للمستشفى ${window.filteredHospitalId}`);
    return;
  }
  
  // ملء القائمة المنسدلة عند أول تحميل
  populateWeeklyHospitalFilter();

  try {
    const API_BASE =
      location.hostname === "localhost" || location.hostname === "127.0.0.1"
        ? "http://localhost:3001"
        : "";

    if (!currentUser) await loadCurrentUser();
    
    // تحديد المعاملات حسب التصفية النشطة أو دور المستخدم
    let qs = "";
    const filteredId = window.filteredHospitalId;
    
    if (filteredId) {
      // إذا كان هناك تصفية نشطة، استخدم hospitalId المفلتر
      qs = `?hospitalId=${encodeURIComponent(filteredId)}`;
      console.log(`🔍 التصفية النشطة - جلب الأقسام من مستشفى ${filteredId} فقط`);
    } else if (!isClusterManager && userHospitalId) {
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

    // ========================================
    // 📝 إعادة العنوان الأصلي للقسم (عند عدم وجود فلترة)
    // ========================================
    const titleElement = document.querySelector('#hospitals-depts-container')?.previousElementSibling;
    if (titleElement && titleElement.tagName === 'H3') {
      // حفظ العنوان الأصلي إذا لم يكن محفوظًا مسبقًا
      if (!titleElement.dataset.originalTitle) {
        titleElement.dataset.originalTitle = titleElement.textContent || 'أعلى العيادات حسب المستشفى';
      }
      // إعادة العنوان الأصلي
      titleElement.textContent = titleElement.dataset.originalTitle;
    }

    const container = document.getElementById("hospitals-depts-container");
    container.innerHTML = "";

    // تحديد إذا كان هناك مستشفى واحد فقط (عند التصفية)
    const isSingleHospital = window.filteredHospitalId && Object.keys(grouped).length === 1;
    
    // تعديل grid layout عند وجود مستشفى واحد فقط
    if (isSingleHospital) {
      container.className = "grid grid-cols-1 gap-6";
    } else {
      container.className = "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6";
    }

    // 🎨 إنشاء كرت لكل مستشفى
    Object.entries(grouped).forEach(([hospital, deptMap]) => {
      const deptsArr = Object.values(deptMap);     // ← مصفوفة الأقسام
      const sorted   = [...deptsArr].sort((a,b)=> b.count - a.count).slice(0, 5);
      const safeId   = hospital.replace(/[^a-zA-Z0-9\-ا-ي]+/g, '-');

      // ارتفاع أكبر للرسم عند وجود مستشفى واحد فقط
      const chartHeight = isSingleHospital ? '500px' : '220px';

      const card = document.createElement("div");
      card.className = "bg-white border border-gray-100 shadow-sm rounded-xl p-5";
      card.innerHTML = `
        <h4 class="font-bold text-lg mb-3 text-blue-900">${hospital}</h4>
        <div class="mb-4" style="height:${chartHeight}"><canvas id="depts-chart-${safeId}"></canvas></div>
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
               onclick="window.location.href='improvements/improvement_937.html?hospital=${encodeURIComponent(hospital)}&department=${encodeURIComponent(dept.name)}'">
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

        const deptCell = `<a class="underline ${isRed ? 'text-red-700 hover:text-red-900' : 'text-blue-700 hover:text-blue-900'} cursor-pointer"
               href="javascript:void(0)"
               onclick="openDepartmentComplaintsModal('${hospital.replace(/'/g,"\\'")}','${dept.name.replace(/'/g,"\\'")}')">${dept.name}</a>`;

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
 * ملء قائمة المستشفيات في القائمة المنسدلة للأسبوع
 */
function populateWeeklyHospitalFilter() {
  const select = document.getElementById('weekly-hospital-filter');
  if (!select) return;
  
  // إذا لم تكن البيانات محملة بعد، انتظر قليلاً
  if (!hospitalsData || hospitalsData.length === 0) {
    // إعادة المحاولة بعد 500ms
    setTimeout(() => populateWeeklyHospitalFilter(), 500);
    return;
  }
  
  // حفظ القيمة المحددة حالياً
  const currentValue = select.value;
  
  // مسح الخيارات القديمة (ما عدا "جميع المستشفيات")
  select.innerHTML = '<option value="">جميع المستشفيات</option>';
  
  // إضافة المستشفيات
  hospitalsData.forEach(hospital => {
    const option = document.createElement('option');
    option.value = hospital.id;
    option.textContent = hospital.name;
    select.appendChild(option);
  });
  
  // استعادة القيمة المحددة
  if (currentValue) {
    select.value = currentValue;
  }
  
  // إزالة event listeners القديمة وإضافة واحدة جديدة
  const newSelect = select.cloneNode(true);
  select.parentNode.replaceChild(newSelect, select);
  
  // إضافة event listener للتصفية
  newSelect.addEventListener('change', async (e) => {
    const selectedHospitalId = e.target.value;
    if (selectedHospitalId) {
      // تعيين التصفية النشطة
      window.filteredHospitalId = selectedHospitalId;
      // تصفية البيانات حسب المستشفى المحدد
      await filterWeeklyBoardByHospital(selectedHospitalId);
      // إعادة تحميل جدول تكرار الشكاوى
      await loadPatientFrequencyTable(1);
    } else {
      // إزالة التصفية النشطة
      window.filteredHospitalId = null;
      // عرض جميع المستشفيات
      await updateDepartmentsChart();
      // إعادة تحميل جدول تكرار الشكاوى بدون تصفية
      await loadPatientFrequencyTable(1);
    }
  });
}

/**
 * تصفية لوحة الأسبوع حسب المستشفى المحدد
 */
async function filterWeeklyBoardByHospital(hospitalId) {
  try {
    // تعيين التصفية النشطة
    window.filteredHospitalId = hospitalId;
    
    const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'http://localhost:3001' : '';
    
    const qs = `?hospitalId=${encodeURIComponent(hospitalId)}`;
    const response = await authFetch(`${API_BASE}/api/dashboard/total/departments${qs}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    
    const result = await response.json();
    if (!result.success || !result.data) return;
    
    // استخدام نفس الدالة لكن مع البيانات المفلترة
    await updateDepartmentsChartWithData(result.data, hospitalId);
  } catch (error) {
    console.error('❌ خطأ في تصفية لوحة الأسبوع:', error);
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
        x: { beginAtZero: true, grid: { display: false }, ticks: { color: '#475569' } },
        y: { grid: { display: false }, ticks: { color: '#475569', font: { family: 'Tajawal' } } }
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
    
    // تحديد المعاملات حسب دور المستخدم أو التصفية النشطة
    let qs = "";
    const filteredId = window.filteredHospitalId;
    
    if (filteredId) {
      // إذا كان هناك تصفية نشطة، استخدم hospitalId المفلتر
      qs = `?hospitalId=${encodeURIComponent(filteredId)}`;
      console.log(`🔍 التصفية النشطة - جلب أنواع البلاغات من مستشفى ${filteredId} فقط`);
    } else if (!isClusterManager && userHospitalId) {
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
          color: '#000',
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
            color: '#333',
            font: { size: 13 }
          }
        },
        y: {
          beginAtZero: true,
          grid: { display: false },
          ticks: {
            color: '#333',
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
    
    // تحديد المعاملات حسب التصفية النشطة أو دور المستخدم
    let qs = "";
    const filteredId = window.filteredHospitalId;
    
    if (filteredId) {
      // إذا كان هناك تصفية نشطة، استخدم hospitalId المفلتر
      qs = `?hospitalId=${encodeURIComponent(filteredId)}`;
      console.log(`🔍 التصفية النشطة - جلب البيانات اليومية من مستشفى ${filteredId}`);
    } else if (userHospitalId) {
      // موظف عادي: فقط مستشفاه
      qs = `?hospitalId=${encodeURIComponent(userHospitalId)}`;
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
            color: '#6B7280',
            font: {
              size: 12
            }
          }
        },
        y: {
          beginAtZero: true,
          suggestedMax: yMax,
          grid: {
            color: 'rgba(107, 114, 128, 0.1)'
          },
          ticks: {
            color: '#6B7280',
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
async function renderTopRedList() {
  const container = document.getElementById('red-list');
  const totalSpan = document.getElementById('red-total');
  if (!container || !totalSpan) return;

  // إذا كان هناك تصفية نشطة، استخدم API مباشرة
  const filteredId = window.filteredHospitalId;
  if (filteredId) {
    await updateCriticalReportsFiltered(filteredId);
    return;
  }

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
    // ⭐⭐ أولاً: قراءة التصفية من URL قبل أي شيء (مهم جداً!)
    const urlParams = new URLSearchParams(window.location.search);
    const hospitalId = urlParams.get('hospitalId');
    const centerId = urlParams.get('centerId');

    // ⭐ إذا كان فيه hospitalId في الرابط خلي النظام يتعرف عليه للتصفية
    if (hospitalId) {
      window.filteredHospitalId = Number(hospitalId);
      window.isFiltered = true;
      console.log(`✅ تم تعيين window.filteredHospitalId = ${window.filteredHospitalId} من URL (قبل تحميل البيانات)`);
    }
    
    if (centerId) {
      window.filteredHospitalId = Number(centerId);
      window.isFiltered = true;
      console.log(`✅ تم تعيين window.filteredHospitalId = ${window.filteredHospitalId} من URL (مركز صحي) - قبل تحميل البيانات`);
    }

    // 0) إخفاء قسم التصدير افتراضياً (قبل أي شيء)
    hideExportSection();

    // 1) هوية المستخدم ودوره
    await loadCurrentUser();

    // 2) تطبيق صلاحيات لوحة التحكم
    await applyDashboardPermissions();

    // 3) بيانات المستشفيات (ستتقيّد بالدور تلقائياً) - الآن بعد تعيين filteredHospitalId
    await loadHospitalsData();

    // تطبيق الفلترة تلقائياً إذا كان هناك معرّف في URL
    if (hospitalId || centerId) {
      const filterId = hospitalId || centerId;
      await filterDashboardByFacility(hospitalId ? 'hospital' : 'center', filterId);
      // عند التصفية، لا نحتاج لتحميل باقي الأقسام العامة
      return;
    }

    // إذا لم تكن هناك تصفية، نكمل التحميل العادي
    // إخفاء مخطط المستشفيات إذا المستخدم ليس مدير تجمع
    if (!isClusterManager) {
      const hf = document.getElementById('health-facilities-charts');
      if (hf) hf.style.display = 'none';
    }

    // إخفاء قسم التصدير إذا لم تكن هناك تصفية
    if (!hospitalId && !centerId) {
      hideExportSection();
    }

    // توليد قوائم الفلترة (المستشفيات والمراكز الصحية)
    generateHospitalFilterList();
    generateCenterFilterList();

    // 🔹 تحميل قائمة المستشفيات لمدير التجمع
    await App.loadHospitalsSelectForMystery();
    
    // 🔹 استدعاء رسم الزائر السري
    App.renderMysteryByDepartment();

    // 🔹 تحميل الرسوم البيانية الجديدة (تعمل مع أو بدون تصفية)
    await loadStatusChart();
    await loadCategoriesChart();
    
    // 🔹 تحميل جدول تكرار الشكاوى حسب رقم الهوية
    await loadPatientFrequencyTable(1);
    
    // 🔹 تحديث تاريخ الأسبوع الحالي
    updateWeeklyPeriod();

    // 3) باقي الأقسام (فقط إذا لم تكن هناك تصفية)
    if (!hospitalId && !centerId) {
      renderTopRedList();
      initializeEventHandlers();
      updateLastUpdateTime();
    }

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
  const cGrayTxt = '#475569';

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
        console.log('بيانات جميع المرافق من قاعدة البيانات:', apiData);
        
        // 🎯 فلترة فقط المستشفيات (FacilityType = 'hospital')
        const hospitalsOnly = apiData.filter(
          h => (h.FacilityType || '').toLowerCase() === 'hospital'
        );
        
        console.log('🎯 بيانات المستشفيات فقط:', hospitalsOnly);
        
        // فلترة البيانات إذا لم يكن مدير تجمع
        const hospitalsData = (!isClusterManager && userHospitalId)
          ? hospitalsOnly.filter(h => (h.HospitalID === userHospitalId || h.HospitalId === userHospitalId))
          : hospitalsOnly;
        
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
                  color: '#374151'
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

  // ===============================
  //   Health Centers Chart
  // ===============================
  const centersCtx = document.getElementById('centers-chart');
  if (centersCtx) {
    // جلب البيانات الحقيقية من API
    const API_BASE = location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? 'http://localhost:3001' : '';
    
    // تحميل المستخدم أولاً إذا لم يكن محملاً
    loadCurrentUser().then(() => {
      const qs = (!isClusterManager && userHospitalId) ? `?hospitalId=${encodeURIComponent(userHospitalId)}` : '';
      return authFetch(`${API_BASE}/api/dashboard/total/by-hospital${qs}`);
    })
    .then(response => response.json())
    .then(apiData => {
      console.log('بيانات جميع المرافق من قاعدة البيانات:', apiData);
      
      // 🎯 فلترة فقط المراكز الصحية (FacilityType = 'center')
      const centersOnly = apiData.filter(
          x => (x.FacilityType || '').toLowerCase() === 'center'
      );
      
      console.log('🎯 بيانات المراكز الصحية فقط:', centersOnly);
      
      // فلترة البيانات إذا لم يكن مدير تجمع
      const centersData = (!isClusterManager && userHospitalId)
        ? centersOnly.filter(h => (h.HospitalID === userHospitalId || h.HospitalId === userHospitalId))
        : centersOnly;
      
      console.log('بيانات المراكز الصحية بعد الفلترة:', centersData);
      
      // تحضير البيانات للرسم البياني
      const labels = centersData.map(c => c.HospitalName || c.NameAr || 'غير محدد');
      const data = centersData.map(c => Number(c.counts?.total ?? 0));
      
      console.log('تسميات المراكز الصحية:', labels);
      console.log('بيانات البلاغات للمراكز:', data);

      // البحث عن جميع الرسوم البيانية الموجودة على هذا Canvas وتدميرها
      Chart.helpers.each(Chart.instances, function(instance) {
        if (instance.canvas.id === 'centers-chart') {
          instance.destroy();
        }
      });

      // التحقق من وجود بيانات
      if (!labels.length || data.every(val => val === 0)) {
        console.warn('لا توجد بيانات للمراكز الصحية أو جميع القيم صفر');
        centersCtx.parentElement.innerHTML = `
          <div class="text-center py-8">
            <div class="text-gray-600 text-lg mb-2">📊 لا توجد بيانات للمراكز الصحية</div>
            <div class="text-gray-500">لم يتم العثور على بلاغات للمراكز الصحية</div>
          </div>
        `;
        return;
      }

      // ألوان مختلفة لكل مركز صحي
      const colors = [
        '#3B82F6', '#0FA47A', '#F59E0B', '#8B5CF6', '#06B6D4', '#DC2626',
        '#14B8A6', '#6366F1', '#F97316', '#0EA5E9'
      ].slice(0, labels.length);

      console.log('إنشاء الرسم الدائري للمراكز الصحية:', { labels, data, colors });

      // إنشاء الرسم الدائري
      new Chart(centersCtx.getContext('2d'), {
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
                color: '#374151'
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
      console.error('❌ خطأ في تحميل بيانات المراكز الصحية:', error);
      console.error('تفاصيل الخطأ:', {
        message: error.message,
        status: error.status
      });
      
      // في حالة الخطأ، اعرض رسالة خطأ
      centersCtx.parentElement.innerHTML = `
        <div class="text-center py-8">
          <div class="text-red-600 text-lg mb-2">⚠️ تعذر تحميل بيانات المراكز الصحية</div>
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
  const cGrayTxt = '#475569';

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

// ========================================
// دوال رسم الرسوم البيانية الجديدة
// ========================================

/**
 * تحميل ورسم مخطط حالة البلاغ
 */
async function loadStatusChart() {
  try {
    const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'http://localhost:3001' : '';

    // التحقق من دور المستخدم
    if (!currentUser) await loadCurrentUser();
    const isCluster = App.isClusterManager();
    
    const urlParams = new URLSearchParams(location.search);
    let hospitalId = urlParams.get('hospitalId') || window.filteredHospitalId;
    
    // إذا كان مدير تجمع ولا يوجد تصفية من URL، لا نرسل hospitalId لعرض جميع المستشفيات
    // إذا كان مدير نظام/موظف، نرسل hospitalId الخاص به
    if (!hospitalId && !isCluster) {
      hospitalId = currentUser?.HospitalID || currentUser?.hospitalId || window.userHospitalId;
    } else if (isCluster && !hospitalId && !window.filteredHospitalId) {
      // مدير تجمع بدون تصفية = جميع المستشفيات
      hospitalId = null;
    }
    
    const qs = hospitalId ? `?hospitalId=${encodeURIComponent(hospitalId)}` : '';

    const resp = await authFetch(`${API_BASE}/api/dashboard/total/status${qs}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    
    const json = await resp.json();

    if (!json.success || !json.data || !json.data.length) {
      const parent = document.getElementById('status-chart')?.parentElement;
      if (parent) {
        parent.innerHTML = '<div class="text-center text-gray-500 p-6">لا توجد بيانات لحالة البلاغ</div>';
      }
      return;
    }

    // 🗂️ تحويل الأكواد إلى عناوين عربية (جميع الحالات من الجدول)
    const statusMap = {
      open: 'مفتوح',
      waiting: 'بانتظار رد القسم',
      in_progress: 'قيد المعالجة',
      on_hold: 'معلق',
      escalated: 'مصعد',
      closed: 'مغلق',
      resolved: 'محلول',
      cancelled: 'ملغي',
      // حالات إضافية للتوافق
      unknown: 'غير محدد',
    };

    // 🎨 ألوان لكل حالة - متناسقة مع نظام الألوان الأساسي للداشبورد
    const colorMap = {
      open: '#1D9BF0', // أزرق فاتح (سماوي) - مفتوحة
      waiting: '#FBBF24', // أصفر - قيد المتابعة
      in_progress: '#1D9BF0', // أزرق فاتح - قيد المعالجة
      on_hold: '#6B7280', // رمادي - معلق
      escalated: '#EF4444', // أحمر - حرجة/مصعد
      closed: '#0FA47A', // أخضر - مغلقة
      resolved: '#0FA47A', // أخضر - محلول (نفس لون المغلقة)
      cancelled: '#DC2626', // أحمر غامق - ملغي
      unknown: '#9CA3AF', // رمادي فاتح - غير محدد
    };

    const labels = json.data.map(s => statusMap[s.StatusCode] || s.StatusCode);
    const values = json.data.map(s => Number(s.Total) || 0);
    const colors = json.data.map(s => colorMap[s.StatusCode] || '#9CA3AF');

    // 🧹 تدمير أي رسم سابق على نفس الكانفس
    Chart.helpers.each(Chart.instances, (inst) => {
      if (inst.canvas && inst.canvas.id === 'status-chart') {
        inst.destroy();
      }
    });

    const ctx = document.getElementById('status-chart');
    if (!ctx) return;

    new Chart(ctx.getContext('2d'), {
      type: 'pie',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: colors,
          borderColor: '#ffffff',
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: {
              font: { family: 'Tajawal', size: 13 },
              color: '#374151',
            },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const total = values.reduce((sum, v) => sum + v, 0);
                const val = ctx.parsed || 0;
                const percent = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                return `${ctx.label}: ${val} (${percent}%)`;
              },
            },
          },
        },
      },
    });
  } catch (error) {
    console.error('❌ خطأ في تحميل مخطط حالة البلاغ:', error);
  }
}

/**
 * تحميل ورسم مخطط التصنيفات الرئيسية
 */
async function loadCategoriesChart() {
  try {
    const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'http://localhost:3001' : '';

    // التحقق من دور المستخدم
    if (!currentUser) await loadCurrentUser();
    const isCluster = App.isClusterManager();
    
    const urlParams = new URLSearchParams(location.search);
    let hospitalId = urlParams.get('hospitalId') || window.filteredHospitalId;
    
    // إذا كان مدير تجمع ولا يوجد تصفية من URL، لا نرسل hospitalId لعرض جميع المستشفيات
    // إذا كان مدير نظام/موظف، نرسل hospitalId الخاص به
    if (!hospitalId && !isCluster) {
      hospitalId = currentUser?.HospitalID || currentUser?.hospitalId || window.userHospitalId;
    } else if (isCluster && !hospitalId && !window.filteredHospitalId) {
      // مدير تجمع بدون تصفية = جميع المستشفيات
      hospitalId = null;
    }
    
    const qs = hospitalId ? `?hospitalId=${encodeURIComponent(hospitalId)}` : '';

    const resp = await authFetch(`${API_BASE}/api/dashboard/total/categories${qs}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    
    const json = await resp.json();

    if (!json.success || !json.data || !json.data.length) {
      const parent = document.getElementById('categories-chart')?.parentElement;
      if (parent) {
        parent.innerHTML = '<div class="text-center text-gray-500 p-6">لا توجد بيانات للتصنيفات</div>';
      }
      return;
    }

    // 🗂️ التصنيفات تأتي من جدول complaint_types مباشرة (TypeName)
    // لا نحتاج لتحويل لأن API يرجع TypeName العربي مباشرة

    const labels = json.data.map(c => c.Category || 'غير محدد');
    const values = json.data.map(c => Number(c.Total) || 0);

    // 🧹 تدمير أي رسم سابق
    Chart.helpers.each(Chart.instances, (inst) => {
      if (inst.canvas && inst.canvas.id === 'categories-chart') {
        inst.destroy();
      }
    });

    const ctx = document.getElementById('categories-chart');
    if (!ctx) return;

    // حفظ البيانات الكاملة للتصنيفات للاستخدام في onClick
    const categoriesData = json.data.map(c => ({
      label: c.Category || 'غير محدد',
      code: c.CategoryCode || c.ComplaintTypeID?.toString() || '',
      id: c.ComplaintTypeID || null,
      total: Number(c.Total) || 0
    }));

    const chartInstance = new Chart(ctx.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'عدد البلاغات',
          data: values,
          backgroundColor: '#0EA5E9',
          borderRadius: 6,
          maxBarThickness: 18,
          categoriesData
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                return `${ctx.label}: ${ctx.formattedValue}`;
              },
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: { display: false },
            ticks: { color: '#374151' },
          },
          y: {
            grid: { display: false },
            ticks: {
              color: '#374151',
              font: { family: 'Tajawal', size: 12 }
            },
          },
        },
        onClick: (evt, elements) => {
          if (!elements || elements.length === 0) return;
          
          // الحصول على العنصر الذي تم النقر عليه
          const element = elements[0];
          const dataset = chartInstance.data.datasets[0];
          const categoryData = dataset.categoriesData?.[element.index];
          
          if (categoryData) {
            // الانتقال إلى صفحة تفاصيل التصنيف
            // استخدام CategoryCode إذا كان موجوداً، وإلا ComplaintTypeID، وإلا TypeName
            const type = categoryData.code || categoryData.id?.toString() || categoryData.label;
            const label = categoryData.label;
            const url = `classification-details.html?type=${encodeURIComponent(type)}&label=${encodeURIComponent(label)}`;
            console.log(`🔗 الانتقال إلى صفحة تفاصيل التصنيف: ${url}`, categoryData);
            window.location.href = url;
          } else {
            console.warn('⚠️ لم يتم العثور على بيانات التصنيف للعنصر:', element);
          }
        },
      },
    });
  } catch (error) {
    console.error('❌ خطأ في تحميل مخطط التصنيفات:', error);
  }
}

/**
 * تحميل وعرض جدول تكرار الشكاوى حسب رقم الهوية
 */
let currentPatientFrequencyPage = 1;
const patientFrequencyLimit = 100;

async function loadPatientFrequencyTable(page = 1) {
  try {
    const tbody = document.getElementById('patient-frequency-tbody');
    const infoDiv = document.getElementById('patient-frequency-info');
    const prevBtn = document.getElementById('patient-frequency-prev');
    const nextBtn = document.getElementById('patient-frequency-next');
    
    if (!tbody) return;
    
    // عرض حالة التحميل
    tbody.innerHTML = '<tr><td colspan="3" class="py-8 text-gray-500">جاري تحميل البيانات...</td></tr>';
    if (infoDiv) infoDiv.textContent = 'جاري التحميل...';
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    
    const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'http://localhost:3001' : '';
    
    // جلب hospitalId من URL أو من المستخدم
    const urlParams = new URLSearchParams(location.search);
    let hospitalId = urlParams.get('hospitalId') || window.filteredHospitalId;
    
    // تحويل hospitalId إلى رقم إذا كان موجوداً
    if (hospitalId) {
      hospitalId = Number(hospitalId);
    }
    
    if (!hospitalId && !App.isClusterManager()) {
      hospitalId = Number(currentUser?.HospitalID || currentUser?.hospitalId || 0);
    }
    
    const params = new URLSearchParams({
      page: page.toString(),
      limit: patientFrequencyLimit.toString()
    });
    
    if (hospitalId && hospitalId > 0) {
      params.set('hospitalId', hospitalId.toString());
    }
    
    const response = await authFetch(`${API_BASE}/api/dashboard/total/patient-frequency?${params.toString()}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const json = await response.json();
    
    if (!json.success || !json.data || !json.data.length) {
      tbody.innerHTML = '<tr><td colspan="3" class="py-8 text-gray-500">لا توجد بيانات</td></tr>';
      if (infoDiv) infoDiv.textContent = 'لا توجد بيانات';
      return;
    }
    
    // عرض البيانات
    tbody.innerHTML = '';
    json.data.forEach((row, index) => {
      const tr = document.createElement('tr');
      tr.className = `${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} cursor-pointer hover:bg-blue-50 transition-colors`;
      tr.innerHTML = `
        <td class="py-3 px-4 border">${row.PatientIDNumber || 'غير محدد'}</td>
        <td class="py-3 px-4 border font-semibold">${row.frequency || 0}</td>
        <td class="py-3 px-4 border">${row.HospitalName || 'غير محدد'}</td>
      `;
      
      // إضافة event listener لفتح الـ modal
      tr.addEventListener('click', () => {
        openPatientComplaintsModal(row.PatientIDNumber, row.HospitalID, row.HospitalName);
      });
      
      tbody.appendChild(tr);
    });
    
    // تحديث معلومات Pagination
    const pagination = json.pagination || {};
    if (infoDiv) {
      const start = (pagination.page - 1) * pagination.limit + 1;
      const end = Math.min(start + pagination.limit - 1, pagination.total);
      infoDiv.textContent = `${start} - ${end} / ${pagination.total}`;
    }
    
    // تحديث أزرار Pagination
    if (prevBtn) {
      prevBtn.disabled = !pagination.hasPrev;
      prevBtn.onclick = () => {
        if (pagination.hasPrev) {
          currentPatientFrequencyPage = pagination.page - 1;
          loadPatientFrequencyTable(currentPatientFrequencyPage);
        }
      };
    }
    
    if (nextBtn) {
      nextBtn.disabled = !pagination.hasNext;
      nextBtn.onclick = () => {
        if (pagination.hasNext) {
          currentPatientFrequencyPage = pagination.page + 1;
          loadPatientFrequencyTable(currentPatientFrequencyPage);
        }
      };
    }
    
    currentPatientFrequencyPage = pagination.page || page;
    
  } catch (error) {
    console.error('❌ خطأ في تحميل جدول تكرار الشكاوى:', error);
    const tbody = document.getElementById('patient-frequency-tbody');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="3" class="py-8 text-red-500">حدث خطأ في تحميل البيانات</td></tr>';
    }
  }
}

/**
 * فتح نافذة منبثقة لعرض شكاوى شخص معين
 */
async function openPatientComplaintsModal(patientIDNumber, hospitalId, hospitalName) {
  const modal = document.getElementById('patient-complaints-modal');
  const listDiv = document.getElementById('patient-complaints-list');
  const infoDiv = document.getElementById('patient-modal-info');
  const closeBtn = document.getElementById('patient-modal-close');
  
  if (!modal || !listDiv) return;
  
  // إظهار الـ modal
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  
  // تحديث معلومات الشخص
  if (infoDiv) {
    infoDiv.textContent = `رقم الهوية: ${patientIDNumber} | المستشفى: ${hospitalName}`;
  }
  
  // عرض حالة التحميل
  listDiv.innerHTML = '<div class="text-center text-gray-500 py-8">جاري تحميل الشكاوى...</div>';
  
  try {
    const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'http://localhost:3001' : '';
    
    const params = new URLSearchParams({
      patientIDNumber: patientIDNumber.toString(),
      hospitalId: hospitalId.toString()
    });
    
    const response = await authFetch(`${API_BASE}/api/dashboard/total/patient-complaints?${params.toString()}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const json = await response.json();
    
    if (!json.success || !json.data || !json.data.length) {
      listDiv.innerHTML = '<div class="text-center text-gray-500 py-8">لا توجد شكاوى لهذا الشخص</div>';
      return;
    }
    
    // عرض الشكاوى
    listDiv.innerHTML = '';
    json.data.forEach((complaint, index) => {
      const complaintCard = document.createElement('div');
      complaintCard.className = 'border border-gray-200 rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-colors';
      
      const statusColor = getStatusColor(complaint.StatusCode);
      const priorityColor = getPriorityColor(complaint.PriorityCode);
      const date = new Date(complaint.CreatedAt).toLocaleDateString('ar-SA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      
      complaintCard.innerHTML = `
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <div class="flex items-center gap-3 mb-2">
              <span class="font-bold text-lg" style="color:#002B5B">${complaint.TicketNumber || 'غير محدد'}</span>
              <span class="px-2 py-1 rounded text-xs font-semibold" style="background:${statusColor.bg}; color:${statusColor.text}">
                ${complaint.StatusLabelAr || complaint.StatusCode || 'غير محدد'}
              </span>
              <span class="px-2 py-1 rounded text-xs font-semibold" style="background:${priorityColor.bg}; color:${priorityColor.text}">
                ${getPriorityLabel(complaint.PriorityCode)}
              </span>
            </div>
            <div class="text-sm text-gray-600 mb-2">
              <span class="font-semibold">النوع:</span> ${complaint.ComplaintTypeNameAr || 'غير محدد'}
              ${complaint.DepartmentNameAr ? ` | <span class="font-semibold">القسم:</span> ${complaint.DepartmentNameAr}` : ''}
            </div>
            <p class="text-sm text-gray-700 line-clamp-2">${complaint.Description || 'لا يوجد وصف'}</p>
            <div class="text-xs text-gray-500 mt-2">تاريخ الإنشاء: ${date}</div>
          </div>
        </div>
      `;
      
      // إضافة event listener لفتح صفحة التفاصيل
      complaintCard.addEventListener('click', () => {
        const ticket = complaint.TicketNumber;
        const complaintId = complaint.ComplaintID;
        const hospitalId = complaint.HospitalID;
        
        // بناء رابط صفحة التفاصيل
        const params = new URLSearchParams();
        if (ticket) params.set('ticket', ticket);
        if (complaintId) params.set('complaintId', complaintId);
        if (hospitalId) params.set('hid', hospitalId);
        
        window.location.href = `../public/complaints/history/complaint-details.html?${params.toString()}`;
      });
      
      listDiv.appendChild(complaintCard);
    });
    
  } catch (error) {
    console.error('❌ خطأ في تحميل شكاوى الشخص:', error);
    listDiv.innerHTML = '<div class="text-center text-red-500 py-8">حدث خطأ في تحميل الشكاوى</div>';
  }
  
  // دالة إغلاق الـ modal
  const closeModal = () => {
    modal.classList.remove('flex');
    modal.classList.add('hidden');
  };
  
  // إضافة event listener لإغلاق الـ modal
  if (closeBtn) {
    closeBtn.onclick = closeModal;
  }
  
  // إغلاق عند النقر خارج الـ modal
  const handleModalClick = (e) => {
    if (e.target === modal) {
      closeModal();
    }
  };
  modal.removeEventListener('click', handleModalClick); // إزالة أي مستمع سابق
  modal.addEventListener('click', handleModalClick);
}

/**
 * دوال مساعدة للألوان والتسميات
 */
function getStatusColor(status) {
  const statusUpper = (status || '').toUpperCase();
  if (statusUpper.includes('CLOSED') || statusUpper.includes('مغلق')) {
    return { bg: '#ECFDF5', text: '#10B981' };
  } else if (statusUpper.includes('OPEN') || statusUpper.includes('مفتوح')) {
    return { bg: '#EFF6FF', text: '#2563EB' };
  } else if (statusUpper.includes('CRITICAL') || statusUpper.includes('حرج')) {
    return { bg: '#FEF2F2', text: '#EF4444' };
  }
  return { bg: '#F3F4F6', text: '#6B7280' };
}

function getPriorityColor(priority) {
  const priorityUpper = (priority || '').toUpperCase();
  if (priorityUpper.includes('CRITICAL') || priorityUpper.includes('HIGH') || priorityUpper.includes('حرج') || priorityUpper.includes('عالي')) {
    return { bg: '#FEF2F2', text: '#EF4444' };
  } else if (priorityUpper.includes('MEDIUM') || priorityUpper.includes('متوسط')) {
    return { bg: '#FFFBEB', text: '#F59E0B' };
  }
  return { bg: '#F3F4F6', text: '#6B7280' };
}

function getPriorityLabel(priority) {
  const priorityUpper = (priority || '').toUpperCase();
  if (priorityUpper.includes('CRITICAL') || priorityUpper.includes('حرج')) {
    return 'حرجة';
  } else if (priorityUpper.includes('HIGH') || priorityUpper.includes('عالي')) {
    return 'عالية';
  } else if (priorityUpper.includes('MEDIUM') || priorityUpper.includes('متوسط')) {
    return 'متوسطة';
  } else if (priorityUpper.includes('LOW') || priorityUpper.includes('منخفض')) {
    return 'منخفضة';
  }
  return priority || 'غير محدد';
}

/**
 * فتح نافذة منبثقة لعرض بلاغات قسم معين
 * متاحة بشكل عام للاستخدام من onclick في HTML
 */
window.openDepartmentComplaintsModal = async function(hospitalName, departmentName) {
  const modal = document.getElementById('department-complaints-modal');
  const listDiv = document.getElementById('department-complaints-list');
  const infoDiv = document.getElementById('department-modal-info');
  const closeBtn = document.getElementById('department-modal-close');
  
  if (!modal || !listDiv) return;
  
  // إظهار الـ modal
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  
  // تحديث معلومات القسم
  if (infoDiv) {
    infoDiv.textContent = `المستشفى: ${hospitalName} | القسم: ${departmentName}`;
  }
  
  // عرض حالة التحميل
  listDiv.innerHTML = '<div class="text-center text-gray-500 py-8">جاري تحميل البلاغات...</div>';
  
  try {
    const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'http://localhost:3001' : '';
    
    const params = new URLSearchParams({
      hospitalName: hospitalName,
      departmentName: departmentName
    });
    
    const response = await authFetch(`${API_BASE}/api/dashboard/total/department-complaints?${params.toString()}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const json = await response.json();
    
    if (!json.success || !json.data || !json.data.length) {
      listDiv.innerHTML = '<div class="text-center text-gray-500 py-8">لا توجد بلاغات لهذا القسم</div>';
      return;
    }
    
    // عرض البلاغات
    listDiv.innerHTML = '';
    json.data.forEach((complaint, index) => {
      const complaintCard = document.createElement('div');
      complaintCard.className = 'border border-gray-200 rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-colors';
      
      const statusColor = getStatusColor(complaint.StatusCode);
      const priorityColor = getPriorityColor(complaint.PriorityCode);
      const date = new Date(complaint.CreatedAt).toLocaleDateString('ar-SA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      
      complaintCard.innerHTML = `
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <div class="flex items-center gap-3 mb-2">
              <span class="font-bold text-lg" style="color:#002B5B">${complaint.TicketNumber || 'غير محدد'}</span>
              <span class="px-2 py-1 rounded text-xs font-semibold" style="background:${statusColor.bg}; color:${statusColor.text}">
                ${complaint.StatusLabelAr || complaint.StatusCode || 'غير محدد'}
              </span>
              <span class="px-2 py-1 rounded text-xs font-semibold" style="background:${priorityColor.bg}; color:${priorityColor.text}">
                ${getPriorityLabel(complaint.PriorityCode)}
              </span>
            </div>
            <div class="text-sm text-gray-600 mb-2">
              <span class="font-semibold">النوع:</span> ${complaint.ComplaintTypeNameAr || 'غير محدد'}
              ${complaint.PatientFullName ? ` | <span class="font-semibold">المريض:</span> ${complaint.PatientFullName}` : ''}
            </div>
            <p class="text-sm text-gray-700 line-clamp-2">${complaint.Description || 'لا يوجد وصف'}</p>
            <div class="text-xs text-gray-500 mt-2">تاريخ الإنشاء: ${date}</div>
          </div>
        </div>
      `;
      
      // إضافة event listener لفتح صفحة التفاصيل
      complaintCard.addEventListener('click', () => {
        const ticket = complaint.TicketNumber;
        const complaintId = complaint.ComplaintID;
        const hospitalId = complaint.HospitalID;
        
        // بناء رابط صفحة التفاصيل
        const params = new URLSearchParams();
        if (ticket) params.set('ticket', ticket);
        if (complaintId) params.set('complaintId', complaintId);
        if (hospitalId) params.set('hid', hospitalId);
        
        window.location.href = `../public/complaints/history/complaint-details.html?${params.toString()}`;
      });
      
      listDiv.appendChild(complaintCard);
    });
    
  } catch (error) {
    console.error('❌ خطأ في تحميل بلاغات القسم:', error);
    listDiv.innerHTML = '<div class="text-center text-red-500 py-8">حدث خطأ في تحميل البلاغات</div>';
  }
  
  // دالة إغلاق الـ modal
  const closeModal = () => {
    modal.classList.remove('flex');
    modal.classList.add('hidden');
  };
  
  // إضافة event listener لإغلاق الـ modal
  if (closeBtn) {
    closeBtn.onclick = closeModal;
  }
  
  // إغلاق عند النقر خارج الـ modal
  const handleModalClick = (e) => {
    if (e.target === modal) {
      closeModal();
    }
  };
  modal.removeEventListener('click', handleModalClick); // إزالة أي مستمع سابق
  modal.addEventListener('click', handleModalClick);
}

/**
 * تحديث تاريخ الأسبوع الحالي (من الأحد إلى السبت)
 */
function updateWeeklyPeriod() {
  const periodElement = document.getElementById('weekly-period');
  if (!periodElement) return;
  
  const now = new Date();
  
  // حساب يوم الأحد من الأسبوع الحالي (الأسبوع يبدأ من الأحد في السعودية)
  const dayOfWeek = now.getDay(); // 0 = الأحد, 1 = الاثنين, ..., 6 = السبت
  const daysToSunday = dayOfWeek === 0 ? 0 : -dayOfWeek; // إذا كان اليوم الأحد، لا نحتاج للرجوع
  
  const sunday = new Date(now);
  sunday.setDate(now.getDate() + daysToSunday);
  sunday.setHours(0, 0, 0, 0);
  
  // حساب يوم السبت من نفس الأسبوع
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  saturday.setHours(23, 59, 59, 999);
  
  // تنسيق التاريخ بالعربية
  const monthNames = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
  ];
  
  const formatDate = (date) => {
    const day = date.getDate();
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  };
  
  const startDate = formatDate(sunday);
  const endDate = formatDate(saturday);
  
  // إذا كان نفس الشهر، نعرض: "12-9 أكتوبر 2025"
  // إذا كان شهرين مختلفين، نعرض: "30 سبتمبر - 6 أكتوبر 2025"
  if (sunday.getMonth() === saturday.getMonth() && sunday.getFullYear() === saturday.getFullYear()) {
    periodElement.textContent = `الفترة: ${sunday.getDate()}-${saturday.getDate()} ${monthNames[sunday.getMonth()]} ${sunday.getFullYear()}`;
  } else {
    periodElement.textContent = `الفترة: ${startDate} - ${endDate}`;
  }
}

/**
 * تصدير تقرير المستشفى (Excel أو PDF)
 */
async function exportHospitalReport(hospitalId, hospitalName, format) {
  try {
    const periodSelect = document.getElementById('export-period-select');
    const months = periodSelect ? Number(periodSelect.value) || 12 : 12;
    
    // عرض رسالة تحميل
    const loadingMsg = format === 'excel' ? 'جاري تصدير Excel...' : 'جاري تصدير PDF...';
    alert(loadingMsg);
    
    const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'http://localhost:3001' : '';
    
    // جلب البيانات من API
    const response = await authFetch(
      `${API_BASE}/api/dashboard/total/hospital-monthly-report?hospitalId=${hospitalId}&months=${months}`
    );
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'فشل في جلب البيانات');
    }
    
    // جلب بيانات التصنيفات
    const classificationsResponse = await authFetch(
      `${API_BASE}/api/dashboard/total/classifications-with-status?hospitalId=${hospitalId}`
    );
    let classificationsData = null;
    if (classificationsResponse.ok) {
      const classificationsResult = await classificationsResponse.json();
      if (classificationsResult.success) {
        classificationsData = classificationsResult.data;
      }
    }
    
    if (format === 'excel') {
      await exportHospitalExcel(data, hospitalName, classificationsData);
    } else {
      await exportHospitalPDF(data, hospitalName, classificationsData);
    }
    
  } catch (error) {
    console.error('❌ خطأ في تصدير تقرير المستشفى:', error);
    alert(`حدث خطأ في التصدير: ${error.message}`);
  }
}

/**
 * تصدير تقرير Excel
 */
async function exportHospitalExcel(data, hospitalName, classificationsData = null) {
  try {
    if (!window.XLSX) {
      throw new Error('مكتبة XLSX غير متوفرة');
    }
    
    const wb = window.XLSX.utils.book_new();
    
    // ورقة البيانات الشهرية
    const monthlyRows = [
      ['الشهر', 'إجمالي البلاغات', 'مفتوحة', 'مغلقة', 'حرجة'],
      ...data.monthlyData.map(row => [
        row.month_label,
        row.total_complaints,
        row.open_complaints,
        row.closed_complaints,
        row.critical_complaints
      ])
    ];
    
    const ws = window.XLSX.utils.aoa_to_sheet(monthlyRows);
    
    // تنسيق الأعمدة
    ws['!cols'] = [
      { wch: 15 }, // الشهر
      { wch: 18 }, // إجمالي
      { wch: 12 }, // مفتوحة
      { wch: 12 }, // مغلقة
      { wch: 12 }  // حرجة
    ];
    
    window.XLSX.utils.book_append_sheet(wb, ws, 'البيانات الشهرية');
    
    // ورقة الملخص
    const summaryRows = [
      ['المستشفى', data.hospital.name],
      ['كود المستشفى', data.hospital.code || 'غير محدد'],
      ['الفترة', `${data.period.from} إلى ${data.period.to}`],
      [''],
      ['الإحصائيات الإجمالية', ''],
      ['إجمالي البلاغات', data.summary.total_reports],
      ['بلاغات مفتوحة', data.summary.open_reports],
      ['بلاغات مغلقة', data.summary.closed_reports],
      ['بلاغات حرجة', data.summary.critical_count],
      ['معدل الإغلاق', `${data.summary.resolution_rate}%`],
      [''],
      ['الاتجاه', data.trend.direction === 'up' ? 'ارتفاع' : data.trend.direction === 'down' ? 'انخفاض' : 'مستقر'],
      ['التغيير', data.trend.change],
      ['النسبة المئوية', `${data.trend.percentage}%`]
    ];
    
    const wsSummary = window.XLSX.utils.aoa_to_sheet(summaryRows);
    wsSummary['!cols'] = [{ wch: 25 }, { wch: 20 }];
    window.XLSX.utils.book_append_sheet(wb, wsSummary, 'الملخص');
    
    // ورقة التصنيفات الرئيسية
    if (classificationsData && classificationsData.mainClassifications) {
      const mainClassRows = [
        ['التصنيف', 'إجمالي البلاغات', 'مفتوحة', 'مغلقة', 'زائر سري'],
        ...classificationsData.mainClassifications.map(item => [
          item.Category || 'غير محدد',
          item.TotalCount || 0,
          item.OpenCount || 0,
          item.ClosedCount || 0,
          item.MysteryCount || 0
        ])
      ];
      const wsMainClass = window.XLSX.utils.aoa_to_sheet(mainClassRows);
      wsMainClass['!cols'] = [
        { wch: 25 }, // التصنيف
        { wch: 18 }, // إجمالي
        { wch: 12 }, // مفتوحة
        { wch: 12 }, // مغلقة
        { wch: 12 }  // زائر سري
      ];
      window.XLSX.utils.book_append_sheet(wb, wsMainClass, 'التصنيفات الرئيسية');
    }
    
    // ورقة التصنيفات الفرعية
    if (classificationsData && classificationsData.subClassifications) {
      const subClassRows = [
        ['التصنيف الفرعي', 'إجمالي البلاغات', 'مفتوحة', 'مغلقة', 'زائر سري'],
        ...classificationsData.subClassifications.map(item => [
          item.SubCategory || 'غير محدد',
          item.TotalCount || 0,
          item.OpenCount || 0,
          item.ClosedCount || 0,
          item.MysteryCount || 0
        ])
      ];
      const wsSubClass = window.XLSX.utils.aoa_to_sheet(subClassRows);
      wsSubClass['!cols'] = [
        { wch: 25 }, // التصنيف الفرعي
        { wch: 18 }, // إجمالي
        { wch: 12 }, // مفتوحة
        { wch: 12 }, // مغلقة
        { wch: 12 }  // زائر سري
      ];
      window.XLSX.utils.book_append_sheet(wb, wsSubClass, 'التصنيفات الفرعية');
    }
    
    // حفظ الملف
    const fileName = `تقرير-${data.hospital.name}-${new Date().toISOString().split('T')[0]}.xlsx`;
    window.XLSX.writeFile(wb, fileName);
    
    console.log('✅ تم تصدير Excel بنجاح');
    
  } catch (error) {
    console.error('❌ خطأ في تصدير Excel:', error);
    throw error;
  }
}

/**
 * تصدير تقرير PDF باستخدام html2canvas لدعم العربية
 */
async function exportHospitalPDF(data, hospitalName, classificationsData = null) {
  try {
    if (!window.jspdf || !window.html2canvas) {
      throw new Error('مكتبات التصدير غير متوفرة');
    }
    
    const { jsPDF } = window.jspdf;
    
    // إنشاء عنصر HTML مخفي للتقرير
    const reportContainer = document.createElement('div');
    reportContainer.style.position = 'absolute';
    reportContainer.style.left = '-9999px';
    reportContainer.style.width = '210mm'; // A4 width
    reportContainer.style.padding = '20mm';
    reportContainer.style.backgroundColor = '#ffffff';
    reportContainer.style.fontFamily = 'Tajawal, Arial, sans-serif';
    reportContainer.style.direction = 'rtl';
    reportContainer.style.textAlign = 'right';
    
    const trendText = data.trend.direction === 'up' ? 'ارتفاع' : data.trend.direction === 'down' ? 'انخفاض' : 'مستقر';
    const trendColor = data.trend.direction === 'up' ? '#dc2626' : data.trend.direction === 'down' ? '#059669' : '#6b7280';
    
    // بناء HTML للتقرير
    reportContainer.innerHTML = `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700&display=swap');
        body { font-family: 'Tajawal', Arial, sans-serif; }
        .report-header {
          text-align: center;
          margin-bottom: 30px;
          padding-bottom: 15px;
          border-bottom: 3px solid #004A9F;
        }
        .report-title {
          font-size: 24px;
          font-weight: bold;
          color: #002B5B;
          margin-bottom: 10px;
        }
        .report-info {
          font-size: 14px;
          color: #666;
          margin: 5px 0;
        }
        .summary-section {
          margin: 20px 0;
        }
        .summary-title {
          font-size: 18px;
          font-weight: bold;
          color: #002B5B;
          margin-bottom: 15px;
        }
        .summary-item {
          font-size: 14px;
          margin: 8px 0;
          padding-right: 20px;
        }
        .trend-info {
          margin-top: 15px;
          padding: 10px;
          background: #f3f4f6;
          border-radius: 8px;
          font-size: 14px;
        }
        .trend-text {
          color: ${trendColor};
          font-weight: bold;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 20px 0;
          font-size: 13px;
        }
        table th {
          background: #004A9F;
          color: white;
          padding: 12px;
          text-align: center;
          font-weight: bold;
        }
        table td {
          padding: 10px;
          text-align: center;
          border: 1px solid #e5e7eb;
        }
        table tr:nth-child(even) {
          background: #f9fafb;
        }
        .chart-title {
          font-size: 18px;
          font-weight: bold;
          color: #002B5B;
          margin: 30px 0 15px 0;
          text-align: center;
        }
        .chart-container {
          width: 100%;
          height: 300px;
          margin: 20px 0;
          position: relative;
        }
      </style>
      
      <div class="report-header">
        <div class="report-title">تقرير المستشفى: ${data.hospital.name}</div>
        <div class="report-info">كود المستشفى: ${data.hospital.code || 'غير محدد'}</div>
        <div class="report-info">الفترة: ${data.period.from} إلى ${data.period.to}</div>
        <div class="report-info">تاريخ التقرير: ${new Date().toLocaleDateString('ar-SA')}</div>
      </div>
      
      <div class="summary-section">
        <div class="summary-title">الإحصائيات الإجمالية</div>
        <div class="summary-item">إجمالي البلاغات: <strong>${data.summary.total_reports}</strong></div>
        <div class="summary-item">بلاغات مفتوحة: <strong>${data.summary.open_reports}</strong></div>
        <div class="summary-item">بلاغات مغلقة: <strong>${data.summary.closed_reports}</strong></div>
        <div class="summary-item">بلاغات حرجة: <strong>${data.summary.critical_count}</strong></div>
        <div class="summary-item">معدل الإغلاق: <strong>${data.summary.resolution_rate}%</strong></div>
        <div class="trend-info">
          الاتجاه: <span class="trend-text">${trendText} (${data.trend.percentage > 0 ? '+' : ''}${data.trend.percentage}%)</span>
          - التغيير: ${data.trend.change > 0 ? '+' : ''}${data.trend.change} بلاغ
        </div>
      </div>
      
      <div class="summary-section">
        <div class="summary-title">البيانات الشهرية</div>
        <table>
          <thead>
            <tr>
              <th>الشهر</th>
              <th>إجمالي البلاغات</th>
              <th>مفتوحة</th>
              <th>مغلقة</th>
              <th>حرجة</th>
            </tr>
          </thead>
          <tbody>
            ${data.monthlyData.map(row => `
              <tr>
                <td>${row.month_label}</td>
                <td>${row.total_complaints}</td>
                <td>${row.open_complaints}</td>
                <td>${row.closed_complaints}</td>
                <td>${row.critical_complaints}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      
      ${classificationsData ? `
      <div class="summary-section">
        <div class="summary-title">التصنيفات الرئيسية</div>
        <table>
          <thead>
            <tr>
              <th>التصنيف</th>
              <th>إجمالي البلاغات</th>
              <th>مفتوحة</th>
              <th>مغلقة</th>
              <th>زائر سري</th>
            </tr>
          </thead>
          <tbody>
            ${classificationsData.mainClassifications.map(item => `
              <tr>
                <td>${item.Category || 'غير محدد'}</td>
                <td>${item.TotalCount || 0}</td>
                <td>${item.OpenCount || 0}</td>
                <td>${item.ClosedCount || 0}</td>
                <td>${item.MysteryCount || 0}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      
      <div class="summary-section">
        <div class="summary-title">التصنيفات الفرعية</div>
        <table>
          <thead>
            <tr>
              <th>التصنيف الفرعي</th>
              <th>إجمالي البلاغات</th>
              <th>مفتوحة</th>
              <th>مغلقة</th>
              <th>زائر سري</th>
            </tr>
          </thead>
          <tbody>
            ${classificationsData.subClassifications.map(item => `
              <tr>
                <td>${item.SubCategory || 'غير محدد'}</td>
                <td>${item.TotalCount || 0}</td>
                <td>${item.OpenCount || 0}</td>
                <td>${item.ClosedCount || 0}</td>
                <td>${item.MysteryCount || 0}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ` : ''}
      
      <div class="chart-title">الرسوم البيانية</div>
      <div class="chart-container">
        <canvas id="report-chart" width="800" height="300"></canvas>
      </div>
    `;
    
    document.body.appendChild(reportContainer);
    
    // إنشاء رسم بياني
    const canvas = reportContainer.querySelector('#report-chart');
    if (canvas && window.Chart) {
      const ctx = canvas.getContext('2d');
      const labels = data.monthlyData.map(r => r.month_label);
      const values = data.monthlyData.map(r => r.total_complaints);
      
      new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'إجمالي البلاغات',
            data: values,
            borderColor: '#004A9F',
            backgroundColor: 'rgba(0, 74, 159, 0.1)',
            tension: 0.4,
            fill: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: 'top',
              labels: {
                font: { family: 'Tajawal', size: 14 }
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
    }
    
    // انتظار تحميل الصور والخطوط
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // تحويل HTML إلى صورة
    const canvasImg = await window.html2canvas(reportContainer, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff'
    });
    
    // إنشاء PDF
    const imgData = canvasImg.toDataURL('image/png');
    const imgWidth = 210; // A4 width in mm
    const pageHeight = 297; // A4 height in mm
    const imgHeight = (canvasImg.height * imgWidth) / canvasImg.width;
    let heightLeft = imgHeight;
    
    const pdf = new jsPDF('p', 'mm', 'a4');
    let position = 0;
    
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
    
    while (heightLeft >= 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }
    
    // إزالة العنصر المخفي
    document.body.removeChild(reportContainer);
    
    // حفظ الملف
    const fileName = `تقرير-${data.hospital.name}-${new Date().toISOString().split('T')[0]}.pdf`;
    pdf.save(fileName);
    
    console.log('✅ تم تصدير PDF بنجاح');
    
  } catch (error) {
    console.error('❌ خطأ في تصدير PDF:', error);
    throw error;
  }
}

