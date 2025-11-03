// mystery-details.js
const API_BASE = 'http://localhost:3001';

// متغيرات عامة
let currentMysteryId = null;
let currentData = null;
let token = null;
let replyTypes = [];
let complaintStatuses = [];
let perms = {}; // صلاحيات المستخدم

// كشف مدير التجمع
function isClusterAdmin() {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const userData = JSON.parse(localStorage.getItem('userData') || '{}');
    return !!(user.isClusterManager || user.roleId === 1 || user.RoleID === 1 ||
              userData.isClusterManager || userData.roleId === 1 || userData.RoleID === 1);
  } catch {
    return false;
  }
}

// ✅ دالة موحّدة لإيجاد hospitalId (حتى لمدير التجمع)
function effectiveHospitalId() {
  const urlParams = new URLSearchParams(location.search);
  const urlHospId = Number(urlParams.get('hospitalId') || urlParams.get('hid') || 0);
  const dsHospId  = Number(document.body?.dataset?.hospitalId || 0);
  const dataHosp  = currentData?.HospitalID ? Number(currentData.HospitalID) : 0;
  const winHosp   = Number(window.currentHospitalId || 0);
  const ud        = JSON.parse(localStorage.getItem('userData') || '{}');
  const userHosp  = Number(ud.HospitalID || ud.hospitalId || ud.hid || 0);
  const lastFromList = Number(localStorage.getItem('mystery:lastHospitalId') || 0);
  return urlHospId || dsHospId || dataHosp || winHosp || userHosp || lastFromList || null;
}

// ✅ دالة انتظار حتى يتوفر hospitalId (مع timeout)
async function waitForHospitalId(timeoutMs = 3000) {
  const start = Date.now();
  while (!effectiveHospitalId()) {
    if (Date.now() - start > timeoutMs) break;
    await new Promise(r => setTimeout(r, 50));
  }
  return effectiveHospitalId();
}

// تحميل صلاحيات المستخدم
async function loadMyPerms(){
  try{
    const hospitalId = getHospitalIdFromClient();
    const url = hospitalId && !isClusterAdmin() 
      ? `${API_BASE}/api/permissions/me?hospitalId=${hospitalId}`
      : `${API_BASE}/api/permissions/me`;
    
    const res = await fetch(url, { 
      credentials:'include', 
      headers: { 'Authorization': `Bearer ${token}` } 
    });
    const json = res.ok ? await res.json() : {data:{}};
    perms = json.data || {};
  }catch(_){ 
    perms = {}; 
  }
}

// تطبيق قواعد الواجهة حسب الصلاحيات
function applyUIRules(){
  // مدير التجمع (RoleID = 1) يرى كل شيء بدون قيود
  const isCentralAdmin = perms.adminPanel && !perms.hospitalCreate; // مدير التجمع المركزي
  
  if (isCentralAdmin) {
    // مدير التجمع يرى جميع الأزرار
    document.getElementById('btnReply')?.classList.remove('hidden');
    document.getElementById('btnChangeStatus')?.classList.remove('hidden');
    document.getElementById('btnTransfer')?.classList.remove('hidden');
    document.getElementById('btnDeleteComplaint')?.classList.remove('hidden');
    return;
  }
  
  // إخفاء الأزرار حسب الصلاحية للمستخدم العادي
  if(!perms.mysteryReplyAdd)    document.getElementById('btnReply')?.classList.add('hidden');
  if(!perms.mysteryStatusUpdate)document.getElementById('btnChangeStatus')?.classList.add('hidden');
  if(!perms.mysteryTransferDept && !perms.mysteryTransferEmp) document.getElementById('btnTransfer')?.classList.add('hidden');
  if(!perms.mysteryDelete)      document.getElementById('btnDeleteComplaint')?.classList.add('hidden');
}

// تهيئة الصفحة
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // الحصول على التوكن
    token = localStorage.getItem('token') || localStorage.getItem('authToken');
    if (!token) {
      console.error('No token found');
      window.location.href = '../../../index/login.html';
      return;
    }

    // الحصول على معرف التقييم من URL
    const urlParams = new URLSearchParams(window.location.search);
    currentMysteryId = urlParams.get('id');
    
    if (!currentMysteryId) {
      console.error('No mystery ID provided');
      showError('لم يتم تحديد معرف التقييم');
      return;
    }

    // تحميل الصلاحيات أولاً
    await loadMyPerms();
    
    // فحص صلاحية العرض
    const isCentralAdmin = perms.adminPanel && !perms.hospitalCreate; // مدير التجمع المركزي
    if (!isCentralAdmin && !perms.mysteryView) {
      showError('لا تملك صلاحية عرض تفاصيل التقييم');
      setTimeout(() => window.location.href = '../mystery-complaints.html', 2000);
      return;
    }
    
    // تحميل بيانات التقييم
    await loadMysteryDetails();
    
    // 🔒 انتظر حتى يتوفر hospitalId المستخرج من تفاصيل التقييم
    await waitForHospitalId();
    console.log('✅ hospitalId متوفر الآن:', effectiveHospitalId());
    
    // الآن بقية الطلبات تعتمد على hid ولن تُفشل
    await loadReplyTypes();
    await loadComplaintStatuses();
    await loadResponses();
    
    // تطبيق قواعد الواجهة
    applyUIRules();
    
    // ربط الأحداث
    bindEvents();
    
  } catch (error) {
    console.error('Error initializing page:', error);
    showError('حدث خطأ أثناء تحميل الصفحة');
  }
});

// التحقق من وجود السجل قبل تحميله
async function validateMysteryExists() {
  try {
    // ✅ استخدام effectiveHospitalId() - قد يكون null في أول مرة
    const hid = effectiveHospitalId();
    let url = `${API_BASE}/api/mystery-complaints/${currentMysteryId}/exists`;
    if (hid) url += `?hospitalId=${hid}`;
    console.log('🔍 Validating mystery exists:', url);

    const response = await fetch(url, { headers: authHeaders() });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    
    if (!data.exists) {
      showError(`التقييم رقم ${currentMysteryId} غير موجود. أقصى رقم متاح: ${data.maxId}`, {
        type: 'warning',
        actions: [
          {
            text: 'عرض آخر تقييم',
            action: () => {
              window.location.href = `detail.html?id=${data.maxId}`;
            }
          },
          {
            text: 'العودة للقائمة',
            action: () => {
              window.location.href = 'mystery-complaints.html';
            }
          }
        ]
      });
      
      throw new Error(`Mystery ID ${currentMysteryId} not found. Max available: ${data.maxId}`);
    }
    
    console.log('✅ Mystery validation passed');
  } catch (error) {
    console.error('❌ Mystery validation failed:', error);
    throw error;
  }
}

// تحميل تفاصيل التقييم
async function loadMysteryDetails() {
  try {
    // أولاً: التحقق من وجود السجل
    await validateMysteryExists();

    // ✅ استخدام effectiveHospitalId() - قد يكون null في أول مرة وسنستخرجه من البيانات
    const hid = effectiveHospitalId();
    let url = `${API_BASE}/api/mystery-complaints/${currentMysteryId}`;
    if (hid) url += `?hospitalId=${hid}`;
    console.log('🔍 Loading mystery details:', url);

    const response = await fetch(url, { headers: authHeaders() });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log('📊 Mystery details response:', data);

    if (!data) {
      throw new Error('التقييم غير موجود');
    }

    // ✅ استخراج hospitalId من البيانات وحفظه دائماً
    if (data.HospitalID) {
      document.body.dataset.hospitalId = data.HospitalID;
      window.currentHospitalId = data.HospitalID;
      console.log('✅ [loadMysteryDetails] تم استخراج hospitalId من البيانات:', data.HospitalID);
    }

    currentData = data;
    
    console.log('🔍 [loadMysteryDetails] تم حفظ البيانات الحالية:', {
      MysteryID: data.MysteryID,
      DepartmentID: data.DepartmentID,
      HospitalID: data.HospitalID,
      Status: data.Status
    });
    
    populateDetails(currentData);
    
  } catch (error) {
    console.error('Error loading mystery details:', error);
    showError(`فشل في تحميل تفاصيل التقييم: ${error.message}`);
  }
}

// ملء تفاصيل التقييم في الواجهة
function populateDetails(data) {
  try {
    // الهيدر الرئيسي
    document.getElementById('dTicket').textContent = data.TicketNumber || `MS-${data.MysteryID}`;
    
    // شارات الحالة والأولوية
    updateStatusBadge(data.Status);
    updatePriorityBadge(data.Priority);
    
    // بيانات المستشفى
    document.getElementById('uiHospitalName').textContent = data.HospitalName || 'غير محدد';
    document.getElementById('uiDepartmentName').textContent = data.DepartmentName || 'غير محدد';
    document.getElementById('dTicketNumber').textContent = data.TicketNumber || '-';
    
    // الفترة
    const periodFrom = data.PeriodFrom ? new Date(data.PeriodFrom).toLocaleDateString('ar-SA') : '-';
    const periodTo = data.PeriodTo ? new Date(data.PeriodTo).toLocaleDateString('ar-SA') : '-';
    document.getElementById('dPeriod').textContent = `${periodFrom} - ${periodTo}`;
    
    // معلومات التقييم
    document.getElementById('dDomain').textContent = data.DomainAr || data.DomainEn || 'غير محدد';
    document.getElementById('dQuestion').textContent = data.QuestionAr || data.QuestionEn || 'غير محدد';
    
    // التقييم والأولوية
    const score = data.MeanScore !== null ? Number(data.MeanScore).toFixed(2) : (data.Score || '-');
    document.getElementById('dScore').textContent = score;
    document.getElementById('dPriority').textContent = getPriorityText(data.Priority);
    
    // التواريخ
    document.getElementById('dCreated').textContent = data.CreatedAt ? new Date(data.CreatedAt).toLocaleString('ar-SA') : '-';
    document.getElementById('dUpdated').textContent = data.UpdatedAt ? new Date(data.UpdatedAt).toLocaleString('ar-SA') : '-';
    
    // التعليق الإضافي
    if (data.Comment && data.Comment.trim()) {
      document.getElementById('dComment').textContent = data.Comment;
      document.getElementById('commentSection').style.display = 'block';
    }
    
    // بيانات الملف المصدر
    document.getElementById('dSourceFile').textContent = data.SourceFile || 'غير محدد';
    document.getElementById('dImportedAt').textContent = data.CreatedAt ? new Date(data.CreatedAt).toLocaleString('ar-SA') : '-';
    document.getElementById('dImportedBy').textContent = data.CreatedByUserName || 'نظام';
    document.getElementById('dUniqueKey').textContent = data.UniqueKey ? data.UniqueKey.substring(0, 16) + '...' : '-';
    
    // معلومات الإنشاء والمسؤولية
    document.getElementById('uiCreatedByName').textContent = data.CreatedByUserName || 'نظام';
    document.getElementById('uiAssignedToName').textContent = data.AssignedToUserName || 'غير مُسند';
    
    // إنشاء الخط الزمني
    createTimeline(data);
    
  } catch (error) {
    console.error('Error populating details:', error);
    showError('حدث خطأ أثناء عرض التفاصيل');
  }
}

// تحديث شارة الحالة (نفس منطق البلاغات العادية)
function updateStatusBadge(statusCode, labelAr = null) {
  const badge = document.querySelector('[data-complaint-status]');
  if (badge) {
    const statusText = labelAr || translateStatusAr(statusCode);
    badge.textContent = statusText;
    badge.className = `badge ${getStatusBadgeClass(statusCode)}`;
  }
  
  // تحديث شارة الحالة في الرأس أيضاً
  const statusBadge = document.getElementById('dStatusBadge');
  if (statusBadge) {
    const statusText = labelAr || translateStatusAr(statusCode);
    const statusColor = getStatusBadgeClass(statusCode);
    statusBadge.innerHTML = `
      <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor}">
        ${statusText}
      </span>
    `;
  }
}

// ترجمة رمز الحالة إلى نص عربي
function translateStatusAr(code) {
  const lowerCode = (code || '').toLowerCase();
  
  switch (lowerCode) {
    case 'open':        return 'مفتوحة';
    case 'in_progress': return 'قيد المعالجة';
    case 'on_hold':     return 'معلقة';
    case 'closed':      return 'مغلقة';
    case 'critical':    return 'حرجة';
    default:            return code || 'غير محددة';
  }
}

// الحصول على كلاس CSS لشارة الحالة
function getStatusBadgeClass(statusCode) {
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

// تحديث شارة الأولوية
function updatePriorityBadge(priority) {
  const badge = document.getElementById('dPriorityBadge');
  const priorityText = getPriorityText(priority);
  const priorityColor = getPriorityColor(priority);
  
  badge.innerHTML = `
    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${priorityColor}">
      ${priorityText}
    </span>
  `;
}

// إنشاء الخط الزمني
function createTimeline(data) {
  const timeline = document.getElementById('dTimeline');
  const events = [];
  
  // حدث الإنشاء
  events.push({
    date: data.CreatedAt,
    title: 'تم إنشاء التقييم',
    description: `تم إنشاء التقييم بواسطة ${data.CreatedByUserName || 'النظام'}`,
    type: 'create'
  });
  
  // حدث آخر تحديث
  if (data.UpdatedAt && data.UpdatedAt !== data.CreatedAt) {
    events.push({
      date: data.UpdatedAt,
      title: 'تم تحديث التقييم',
      description: 'تم تحديث معلومات التقييم',
      type: 'update'
    });
  }
  
  // ترتيب الأحداث حسب التاريخ
  events.sort((a, b) => new Date(b.date) - new Date(a.date));
  
  // عرض الأحداث
  timeline.innerHTML = events.map(event => `
    <li class="flex items-start space-x-reverse space-x-3">
      <div class="flex-shrink-0 w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
      <div class="flex-1 min-w-0">
        <div class="text-sm font-medium text-gray-900">${event.title}</div>
        <div class="text-sm text-gray-500">${event.description}</div>
        <div class="text-xs text-gray-400 mt-1">${new Date(event.date).toLocaleString('ar-SA')}</div>
      </div>
    </li>
  `).join('');
}

// ربط الأحداث
function bindEvents() {
  // مدير التجمع (RoleID = 1) يرى كل شيء بدون قيود
  const isCentralAdmin = perms.adminPanel && !perms.hospitalCreate; // مدير التجمع المركزي
  
  // زر إضافة تعليق
  document.getElementById('btnReply')?.addEventListener('click', () => {
    if(!isCentralAdmin && !perms.mysteryReplyAdd){ 
      return alert('لا تملك صلاحية إضافة تعليق'); 
    }
    showReplyModal();
  });
  
  // زر تغيير الحالة
  document.getElementById('btnChangeStatus')?.addEventListener('click', () => {
    if(!isCentralAdmin && !perms.mysteryStatusUpdate){ 
      return alert('لا تملك صلاحية تغيير الحالة'); 
    }
    showStatusModal();
  });
  
  // زر التحويل
  document.getElementById('btnTransfer')?.addEventListener('click', () => {
    if(!isCentralAdmin && !(perms.mysteryTransferDept || perms.mysteryTransferEmp)){ 
      return alert('لا تملك صلاحية التحويل'); 
    }
    showTransferModal();
  });
  
  // زر حذف التقييم
  document.getElementById('btnDeleteComplaint')?.addEventListener('click', () => {
    if(!isCentralAdmin && !perms.mysteryDelete){ 
      return alert('لا تملك صلاحية الحذف'); 
    }
    showDeleteModal();
  });
  
  // إغلاق المودالات
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', closeAllModals);
  });
  
  // إغلاق المودال عند الضغط على الخلفية
  const overlay = document.getElementById('modalOverlay');
  if (overlay) {
    overlay.addEventListener('click', closeAllModals);
  }
  
  // إغلاق المودال بمفتاح Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllModals();
    }
  });
  
  // زر حفظ التعليق
  document.getElementById('saveReply')?.addEventListener('click', saveReply);
  
  // زر تطبيق الحالة
  document.getElementById('applyStatusBtn')?.addEventListener('click', applyStatus);
  
  // زر تأكيد الحذف
  document.getElementById('confirmDelete')?.addEventListener('click', confirmDelete);
}

// عرض مودال التعليق
function showReplyModal() {
  document.getElementById('replyModal').classList.remove('hidden');
  document.getElementById('modalOverlay').classList.remove('hidden');
}

// عرض مودال تغيير الحالة (نفس منطق البلاغات العادية)
function showStatusModal() {
  console.log('🔍 فتح مودال تغيير الحالة...');
  const modal = document.querySelector('#changeStatusModal');
  if (modal) {
    modal.classList.remove('hidden');
    loadComplaintStatuses();
  }
}

// عرض مودال الحذف
function showDeleteModal() {
  document.getElementById('deleteModal').classList.remove('hidden');
}

// عرض مودال التحويل
function showTransferModal() {
  document.getElementById('transferModal').classList.remove('hidden');
  document.getElementById('modalOverlay').classList.remove('hidden');
  
  // تحميل بيانات التحويل
  loadTransferData();
}

// إغلاق جميع المودالات
function closeAllModals() {
  // إغلاق مودال التعليق
  const replyModal = document.getElementById('replyModal');
  if (replyModal) {
    replyModal.classList.add('hidden');
    // إعادة تعيين نموذج التعليق
    resetReplyForm();
  }
  
  // إغلاق مودال التحويل
  const transferModal = document.getElementById('transferModal');
  if (transferModal) {
    transferModal.classList.add('hidden');
  }
  
  // إغلاق المودالات الأخرى
  document.querySelectorAll('.modal').forEach(modal => {
    modal.classList.add('hidden');
  });
  
  // إخفاء الخلفية
  const overlay = document.getElementById('modalOverlay');
  if (overlay) {
    overlay.classList.add('hidden');
  }
}

// إعادة تعيين نموذج التعليق
function resetReplyForm() {
  const replyType = document.getElementById('replyType');
  const replyText = document.getElementById('replyText');
  const replyFiles = document.getElementById('replyFiles');
  
  if (replyType) replyType.value = '';
  if (replyText) replyText.value = '';
  if (replyFiles) replyFiles.value = '';
}

// تحميل أنواع الردود
async function loadReplyTypes() {
  try {
    // ✅ استخدام effectiveHospitalId() وإضافة hospitalId دائماً إذا توفر
    const hid = effectiveHospitalId();
    let url = `${API_BASE}/api/reply-types?active=1`;
    if (hid) url += `&hospitalId=${hid}`;
    
    const response = await fetch(url, {
      headers: authHeaders()
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    replyTypes = data.items || [];
    
    // تحديث قائمة أنواع الردود في المودال
    updateReplyTypesSelect();
    
  } catch (error) {
    console.error('Error loading reply types:', error);
    // استخدام قائمة افتراضية في حالة الفشل
    replyTypes = [
      { ReplyTypeID: 1, NameAr: 'تحديث الحالة', NameEn: 'Status Update' },
      { ReplyTypeID: 2, NameAr: 'متابعة', NameEn: 'Follow-up' },
      { ReplyTypeID: 3, NameAr: 'حل المشكلة', NameEn: 'Resolution' },
      { ReplyTypeID: 4, NameAr: 'معلومات إضافية', NameEn: 'Additional Information' },
      { ReplyTypeID: 5, NameAr: 'طلب توضيح', NameEn: 'Clarification Request' },
      { ReplyTypeID: 6, NameAr: 'تصعيد', NameEn: 'Escalation' }
    ];
    updateReplyTypesSelect();
  }
}

// تحميل حالات البلاغ (نفس منطق البلاغات العادية)
async function loadComplaintStatuses() {
  const statusSelect = document.querySelector('#statusSelect');
  if (!statusSelect) return;

  // ✅ استخدام effectiveHospitalId() وإضافة hospitalId دائماً إذا توفر
  const hid = effectiveHospitalId();
  let url = `${API_BASE}/api/complaint-statuses`;
  if (hid) url += `?hospitalId=${hid}`;

  try {
    console.log('🔍 جلب حالات البلاغات من:', url);
    
    const headers = authHeaders();
    
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

    if (!Array.isArray(data)) {
      throw new Error('Unexpected payload (not an array)');
    }

    const lang = (localStorage.getItem('lang') || 'ar').toLowerCase();

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
        const text = (lang === 'ar' ? s.LabelAr : (s.LabelEn || s.LabelAr)) || s.StatusCode;
        opt.textContent = text;
        statusSelect.appendChild(opt);
      });
      console.log('✅ تم تحميل', data.length, 'حالة');
    }

    // تحديد الحالة الحالية
    if (currentData?.Status) {
      statusSelect.value = currentData.Status;
    }

  } catch (error) {
    console.error('❌ خطأ في تحميل الحالات:', error);
    statusSelect.innerHTML = '<option value="">خطأ في تحميل الحالات</option>';
  }
}

// تحميل الردود الموجودة (مع retry ذكي)
async function loadResponses() {
  async function doFetch() {
    const hid = effectiveHospitalId();
    let url = `${API_BASE}/api/mystery-complaints/${currentMysteryId}/responses`;
    if (hid) url += `?hospitalId=${hid}`;
    return fetch(url, { headers: authHeaders() });
  }

  try {
    let res = await doFetch();
    
    // 🔄 لو رجع 400 لأن hospitalId ناقص، انتظر/ثبت الـhid ثم أعد المحاولة مرة واحدة
    if (res.status === 400) {
      const txt = await res.text().catch(() => '');
      if (/hospitalId/i.test(txt) || /hospital id/i.test(txt)) {
        console.warn('⚠️ 400 بسبب hospitalId - إعادة المحاولة بعد الانتظار...');
        // انتظر استخراج الـhid من تفاصيل التقييم (لو كان لسه ما ثبت)
        await waitForHospitalId();
        res = await doFetch();
      } else {
        throw new Error(`HTTP 400: ${txt}`);
      }
    }
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    
    const data = await res.json();
    displayResponses(data.items || []);
    
  } catch (error) {
    console.error('Error loading responses:', error);
    showError('فشل في تحميل الردود');
  }
}

// عرض الردود
function displayResponses(responses) {
  const container = document.getElementById('repliesList');
  
  if (!responses || responses.length === 0) {
    container.innerHTML = `
      <div class="text-center text-gray-500 py-8">
        <div class="text-lg mb-2">💬</div>
        <div>لا توجد تعليقات بعد</div>
        <div class="text-sm mt-1">كن أول من يعلق على هذا التقييم</div>
      </div>
    `;
    return;
  }
  
  container.innerHTML = responses.map(response => `
    <div class="bg-gray-50 rounded-lg p-4 border border-gray-200">
      <div class="flex items-start justify-between mb-2">
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium text-gray-900">${response.ResponderFullName || 'مستخدم'}</span>
          <span class="text-xs text-gray-500">•</span>
          <span class="text-xs text-gray-500">${new Date(response.CreatedAt).toLocaleString('ar-SA')}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full">
            ${response.ReplyTypeNameAr || response.ReplyTypeNameEn || 'تعليق'}
          </span>
          ${response.IsInternal ? '<span class="text-xs px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full">داخلي</span>' : ''}
        </div>
      </div>
      
      <div class="text-gray-700 text-sm leading-relaxed mb-3">
        ${response.Message}
      </div>
      
      ${response.attachments && response.attachments.length > 0 ? `
        <div class="mt-3 pt-3 border-t border-gray-200">
          <div class="text-xs text-gray-500 mb-2">المرفقات:</div>
          <div class="flex flex-wrap gap-2">
            ${response.attachments.map(att => `
              <a href="${API_BASE}${att.FilePath}" target="_blank" 
                 class="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-1 rounded">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/>
                </svg>
                ${att.FileName}
              </a>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `).join('');
}

// تحديث قائمة أنواع الردود
function updateReplyTypesSelect() {
  const select = document.getElementById('replyType');
  select.innerHTML = '<option value="">اختر نوع التعليق</option>';
  
  replyTypes.forEach(type => {
    const option = document.createElement('option');
    option.value = type.ReplyTypeID;
    option.textContent = type.NameAr || type.NameEn;
    select.appendChild(option);
  });
}



// حفظ التعليق
async function saveReply() {
  const isCentralAdmin = perms.adminPanel && !perms.hospitalCreate; // مدير التجمع المركزي
  if(!isCentralAdmin && !perms.mysteryReplyAdd) return alert('لا تملك صلاحية إضافة تعليق');
  
  try {
    const replyType = document.getElementById('replyType').value;
    const replyText = document.getElementById('replyText').value.trim();
    const files = document.getElementById('replyFiles').files;
    
    if (!replyText) {
      alert('الرجاء إدخال نص التعليق');
      return;
    }
    
    if (!replyType) {
      alert('الرجاء اختيار نوع التعليق');
      return;
    }
    
    // إعداد البيانات
    const formData = new FormData();
    formData.append('ReplyTypeID', replyType);
    formData.append('Message', replyText);
    formData.append('IsInternal', '0'); // افتراضياً عام
    
    // إضافة المرفقات
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }
    
    // ✅ استخدام effectiveHospitalId() وإضافة hospitalId دائماً إذا توفر
    const hid = effectiveHospitalId();
    let url = `${API_BASE}/api/mystery-complaints/${currentMysteryId}/responses`;
    if (hid) url += `?hospitalId=${hid}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: authHeaders(),
      body: formData
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.ok) {
    alert('تم حفظ التعليق بنجاح');
    closeAllModals();
      
      // إعادة تحميل الردود
      await loadResponses();
      
      // إعادة تحميل تفاصيل التقييم إذا تم تحديث الحالة
      if (result.statusUpdated) {
        await loadMysteryDetails();
      }
    } else {
      throw new Error(result.message || 'فشل في حفظ التعليق');
    }
    
  } catch (error) {
    console.error('Error saving reply:', error);
    alert(`فشل في حفظ التعليق: ${error.message}`);
  }
}

// تطبيق تغيير الحالة (نفس منطق البلاغات العادية)
async function applyStatus() {
  const isCentralAdmin = perms.adminPanel && !perms.hospitalCreate; // مدير التجمع المركزي
  if(!isCentralAdmin && !perms.mysteryStatusUpdate) return alert('لا تملك صلاحية تغيير الحالة');
  
  console.log('🚀 applyStatus() تم استدعاؤها');
  
  const statusSelect = document.querySelector('#statusSelect');
  const noteInput = document.querySelector('#statusNote');
  const applyBtn = document.querySelector('#applyStatusBtn');

  console.log('🔍 فحص العناصر:', {
    statusSelect: !!statusSelect,
    noteInput: !!noteInput,
    applyBtn: !!applyBtn,
    mysteryId: currentMysteryId
  });

  if (!statusSelect || !noteInput || !applyBtn || !currentMysteryId) {
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
    // ✅ استخدام effectiveHospitalId() وإضافة hospitalId دائماً إذا توفر
    const hid = effectiveHospitalId();
    let putUrl = `${API_BASE}/api/mystery-complaints/${currentMysteryId}/status`;
    if (hid) putUrl += `?hospitalId=${hid}`;
    
    const body = {
      statusCode: statusCode,
      note: note
    };
    
    // إضافة hospitalId في الجسم أيضاً
    if (hid) {
      body.hospitalId = hid;
    }

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
    
    // تحديث شارة الحالة في أعلى الصفحة
    updateStatusBadge(statusCode);
    
    // إغلاق المودال
    const modal = document.querySelector('#changeStatusModal');
    if (modal) {
      modal.classList.add('hidden');
    }
    
    // مسح الحقول
    noteInput.value = '';
    
    // إعادة تحميل الردود
    await loadResponses();
    
    // إعادة تحميل تفاصيل التقييم
    await loadMysteryDetails();
    
    alert('تم تحديث حالة التقييم بنجاح ✅');
  } catch (error) {
    console.error('❌ خطأ في تحديث الحالة:', error);
    alert(`حدث خطأ أثناء تحديث الحالة: ${error.message}`);
  } finally {
    // إعادة تفعيل الزر
    applyBtn.disabled = false;
    applyBtn.textContent = 'تطبيق';
  }
}

// تأكيد الحذف
async function confirmDelete() {
  const isCentralAdmin = perms.adminPanel && !perms.hospitalCreate; // مدير التجمع المركزي
  if(!isCentralAdmin && !perms.mysteryDelete) return alert('لا تملك صلاحية الحذف');
  
  try {
    const reason = document.getElementById('deleteReason').value.trim();
    
    // ✅ استخدام effectiveHospitalId() وإضافة hospitalId دائماً إذا توفر
    const hid = effectiveHospitalId();
    let url = `${API_BASE}/api/mystery-complaints/${currentMysteryId}`;
    if (hid) url += `?hospitalId=${hid}`;
    
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        ...authHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        deleteReason: reason
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.success) {
    alert('تم حذف التقييم بنجاح');
    closeAllModals();
    
    // العودة للقائمة
    window.location.href = 'mystery-complaints.html';
    } else {
      throw new Error(result.message || 'فشل في حذف التقييم');
    }
    
  } catch (error) {
    console.error('Error deleting mystery:', error);
    alert(`فشل في حذف التقييم: ${error.message}`);
  }
}

// دوال مساعدة
function authHeaders() {
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json'
  };
  
  // ✅ إضافة x-hospital-id دائماً إذا توفر (حتى لمدير التجمع)
  const hid = effectiveHospitalId();
  if (hid) {
    headers['x-hospital-id'] = hid;
  }
  
  return headers;
}

function getHospitalIdFromClient() {
  // مدير التجمع لا يحتاج hospitalId
  if (isClusterAdmin()) {
    // محاولة جلب hospitalId من URL أو dataset
    const urlHospId = Number(new URLSearchParams(window.location.search).get('hospitalId') || 0);
    const datasetHospId = Number(document.body?.dataset?.hospitalId || 0);
    return urlHospId || datasetHospId || window.currentHospitalId || null;
  }
  
  // المستخدم العادي - جلب من مصادر متعددة
  const ud = JSON.parse(localStorage.getItem('userData') || '{}');
  const urlHospId = Number(new URLSearchParams(window.location.search).get('hospitalId') || 0);
  const datasetHospId = Number(document.body?.dataset?.hospitalId || 0);
  
  return (
    ud.HospitalID || ud.hospitalId || ud.hid ||
    urlHospId || datasetHospId ||
    window.currentHospitalId ||
    Number(localStorage.getItem('hospitalId')) || null
  );
}


function getPriorityText(priority) {
  const priorityMap = {
    'LOW': 'منخفضة',
    'MEDIUM': 'متوسطة',
    'HIGH': 'عالية',
    'CRITICAL': 'حرجة'
  };
  return priorityMap[priority] || priority;
}

function getPriorityColor(priority) {
  const colorMap = {
    'LOW': 'bg-green-100 text-green-800',
    'MEDIUM': 'bg-yellow-100 text-yellow-800',
    'HIGH': 'bg-orange-100 text-orange-800',
    'CRITICAL': 'bg-red-100 text-red-800'
  };
  return colorMap[priority] || 'bg-gray-100 text-gray-800';
}

// ====== دوال التحويل ======

// تحميل بيانات التحويل
async function loadTransferData() {
  try {
    // تحميل الأقسام
    await loadDepartments();
    
    // تحميل الموظفين
    await loadEmployees();
    
    // إعداد التبويبات
    setupTransferTabs();
    
  } catch (error) {
    console.error('Error loading transfer data:', error);
    alert('خطأ في تحميل بيانات التحويل');
  }
}

// تحميل الأقسام
async function loadDepartments() {
  try {
    // ✅ استخدام effectiveHospitalId() وإضافة hospitalId دائماً إذا توفر
    const hid = effectiveHospitalId();
    let url = `${API_BASE}/api/departments`;
    if (hid) url += `?hospitalId=${hid}`;
    
    const response = await fetch(url, {
      headers: authHeaders()
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    const departments = data.items || [];
    
    // تحديث قائمة الأقسام
    updateDepartmentSelects(departments);
    
    // عرض القسم الحالي
    showCurrentDepartment(departments);
    
  } catch (error) {
    console.error('Error loading departments:', error);
  }
}

// تحديث قوائم الأقسام
function updateDepartmentSelects(departments) {
  const deptToSelect = document.getElementById('deptTo');
  const empDeptSelect = document.getElementById('empDept');
  
  if (deptToSelect) {
    deptToSelect.innerHTML = '<option value="">اختر القسم الهدف</option>';
    departments.forEach(dept => {
      const option = document.createElement('option');
      option.value = dept.DepartmentID;
      option.textContent = dept.NameAr || dept.NameEn;
      deptToSelect.appendChild(option);
    });
  }
  
  if (empDeptSelect) {
    empDeptSelect.innerHTML = '<option value="">اختر القسم</option>';
    departments.forEach(dept => {
      const option = document.createElement('option');
      option.value = dept.DepartmentID;
      option.textContent = dept.NameAr || dept.NameEn;
      empDeptSelect.appendChild(option);
    });
  }
}

// عرض القسم الحالي
function showCurrentDepartment(departments) {
  const currentDeptId = currentData?.DepartmentID;
  const currentTxt = document.getElementById('transferDepartmentCurrent');
  const deptFromSelect = document.getElementById('deptFrom');
  
  console.log('🔍 [showCurrentDepartment] تحديد القسم الحالي:', {
    currentDeptId: currentDeptId,
    currentData: currentData,
    departmentsCount: departments.length
  });
  
  if (currentTxt && deptFromSelect) {
    const currentDept = departments.find(d => d.DepartmentID == currentDeptId);
    let deptName = 'غير محدد';
    
    if (currentDept) {
      deptName = currentDept.NameAr || currentDept.NameEn;
    } else if (currentDeptId) {
      // إذا كان هناك ID لكن لم نجد القسم في القائمة
      deptName = `قسم ${currentDeptId}`;
    }
    
    currentTxt.textContent = deptName;
    deptFromSelect.value = currentDeptId || '';
    
    console.log('✅ [showCurrentDepartment] تم تحديث القسم الحالي:', {
      deptName: deptName,
      deptFromValue: deptFromSelect.value,
      foundInList: !!currentDept
    });
  }
}

// تحميل الموظفين
async function loadEmployees() {
  try {
    // ✅ استخدام effectiveHospitalId() وإضافة hospitalId دائماً إذا توفر
    const hid = effectiveHospitalId();
    let url = `${API_BASE}/api/users?active=1`;
    if (hid) url += `&hospitalId=${hid}`;
    
    const response = await fetch(url, {
      headers: authHeaders()
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    const users = data.items || [];
    
    // تحديث قوائم الموظفين
    updateEmployeeSelects(users);
    
  } catch (error) {
    console.error('Error loading employees:', error);
  }
}

// تحديث قوائم الموظفين
function updateEmployeeSelects(users) {
  const empFromSelect = document.getElementById('empFrom');
  const empToSelect = document.getElementById('empTo');
  
  if (empFromSelect) {
    empFromSelect.innerHTML = '<option value="">اختر الموظف الحالي</option>';
    users.forEach(user => {
      const option = document.createElement('option');
      option.value = user.UserID;
      option.textContent = user.FullNameAr || user.FullNameEn || user.Username;
      empFromSelect.appendChild(option);
    });
  }
  
  if (empToSelect) {
    empToSelect.innerHTML = '<option value="">اختر الموظف الهدف</option>';
    users.forEach(user => {
      const option = document.createElement('option');
      option.value = user.UserID;
      option.textContent = user.FullNameAr || user.FullNameEn || user.Username;
      empToSelect.appendChild(option);
    });
  }
}

// إعداد تبويبات التحويل
function setupTransferTabs() {
  const tabDeptBtn = document.getElementById('tabDeptBtn');
  const tabEmpBtn = document.getElementById('tabEmpBtn');
  
  if (tabDeptBtn) {
    tabDeptBtn.addEventListener('click', () => setActiveTab('dept'));
  }
  
  if (tabEmpBtn) {
    tabEmpBtn.addEventListener('click', () => setActiveTab('emp'));
  }
  
  // زر التحويل
  const confirmTransferBtn = document.getElementById('confirmTransfer');
  if (confirmTransferBtn) {
    confirmTransferBtn.addEventListener('click', handleTransfer);
  }
}

// تعيين التبويب النشط
function setActiveTab(tab) {
  // تحديث الأزرار
  document.querySelectorAll('#transferModal .tab-btn').forEach(btn => {
    const isActive = btn.dataset.tab === tab;
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    btn.classList.toggle('bg-indigo-600', isActive);
    btn.classList.toggle('text-white', isActive);
    btn.classList.toggle('bg-gray-100', !isActive);
    btn.classList.toggle('text-gray-700', !isActive);
  });
  
  // تحديث اللوحات
  document.querySelectorAll('#transferModal [id^="pane-"]').forEach(pane => {
    const paneTab = pane.id.replace('pane-', '');
    pane.classList.toggle('hidden', paneTab !== tab);
  });
}

// معالجة التحويل
async function handleTransfer() {
  const activeTab = document.querySelector('#transferModal .tab-btn[aria-selected="true"]')?.dataset.tab;
  
  if (activeTab === 'dept') {
    await submitDepartmentTransfer();
  } else if (activeTab === 'emp') {
    await submitEmployeeTransfer();
  } else {
    alert('اختر نوع التحويل');
  }
}

// تنفيذ التحويل بين الأقسام
async function submitDepartmentTransfer() {
  const isCentralAdmin = perms.adminPanel && !perms.hospitalCreate; // مدير التجمع المركزي
  if(!isCentralAdmin && !perms.mysteryTransferDept) return alert('لا تملك صلاحية تحويل بين الأقسام');
  
  try {
    const fromDepartmentId = Number(document.getElementById('deptFrom')?.value);
    const toDepartmentId = Number(document.getElementById('deptTo')?.value);
    const note = document.getElementById('deptNote')?.value?.trim() || '';
    
    console.log('🔍 [submitDepartmentTransfer] فحص القيم:', {
      fromDepartmentId: fromDepartmentId,
      toDepartmentId: toDepartmentId,
      currentData: currentData
    });
    
    if (!toDepartmentId) {
      alert('اختر القسم الهدف');
      return;
    }
    
    // إذا لم يكن هناك قسم حالي، استخدم القسم من البيانات الحالية
    let actualFromDepartmentId = fromDepartmentId;
    if (!actualFromDepartmentId && currentData?.DepartmentID) {
      actualFromDepartmentId = Number(currentData.DepartmentID);
      console.log('🔄 [submitDepartmentTransfer] استخدام القسم من البيانات الحالية:', actualFromDepartmentId);
    }
    
    // إذا لم يكن هناك قسم حالي على الإطلاق، استخدم null
    if (!actualFromDepartmentId || actualFromDepartmentId === 0) {
      actualFromDepartmentId = null;
      console.log('⚠️ [submitDepartmentTransfer] لا يوجد قسم حالي، سيتم استخدام null');
    }
    
    if (actualFromDepartmentId && actualFromDepartmentId === toDepartmentId) {
      alert('القسم الهدف يجب أن يكون مختلفاً عن القسم الحالي');
      return;
    }
    
    // ✅ استخدام effectiveHospitalId() وإضافة hospitalId دائماً إذا توفر
    const hid = effectiveHospitalId();
    let url = `${API_BASE}/api/mystery-complaints/${currentMysteryId}/transfer/department`;
    if (hid) url += `?hospitalId=${hid}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...authHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fromDepartmentId: actualFromDepartmentId,
        toDepartmentId,
        note
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.ok) {
      alert('تم تحويل التقييم إلى القسم الجديد ✅');
      closeAllModals();
      
      // إعادة تحميل البيانات
      await loadMysteryDetails();
    } else {
      throw new Error(result.message || 'فشل في تحويل التقييم');
    }
    
  } catch (error) {
    console.error('Error transferring mystery:', error);
    alert(`فشل في تحويل التقييم: ${error.message}`);
  }
}

// تنفيذ التحويل بين الموظفين
async function submitEmployeeTransfer() {
  const isCentralAdmin = perms.adminPanel && !perms.hospitalCreate; // مدير التجمع المركزي
  if(!isCentralAdmin && !perms.mysteryTransferEmp) return alert('لا تملك صلاحية تحويل بين الموظفين');
  
  try {
    const fromUserId = Number(document.getElementById('empFrom')?.value || 0);
    const toUserId = Number(document.getElementById('empTo')?.value || 0);
    const note = document.getElementById('empNote')?.value?.trim() || '';
    
    if (!toUserId) {
      alert('اختر الموظف الهدف');
      return;
    }
    
    // ✅ استخدام effectiveHospitalId() وإضافة hospitalId دائماً إذا توفر
    const hid = effectiveHospitalId();
    let url = `${API_BASE}/api/mystery-complaints/${currentMysteryId}/transfer/employee`;
    if (hid) url += `?hospitalId=${hid}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...authHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fromUserId: fromUserId || undefined,
        toUserId,
        note
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.ok) {
      alert('تم تحويل التقييم بين الموظفين ✅');
      closeAllModals();
      
      // إعادة تحميل البيانات
      await loadMysteryDetails();
    } else {
      throw new Error(result.message || 'فشل في تحويل التقييم');
    }
    
  } catch (error) {
    console.error('Error transferring mystery:', error);
    alert(`فشل في تحويل التقييم: ${error.message}`);
  }
}

function showError(message, options = {}) {
  const { type = 'error', actions = [] } = options;
  
  const errorDiv = document.createElement('div');
  errorDiv.className = `fixed top-20 left-1/2 transform -translate-x-1/2 ${
    type === 'warning' ? 'bg-yellow-500' : 'bg-red-500'
  } text-white px-6 py-4 rounded-lg shadow-lg z-50 max-w-md`;
  
  const content = document.createElement('div');
  content.className = 'text-center';
  
  const messageDiv = document.createElement('div');
  messageDiv.textContent = message;
  messageDiv.className = 'mb-3';
  content.appendChild(messageDiv);
  
  // إضافة الأزرار إذا كانت متوفرة
  if (actions.length > 0) {
    const buttonsDiv = document.createElement('div');
    buttonsDiv.className = 'flex gap-2 justify-center';
    
    actions.forEach(action => {
      const button = document.createElement('button');
      button.textContent = action.text;
      button.className = 'bg-white text-gray-800 px-3 py-1 rounded text-sm hover:bg-gray-100 transition';
      button.onclick = () => {
        errorDiv.remove();
        action.action();
      };
      buttonsDiv.appendChild(button);
    });
    
    content.appendChild(buttonsDiv);
  }
  
  errorDiv.appendChild(content);
  document.body.appendChild(errorDiv);
  
  // إزالة تلقائية بعد 10 ثوانٍ (أو 5 ثوانٍ إذا لم تكن هناك أزرار)
  setTimeout(() => {
    if (errorDiv.parentNode) {
      errorDiv.remove();
    }
  }, actions.length > 0 ? 10000 : 5000);
}
