// ✅ تم الاستبدال بـ API حقيقي - البيانات الوهمية معطلة الآن
// دالة بناء رابط الرجوع مع الفلاتر
function buildBackLink() {
  const urlParams = new URLSearchParams(location.search);
  const returnParams = new URLSearchParams();
  
  // جمع جميع معاملات return_ من URL
  const returnFilters = {};
  urlParams.forEach((value, key) => {
    if (key.startsWith('return_')) {
      const filterKey = key.replace('return_', '');
      returnFilters[filterKey] = value;
    }
  });
  
  // بناء رابط الرجوع مع الفلاتر
  if (Object.keys(returnFilters).length > 0) {
    Object.entries(returnFilters).forEach(([key, value]) => {
      returnParams.set(key, value);
    });
    return `complaints-history.html?${returnParams.toString()}`;
  }
  
  return 'complaints-history.html';
}

// تحديث رابط الرجوع عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
  const backLink = document.getElementById('backToHistoryLink');
  if (backLink) {
    backLink.href = buildBackLink();
  }
});

// إذا أردت الرجوع للوضع الوهمي للاختبار، فعّل السطور التالية:
// const MOCK = window.MOCK_COMPLAINTS ?? [...];

// إعدادات الـ API - تأكد من مطابقة المنفذ مع السيرفر
const API_BASE_URL = 'http://localhost:3001';

function qs(id){ return document.getElementById(id); }

function getParam(name){
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

// تنسيق التاريخ للعرض بالعربي + توقيت الرياض
function formatDateLocal(value, opts = {}) {
  if (!value) return '—';
  // دعم: ISO مثل 2025-10-21T09:08:00.000Z أو MySQL مثل 2025-10-21 09:08:00
  const raw = String(value).trim();
  const isoish = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const d = new Date(isoish);
  if (isNaN(d)) return raw; // لو تعذر التحويل نعرض النص كما هو

  const fmt = new Intl.DateTimeFormat('ar-SA', {
    calendar: 'gregory',
    numberingSystem: 'arab',
    year: 'numeric',
    month: 'long',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Riyadh',
    ...opts
  });
  return fmt.format(d);
}

// ✅ عداد مدة المعالجة
let processingTimerInterval = null;

function setupProcessingDurationTimer(complaint) {
  // 🚫 إذا البلاغ مغلق → أخفِ العداد فوراً
  const status = complaint.StatusCode || complaint.status || '';
  const statusUpper = status.toUpperCase();
  const isClosed = statusUpper === 'CLOSED' || 
                   statusUpper === 'RESOLVED' || 
                   statusUpper === 'CANCELLED' ||
                   status.includes('مغلق') || 
                   status.includes('محلول') || 
                   status.includes('مكتمل');
  
  if (isClosed) {
    const container = document.getElementById('processingDurationContainer');
    if (container) container.style.display = 'none';
    if (processingTimerInterval) {
      clearInterval(processingTimerInterval);
      processingTimerInterval = null;
    }
    return;
  }

  // إيقاف أي عداد سابق
  if (processingTimerInterval) {
    clearInterval(processingTimerInterval);
    processingTimerInterval = null;
  }

  const container = document.getElementById('processingDurationContainer');
  const countdownEl = document.getElementById('processingCountdown');
  const deadlineInfoEl = document.getElementById('processingDeadlineInfo');

  if (!container || !countdownEl || !deadlineInfoEl) return;

  // التحقق من وجود مدة معالجة
  const deadline = complaint.ProcessingDeadline || complaint.processingDeadline;
  const durationHours = complaint.ProcessingDurationHours || complaint.processingDurationHours;

  if (!deadline || !durationHours) {
    container.style.display = 'none';
    return;
  }

  // عرض الحاوية
  container.style.display = 'block';

  // تحويل الموعد النهائي إلى Date
  const deadlineDate = new Date(deadline);
  
  // التحقق من صحة التاريخ
  if (isNaN(deadlineDate.getTime())) {
    console.error('❌ تاريخ الموعد النهائي غير صحيح:', deadline);
    container.style.display = 'none';
    return;
  }
  
  // عرض معلومات الموعد النهائي
  const deadlineFormatted = deadlineDate.toLocaleString('ar-SA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  deadlineInfoEl.textContent = `ينتهي في: ${deadlineFormatted}`;

  // دالة تحديث العداد
  function updateCountdown() {
    const now = new Date();
    const diff = deadlineDate - now;

    if (diff <= 0) {
      // انتهت المدة
      countdownEl.innerHTML = '<span class="text-red-600">⛔ انتهت المدة المحددة</span>';
      deadlineInfoEl.innerHTML = '<span class="text-red-600">تم تجاوز الموعد النهائي</span>';
      clearInterval(processingTimerInterval);
      processingTimerInterval = null;
      return;
    }

    // حساب الوقت المتبقي
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((diff / (1000 * 60)) % 60);
    const seconds = Math.floor((diff / (1000)) % 60);

    // تنسيق النص
    let timeText = '';
    if (days > 0) {
      timeText = `${days} يوم و ${hours} ساعة`;
    } else if (hours > 0) {
      timeText = `${hours} ساعة و ${minutes} دقيقة`;
    } else if (minutes > 0) {
      timeText = `${minutes} دقيقة و ${seconds} ثانية`;
    } else {
      timeText = `${seconds} ثانية`;
    }

    // تغيير اللون حسب الوقت المتبقي
    if (days === 0 && hours < 6) {
      // أقل من 6 ساعات - خطر
      countdownEl.className = 'text-lg font-bold text-red-600';
      countdownEl.innerHTML = `🔴 ${timeText}`;
    } else if (days === 0 && hours < 24) {
      // أقل من 24 ساعة - تحذير
      countdownEl.className = 'text-lg font-bold text-orange-600';
      countdownEl.innerHTML = `⏱️ ${timeText}`;
    } else {
      // طبيعي
      countdownEl.className = 'text-lg font-bold text-blue-600';
      countdownEl.innerHTML = `⏱️ ${timeText}`;
    }
  }

  // تحديث فوري
  updateCountdown();

  // تحديث كل ثانية
  processingTimerInterval = setInterval(updateCountdown, 1000);
}

// ===== إظهار/إخفاء أزرار الإجراءات حسب الصلاحيات =====
async function applyActionPermissions(hospitalId) {
  try {
    const headers = authHeaders();
    if (!headers.Authorization) {
      console.warn('⚠️ لا يوجد توكن - سيتم إخفاء الإجراءات.');
      hideAllActions();
      return;
    }

    // نجيب صلاحياتي من الباك-إند
    const url = new URL(`${API_BASE_URL}/api/auth/me-permissions`);
    if (hospitalId) url.searchParams.set('hospitalId', hospitalId);

    const res = await fetch(url, { headers, credentials: 'include' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const p = await res.json();

    // مفاتيحنا المتفق عليها
    const isClusterManager = Boolean(
      p.user?.RoleID === 1 ||
      p.user?.IsClusterManager === true ||
      p.user?.role?.isClusterManager === true
    );

    const canReply        = !!(p.reply ?? p.canReply);
    const canTransferDept = !!(p.transferDept ?? p.canTransferDept);
    const canTransferUser = !!(p.transferUser ?? p.canTransferUser);
    const canTransferHospital = !!(p.complaintTransferHospital ?? false) || isClusterManager;
    const canTransfer     = canTransferDept || canTransferUser || canTransferHospital; // أي نوع من التحويل
    const canStatusUpdate = !!(p.statusUpdate ?? p.canStatusUpdate);
    const canDelete       = !!(p.remove ?? p.canDelete);

    console.log('🔐 [PERMISSIONS] الصلاحيات:', { 
      canReply, 
      canTransferDept, 
      canTransferUser, 
      canTransferHospital,
      canTransfer, 
      canStatusUpdate, 
      canDelete 
    });

    toggle('#btnReply',         canReply);
    toggle('#btnTransfer',      canTransfer);
    toggle('#btnChangeStatus',  canStatusUpdate);
    toggle('#btnChangeDuration', canStatusUpdate);
    toggle('#btnDeleteComplaint', canDelete);

    // خزّن كـ global لاستخدامها عند فتح المودال
    window.__canTransferDept = canTransferDept;
    window.__canTransferUser = canTransferUser;

    // أخفِ/أظهر تبويبات التحويل بحسب الصلاحيات
    const tabDeptBtn = document.getElementById('tabDeptBtn');
    const tabEmpBtn  = document.getElementById('tabEmpBtn');
    const tabHospBtn = document.getElementById('tabHospBtn');

    if (tabDeptBtn) {
      tabDeptBtn.style.display = canTransferDept ? '' : 'none';
    }
    if (tabEmpBtn) {
      tabEmpBtn.style.display = canTransferUser ? '' : 'none';
    }
    // ✅ إخفاء تبويب "تحويل بين المستشفيات" إذا لم تكن الصلاحية موجودة
    if (tabHospBtn) {
      tabHospBtn.style.display = canTransferHospital ? '' : 'none';
      console.log('🔒 [PERMISSIONS] تبويب تحويل بين المستشفيات:', canTransferHospital ? 'ظاهر' : 'مخفي');
    }

    // لو ما فيه أي نوع تحويل → لا معنى لزر المودال
    if (!canTransferDept && !canTransferUser && !canTransferHospital) {
      toggle('#btnTransfer', false);
    }

    // لو ما عنده أي إجراء → نخفي الشريط كامل
    const any = canReply || canTransfer || canStatusUpdate || canDelete;
    const actionsBar = document.getElementById('actionsBar');
    if (actionsBar) {
      actionsBar.classList.toggle('hidden', !any);
    }

  } catch (e) {
    console.error('❌ فشل تحميل الصلاحيات:', e);
    hideAllActions();
  }
}

function toggle(sel, show) {
  const el = document.querySelector(sel);
  if (!el) return;
  if (show) {
    el.classList.remove('hidden');
    el.style.display = '';
  } else {
    el.classList.add('hidden');
    el.style.display = 'none';
  }
}

function hideAllActions() {
  toggle('#btnReply', false);
  toggle('#btnTransfer', false);
  toggle('#btnChangeStatus', false);
  toggle('#btnChangeDuration', false);
  toggle('#btnDeleteComplaint', false);
  const actionsBar = document.getElementById('actionsBar');
  if (actionsBar) {
    actionsBar.classList.add('hidden');
  }
}

// ===== كاش الأقسام للاستخدام في تعريب نصوص الردود =====
const DeptCache = { list: [], map: new Map() };

async function ensureDeptCache(hid) {
  if (DeptCache.list.length) return DeptCache;
  if (!hid) return DeptCache;
  try {
    const res = await fetch(`${API_BASE_URL}/api/departments?hospitalId=${hid}`, { headers: { ...authHeaders() } });
    const data = await res.json();
    DeptCache.list = data.items || [];
    DeptCache.map = new Map(DeptCache.list.map(d => [Number(d.DepartmentID), (d.NameAr || d.NameEn || d.Code || String(d.DepartmentID))]));
  } catch (e) {
    console.warn('Dept cache load failed:', e);
  }
  return DeptCache;
}

function deptName(id) {
  const n = DeptCache.map.get(Number(id));
  return n ? n : `قسم ${id}`;
}

// يستبدل "قسم 2 إلى 3" و "قسم 2" بأسماء الأقسام
function localizeReplyMessage(msg = '') {
  let out = String(msg);
  // نمط "من قسم 2 إلى 3"
  out = out.replace(/قسم\s+(\d+)\s*إلى\s*(\d+)/g, (_, a, b) => `قسم ${deptName(a)} إلى ${deptName(b)}`);
  // أي "قسم 2" مفردة
  out = out.replace(/قسم\s+(\d+)/g, (_, a) => `قسم ${deptName(a)}`);
  return out;
}

// تحويل حالة البلاغ إلى عربي
function translateStatus(status) {
  switch (status?.toUpperCase()) {
    case 'OPEN':
      return 'مفتوحة';
    case 'IN_PROGRESS':
      return 'قيد المعالجة';
    case 'ON_HOLD':
      return 'معلقة';
    case 'CLOSED':
      return 'مغلقة';
    case 'CRITICAL':
      return 'حرجة';
    default:
      return status || 'غير محددة';
  }
}

// ترجمة الحالات إلى العربية (نسخة إضافية للاستخدام في الردود)
function translateStatusAr(status) {
  switch (status?.toUpperCase()) {
    case 'OPEN':
      return 'مفتوحة';
    case 'IN_PROGRESS':
      return 'قيد المعالجة';
    case 'ON_HOLD':
      return 'معلقة';
    case 'CLOSED':
      return 'مغلقة';
    case 'CRITICAL':
      return 'حرجة';
    default:
      return status || 'غير محددة';
  }
}

function badgeStatus(st){
  const map = {
    OPEN:   { t:'مفتوحة',      bg:'#EFF6FF', ring:'#DBEAFE', dot:'#2563EB', klass:'bg-blue-100 text-blue-600' },
    IN_PROGRESS:{ t:'قيد المعالجة', bg:'#FFFBEB', ring:'#FEF3C7', dot:'#F59E0B', klass:'bg-yellow-100 text-yellow-700' },
    ON_HOLD:{ t:'معلقة', bg:'#FFFBEB', ring:'#FEF3C7', dot:'#F59E0B', klass:'bg-yellow-100 text-yellow-700' },
    CLOSED: { t:'مغلقة',       bg:'#ECFDF5', ring:'#D1FAE5', dot:'#10B981', klass:'bg-green-100 text-green-600' },
    CRITICAL:{ t:'حرجة',        bg:'#FEF2F2', ring:'#FECACA', dot:'#EF4444', klass:'bg-red-100 text-red-600' },
  }[st] || { t:translateStatus(st), bg:'#F3F4F6', ring:'#E5E7EB', dot:'#6B7280', klass:'bg-gray-100 text-gray-700' };

  return `<span style="background:${map.bg};border:1px solid ${map.ring};"
           class="px-3 py-1 rounded-full text-sm font-semibold inline-flex items-center gap-2 ${map.klass}">
           <span style="width:8px;height:8px;border-radius:9999px;background:${map.dot}"></span>${map.t}</span>`;
}

// تحويل أولوية البلاغ إلى عربي
function translatePriority(priority) {
  switch (priority?.toUpperCase()) {
    case 'HIGH':
      return 'عالية';
    case 'MEDIUM':
    case 'MED':
      return 'متوسطة';
    case 'LOW':
      return 'منخفضة';
    case 'URGENT':
      return 'حرجة';
    default:
      return priority || 'غير محددة';
  }
}

function badgePriority(p){
  const map = {
    URGENT:{ t:'حرجة', bg:'#FEF2F2', ring:'#FECACA', dot:'#EF4444', klass:'bg-red-100 text-red-600' },
    HIGH:{ t:'عالية', bg:'#FFF7ED', ring:'#FFEDD5', dot:'#F97316', klass:'bg-red-100 text-red-600' },
    MEDIUM:{ t:'متوسطة', bg:'#FFFBEB', ring:'#FEF3C7', dot:'#F59E0B', klass:'bg-yellow-100 text-yellow-700' },
    MED:{ t:'متوسطة', bg:'#FFFBEB', ring:'#FEF3C7', dot:'#F59E0B', klass:'bg-yellow-100 text-yellow-700' },
    LOW:{ t:'منخفضة', bg:'#ECFDF5', ring:'#D1FAE5', dot:'#10B981', klass:'bg-green-100 text-green-700' },
  }[p] || { t:translatePriority(p), bg:'#F3F4F6', ring:'#E5E7EB', dot:'#6B7280', klass:'bg-gray-100 text-gray-700' };

  return `<span style="background:${map.bg};border:1px solid ${map.ring};"
           class="px-3 py-1 rounded-full text-sm font-semibold inline-flex items-center gap-2 ${map.klass}">
           <span class="dot" style="width:8px;height:8px;border-radius:9999px;background:${map.dot}"></span>${map.t}</span>`;
}

// ✅ دالة تحديث عرض الأولوية مباشرة
function updatePriorityDisplay(priorityCode) {
  const priorityBadge = qs('dPriorityBadge');
  if (priorityBadge) {
    priorityBadge.innerHTML = badgePriority(priorityCode.toUpperCase());
  }
}

// ✅ تحميل البيانات من API حقيقي
document.addEventListener('DOMContentLoaded', () => loadDetails());

async function loadDetails() {
  const ticket = getParam('ticket');
  const hid = getParam('hid'); // ✅ جلب HospitalID من الرابط

  if (!ticket) {
    qs('dTicket').textContent = 'لا يوجد رقم بلاغ في الرابط';
    alert('خطأ: لم يتم تمرير رقم البلاغ في الرابط.');
    return;
  }

  // عرض مؤشر التحميل
  showLoadingState();

  try {
    // بناء الرابط بشكل آمن باستخدام URLSearchParams
    const params = new URLSearchParams({ name: ticket });
    
    // ✅ إضافة HospitalID للطلب لضمان البحث في القاعدة الصحيحة
    if (hid) {
      params.set('hospitalId', hid);
    }
    
    const url = `${API_BASE_URL}/api/complaints/track?${params.toString()}`;
    
    console.log('🔍 Loading complaint details from:', url);
    console.log('🏥 HospitalID المُرسل:', hid);

    const res = await fetch(url, { 
      headers: { 
        'Accept': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
      } 
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP ${res.status}`);
    }

    const data = await res.json();
    console.log('📊 API Response:', data);

    if (!data.ok || !data.items || data.items.length === 0) {
      qs('dTicket').textContent = ticket;
      alert(`لم يتم العثور على البلاغ ${ticket}.`);
      hideLoadingState();
      return;
    }

    const c = data.items[0];
    console.log('✅ Complaint data:', c);
    console.log('📋 جميع حقول البلاغ المتاحة:', Object.keys(c));
    
    // حفظ البيانات في المتغير العام
    currentComplaint = c;
    
    // حفظ البيانات في dataset للوصول السريع
    document.body.dataset.complaintId = c.ComplaintID || '';
    
    // استخراج hospitalId من مصدر البيانات (حسب ما ظهر "source: hospital-11")
    const sourceStr = c?.source || ''; // مثل: 'hospital-11'
    const sourceHospId = Number((sourceStr.match(/hospital-(\d+)/)?.[1]) || 0);
    
    // fallback: من كويري الصفحة ?hospitalId=
    const urlHospId = Number(new URLSearchParams(location.search).get('hospitalId') || 0);
    
    // استخدام hospitalId من البلاغ أو من المصدر أو fallback إلى 1
    const hospitalId = c.HospitalID || sourceHospId || urlHospId || 1;
    document.body.dataset.hospitalId = hospitalId;
    document.body.dataset.departmentId = c.DepartmentID || c.departmentId || '';
    
    // حفظ hospitalId في متغير عام للاستخدام في الدوال
    window.currentHospitalId = hospitalId;
    
    console.log('🔍 حفظ البيانات:', { 
      complaintId: c.ComplaintID, 
      hospitalId: hospitalId,
      sourceStr: sourceStr,
      sourceHospId: sourceHospId,
      urlHospId: urlHospId,
      departmentId: c.DepartmentID || c.departmentId 
    });
    
    // حفظ ComplaintID في متغير عام للاستخدام في الردود
    window.currentComplaintId = c.ComplaintID;
    
    // تطبيق الصلاحيات على أزرار الإجراءات
    await applyActionPermissions(hospitalId);
    
    // ✅ جلب المرفقات من API التفاصيل
    try {
      const detailsUrl = `${API_BASE_URL}/api/complaints/${c.ComplaintID}?hospitalId=${hospitalId}`;
      console.log('📎 جلب المرفقات من:', detailsUrl);
      
      const detailsRes = await fetch(detailsUrl, { 
        headers: { 
          'Accept': 'application/json', 
          ...authHeaders() 
        } 
      });
      
      if (detailsRes.ok) {
        const full = await detailsRes.json();
        renderAttachments(full.attachments || []);
        console.log('✅ تم جلب المرفقات:', full.attachments?.length || 0);
      } else {
        console.warn('⚠️ فشل جلب المرفقات:', detailsRes.status);
        renderAttachments([]); // fallback
      }
    } catch (attachmentError) {
      console.error('❌ خطأ في جلب المرفقات:', attachmentError);
      renderAttachments([]); // fallback
    }

    // تعبئة الرأس
    qs('dTicket').textContent = c.TicketNumber || c.ticket || '';
    
    // استخدام النص العربي من API إذا كان متوفراً
    const statusCode = c.StatusCode || c.status || '';
    const statusLabelAr = c.StatusLabelAr || c.statusLabelAr;
    const priorityCode = c.PriorityCode || c.priority || '';
    
    // تحديث شارة الحالة بالعربي
    if (statusLabelAr) {
      qs('dStatusBadge').innerHTML = `<span class="px-3 py-1 rounded-full text-sm font-semibold inline-flex items-center gap-2 bg-blue-100 text-blue-600">
        <span class="w-2 h-2 rounded-full bg-blue-600"></span>${statusLabelAr}
      </span>`;
    } else {
      qs('dStatusBadge').innerHTML = badgeStatus(statusCode.toUpperCase());
    }
    
    qs('dPriorityBadge').innerHTML = badgePriority(priorityCode.toUpperCase());
    
    // تحديث الشارة بالعربي (استخدم النص من API إذا كان متوفراً)
    updateStatusBadge(statusCode, statusLabelAr);

    // ✅ إعداد عداد مدة المعالجة
    setupProcessingDurationTimer(c);

    // تعبئة بيانات المراجع
    qs('dName').textContent = c.PatientFullName || c.fullName || '';
    qs('dMobile').textContent = c.PatientMobile || c.mobile || '';
    qs('dFile').textContent = c.FileNumber || c.fileNumber || '';
    
    // 1) اسم المستشفى
    const hospitalNameEl = document.getElementById('uiHospitalName');
    if (hospitalNameEl) {
      hospitalNameEl.textContent = c.hospitalNameAr || c.hospital || '—';
    }

    // 2) اسم القسم
    const departmentNameEl = document.getElementById('uiDepartmentName');
    if (departmentNameEl) {
      departmentNameEl.textContent = c.DepartmentNameAr || c.DepartmentNameEn || c.departmentNameAr || c.departmentNameEn || c.dept || '—';
    }
    
    // 2.5) اسم القسم الفرعي
    const subDeptEl = document.getElementById('uiSubDepartmentName');
    if (subDeptEl) {
      subDeptEl.textContent = c.ParentDepartmentNameAr || c.ParentDepartmentNameEn || '—';
    }
    
    // 3) اسم منشئ البلاغ
    const createdByNameEl = document.getElementById('uiCreatedByName');
    if (createdByNameEl) {
      createdByNameEl.textContent = c.CreatedByFullName || c.createdByFullName || c.reporter || '—';
    }
    
    // 4) اسم الموظف المُسند إليه
    const assignedToNameEl = document.getElementById('uiAssignedToName');
    if (assignedToNameEl) {
      assignedToNameEl.textContent = c.AssignedToFullName || c.assignedToFullName || '—';
    }
    
    // عناصر إضافية (إذا موجودة في HTML)
    const dDept = document.getElementById('dDept');
    if (dDept) dDept.textContent = c.departmentNameAr || c.departmentNameEn || c.DepartmentID || c.department || '';
    
    const dNID = document.getElementById('dNID');
    if (dNID) dNID.textContent = c.PatientIDNumber || c.nationalId || '';

    // معلومات البلاغ - التصنيف الرئيسي
    const typeNameAr = c.ComplaintTypeNameAr || c.TypeName || c.typeName || '';
    qs('dType').textContent = typeNameAr || '—';
    
    // التصنيف الفرعي - عرضه في حقل منفصل
    const subTypeEl = document.getElementById('uiSubTypeName');
    if (subTypeEl) {
      // البحث عن التصنيف الفرعي بجميع الأسماء المحتملة
      const subTypeName = c.SubTypeNameAr || c.SubTypeNameEn || c.subTypeName || c.SubTypeName || c.SubTypeNameAr || '';
      subTypeEl.textContent = subTypeName ? subTypeName.trim() : '—';
      
      // Debug: طباعة معلومات التصنيف الفرعي
      if (subTypeName) {
        console.log('✅ تم العثور على التصنيف الفرعي:', {
          SubTypeNameAr: c.SubTypeNameAr,
          SubTypeNameEn: c.SubTypeNameEn,
          subTypeName: c.subTypeName,
          SubTypeID: c.SubTypeID,
          finalValue: subTypeName
        });
      } else {
        console.warn('⚠️ التصنيف الفرعي غير موجود في البيانات:', {
          SubTypeNameAr: c.SubTypeNameAr,
          SubTypeNameEn: c.SubTypeNameEn,
          SubTypeID: c.SubTypeID,
          allKeys: Object.keys(c)
        });
      }
    }
    qs('dVisitDate').textContent = formatDateLocal(c.VisitDate || c.visitDate || '—');
    qs('dCreated').textContent = formatDateLocal(c.CreatedAt || c.createdAt);
    qs('dUpdated').textContent = formatDateLocal(c.UpdatedAt || c.lastUpdate);
    
    // وصف البلاغ - من عمود Description في جدول البلاغات
    const descriptionElement = document.getElementById('dDescription');
    if (descriptionElement) {
      // دعم جميع أسماء الحقول المحتملة
      const description = c.Description || c.description || c.complaintDescription || c.desc || '';
      
      console.log('📝 وصف البلاغ من API:', {
        Description: c.Description,
        description: c.description,
        complaintDescription: c.complaintDescription,
        desc: c.desc,
        finalDescription: description,
        hasDescription: !!(description && description.trim()),
        descriptionLength: description ? description.length : 0
      });
      
      if (description && description.trim()) {
        descriptionElement.textContent = description;
        descriptionElement.style.display = 'block';
        descriptionElement.style.fontStyle = 'normal';
        descriptionElement.style.color = '#1F2937';
        console.log('✅ تم عرض وصف البلاغ بنجاح');
      } else {
        descriptionElement.textContent = 'لا يوجد وصف متوفر';
        descriptionElement.style.fontStyle = 'italic';
        descriptionElement.style.color = '#6B7280';
        console.log('⚠️ لا يوجد وصف متوفر للبلاغ');
      }
    }

    // --- بيانات الموظف المُبلّغ عليه ---
    if (c.targets && c.targets.length > 0) {
      const t = c.targets[0];
      const section = document.getElementById('targetSection');
      if (section) {
        section.style.display = 'block';
        document.getElementById('targetEmployeeName').textContent = t.TargetEmployeeName || '—';
        document.getElementById('targetEmployeeID').textContent = t.TargetEmployeeID || '—';
        document.getElementById('targetDepartmentName').textContent = t.TargetDepartmentName || '—';
        document.getElementById('targetDepartmentID').textContent = t.TargetDepartmentID || '—';
        
        console.log('✅ تم عرض بيانات الموظف المُبلّغ عليه:', t);
      }
    } else {
      // ما فيه بيانات موظف، خفِ المربع
      const section = document.getElementById('targetSection');
      if (section) {
        section.style.display = 'none';
        console.log('ℹ️ لا توجد بيانات موظف مُبلّغ عليه');
      }
    }

    // خط زمني بسيط
    const tl = qs('dTimeline');
    const items = [
      { t: c.CreatedAt || c.createdAt, txt: 'تم إنشاء البلاغ' },
      { t: c.UpdatedAt || c.lastUpdate, txt: 'آخر تحديث للحالة' },
    ].filter(x => x.t);
    
    tl.innerHTML = items.map(it => `
      <li class="flex items-start gap-3">
        <span class="mt-1 w-2 h-2 rounded-full bg-gray-400"></span>
        <div>
          <div class="text-sm text-gray-800">${it.txt}</div>
          <div class="text-xs text-gray-500">${formatDateLocal(it.t)}</div>
        </div>
      </li>
    `).join('');

    // إخفاء مؤشر التحميل
    hideLoadingState();

    // التحقق من حالة الحذف
    checkComplaintDeletedStatus();

    // تحميل الردود
    loadReplies();

    // TODO: إذا توفر API للردود/المرفقات، يمكن استدعاؤه هنا
    // مثال: await loadComplaintReplies(c.ticket);
    // مثال: await loadComplaintAttachments(c.ticket);

  } catch (err) {
    console.error('❌ Details load error:', err);
    hideLoadingState();
    alert('حدث خطأ أثناء جلب بيانات البلاغ.\n\nالرجاء التأكد من:\n• تشغيل الخادم على المنفذ ' + API_BASE_URL + '\n• صحة رقم البلاغ\n\nتفاصيل الخطأ: ' + err.message);
  }
}

// دوال مساعدة لإدارة حالة التحميل
function showLoadingState() {
  const container = document.querySelector('.container, main, body > div');
  if (container) {
    const loader = document.createElement('div');
    loader.id = 'detailsLoader';
    loader.className = 'fixed inset-0 bg-white bg-opacity-90 flex items-center justify-center z-50';
    loader.innerHTML = `
      <div class="text-center">
        <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-[#002B5B] mb-4"></div>
        <p class="text-gray-600 font-semibold">جاري تحميل تفاصيل البلاغ...</p>
      </div>
    `;
    document.body.appendChild(loader);
  }
}

function hideLoadingState() {
  const loader = document.getElementById('detailsLoader');
  if (loader) loader.remove();
}

// ===== بيانات تجريبية للأقسام/المستشفيات (واجهة فقط) =====
const HOSPITALS = [
  { id: 1, name: 'مستشفى الملك عبدالعزيز', departments: [
    {id: 11, name:'الطوارئ'},{id:12,name:'العيادات الخارجية'},{id:13,name:'الأشعة'}
  ]},
  { id: 2, name: 'مستشفى حراء العام', departments: [
    {id:21,name:'التمريض'},{id:22,name:'المختبر'},{id:23,name:'السجلات الطبية'}
  ]},
  { id: 3, name: 'مستشفى النور التخصصي', departments: [
    {id:31,name:'العناية المركزة'},{id:32,name:'العمليات'},{id:33,name:'الصيدلية'}
  ]}
];

// موظفون تجريبياً لكل قسم (بالأرقام الموجودة في HOSPITALS)
const EMPLOYEES_BY_DEPT = {
  11: [{id:1101,name:'عبدالله الحربي'},{id:1102,name:'حسن باوزير'}],
  12: [{id:1201,name:'رنيم الشهري'},{id:1202,name:'سمر الغامدي'}],
  13: [{id:1301,name:'سعود المالكي'}],
  21: [{id:2101,name:'نورة العتيبي'}],
  22: [{id:2201,name:'طارق البلوي'}],
  23: [{id:2301,name:'ليلى بخاري'}],
  31: [{id:3101,name:'محمد الزهراني'}],
  32: [{id:3201,name:'ريم السلمي'}],
  33: [{id:3301,name:'خالد العتيبي'}],
};

// ✅ تم إزالة البيانات الوهمية واستبدالها بـ API حقيقي
// الردود تُجلب الآن من قاعدة البيانات

function $(id){ return document.getElementById(id); }
const overlay = $('modalOverlay');

function openModal(el){ overlay.classList.remove('hidden'); el.classList.remove('hidden'); el.classList.add('grid'); }
function closeModals(){ overlay.classList.add('hidden'); document.querySelectorAll('#replyModal,#transferModal').forEach(m=>{ m.classList.add('hidden'); m.classList.remove('grid'); }); }
document.querySelectorAll('[data-close-modal]').forEach(b=> b.addEventListener('click', closeModals));
overlay.addEventListener('click', closeModals);

// فتح النوافذ
$('btnReply').addEventListener('click', ()=> {
  openModal($('replyModal'));
  // تحميل أنواع الردود عند فتح المودال
  setTimeout(() => loadReplyTypes(), 100);
});
// ❌ تم إلغاء فتح المودال القديم - يُفتح الآن المودال الجديد من DOMContentLoaded
// $('btnChangeStatus').addEventListener('click', ()=> openModal($('statusModal')));
// تم نقل هذا المعالج إلى updateTransferModalHandler()

// دوال مساعدة للتبويبات وتعبئة القوائم
function setActiveTab(tab){
  // أزرار
  document.querySelectorAll('#transferModal .tab-btn').forEach(btn=>{
    const active = btn.dataset.tab === tab;
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
    btn.classList.toggle('bg-indigo-600', active);
    btn.classList.toggle('text-white', active);
    btn.classList.toggle('bg-gray-100', !active);
    btn.classList.toggle('text-gray-700', !active);
  });
  // لوحات
  ['hosp','dept','emp'].forEach(t=>{
    document.getElementById(`pane-${t}`).classList.toggle('hidden', t !== tab);
  });
}

// ✅ دالة تعبئة المستشفيات من قاعدة البيانات
async function populateHospitals(){
  const selHosp = $('transferHospital');
  if (!selHosp) {
    console.warn('⚠️ عنصر transferHospital غير موجود');
    return;
  }

  // عرض حالة التحميل
  selHosp.innerHTML = '<option value="">جاري التحميل...</option>';
  selHosp.disabled = true;

  try {
    const url = `${API_BASE_URL}/api/hospitals?active=1`;
    const res = await fetch(url, { 
      headers: { 
        'Accept': 'application/json',
        ...authHeaders() 
      } 
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    
    // معالجة أنواع الاستجابات المختلفة
    let hospitals = [];
    if (Array.isArray(data)) {
      hospitals = data;
    } else if (data?.data && Array.isArray(data.data)) {
      hospitals = data.data;
    } else if (data?.hospitals && Array.isArray(data.hospitals)) {
      hospitals = data.hospitals;
    } else if (data?.items && Array.isArray(data.items)) {
      hospitals = data.items;
    } else {
      console.warn('⚠️ تنسيق استجابة غير متوقع:', data);
      hospitals = [];
    }

    // تعبئة القائمة
    if (hospitals.length === 0) {
      selHosp.innerHTML = '<option value="">لا توجد مستشفيات متاحة</option>';
      console.warn('⚠️ لا توجد مستشفيات في القاعدة');
    } else {
      selHosp.innerHTML = '<option value="">اختر المستشفى</option>' + 
        hospitals.map(h => 
          `<option value="${h.HospitalID || h.id}">${h.NameAr || h.NameEn || h.name || h.Code || 'غير معروف'}</option>`
        ).join('');
      console.log('✅ تم تحميل', hospitals.length, 'مستشفى من قاعدة البيانات');
    }

    selHosp.disabled = false;

  } catch (error) {
    console.error('❌ خطأ في تحميل المستشفيات:', error);
    selHosp.innerHTML = '<option value="">خطأ في تحميل المستشفيات</option>';
    selHosp.disabled = false;
    showToast('خطأ في تحميل قائمة المستشفيات: ' + error.message, 'error');
  }
}

// دالة تعبئة الأقسام من API الحقيقي
async function populateDeptMove() {
  const hid = Number(document.body.dataset.hospitalId);
  const currentDeptId = Number(document.body.dataset.departmentId) || 0;

  console.log('🔍 populateDeptMove - البيانات:', { hid, currentDeptId });

  if (!hid) {
    console.error('❌ Hospital ID غير متوفر');
    return;
  }

  try {
    // حمّل الأقسام من قاعدة المستشفى
    const url = `${API_BASE_URL}/api/departments?hospitalId=${hid}`;
    const res = await fetch(url, { headers: { ...authHeaders() } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const list = data.items || [];

    // عبّي القائمتين
    const from = document.getElementById('deptFrom');
    const to = document.getElementById('deptTo');

    if (from) {
      from.innerHTML = '';
      for (const d of list) {
        const opt = document.createElement('option');
        opt.value = d.DepartmentID;
        opt.textContent = d.NameAr || d.NameEn || d.Code || d.DepartmentID;
        from.appendChild(opt);
      }
    }

    if (to) {
      to.innerHTML = '';
      for (const d of list) {
        const opt = document.createElement('option');
        opt.value = d.DepartmentID;
        opt.textContent = d.NameAr || d.NameEn || d.Code || d.DepartmentID;
        to.appendChild(opt);
      }
    }

    // حددي "القسم الحالي" على قيمة البلاغ
    if (currentDeptId && from) {
      const idx = [...from.options].findIndex(o => Number(o.value) === currentDeptId);
      if (idx >= 0) from.selectedIndex = idx;
    }

    // خلي "القسم الهدف" مختلف افتراضيًا إن أمكن
    if (to && from && to.value === from.value && to.options.length > 1) {
      const otherIdx = [...to.options].findIndex(o => Number(o.value) !== currentDeptId);
      if (otherIdx >= 0) to.selectedIndex = otherIdx;
    }

    // عرض اسم القسم الحالي
    showCurrentDeptName(list);

    console.log('✅ تم تحميل الأقسام:', list.length);

  } catch (error) {
    console.error('❌ خطأ في تحميل الأقسام:', error);
  }
}

// دالة عرض اسم القسم الحالي
function showCurrentDeptName(list) {
  const currentDeptId = Number(document.body.dataset.departmentId) || 0;
  const d = list.find(x => Number(x.DepartmentID) === currentDeptId);
  
  console.log('🔍 showCurrentDeptName - البحث عن:', { currentDeptId, found: !!d, listLength: list.length });
  
  // تحديث الحقل النصي للقسم الحالي
  const currentTxt = document.getElementById('transferDepartmentCurrent');
  if (currentTxt) {
    const deptName = d ? (d.NameAr || d.NameEn || d.Code) : 'غير معروف';
    currentTxt.textContent = deptName;
    console.log('✅ تم تحديث القسم الحالي:', deptName);
  }
  
  // تحديث عنصر عرض القسم في التفاصيل (إذا كان موجوداً)
  const dDept = document.getElementById('dDept');
  if (dDept) {
    const deptName = d ? (d.NameAr || d.NameEn || d.Code) : 'غير معروف';
    dDept.textContent = deptName;
    console.log('✅ تم تحديث dDept:', deptName);
  }
  
  // تحديث عنصر القسم الجديد
  const uiDepartmentName = document.getElementById('uiDepartmentName');
  if (uiDepartmentName) {
    const deptName = d ? (d.NameAr || d.NameEn || d.Code) : 'غير معروف';
    uiDepartmentName.textContent = deptName;
    console.log('✅ تم تحديث uiDepartmentName:', deptName);
  }
}

// دالة لجلب الموظفين من API
async function fetchDeptUsers(hid, deptId) {
  const url = new URL(`${API_BASE_URL}/api/users/list`);
  url.searchParams.set('hospitalId', hid);
  if (deptId) url.searchParams.set('departmentId', deptId);
  url.searchParams.set('active', '1');

  const res = await fetch(url, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.items || [];
}

// دالة تعبئة تبويب تحويل الموظفين من API
async function populateEmpMove() {
  const hid = Number(document.body.dataset.hospitalId);
  const deptId = Number(document.body.dataset.departmentId); // قسم البلاغ الحالي
  const empDept = document.getElementById('empDept');
  const empFrom = document.getElementById('empFrom');
  const empTo   = document.getElementById('empTo');

  if (!hid || !empDept || !empFrom || !empTo) return;

  try {
    // 1) عبّي قائمة الأقسام (لدينا بالفعل API للأقسام) ثم اختاري القسم الحالي
    const depRes = await fetch(`${API_BASE_URL}/api/departments?hospitalId=${hid}`, { 
      headers: { ...authHeaders() }
    });
    const depData = await depRes.json();
    const deps = depData.items || [];

    empDept.innerHTML = deps.map(d => 
      `<option value="${d.DepartmentID}">${d.NameAr || d.NameEn || d.Code || d.DepartmentID}</option>`
    ).join('');

    // حدّدي القسم الحالي
    const idx = deps.findIndex(d => Number(d.DepartmentID) === deptId);
    if (idx >= 0) empDept.selectedIndex = idx;

    async function loadUsersFor(selectedDeptId) {
      const users = await fetchDeptUsers(hid, selectedDeptId);
      const options = users.map(u => 
        `<option value="${u.UserID}">${u.FullName || u.Username}</option>`
      ).join('') || '<option value="">—</option>';
      
      empFrom.innerHTML = options;
      empTo.innerHTML   = options;

      // اختيار الموظف الحالي إن وُجد من بيانات البلاغ
      const currentAssignee = Number(currentComplaint?.AssignedToUserID || 0);
      
      if (currentAssignee) {
        const iFrom = [...empFrom.options].findIndex(o => Number(o.value) === currentAssignee);
        if (iFrom >= 0) {
          empFrom.selectedIndex = iFrom;
        } else {
          // الموظف المُسند غير موجود في هذا القسم - أضف خيار "غير مُسند"
          empFrom.insertAdjacentHTML('afterbegin', '<option value="">— غير مُسند —</option>');
          empFrom.selectedIndex = 0;
        }
      } else {
        // لا يوجد موظف مُسند - أضف خيار "غير مُسند"
        empFrom.insertAdjacentHTML('afterbegin', '<option value="">— غير مُسند —</option>');
        empFrom.selectedIndex = 0;
      }

      // اجعلي الهدف مختلفًا تلقائيًا
      if (empFrom.value === empTo.value && empTo.options.length > 1) {
        empTo.selectedIndex = 1;
      }
    }

    await loadUsersFor(Number(empDept.value));
    empDept.onchange = e => loadUsersFor(Number(e.target.value));

  } catch (error) {
    console.error('خطأ في تحميل الموظفين:', error);
    showToast('خطأ في تحميل قائمة الموظفين', 'error');
  }
}

// ✅ حفظ الرد عبر API (مُحدّث لجدول complaint_responses)
$('saveReply').addEventListener('click', async () => {
  const complaintId = window.currentComplaintId || document.body.dataset.complaintId;
  const replyType = $('replyType')?.value;
  const message = $('replyText')?.value?.trim();
  const files = $('replyFiles')?.files;
  
  // حقول إضافية
  const isInternal = document.getElementById('replyInternal')?.checked ? 1 : 0;
  const targetStatus = document.getElementById('targetStatus')?.value || '';

  // التحقق من البيانات المطلوبة
  if (!complaintId) {
    alert('خطأ: لا يمكن تحديد معرّف البلاغ.');
    return;
  }

  if (!replyType) {
    alert('الرجاء اختيار نوع الرد.');
    return;
  }

  if (!message) {
    alert('الرجاء كتابة نص الرد.');
    return;
  }

  try {
    // إعداد FormData (بأسماء الحقول الصحيحة)
    const fd = new FormData();
    if (replyType) fd.append('ReplyTypeID', replyType);
    if (message) fd.append('Message', message); // ⚠️ تغيّر من ResponseText إلى Message
    fd.append('IsInternal', isInternal);
    if (targetStatus) fd.append('TargetStatusCode', targetStatus);

    // إضافة ResponderUserID
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const responderId = user.EmployeeID || user.UserID || null;
    if (responderId) fd.append('ResponderUserID', responderId);

    // إضافة الملفات
    for (const f of files || []) {
      fd.append('files', f);
    }

    console.log('📤 إرسال رد للبلاغ:', complaintId, {
      isInternal,
      targetStatus: targetStatus || 'بدون تغيير'
    });

    // إرسال الرد مع التوكِن
    const headers = authHeaders(); // ترجع { Authorization: 'Bearer ...' } إذا فيه توكن
    const hid = document.body.dataset.hospitalId || '';
    const url = `${API_BASE_URL}/api/complaints/${complaintId}/responses${hid ? `?hospitalId=${encodeURIComponent(hid)}` : ''}`;
    const res = await fetch(url, {
      method: 'POST',
      headers,               // << أضيفي هذا
      body: fd
    });

    const data = await res.json();

    if (!res.ok) {                       // يكفي نفحص كود HTTP
      throw new Error(data.message || data.error || `HTTP ${res.status}`);
    }

    // نجاح: لا تشترطي data.ok هنا

    console.log('✅ تم حفظ الرد بنجاح');
    if (data.statusUpdated) {
      console.log('🔄 تم تحديث حالة البلاغ');
    }

    // تنظيف النموذج
    $('replyType').value = '';
    $('replyText').value = '';
    $('replyFiles').value = '';
    if (document.getElementById('replyInternal')) {
      document.getElementById('replyInternal').checked = false;
    }
    if (document.getElementById('targetStatus')) {
      document.getElementById('targetStatus').value = '';
    }

    // إغلاق المودال
    closeModals();

    // إعادة تحميل الردود
    await refreshReplies();

    // إذا تم تحديث الحالة، نُعيد تحميل رأس البطاقة
    if (data.statusUpdated) {
      await loadDetails?.(); // إعادة تحميل التفاصيل لتحديث الحالة
      showToast('✅ تم إضافة الرد بنجاح وتحديث حالة البلاغ! 🔄', 'success');
    } else {
      showToast('✅ تم إضافة الرد بنجاح!', 'success');
    }

  } catch (error) {
    console.error('❌ خطأ في حفظ الرد:', error);
    showToast('❌ حدث خطأ أثناء حفظ الرد: ' + error.message, 'error');
  }
});

// ❌ تم إلغاء المعالج القديم (واجهة فقط) - استُبدل بـ applyStatusChange() المتصل بـ API
/*
$('applyStatus').addEventListener('click', async ()=>{
  const ticket = qs('dTicket').textContent.trim();
  const status = $('newStatus').value;
  const note = $('statusNote').value.trim();

  // TODO: API
  // await fetch(`/api/complaints/${encodeURIComponent(ticket)}/status`, {
  //   method:'PATCH', headers:{ 'Content-Type':'application/json', ...authHeaders() },
  //   body: JSON.stringify({ status, note })
  // });

  // تحديث البادج بصريًا
  qs('dStatusBadge').innerHTML = badgeStatus(status);
  alert('تم تغيير الحالة (واجهة).');
  closeModals();
});
*/

// تم نقل هذا المعالج إلى updateDepartmentTransferHandler()

// إن كان عندك دالة authHeaders للـ JWT استعملها هنا
function authHeaders(){
  const token = localStorage.getItem('authToken') || localStorage.getItem('token') || sessionStorage.getItem('token');
  console.log('🔑 التوكِن من localStorage:', token ? 'موجود ✅' : 'غير موجود ❌');
  console.log('📦 localStorage.authToken:', localStorage.getItem('authToken'));
  console.log('📦 localStorage.token:', localStorage.getItem('token'));
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/* ========= ربط الباك-إند لاحقًا =========
- استبدل MOCK بـ API:
  fetch(`/api/complaints/details?ticket=${encodeURIComponent(ticket)}`, {
    headers:{ Authorization: `Bearer ${token}` }
  })
  .then(r=>r.json())
  .then(data => { 
    // عبّي الحقول
  });
*/

// ===== إدارة الردود =====
// ✅ تحميل أنواع الردود من API (مُحسّن وآمن)
async function loadReplyTypes() {
  try {
    console.log('🔍 جلب أنواع الردود...');
    const hid = window.currentHospitalId || document.body.dataset.hospitalId || '';
    console.log('[loadReplyTypes] hospitalId=', hid);
    
    // بناء URL مع hospitalId أو complaintId كـ fallback
    const complaintId = window.currentComplaintId || document.body.dataset.complaintId;
    let url = `${API_BASE_URL}/api/reply-types?active=1`;
    
    if (hid) {
      url += `&hospitalId=${encodeURIComponent(hid)}`;
    } else if (complaintId) {
      url += `&complaintId=${encodeURIComponent(complaintId)}`;
    } else {
      console.warn('⚠️ لا يمكن تحديد المستشفى أو البلاغ - سيتم استخدام بيانات التوكِن');
      // لا نرمي خطأ هنا - دع السيرفر يحدد من التوكِن
    }
    
    console.log('[loadReplyTypes] URL=', url);
    const headers = authHeaders();
    
    // التحقق من وجود التوكِن
    if (!headers.Authorization) {
      throw new Error('لم يتم تسجيل الدخول. الرجاء تسجيل الدخول أولاً.');
    }
    
    const res = await fetch(url, { 
      credentials: 'include',
      headers: { 'Accept': 'application/json', ...headers }
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('❌ خطأ في جلب أنواع الردود:', errorText);
      throw new Error(`HTTP ${res.status}: ${errorText}`);
    }

    const data = await res.json();
    console.log('📊 API Response:', data);

    // تحقّق من النوع - الآن البيانات تأتي في data.items
    const items = data.items || data;
    if (!Array.isArray(items)) {
      throw new Error('Unexpected payload (not an array)');
    }

    const sel = document.getElementById('replyType');
    if (!sel) {
      throw new Error('#replyType not found in DOM');
    }

    // حددي اللغة الحالية (افتراضي: عربي)
    const lang = (localStorage.getItem('lang') || 'ar').toLowerCase();

    // املئي القائمة
    sel.innerHTML = '<option value="">اختر نوع الرد</option>';
    
    if (items.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'لا توجد أنواع رد مفعّلة';
      sel.appendChild(opt);
      console.warn('⚠️ لا توجد أنواع رد مفعّلة في قاعدة البيانات');
    } else {
      items.forEach(rt => {
        const opt = document.createElement('option');
        opt.value = rt.ReplyTypeID;
        // السيرفر يرجّع: ReplyTypeID, NameAr, NameEn
        const text = (lang === 'ar' ? rt.NameAr : (rt.NameEn || rt.NameAr)) || `#${rt.ReplyTypeID}`;
        opt.textContent = text;
        sel.appendChild(opt);
      });
      console.log('✅ تم تحميل', items.length, 'نوع رد');
    }

    // إزالة رسالة الخطأ الافتراضية
    sel.dataset.loaded = '1';

  } catch (err) {
    console.error('❌ خطأ في تحميل أنواع الردود:', err);
    
    // أعرضي رسالة للمستخدم + أبقي placeholder واضح
    const sel = document.getElementById('replyType');
    if (sel) {
      sel.innerHTML = '<option value="">تعذّر تحميل الأنواع</option>';
    }
    
    // إظهار رسالة خطأ للمستخدم
    console.warn('تعذّر تحميل أنواع الرد. أعيدي المحاولة لاحقًا.');
  }
}

// ✅ تحميل الردود من API (مُحدّث لجدول complaint_responses)
async function refreshReplies({ showAll } = {}) {
  const complaintId = window.currentComplaintId || document.body.dataset.complaintId;
  const repliesList = document.getElementById('repliesList');

  if (!repliesList || !complaintId) return;

  repliesList.innerHTML = `
    <div class="text-center text-gray-500 py-8">
      <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#002B5B] mb-3"></div>
      <div>جاري تحميل الردود...</div>
    </div>
  `;

  try {
    // إضافة ?all=1 لعرض الردود الداخلية (للموظفين فقط)
    const url = new URL(`${API_BASE_URL}/api/complaints/${complaintId}/responses`);
    if (showAll) url.searchParams.set('all', '1');
    
    // إضافة hospitalId للطلب
    const hid = document.body.dataset.hospitalId || '';
    if (hid) url.searchParams.set('hospitalId', hid);
    
    // تحميل كاش الأقسام
    await ensureDeptCache(hid);
    
    console.log('🔍 جلب ردود البلاغ:', complaintId, showAll ? '(كل الردود)' : '(عامة فقط)');
    const headers = authHeaders();
    const res = await fetch(url, { headers });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || data.error || `HTTP ${res.status}`);
    }

    // إذا لم تكن هناك ردود أو كانت المصفوفة فارغة
    if (!data.items || data.items.length === 0) {
      repliesList.innerHTML = `
        <div class="text-center text-gray-500 py-8">
          <div class="text-lg mb-2">💬</div>
          <div>لا توجد ردود بعد</div>
          <div class="text-sm mt-1">كن أول من يرد على هذا البلاغ</div>
        </div>
      `;
      return;
    }

    console.log('✅ تم جلب', data.items.length, 'ردود');

    repliesList.innerHTML = data.items.map(reply => {
      const authorInitial = (reply.ResponderFullName || '—').charAt(0);

      // 🟢 ترجمة الحالة المستهدفة للعربي (لو موجودة)
      const statusTextAr =
        reply.TargetStatusLabelAr ||
        translateStatusAr(reply.TargetStatusCode || '');

      // 🟢 استبدال أرقام الأقسام بأسمائها داخل نص الرد
      const prettyMessage = reply.Message ? localizeReplyMessage(reply.Message) : '';

      return `
        <div class="reply-card bg-gray-50 rounded-xl p-4 border border-gray-200 mb-3">
          <div class="reply-header flex items-start justify-between mb-3">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <span class="text-blue-600 font-semibold text-sm">${escapeHTML(authorInitial)}</span>
              </div>
              <div>
                <div class="author font-semibold text-gray-800">${escapeHTML(reply.ResponderFullName || '—')}</div>
                <div class="text-xs text-gray-500">موظف النظام</div>
              </div>
            </div>
            <div class="text-right">
              <div class="time text-xs text-gray-500">${escapeHTML(formatDateLocal(reply.CreatedAt))}</div>
              ${reply.ReplyTypeNameAr ? `
                <span class="inline-block px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 mt-1">
                  ${escapeHTML(reply.ReplyTypeNameAr)}
                </span>
              ` : ''}
            </div>
          </div>

          ${reply.TargetStatusCode ? `
            <div class="mb-2 text-xs">
              <span class="inline-block px-2 py-1 rounded bg-indigo-100 text-indigo-700">
                🔄 تحديث الحالة إلى: <span class="font-semibold">${escapeHTML(statusTextAr)}</span>
              </span>
            </div>
          ` : ''}

          <!-- 🚫 تمت إزالة شارة الرد الداخلي بناءً على طلبك -->

          ${prettyMessage ? `
            <div class="reply-body text-gray-700 text-sm leading-relaxed mb-3">${escapeHTML(prettyMessage)}</div>
          ` : `
            <div class="text-xs text-gray-500 italic">لا يوجد محتوى للرد</div>
          `}
          
          ${reply.attachments && reply.attachments.length > 0 ? `
            <div class="border-t border-gray-200 pt-3">
              <div class="text-xs text-gray-500 mb-2">المرفقات (${reply.attachments.length}):</div>
              <div class="flex flex-wrap gap-2">
                ${reply.attachments.map(file => {
                  const sizeKB = Math.round((file.FileSize || 0) / 1024);
                  return `
                    <a href="${file.FilePath}" target="_blank" rel="noopener" 
                       class="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded hover:bg-blue-200">
                      📎 ${escapeHTML(file.FileName)} (${sizeKB} KB)
                    </a>
                  `;
                }).join('')}
              </div>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

  } catch (error) {
    console.error('❌ خطأ في تحميل الردود:', error);
    repliesList.innerHTML = `
      <div class="text-center text-red-600 py-8">
        <div class="text-lg mb-2">⚠️</div>
        <div>حدث خطأ في تحميل الردود</div>
        <div class="text-sm mt-1">${escapeHTML(error.message)}</div>
      </div>
    `;
  }
}

// استدعاء التحميل عند فتح الصفحة
function loadReplies() {
  // تحميل الردود أولاً
  refreshReplies();
  
  // تحميل أنواع الردود عند الحاجة (عند فتح المودال)
  // loadReplyTypes(); // سيتم استدعاؤها عند فتح المودال
}

// دالة مساعدة لتنظيف HTML
function escapeHTML(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ====== إدارة تغيير حالة البلاغ ======

// متغيرات عامة
let currentComplaint = null;

// 1) تحميل الحالات من القاعدة (LabelAr)
async function loadStatuses() {
  const statusSelect = document.querySelector('#statusSelect');
  if (!statusSelect) return;

  const hid = window.currentHospitalId || document.body.dataset.hospitalId || ''; // تم حفظها عند تحميل التفاصيل
  const url = `${API_BASE_URL}/api/complaint-statuses${hid ? `?hospitalId=${encodeURIComponent(hid)}` : ''}`;

  try {
    console.log('🔍 جلب حالات البلاغات من:', url);
    
    // استخدام authHeaders() للحصول على التوكِن
    const headers = authHeaders();
    
    // التحقق من وجود التوكِن
    if (!headers.Authorization) {
      console.error('❌ التوكِن غير موجود - يجب تسجيل الدخول');
      statusSelect.innerHTML = '<option value="">يجب تسجيل الدخول أولاً</option>';
      return;
    }
    
    console.log('🔑 التوكِن موجود ✅');

    const res = await fetch(url, { 
      credentials: 'include', 
      headers: { 
        'Accept': 'application/json',
        ...headers 
      }
    });
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error('❌ خطأ في جلب الحالات:', errorText);
      throw new Error(`HTTP ${res.status}: ${errorText}`);
    }
    
    const data = await res.json();
    console.log('📊 API Response:', data);

    // تحقّق من النوع
    if (!Array.isArray(data)) {
      throw new Error('Unexpected payload (not an array)');
    }

    // حددي اللغة الحالية (افتراضي: عربي)
    const lang = (localStorage.getItem('lang') || 'ar').toLowerCase();

    // املئي القائمة
    statusSelect.innerHTML = '<option value="">اختر من قائمة الحالات</option>';
    
    if (data.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'لا توجد حالات متاحة';
      statusSelect.appendChild(opt);
      console.warn('⚠️ لا توجد حالات في قاعدة البيانات');
    } else {
      data.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.StatusCode;
        // السيرفر يرجّع: StatusCode, LabelAr, LabelEn
        const text = (lang === 'ar' ? s.LabelAr : (s.LabelEn || s.LabelAr)) || s.StatusCode;
        opt.textContent = text;
        statusSelect.appendChild(opt);
      });
      console.log('✅ تم تحميل', data.length, 'حالة');
    }

    // عيّني القيمة الحالية من بيانات البلاغ الموجودة
    if (currentComplaint?.status) {
      statusSelect.value = currentComplaint.status;
    }

  } catch (error) {
    console.error('❌ خطأ في تحميل الحالات:', error);
    statusSelect.innerHTML = '<option value="">خطأ في تحميل الحالات</option>';
  }
}

// 2) تطبيق التغيير
async function applyStatusChange() {
  console.log('🚀 applyStatusChange() تم استدعاؤها');
  
  const statusSelect = document.querySelector('#statusSelect');
  const noteInput = document.querySelector('#statusNote');
  const applyBtn = document.querySelector('#applyStatusBtn');
  const complaintId = window.currentComplaintId || document.body.dataset.complaintId;

  console.log('🔍 فحص العناصر:', {
    statusSelect: !!statusSelect,
    noteInput: !!noteInput,
    applyBtn: !!applyBtn,
    complaintId: complaintId
  });

  if (!statusSelect || !noteInput || !applyBtn || !complaintId) {
    console.error('❌ عناصر تغيير الحالة غير موجودة');
    alert('خطأ: عناصر النموذج غير موجودة');
    return;
  }

  const statusCode = statusSelect.value;
  const note = noteInput.value.trim();

  if (!statusCode) {
    alert('اختر الحالة الجديدة.');
    return;
  }

  // تعطيل الزر أثناء التحميل
  applyBtn.disabled = true;
  applyBtn.textContent = 'جاري التطبيق...';

  try {
    const hid = document.body.dataset.hospitalId || '';
    const putUrl = `${API_BASE_URL}/api/complaints/${complaintId}/status${hid ? ('?hospitalId=' + encodeURIComponent(hid)) : ''}`;
    
    const body = {
      statusCode: statusCode,
      note: note,
      hospitalId: hid || undefined
    };

    console.log('📤 إرسال تغيير الحالة:', body);
    console.log('🌐 URL:', putUrl);

    const authHeadersObj = authHeaders();
    const headers = { 'Content-Type': 'application/json', ...authHeadersObj };
    console.log('📋 Headers المرسلة:', headers);
    
    const res = await fetch(putUrl, {
      method: 'PUT',
      headers,
      credentials: 'include',
      body: JSON.stringify(body)
    });

    console.log('📥 استجابة الخادم:', res.status, res.statusText);

    const data = await res.json().catch(err => {
      console.error('❌ خطأ في تحليل JSON:', err);
      return { ok: false, message: 'استجابة غير صالحة من الخادم' };
    });
    
    console.log('📊 البيانات المستلمة:', data);
    
    if (!res.ok || !data.ok) {
      throw new Error(data.message || `HTTP ${res.status}`);
    }
    
    console.log('✅ تم تحديث الحالة بنجاح!');
    
    // حدّثي الشارة في أعلى الصفحة حسب الحالة الجديدة
    updateStatusBadge(statusCode);
    
    // إغلاق المودال
    const modal = document.querySelector('#changeStatusModal');
    if (modal) {
      modal.classList.add('hidden');
    }
    
    // مسح الحقول
    noteInput.value = '';
    
    // إعادة تحميل الردود (لإظهار الرد الداخلي إن أرسل note)
    await refreshReplies();
    
    // إعادة تحميل تفاصيل البلاغ
    await loadDetails();
    
    showToast('تم تحديث حالة البلاغ بنجاح ✅', 'success');
  } catch (error) {
    console.error('❌ خطأ في تحديث الحالة:', error);
    showToast('حدث خطأ أثناء تحديث الحالة', 'error');
  } finally {
    // إعادة تفعيل الزر
    applyBtn.disabled = false;
    applyBtn.textContent = 'تطبيق';
  }
}

// ====== إدارة تغيير مدة المعالجة ======
async function applyDurationChange() {
  const complaintId = window.currentComplaintId || document.body.dataset.complaintId;
  const hid = document.body.dataset.hospitalId || getParam('hospitalId') || getParam('hid') || '';
  const durationSelect = document.getElementById('newDuration');
  const noteInput = document.getElementById('durationNote');
  const applyBtn = document.getElementById('applyDurationBtn');

  if (!complaintId) {
    console.error('❌ لا يمكن تحديد معرف البلاغ لتغيير المدة');
    showToast('لا يمكن تحديد البلاغ. يرجى إعادة تحميل الصفحة.', 'error');
    return;
  }

  if (!durationSelect || !applyBtn) {
    console.error('❌ عناصر تغيير المدة غير متوفرة في الصفحة');
    alert('خطأ: عناصر تغيير المدة غير موجودة');
    return;
  }

  const newHours = durationSelect.value;
  const note = noteInput?.value?.trim() || '';

  if (!newHours) {
    alert('يرجى اختيار مدة جديدة');
    return;
  }

  applyBtn.disabled = true;
  applyBtn.textContent = 'جاري التحديث...';

  try {
    const url = `${API_BASE_URL}/api/complaints/${complaintId}/duration${hid ? `?hospitalId=${encodeURIComponent(hid)}` : ''}`;
    const headers = {
      'Content-Type': 'application/json',
      ...authHeaders()
    };

    if (!headers.Authorization) {
      throw new Error('مطلوب تسجيل الدخول. يرجى تسجيل الدخول مرة أخرى.');
    }

    const res = await fetch(url, {
      method: 'PUT',
      headers,
      credentials: 'include',
      body: JSON.stringify({
        ProcessingDurationHours: Number(newHours),
        Note: note || null
      })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok) {
      throw new Error(data.message || `HTTP ${res.status}`);
    }

    showToast('✅ تم تحديث مدة المعالجة بنجاح', 'success');

    const modal = document.getElementById('changeDurationModal');
    if (modal) {
      modal.classList.add('hidden');
    }

    if (durationSelect) durationSelect.value = '';
    if (noteInput) noteInput.value = '';

    await loadDetails();
  } catch (err) {
    console.error('❌ خطأ في تحديث المدة:', err);
    showToast('حدث خطأ أثناء تغيير المدة: ' + err.message, 'error');
  } finally {
    applyBtn.disabled = false;
    applyBtn.textContent = 'تطبيق';
  }
}

// دالة صغيرة لعرض الشارة بالعربي
function translateStatusAr(code) {
  // تحويل إلى lowercase للتعامل مع الحالات المختلفة (OPEN, open, Open)
  const lowerCode = (code || '').toLowerCase();
  
  switch (lowerCode) {
    case 'open':        return 'مفتوحة';
    case 'in_progress': return 'قيد المعالجة';
    case 'on_hold':     return 'معلقة';
    case 'closed':      return 'مغلقة';
    default:            return code || 'غير محددة';
  }
}

function updateStatusBadge(code, labelAr = null) {
  const badge = document.querySelector('[data-complaint-status]');
  if (badge) {
    // استخدم النص العربي من API إذا كان متوفراً، وإلا استخدم الترجمة المحلية
    const statusText = labelAr || translateStatusAr(code);
    badge.textContent = statusText;
    badge.className = `badge ${getStatusBadgeClass(code)}`;
  }
  
  // تحديث شارة الحالة في الرأس أيضاً
  const statusBadge = document.getElementById('dStatusBadge');
  if (statusBadge && labelAr) {
    statusBadge.innerHTML = `<span class="px-3 py-1 rounded-full text-sm font-semibold inline-flex items-center gap-2 ${getStatusBadgeClass(code)}">
      <span class="w-2 h-2 rounded-full ${getStatusBadgeDotColor(code)}"></span>${labelAr}
    </span>`;
  }
}

// دالة للحصول على ألوان الحالة
function getStatusBadgeClass(statusCode) {
  // تحويل إلى lowercase للتوافق مع جميع الحالات
  const lowerCode = (statusCode || '').toLowerCase();
  
  const statusMap = {
    'open': 'bg-blue-100 text-blue-600',
    'in_progress': 'bg-yellow-100 text-yellow-700',
    'on_hold': 'bg-yellow-100 text-yellow-700',
    'closed': 'bg-green-100 text-green-600',
    'critical': 'bg-red-100 text-red-600'
  };
  
  return statusMap[lowerCode] || 'bg-gray-100 text-gray-700';
}

// دالة للحصول على لون النقطة في الشارة
function getStatusBadgeDotColor(statusCode) {
  // تحويل إلى lowercase للتوافق مع جميع الحالات
  const lowerCode = (statusCode || '').toLowerCase();
  
  const statusMap = {
    'open': 'bg-blue-600',
    'in_progress': 'bg-yellow-600',
    'on_hold': 'bg-yellow-600',
    'closed': 'bg-green-600',
    'critical': 'bg-red-600'
  };
  
  return statusMap[lowerCode] || 'bg-gray-600';
}

// دالة لعرض الرسائل (Toast Notification)
function showToast(message, type = 'info') {
  // تحديد الألوان والأيقونات حسب النوع
  const config = {
    success: {
      bg: 'bg-green-500',
      icon: '✅',
      border: 'border-green-600'
    },
    error: {
      bg: 'bg-red-500',
      icon: '❌',
      border: 'border-red-600'
    },
    warning: {
      bg: 'bg-yellow-500',
      icon: '⚠️',
      border: 'border-yellow-600'
    },
    info: {
      bg: 'bg-blue-500',
      icon: 'ℹ️',
      border: 'border-blue-600'
    }
  }[type] || { bg: 'bg-gray-500', icon: '📌', border: 'border-gray-600' };

  // إنشاء عنصر التنبيه
  const toast = document.createElement('div');
  toast.className = `fixed top-6 right-6 ${config.bg} text-white px-6 py-4 rounded-xl shadow-2xl border-2 ${config.border} z-[9999] flex items-center gap-3 min-w-[300px] max-w-[500px] transition-all duration-300 transform translate-x-0 opacity-100`;
  toast.style.animation = 'slideIn 0.3s ease-out';
  
  toast.innerHTML = `
    <span class="text-2xl">${config.icon}</span>
    <span class="flex-1 font-medium">${message}</span>
    <button class="text-white/80 hover:text-white text-xl leading-none" onclick="this.parentElement.remove()">×</button>
  `;
  
  // إضافة الأنيميشن في CSS
  if (!document.getElementById('toast-animations')) {
    const style = document.createElement('style');
    style.id = 'toast-animations';
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(toast);
  
  // إزالة التنبيه بعد 4 ثوان مع أنيميشن
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease-in';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, 4000);
}

// ربط الأحداث عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
  console.log('🔧 ربط أحداث تغيير الحالة...');
  
  // ربط زر تطبيق تغيير الحالة
  const applyBtn = document.querySelector('#applyStatusBtn');
  if (applyBtn) {
    console.log('✅ تم العثور على زر التطبيق، جاري الربط...');
    applyBtn.addEventListener('click', applyStatusChange);
  } else {
    console.warn('⚠️ لم يتم العثور على #applyStatusBtn');
  }

  // ربط زر فتح مودال تغيير الحالة
  const btnChangeStatus = document.querySelector('#btnChangeStatus');
  if (btnChangeStatus) {
    console.log('✅ تم العثور على زر فتح المودال');
    btnChangeStatus.addEventListener('click', () => {
      console.log('🔍 فتح مودال تغيير الحالة...');
      const modal = document.querySelector('#changeStatusModal');
      if (modal) {
        modal.classList.remove('hidden');
        loadStatuses();
      }
    });
  } else {
    console.warn('⚠️ لم يتم العثور على #btnChangeStatus');
  }

  // ربط زر فتح مودال تغيير الأولوية
  const btnChangePriority = document.querySelector('#btnChangePriority');
  if (btnChangePriority) {
    btnChangePriority.addEventListener('click', () => {
      const modal = document.querySelector('#changePriorityModal');
      if (modal) {
        modal.classList.remove('hidden');
      }
    });
  }

  // ربط زر فتح مودال تغيير المدة
  const btnChangeDuration = document.querySelector('#btnChangeDuration');
  if (btnChangeDuration) {
    btnChangeDuration.addEventListener('click', () => {
      const modal = document.getElementById('changeDurationModal');
      if (modal) {
        modal.classList.remove('hidden');
      }
    });
  }

  const applyDurationBtn = document.getElementById('applyDurationBtn');
  if (applyDurationBtn) {
    applyDurationBtn.addEventListener('click', applyDurationChange);
  }

  // ربط أزرار اختيار الأولوية في المودال
  document.querySelectorAll('.priority-option').forEach(btn => {
    btn.addEventListener('click', async () => {
      const priorityCode = btn.dataset.priority;
      if (!priorityCode) return;

      // تعطيل الأزرار أثناء التحميل
      document.querySelectorAll('.priority-option').forEach(b => b.disabled = true);

      try {
        const complaintId = window.currentComplaintId || getParam('id');
        if (!complaintId) {
          throw new Error('معرف البلاغ غير موجود');
        }

        // ✅ جلب hospitalId من المتغيرات المتاحة
        const hid = window.currentHospitalId || 
                   document.body.dataset.hospitalId || 
                   getParam('hospitalId') || 
                   getParam('hid');
        
        if (!hid) {
          throw new Error('لا يمكن تحديد المستشفى. يرجى إعادة تحميل الصفحة.');
        }

        // ✅ استخدام authHeaders() لإضافة Authorization header
        const authHeadersObj = authHeaders();
        const headers = {
          'Content-Type': 'application/json',
          'X-Hospital-Id': String(hid), // ✅ إضافة hospitalId كـ header أيضاً
          ...authHeadersObj
        };

        // ✅ التحقق من وجود التوكن
        if (!authHeadersObj.Authorization) {
          throw new Error('مطلوب تسجيل الدخول. يرجى تسجيل الدخول مرة أخرى.');
        }

        // ✅ إضافة hospitalId إلى URL و body
        const url = `${API_BASE_URL}/api/complaints/${complaintId}/priority?hospitalId=${hid}`;
        console.log('🔗 URL التحديث:', url);
        console.log('🏥 HospitalID:', hid);

        const res = await fetch(url, {
          method: 'PUT',
          headers: headers,
          credentials: 'include',
          body: JSON.stringify({ 
            PriorityCode: priorityCode,
            HospitalID: hid // ✅ إضافة hospitalId في body أيضاً كـ fallback
          })
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
          throw new Error(data.message || 'فشل تحديث الأولوية');
        }

        // تحديث العرض مباشرة
        updatePriorityDisplay(priorityCode);

        // إغلاق المودال
        const modal = document.querySelector('#changePriorityModal');
        if (modal) {
          modal.classList.add('hidden');
        }

        // إعادة تحميل التفاصيل للتأكد من التحديث
        await loadDetails();

        // إظهار رسالة نجاح
        showToast('تم تحديث الأولوية بنجاح ✅', 'success');

      } catch (error) {
        console.error('❌ خطأ في تحديث الأولوية:', error);
        alert('فشل تحديث الأولوية: ' + error.message);
      } finally {
        // تفعيل الأزرار مرة أخرى
        document.querySelectorAll('.priority-option').forEach(b => b.disabled = false);
      }
    });
  });

  // ربط أزرار إغلاق المودال
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const modal = e.target.closest('.modal');
      if (modal) {
        modal.classList.add('hidden');
      }
    });
  });

  // إغلاق المودال عند الضغط خارجه
  const modal = document.querySelector('#changeStatusModal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.add('hidden');
      }
    });
  }

  // إغلاق مودال الأولوية عند الضغط خارجه
  const priorityModal = document.querySelector('#changePriorityModal');
  if (priorityModal) {
    priorityModal.addEventListener('click', (e) => {
      if (e.target === priorityModal) {
        priorityModal.classList.add('hidden');
      }
    });
  }

  const durationModal = document.querySelector('#changeDurationModal');
  if (durationModal) {
    durationModal.addEventListener('click', (e) => {
      if (e.target === durationModal) {
        durationModal.classList.add('hidden');
      }
    });
  }
});

// ربط إضافي للزر إذا لم يتم ربطه في DOMContentLoaded
window.addEventListener('load', () => {
  const applyBtn = document.querySelector('#applyStatusBtn');
  if (applyBtn && !applyBtn.onclick) {
    console.log('🔧 ربط متأخر لزر التطبيق...');
    applyBtn.addEventListener('click', applyStatusChange);
  }
});

// ====== إدارة حذف البلاغ ======

// فتح مودال الحذف
const btnDeleteComplaint = document.getElementById('btnDeleteComplaint');
const deleteModal = document.getElementById('deleteModal');
const cancelDelete = document.getElementById('cancelDelete');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
const confirmDelete = document.getElementById('confirmDelete');
const deleteReasonInput = document.getElementById('deleteReason');

if (btnDeleteComplaint) {
  btnDeleteComplaint.addEventListener('click', () => {
    // التحقق من أن البلاغ ليس محذوفاً مسبقاً
    if (currentComplaint?.IsDeleted === 1) {
      showToast('هذا البلاغ محذوف مسبقاً', 'error');
      return;
    }

    // فتح المودال
    if (deleteModal) {
      deleteModal.classList.remove('hidden');
      deleteReasonInput.value = '';
      deleteReasonInput.focus();
    }
  });
}

// إغلاق مودال الحذف
function closeDeleteModal() {
  if (deleteModal) {
    deleteModal.classList.add('hidden');
    deleteReasonInput.value = '';
  }
}

if (cancelDelete) {
  cancelDelete.addEventListener('click', closeDeleteModal);
}

if (cancelDeleteBtn) {
  cancelDeleteBtn.addEventListener('click', closeDeleteModal);
}

// إغلاق عند الضغط خارج المودال
if (deleteModal) {
  deleteModal.addEventListener('click', (e) => {
    if (e.target === deleteModal) {
      closeDeleteModal();
    }
  });
}

// تأكيد الحذف
if (confirmDelete) {
  confirmDelete.addEventListener('click', async () => {
    const ticket = getParam('ticket');
    
    if (!ticket) {
      showToast('لا يمكن تحديد رقم البلاغ', 'error');
      return;
    }

    // الحصول على ComplaintID من البيانات المحملة
    const complaintId = currentComplaint?.ComplaintID;
    
    if (!complaintId) {
      showToast('لا يمكن تحديد معرّف البلاغ', 'error');
      return;
    }

    // تعطيل الزر أثناء المعالجة
    confirmDelete.disabled = true;
    confirmDelete.textContent = 'جاري الحذف...';

    try {
      const reason = deleteReasonInput.value.trim();

      console.log('🗑️ حذف البلاغ:', {
        complaintId,
        ticket,
        reason
      });

      const res = await fetch(`${API_BASE_URL}/api/complaints/${complaintId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        },
        body: JSON.stringify({ deleteReason: reason || null })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${res.status}`);
      }

      const data = await res.json();
      console.log('✅ تم حذف البلاغ:', data);

      if (!data.success) {
        throw new Error(data.message || 'فشل حذف البلاغ');
      }

      // إغلاق المودال
      closeDeleteModal();

      // عرض رسالة نجاح
      showToast('تم حذف البلاغ بنجاح ✅', 'success');

      // الانتظار قليلاً ثم التوجيه
      setTimeout(() => {
        // التوجيه لصفحة سلة المحذوفات
        const hospitalId = currentComplaint?.HospitalID || data.data?.hospitalId;
        
        if (hospitalId) {
          // التوجيه لسلة المحذوفات للمستشفى
          window.location.href = `../../admin/admin-trash.html?hospitalId=${hospitalId}`;
        } else {
          // التوجيه لسجل البلاغات مع استعادة الفلاتر
          window.location.href = buildBackLink();
        }
      }, 1500);

    } catch (error) {
      console.error('❌ خطأ في حذف البلاغ:', error);
      showToast(`فشل حذف البلاغ: ${error.message}`, 'error');
      
      // إعادة تفعيل الزر
      confirmDelete.disabled = false;
      confirmDelete.textContent = 'حذف البلاغ';
    }
  });
}

// تعطيل زر الحذف إذا كان البلاغ محذوفاً مسبقاً
function checkComplaintDeletedStatus() {
  if (currentComplaint?.IsDeleted === 1 && btnDeleteComplaint) {
    btnDeleteComplaint.disabled = true;
    btnDeleteComplaint.title = 'البلاغ محذوف مسبقاً';
    btnDeleteComplaint.textContent = '🗑️ محذوف';
    btnDeleteComplaint.classList.remove('bg-rose-600', 'hover:bg-rose-700');
    btnDeleteComplaint.classList.add('bg-gray-400', 'cursor-not-allowed');
  }
}

// ====== إدارة تحويل البلاغات بين الأقسام ======

// تحميل الأقسام من قاعدة المستشفى
async function loadDepartmentsForTransfer() {
  const hid = Number(document.body.dataset.hospitalId);
  const currDeptId = Number(document.body.dataset.departmentId);

  if (!hid) {
    console.error('❌ Hospital ID غير متوفر');
    showToast('خطأ: لا يمكن تحديد المستشفى', 'error');
    return;
  }

  try {
    const url = `${API_BASE_URL}/api/departments?hospitalId=${hid}`;
    const res = await fetch(url, { headers: { ...authHeaders() } });
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    
    const data = await res.json();
    
    if (!data.ok) {
      throw new Error(data.message || 'خطأ في جلب الأقسام');
    }

    const targetSel = document.getElementById('deptTo');
    const currentTxt = document.getElementById('transferDepartmentCurrent');

    if (!targetSel) {
      console.warn('⚠️ عنصر deptTo غير موجود');
      return;
    }

    targetSel.innerHTML = '';
    let currentName = 'غير معروف';

    // البحث عن اسم القسم الحالي
    (data.items || []).forEach(dep => {
      if (dep.DepartmentID === currDeptId) {
        currentName = dep.NameAr || dep.NameEn || dep.Code;
      }
    });

    // تعبئة قائمة الأقسام الهدف (استبعاد القسم الحالي)
    (data.items || [])
      .filter(dep => dep.DepartmentID !== currDeptId)
      .forEach(dep => {
        const opt = document.createElement('option');
        opt.value = dep.DepartmentID;
        opt.textContent = dep.NameAr || dep.NameEn || dep.Code;
        targetSel.appendChild(opt);
      });

    // عرض اسم القسم الحالي
    if (currentTxt) {
      currentTxt.textContent = currentName;
    }

    console.log('✅ تم تحميل الأقسام:', data.items?.length || 0);

  } catch (error) {
    console.error('❌ خطأ في تحميل الأقسام:', error);
    showToast('خطأ في تحميل قائمة الأقسام: ' + error.message, 'error');
  }
}

// تنفيذ التحويل بين الأقسام
async function submitDepartmentTransfer() {
  const complaintId = Number(document.body.dataset.complaintId);
  const hid = Number(document.body.dataset.hospitalId);
  const fromDepartmentId = Number(document.getElementById('deptFrom')?.value);
  const toDepartmentId = Number(document.getElementById('deptTo')?.value);
  const note = document.getElementById('deptNote')?.value?.trim() || '';

  if (!complaintId) {
    showToast('خطأ: لا يمكن تحديد البلاغ', 'error');
    return;
  }

  if (!hid) {
    showToast('خطأ: لا يمكن تحديد المستشفى', 'error');
    return;
  }

  if (!fromDepartmentId || !toDepartmentId) {
    showToast('اختر القسمين', 'error');
    return;
  }

  if (fromDepartmentId === toDepartmentId) {
    showToast('القسم الهدف يجب أن يكون مختلفاً عن القسم الحالي', 'error');
    return;
  }

  try {
    const url = `${API_BASE_URL}/api/complaints/${complaintId}/transfer/department?hospitalId=${hid}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        ...authHeaders() 
      },
      body: JSON.stringify({ toDepartmentId, note })
    });

    const data = await res.json();
    
    if (!res.ok || !data.ok) {
      throw new Error(data.message || `HTTP ${res.status}`);
    }

    showToast('تم تحويل البلاغ إلى القسم الجديد ✅', 'success');
    
    // تحديث البيانات المحلية
    document.body.dataset.departmentId = String(toDepartmentId);
    
    // إعادة تحميل الأقسام
    await loadDepartmentsForTransfer();
    
    // إعادة تحميل تفاصيل البلاغ
    await loadDetails();
    
    // إعادة تحميل الردود
    await refreshReplies();
    
    // إغلاق المودال
    closeModals();

  } catch (error) {
    console.error('❌ خطأ في تحويل البلاغ:', error);
    showToast('خطأ في تحويل البلاغ: ' + error.message, 'error');
  }
}

// تنفيذ التحويل بين الموظفين
async function submitEmployeeTransfer() {
  const complaintId = Number(document.body.dataset.complaintId);
  const hid = Number(document.body.dataset.hospitalId);
  const fromUserId = Number(document.getElementById('empFrom')?.value || 0);
  const toUserId = Number(document.getElementById('empTo')?.value || 0);
  const note = document.getElementById('empNote')?.value?.trim() || '';

  if (!complaintId) {
    showToast('خطأ: لا يمكن تحديد البلاغ', 'error');
    return;
  }

  if (!hid) {
    showToast('خطأ: لا يمكن تحديد المستشفى', 'error');
    return;
  }

  if (!toUserId) {
    showToast('اختر الموظف الهدف', 'error');
    return;
  }

  if (fromUserId && fromUserId === toUserId) {
    showToast('اختر موظفًا مختلفًا', 'error');
    return;
  }

  try {
    // current assigned from complaint (قد يكون null)
    const currentAssignee = Number(currentComplaint?.AssignedToUserID || 0);
    // المختار من القائمة
    const selectedFrom = Number(document.getElementById('empFrom')?.value || 0);

    // لا نرسل fromUserId إلا إذا طابق الموظف المُسند فعلاً
    const safeFromUserId = currentAssignee && selectedFrom === currentAssignee
      ? selectedFrom
      : undefined;

    const payload = {
      fromUserId: safeFromUserId, // قد تكون undefined فتُحذف تلقائيًا
      toUserId,
      note
    };

    const url = `${API_BASE_URL}/api/complaints/${complaintId}/transfer/employee?hospitalId=${hid}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        ...authHeaders() 
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    
    if (!res.ok || !data.ok) {
      // تحسين رسائل الخطأ
      let errorMessage = data.message || `HTTP ${res.status}`;
      
      if (res.status === 409 && errorMessage.includes('fromUserId لا يطابق')) {
        errorMessage = 'لا يمكن تأكيد الموظف الحالي للبلاغ. تمت محاولة التحويل بدون التحقق من الموظف الحالي.';
      }
      
      throw new Error(errorMessage);
    }

    showToast('تم تحويل البلاغ بين الموظفين ✅', 'success');
    
    // تحديث البيانات المحلية
    if (currentComplaint) {
      currentComplaint.AssignedToUserID = toUserId;
    }
    
    // إعادة تحميل تفاصيل البلاغ
    await loadDetails();
    
    // إعادة تحميل الردود
    await refreshReplies();
    
    // إغلاق المودال
    closeModals();

  } catch (error) {
    console.error('❌ خطأ في تحويل البلاغ بين الموظفين:', error);
    showToast('خطأ في تحويل البلاغ: ' + error.message, 'error');
  }
}

// تحديث معالج التحويل بين الأقسام
function updateDepartmentTransferHandler() {
  const confirmTransferBtn = document.getElementById('confirmTransfer');
  
  if (confirmTransferBtn) {
    // إزالة المعالج القديم إذا كان موجوداً
    confirmTransferBtn.removeEventListener('click', handleOldTransfer);
    
    // إضافة المعالج الجديد
    confirmTransferBtn.addEventListener('click', async () => {
      const activeTab = document.querySelector('#transferModal .tab-btn[aria-selected="true"]')?.dataset.tab;
      
      if (activeTab === 'dept') {
        await submitDepartmentTransfer();
      } else if (activeTab === 'emp') {
        await submitEmployeeTransfer();
      } else if (activeTab === 'hosp') {
        // معالجة التحويل بين المستشفيات
        handleOtherTransfers(activeTab);
      } else {
        // معالجة التبويبات الأخرى (احتياط)
        handleOtherTransfers(activeTab);
      }
    });
  }
}

// معالجة التحويلات الأخرى (واجهة فقط)
async function handleOtherTransfers(activeTab) {
  const ticket = qs('dTicket').textContent.trim();
  const complaintId = window.currentComplaintId || document.body.dataset.complaintId || currentComplaint?.ComplaintID;

  if (activeTab === 'hosp') {
    const targetHospitalId = Number($('transferHospital').value);
    const note = $('transferNote').value.trim();
    
    if (!targetHospitalId) { 
      alert('يرجى اختيار المستشفى الهدف'); 
      return; 
    }

    if (!complaintId) {
      alert('خطأ: لا يمكن تحديد رقم البلاغ');
      return;
    }

    if (!confirm('هل أنت متأكد من تحويل البلاغ إلى المستشفى المحدد؟')) {
      return;
    }

    // ✅ التحقق من التوكن قبل الإرسال
    const token = localStorage.getItem('token') || localStorage.getItem('authToken');
    if (!token) {
      alert('⚠️ غير مسجل دخول، يرجى تسجيل الدخول أولاً');
      return;
    }

    console.log('🔑 [Transfer] التحقق من التوكن:', {
      hasToken: !!token,
      tokenPreview: token ? token.substring(0, 30) + '...' : 'none',
      API_BASE: API_BASE_URL
    });

    // عرض رسالة تحميل
    const confirmBtn = document.getElementById('confirmTransfer');
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'جاري التحويل...';
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/complaints/transfer-hospital`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`  // ✅ إضافة مباشرة للتوكن
        },
        credentials: 'include',
        body: JSON.stringify({ 
          complaintId: Number(complaintId), 
          targetHospitalId 
        })
      });

      console.log('📡 [Transfer] Response status:', res.status, res.statusText);

      const json = await res.json();

      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'تحويل';
      }

      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'فشل تحويل البلاغ');
      }

      // نجاح التحويل (فوري)
      alert(`✅ ${json.message || 'تم تحويل البلاغ بنجاح إلى المستشفى الجديد'}`);
      
      // إغلاق المودال
      closeModals();
      
      // إعادة توجيه إلى صفحة البلاغات بعد ثانية واحدة مع استعادة الفلاتر
      setTimeout(() => {
        window.location.href = buildBackLink();
      }, 1000);

    } catch (error) {
      console.error('❌ خطأ في التحويل بين المستشفيات:', error);
      alert('تعذر تحويل البلاغ: ' + error.message);
    }
  } else if (activeTab === 'emp') {
    const deptId = Number($('empDept').value);
    const fromEmp = Number($('empFrom').value);
    const toEmp = Number($('empTo').value);
    const note = $('empNote').value.trim();
    if (!deptId || !fromEmp || !toEmp || fromEmp === toEmp) { 
      alert('اختر موظفين مختلفين ضمن نفس القسم.'); 
      return; 
    }
    alert('تم التحويل بين الموظفين (واجهة).');
  }

  closeModals();
}

// معالج التحويل القديم (للتوافق)
function handleOldTransfer() {
  // هذا المعالج القديم سيتم استبداله
}

// تحديث معالج فتح مودال التحويل
function updateTransferModalHandler() {
  const btnTransfer = document.getElementById('btnTransfer');
  
  if (btnTransfer) {
    btnTransfer.addEventListener('click', () => {
      // حددي التبويب الافتراضي حسب الصلاحيات
      const canDept = !!window.__canTransferDept;
      const canEmp  = !!window.__canTransferUser;

      if (!canDept && !canEmp) {
        // احتياط: لو وصلنا هنا بدون صلاحيات، لا نفتح المودال
        return;
      }

      // اضبطي ظهور أزرار التبويب (احتياط إضافي)
      const tabDeptBtn = document.getElementById('tabDeptBtn');
      const tabEmpBtn  = document.getElementById('tabEmpBtn');
      const tabHospBtn = document.getElementById('tabHospBtn');
      if (tabDeptBtn) tabDeptBtn.style.display = canDept ? '' : 'none';
      if (tabEmpBtn)  tabEmpBtn.style.display  = canEmp  ? '' : 'none';
      // التبويب الثالث (المستشفيات) ظاهر للجميع مبدئياً للاختبار

      // اختاري التبويب الافتراضي المتاح
      const defaultTab = canDept ? 'dept' : 'emp';
      setActiveTab(defaultTab);
      
      // تحميل الأقسام
      populateDeptMove();
      
      // تعبئة التبويبات الأخرى (واجهة فقط)
      populateHospitals(); // تعبئة قائمة المستشفيات
      populateEmpMove();
      
       // تفعيل أزرار التبويب
       document.querySelectorAll('#transferModal .tab-btn').forEach(btn => {
         btn.onclick = () => {
           // امنعي الانتقال لتبويب غير مسموح به
           const t = btn.dataset.tab;
           if ((t === 'dept' && !canDept) || (t === 'emp' && !canEmp)) return;
           setActiveTab(t);
         };
       });
       
       openModal($('transferModal'));
     });
   }
 }

// ✅ دالة عرض المرفقات
function renderAttachments(attachments) {
  const box = document.getElementById('dAttachments');
  if (!box) {
    console.warn('⚠️ عنصر dAttachments غير موجود');
    return;
  }
  
  if (!attachments || attachments.length === 0) {
    box.innerHTML = '<div class="text-gray-500 text-sm">لا توجد مرفقات.</div>';
    return;
  }
  
  box.innerHTML = `
    <div class="space-y-2">
      ${attachments.map(attachment => {
        // إصلاح الرابط ليشير إلى السيرفر الصحيح
        const fileUrl = attachment.url.startsWith('/') 
          ? `http://localhost:3001${attachment.url}` 
          : attachment.url;
        
        return `
        <div class="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
          <span class="text-blue-600">📎</span>
          <a class="text-blue-600 hover:underline flex-1" 
             href="${fileUrl}" 
             target="_blank" 
             rel="noopener">
            ${attachment.name}
          </a>
        </div>
      `;
      }).join('')}
    </div>
  `;
  
  console.log('✅ تم عرض المرفقات:', attachments.length);
}

// تحديث معالج التبويبات
function setActiveTab(tab) {
  // أزرار
  document.querySelectorAll('#transferModal .tab-btn').forEach(btn => {
    const active = btn.dataset.tab === tab;
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
    btn.classList.toggle('bg-indigo-600', active);
    btn.classList.toggle('text-white', active);
    btn.classList.toggle('bg-gray-100', !active);
    btn.classList.toggle('text-gray-700', !active);
  });
  
  // لوحات
  ['hosp', 'dept', 'emp'].forEach(t => {
    const pane = document.getElementById(`pane-${t}`);
    if (pane) {
      pane.classList.toggle('hidden', t !== tab);
    }
  });
}

// ربط الأحداث عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
  // تحديث معالجات التحويل
  updateDepartmentTransferHandler();
  updateTransferModalHandler();
  
  console.log('✅ تم ربط معالجات تحويل الأقسام');
});

