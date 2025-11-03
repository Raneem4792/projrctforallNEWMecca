// ===== إعدادات الـ API =====
const API_BASE_URL = 'http://localhost:3001'; // غيّر هذا حسب بيئة التشغيل

const els = {
  form: document.getElementById('searchForm'),
  qName: document.getElementById('qName'),
  qMobile: document.getElementById('qMobile'),
  qFile: document.getElementById('qFile'),
  qNid: document.getElementById('qNid'),
  qTicket: document.getElementById('qTicket'),
  results: document.getElementById('results'),
  noResults: document.getElementById('noResults'),
  filters: document.querySelectorAll('[data-status]'),
  resetBtn: document.getElementById('resetBtn')
};

let currentResults = [];
let activeStatus = 'all';

document.addEventListener('DOMContentLoaded', () => {
  els.form.addEventListener('submit', onSearch);
  els.resetBtn.addEventListener('click', resetForm);
  els.filters.forEach(btn => btn.addEventListener('click', () => {
    activeStatus = (btn.dataset.status || 'all').toLowerCase();
    renderResults();
    els.filters.forEach(b => b.classList.remove('ring-2'));
    btn.classList.add('ring-2'); // تمييز الفلتر النشط
  }));
});

async function onSearch(e){
  e.preventDefault();
  
  // إظهار مؤشر التحميل
  els.results.innerHTML = `
    <div class="col-span-full flex items-center justify-center py-12">
      <div class="text-center">
        <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-[#002B5B] mb-4"></div>
        <p class="text-gray-600">جاري البحث...</p>
      </div>
    </div>
  `;
  els.noResults.classList.add('hidden');

  const name = (els.qName.value || '').trim();
  const mobile = (els.qMobile.value || '').trim();
  const file = (els.qFile.value || '').trim();
  const nid = (els.qNid.value || '').trim();
  const ticket = (els.qTicket.value || '').trim();

  // بناء معاملات الاستعلام
  const params = new URLSearchParams();
  
  // التأكد من أن ticket له الأولوية الأولى
  if (ticket) {
    params.set('ticket', ticket.trim());
  } else if (name) {
    params.set('name', name.trim());
  }
  
  if (mobile) params.set('mobile', mobile.trim());
  if (file) params.set('file', file.trim());
  if (nid) params.set('nid', nid.trim());
  
  // إضافة فلتر الحالة إذا كان نشطاً
  if (activeStatus && activeStatus !== 'all') {
    params.set('status', activeStatus); // open | in_progress | on_hold | closed
  }
  
  // إضافة hospitalId إذا كان متوفراً (لتفعيل fallback)
  const hospitalId = localStorage.getItem('hospitalId');
  if (hospitalId && hospitalId !== 'ALL') {
    params.set('hospitalId', hospitalId);
    console.log(`🏥 إرسال hospitalId: ${hospitalId}`);
  }
  
  // تسجيل المعاملات للتحقق
  console.log('معاملات البحث:', params.toString());

  try {
    // استدعاء الـ API
    const token = localStorage.getItem('token');
    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };
    
    // إضافة التوكن إذا كان متوفراً (للمستخدمين المسجلين)
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      console.log('🔑 إرسال التوكن مع الطلب للمستخدم المسجل');
    } else {
      console.log('👤 طلب عام بدون توكن');
    }
    
    const response = await fetch(`${API_BASE_URL}/api/complaints/track?${params.toString()}`, {
      method: 'GET',
      headers
    });

    const data = await response.json();

    // لو السيرفر رجع خطأ فعلي (500 مثلاً)
    if (!response.ok && data?.ok !== true) {
      console.error('خطأ في API:', response.status, data);
      showError('حدث خطأ في الخادم');
      return;
    }

    // نجاح (حتى لو القائمة فارغة)
    if (data.ok === true && Array.isArray(data.items)) {
      if (data.items.length === 0) {
        showNoResults(data.message || 'ما وجدنا بلاغ بهذا الاسم/الرقم');
        currentResults = [];
        return;
      }
      currentResults = data.items;
      renderResults();
      return;
    }

    // احتياط
    showNoResults('ما وجدنا بلاغ بهذا الاسم/الرقم');

  } catch (error) {
    console.error('خطأ في البحث:', error);
    showError(error.message || 'حدث خطأ غير متوقع');
    currentResults = [];
  }
}

function resetForm(){
  els.form.reset();
  currentResults = [];
  activeStatus = 'all';
  els.filters.forEach(b => b.classList.remove('ring-2'));
  renderResults();
}

function renderResults(){
  // نطبّع الحقول القادمة من الـAPI
  const normalized = (currentResults || []).map(r => {
    const status = (r.status || r.StatusCode || r.statusCode || '').toString().toLowerCase();
    const priority = (r.priority || r.PriorityCode || r.priorityCode || '').toString().toUpperCase();
    return {
      ticket:      r.ticket || r.TicketNumber,
      fullName:    r.fullName || r.PatientFullName || r.full_name,
      mobile:      r.mobile || r.PatientMobile,
      fileNumber:  r.fileNumber || r.FileNumber,
      nationalId:  r.nationalId || r.PatientIDNumber || r.nid,
      hospital:    r.hospital || r.HospitalNameAr || r.hospital_name,
      department:  r.department || r.DepartmentNameAr || r.department_name,
      type:        r.type || r.TypeNameAr || r.ComplaintTypeNameAr,
      subType:     r.subType || r.SubTypeNameAr || '',
      createdAt:   r.createdAt || r.CreatedAt,
      lastUpdate:  r.lastUpdate || r.UpdatedAt,
      status,
      statusLabelAr:  r.StatusLabelAr || '',     // لو رجعتيها من الـAPI
      priority,
      priorityLabelAr:r.PriorityLabelAr || ''    // لو رجعتيها من الـAPI
    };
  });

  const list = activeStatus === 'all'
    ? normalized
    : normalized.filter(c => c.status === activeStatus);

  els.results.innerHTML = '';
  if(!list.length){
    els.noResults.classList.remove('hidden');
    return;
  }
  els.noResults.classList.add('hidden');

  list.forEach(c => {
    const card = document.createElement('div');
    card.className = 'card';

    const statusBadge   = badgeForStatus(c.status,   c.statusLabelAr);
    const priorityBadge = badgeForPriority(c.priority, c.priorityLabelAr);

    const detailsUrl = new URL('../history/complaint-details.html', window.location.href);
    detailsUrl.searchParams.set('ticket', c.ticket);

    card.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="text-sm text-gray-500">رقم البلاغ</div>
          <div class="font-extrabold text-lg text-[#002B5B]">${escapeHTML(c.ticket)}</div>
        </div>
        <div class="flex gap-2">${statusBadge}${priorityBadge}</div>
      </div>

      <div class="grid md:grid-cols-2 gap-3 mt-4 text-[15px] text-gray-700">
        <div><span class="font-semibold text-gray-800">الاسم:</span> ${escapeHTML(c.fullName)}</div>
        <div><span class="font-semibold text-gray-800">الجوال:</span> ${escapeHTML(c.mobile)}</div>
        <div><span class="font-semibold text-gray-800">رقم الملف:</span> ${escapeHTML(c.fileNumber)}</div>
        <div><span class="font-semibold text-gray-800">الهوية:</span> ${escapeHTML(c.nationalId)}</div>
        <div><span class="font-semibold text-gray-800">المستشفى:</span> ${escapeHTML(c.hospital)}</div>
        <div><span class="font-semibold text-gray-800">القسم:</span> ${escapeHTML(c.department)}</div>
        <div><span class="font-semibold text-gray-800">التصنيف:</span> ${escapeHTML(c.type)}</div>
        <div><span class="font-semibold text-gray-800">الفرعي:</span> ${escapeHTML(c.subType)}</div>
      </div>

      <div class="mt-3 text-sm text-gray-600">
        <div>تاريخ الإنشاء: ${escapeHTML(c.createdAt)}</div>
        <div>آخر تحديث: ${escapeHTML(c.lastUpdate)}</div>
      </div>

      <div class="mt-4 flex gap-2">
        <a class="btn-secondary" href="${escapeHTML(detailsUrl.toString())}">عرض التفاصيل</a>
        <a class="btn-primary" href="../history/complaint-timeline.html?ticket=${encodeURIComponent(c.ticket)}">تتبع الحالة</a>
      </div>
    `;
    els.results.appendChild(card);
  });
}

function badgeForStatus(code, labelAr=''){
  const c = (code || '').toLowerCase();
  const map = {
    'open':        { text:'مفتوحة',      bg:'#F3F4F6', ring:'#e5e7eb', dot:'#2563EB' },
    'in_progress': { text:'قيد المعالجة', bg:'#F3F4F6', ring:'#e5e7eb', dot:'#F59E0B' },
    'on_hold':     { text:'معلقة',       bg:'#F3F4F6', ring:'#e5e7eb', dot:'#6B7280' },
    'closed':      { text:'مغلقة',       bg:'#ECFDF5', ring:'#D1FAE5', dot:'#10B981' },
    'critical':    { text:'حرجة',        bg:'#FEF2F2', ring:'#FECACA', dot:'#EF4444' }
  }[c] || { text: labelAr || code, bg:'#F3F4F6', ring:'#e5e7eb', dot:'#6B7280' };

  return `
    <span style="background:${map.bg};border:1px solid ${map.ring};" class="px-3 py-1 rounded-full text-sm font-semibold inline-flex items-center gap-2">
      <span style="display:inline-block;width:8px;height:8px;border-radius:9999px;background:${map.dot}"></span>
      ${labelAr || map.text}
    </span>
  `;
}

function badgeForPriority(code, labelAr=''){
  const p = (code || '').toUpperCase();
  const map = {
    'URGENT': { text:'عاجلة',   bg:'#FEF2F2', ring:'#FECACA', dot:'#EF4444' },
    'HIGH':   { text:'عالية',   bg:'#FFF7ED', ring:'#FFEDD5', dot:'#F97316' },
    'MEDIUM': { text:'متوسطة',  bg:'#EFF6FF', ring:'#DBEAFE', dot:'#3B82F6' },
    'LOW':    { text:'منخفضة',  bg:'#F3F4F6', ring:'#E5E7EB', dot:'#6B7280' }
  }[p] || { text: labelAr || code, bg:'#F3F4F6', ring:'#E5E7EB', dot:'#6B7280' };

  return `
    <span style="background:${map.bg};border:1px solid ${map.ring};" class="px-3 py-1 rounded-full text-sm font-semibold inline-flex items-center gap-2">
      <span style="display:inline-block;width:8px;height:8px;border-radius:9999px;background:${map.dot}"></span>
      ${labelAr || map.text}
    </span>
  `;
}

function showNoResults(msg) {
  els.results.innerHTML = `
    <div class="col-span-full">
      <div class="rounded-xl border border-gray-200 bg-white/70 p-8 text-center">
        <div class="text-6xl mb-4">🔍</div>
        <div class="text-xl font-bold text-gray-800 mb-2">${escapeHTML(msg)}</div>
        <div class="text-sm text-gray-500">جرّبي رقم التذكرة، رقم الجوال، أو الاسم الكامل.</div>
      </div>
    </div>
  `;
  els.noResults.classList.add('hidden');
}

function showError(msg) {
  els.results.innerHTML = `
    <div class="col-span-full">
      <div class="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <svg class="w-12 h-12 text-red-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        <h3 class="text-lg font-semibold text-red-900 mb-2">حدث خطأ</h3>
        <p class="text-red-700">${escapeHTML(msg)}</p>
        <p class="text-sm text-red-600 mt-2">الرجاء التأكد من تشغيل الخادم والمحاولة مرة أخرى</p>
      </div>
    </div>
  `;
  els.noResults.classList.add('hidden');
}

function escapeHTML(str=''){
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#039;');
}

/* ========= ملاحظات ==========
✅ تم ربط الـ API بنجاح!
- الآن يتم الاستعلام مباشرة من قاعدة البيانات
- يدعم التطابق الجزئي للاسم (LIKE) والتطابق الدقيق لباقي الحقول
- يستفيد من الـ indexes (ix_complaints_ticket, ix_complaints_mobile, إلخ)
- الاستجابة بصيغة JSON متوافقة مع renderResults()
- لإضافة JWT: فعّل السطر Authorization في headers
*/

