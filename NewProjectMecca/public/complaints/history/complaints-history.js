// ===== إعدادات عامة =====
const API_BASE = 'http://localhost:3001';
const PAGE_SIZE = 9;

// ===== دوال التعرف على مدير التجمع =====
function isClusterManager(user) {
  const clusterRoles = new Set([1, 4]); // مطابق للباك-إند
  return user && (clusterRoles.has(user.RoleID) || (user.Permissions || []).includes('VIEW_ALL_HOSPITALS'));
}

function getUserMode(user) {
  if (!user) return 'guest';
  if (isClusterManager(user)) return 'cluster';
  if (user.HospitalID) return 'hospital';
  return 'central'; // مدير مركزي بدون مستشفى محدد
}

const els = {
  qName:   document.getElementById('qName'),
  qMobile: document.getElementById('qMobile'),
  qFile:   document.getElementById('qFile'),
  qTicket: document.getElementById('qTicket'),
  fStatus: document.getElementById('fStatus'),
  fHospital: document.getElementById('fHospital'),
  fType: document.getElementById('fType'),
  fFrom: document.getElementById('fFrom'),
  fTo: document.getElementById('fTo'),
  btnSearch: document.getElementById('btnSearch'),
  btnReset: document.getElementById('btnReset'),
  results: document.getElementById('results'),
  noResults: document.getElementById('noResults'),
  kpiTotal: document.getElementById('kpiTotal'),
  kpiOpen: document.getElementById('kpiOpen'),
  kpiClosed: document.getElementById('kpiClosed'),
  kpiCritical: document.getElementById('kpiCritical'),
  pPrev: document.getElementById('pPrev'),
  pNext: document.getElementById('pNext'),
  pInfo: document.getElementById('pInfo'),
};

let page = 1;
let lastResponse = { items: [], total: 0, pages: 1, kpis: {open:0, closed:0, critical:0} };
let assignedOnly = false;

// ===== دالة تحميل المستشفيات لمدير التجمع =====
async function loadHospitalsForCluster() {
  try {
    const response = await fetch(`${API_BASE}/api/hospitals`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    const hospitals = Array.isArray(data) ? data : (data?.hospitals || []);
    
    const select = document.getElementById('hospitalSelect');
    if (select) {
      select.innerHTML = '<option value="">الكل</option>' + 
        hospitals.map(h => `<option value="${h.HospitalID}">${h.NameAr || h.NameEn}</option>`).join('');
      
      // التأكد من أن القيمة الافتراضية هي "الكل" (فارغة)
      select.value = '';
      console.log('✅ تم تحميل المستشفيات لمدير التجمع، القيمة الافتراضية: الكل');
    }
  } catch (error) {
    console.error('❌ خطأ في تحميل المستشفيات:', error);
  }
}

// قراءة hname من الرابط (اختياري)
const params = new URLSearchParams(location.search);
const hname = params.get('hname');

// قراءة الفلاتر من النموذج مع تنظيف القيم التجريبية
function getFilters() {
  const v = (id) => (document.getElementById(id)?.value || '').trim();

  let name   = v('qName');
  let mobile = v('qMobile');
  let file   = v('qFile');
  let ticket = v('qTicket');

  // شيل النصوص التجريبية
  if (name.includes('مثال')) name = '';
  if (/^05X+$/i.test(mobile)) mobile = '';
  if (/^KA-12345$/i.test(file)) file = '';
  if (/^C-2025-000001$/i.test(ticket)) ticket = '';

  // تحقّق من الصيغ
  if (mobile && !/^05\d{8}$/.test(mobile)) mobile = '';
  if (ticket && !/^C-\d{4}-\d{5,6}$/i.test(ticket)) ticket = '';

  return {
    name,
    mobile,
    file,
    ticket,
    status: els.fStatus?.value || 'ALL',
    hospital: els.fHospital?.value || 'ALL',
    type: els.fType?.value || 'ALL',
    from: v('fFrom'),
    to: v('fTo')
  };
}

document.addEventListener('DOMContentLoaded', async () => {
  // تفريغ الحقول مرة واحدة عند تحميل الصفحة
  ['qName','qMobile','qFile','qTicket'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  // ===== إعداد واجهة مدير التجمع =====
  try {
    const token = localStorage.getItem('token');
    if (token) {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const user = {
        UserID: payload.uid || payload.userId,
        RoleID: payload.roleId || payload.role,
        HospitalID: payload.hospitalId || payload.hosp,
        Permissions: payload.permissions || []
      };
      
      const userMode = getUserMode(user);
      const clusterMode = userMode === 'cluster' || userMode === 'central';
      
      console.log('🔍 Frontend Debug:', {
        user,
        userMode,
        clusterMode,
        isClusterManager: isClusterManager(user)
      });
      
      if (clusterMode) {
        // إظهار شريط مدير التجمع
        const clusterBar = document.getElementById('clusterBar');
        if (clusterBar) {
          clusterBar.classList.remove('hidden');
          console.log('✅ تم إظهار شريط مدير التجمع');
        }
        
        // تحميل المستشفيات
        await loadHospitalsForCluster();
        
        // ربط تغيير المستشفى
        const hospitalSelect = document.getElementById('hospitalSelect');
        if (hospitalSelect) {
          hospitalSelect.addEventListener('change', () => {
            page = 1;
            runSearch();
          });
        }
      }
    }
  } catch (error) {
    console.error('❌ خطأ في إعداد واجهة مدير التجمع:', error);
  }

  if (hname) {
    els.fHospital.value = hname;
    if (els.fHospital.value !== hname) {
      const opt = document.createElement('option');
      opt.value = hname; 
      opt.textContent = hname; 
      opt.selected = true;
      els.fHospital.appendChild(opt);
    }
  }

  els.btnSearch.addEventListener('click', () => { page = 1; runSearch(); });
  els.btnReset.addEventListener('click', resetFilters);
  
  // ربط أزرار التصدير
  const btnExportExcel = document.getElementById('btnExportExcel');
  const btnExportPDF = document.getElementById('btnExportPDF');
  
  if (btnExportExcel) {
    btnExportExcel.addEventListener('click', () => exportComplaints('excel'));
  }
  
  if (btnExportPDF) {
    btnExportPDF.addEventListener('click', () => exportComplaints('pdf'));
  }
  
  // ربط زر "المسنّدة لي"
  const btnAssigned = document.getElementById('btnAssignedMe');
  if (btnAssigned) {
    btnAssigned.addEventListener('click', () => {
      assignedOnly = !assignedOnly;
      // تبديل الستايل عند التفعيل
      btnAssigned.classList.toggle('bg-blue-600', assignedOnly);
      btnAssigned.classList.toggle('text-white', assignedOnly);
      btnAssigned.classList.toggle('border-blue-600', assignedOnly);
      runSearch();
    });
  }
  
  // تفعيل زر "المسنّدة لي" بصرياً إذا كان النطاق ASSIGNED
  if (window.defaultHistoryScope === 'ASSIGNED') {
    const btnAssigned = document.getElementById('btnAssignedMe');
    if (btnAssigned) {
      assignedOnly = true;
      btnAssigned.classList.add('bg-blue-600', 'text-white', 'border-blue-600');
      console.log('🔍 تم تفعيل زر "المسنّدة لي" بصرياً');
    }
  }

  // تحميل البيانات تلقائياً عند فتح الصفحة
  console.log('🚀 تحميل البيانات تلقائياً عند فتح الصفحة');
  runSearch();
  
  els.pPrev.addEventListener('click', () => changePage(-1));
  els.pNext.addEventListener('click', () => changePage(1));

  // التحقق من صلاحية التصدير
  checkExportPermission();
});

// دالة التحقق من صلاحية التصدير
async function checkExportPermission() {
  try {
    const token = localStorage.getItem('token');
    const API_BASE = window.API_BASE || 'http://localhost:3001';

    // التحقق من كون المستخدم مدير تجمع أولاً
    let isClusterManager = false;
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const user = {
          UserID: payload.uid || payload.userId,
          RoleID: payload.roleId || payload.role,
          HospitalID: payload.hospitalId || payload.hosp,
          Permissions: payload.permissions || []
        };
        const userMode = getUserMode(user);
        isClusterManager = userMode === 'cluster' || userMode === 'central';
      } catch (error) {
        console.error('❌ خطأ في قراءة التوكن:', error);
      }
    }

    // إذا كان مدير تجمع، نعرض الأزرار مباشرة
    if (isClusterManager) {
      const btnExcel = document.getElementById('btnExportExcel');
      const btnPDF = document.getElementById('btnExportPDF');
      const exportArea = document.querySelector('.flex.flex-wrap.gap-3.items-end.mb-4.p-4.bg-gray-50');
      
      if (btnExcel) btnExcel.style.display = 'inline-flex';
      if (btnPDF) btnPDF.style.display = 'inline-flex';
      if (exportArea) exportArea.style.display = 'flex';
      console.log('✅ مدير التجمع - عرض أزرار التصدير');
      return;
    }

    // للمستخدمين الآخرين، نتحقق من الصلاحية
    const res = await fetch(`${API_BASE}/api/permissions/me`, {
      headers: {
        'Accept': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    });

    const json = await res.json();
    console.log('🔍 [Export Permission] Response from API:', json);
    
    if (!json.ok) {
      console.warn('⚠️ [Export Permission] API response not ok:', json);
      // في حالة فشل الاستجابة، نخفي الأزرار
      const btnExcel = document.getElementById('btnExportExcel');
      const btnPDF = document.getElementById('btnExportPDF');
      const exportArea = document.querySelector('.flex.flex-wrap.gap-3.items-end.mb-4.p-4.bg-gray-50');
      if (btnExcel) btnExcel.style.display = 'none';
      if (btnPDF) btnPDF.style.display = 'none';
      if (exportArea) exportArea.style.display = 'none';
      return;
    }

    const perms = json.data || {};
    const canExport = perms.complaintsExport;
    
    console.log('🔍 [Export Permission] Full permissions object:', perms);
    console.log('🔍 [Export Permission] complaintsExport value:', canExport);
    console.log('🔍 [Export Permission] Type of canExport:', typeof canExport);

    const btnExcel = document.getElementById('btnExportExcel');
    const btnPDF = document.getElementById('btnExportPDF');
    const exportArea = document.querySelector('.flex.flex-wrap.gap-3.items-end.mb-4.p-4.bg-gray-50');

    if (!canExport) {
      console.log('❌ [Export Permission] No export permission - hiding buttons');
      if (btnExcel) btnExcel.style.display = 'none';
      if (btnPDF) btnPDF.style.display = 'none';
      // إخفاء منطقة التصدير بالكامل إذا لم تكن هناك صلاحية
      if (exportArea) exportArea.style.display = 'none';
    } else {
      console.log('✅ [Export Permission] Has export permission - showing buttons');
      if (btnExcel) btnExcel.style.display = 'inline-flex';
      if (btnPDF) btnPDF.style.display = 'inline-flex';
      if (exportArea) exportArea.style.display = 'flex';
    }
  } catch (err) {
    console.error('❌ فشل التحقق من صلاحيات التصدير:', err);
    // في حالة الخطأ، نخفي الأزرار للسلامة (إلا إذا كان مدير تجمع)
    const token = localStorage.getItem('token');
    let isClusterManager = false;
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const user = {
          UserID: payload.uid || payload.userId,
          RoleID: payload.roleId || payload.role,
          HospitalID: payload.hospitalId || payload.hosp,
          Permissions: payload.permissions || []
        };
        const userMode = getUserMode(user);
        isClusterManager = userMode === 'cluster' || userMode === 'central';
      } catch (error) {
        // في حالة الخطأ، نخفي الأزرار
      }
    }

    const btnExcel = document.getElementById('btnExportExcel');
    const btnPDF = document.getElementById('btnExportPDF');
    const exportArea = document.querySelector('.flex.flex-wrap.gap-3.items-end.mb-4.p-4.bg-gray-50');
    
    if (isClusterManager) {
      // مدير التجمع - نعرض الأزرار حتى في حالة الخطأ
      if (btnExcel) btnExcel.style.display = 'inline-flex';
      if (btnPDF) btnPDF.style.display = 'inline-flex';
      if (exportArea) exportArea.style.display = 'flex';
    } else {
      // مستخدم عادي - نخفي الأزرار
      if (btnExcel) btnExcel.style.display = 'none';
      if (btnPDF) btnPDF.style.display = 'none';
      if (exportArea) exportArea.style.display = 'none';
    }
  }
}

// دالة جلب بيانات البلاغات للتصدير
async function fetchComplaintsForExport({ from, to, tickets, hospitalId, token }) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (tickets) params.set('tickets', tickets);
  if (!from && !to && !tickets) params.set('all', '1');
  if (hospitalId && hospitalId !== 'ALL') params.set('hospitalId', hospitalId);
  params.set('page', '1');
  params.set('pageSize', '10000'); // جلب كل البيانات

  const headers = { 'Accept': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = `${API_BASE}/api/complaints/history?${params.toString()}`;
  const res = await fetch(url, { headers });
  
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.message || 'خطأ في البيانات');
  }

  return data.items || [];
}

// دالة ملء جدول التصدير
function renderExportTable(complaints) {
  const tbody = document.getElementById('exportTableBody');
  if (!tbody) return;

  tbody.innerHTML = '';

  complaints.forEach((c, idx) => {
    const row = document.createElement('tr');
    row.className = 'border-b';
    
    // جلب آخر رد (يمكن أن يكون reply, replyMessage, lastReply)
    const reply = c.reply || c.replyMessage || c.lastReply || '';
    let replyText = '-';
    if (reply && reply.trim()) {
      // تقصير النص إلى 80 حرف مع إضافة ...
      replyText = reply.trim().length > 80 
        ? reply.trim().substring(0, 80) + '...' 
        : reply.trim();
    }
    
    row.innerHTML = `
      <td class="px-3 py-2 text-center border">${idx + 1}</td>
      <td class="px-3 py-2 text-center border">${escapeHTML(c.ticket || '-')}</td>
      <td class="px-3 py-2 text-center border">${escapeHTML(c.fullName || '-')}</td>
      <td class="px-3 py-2 text-center border">${escapeHTML(c.mobile || '-')}</td>
      <td class="px-3 py-2 text-center border">${escapeHTML(c.department || c.departmentName || '-')}</td>
      <td class="px-3 py-2 text-center border">${escapeHTML(c.status || '-')}</td>
      <td class="px-3 py-2 text-center border">${escapeHTML(c.priority || '-')}</td>
      <td class="px-3 py-2 text-center border">${escapeHTML(c.createdAt || c.created || '-')}</td>
      <td class="px-3 py-2 text-right border" style="max-width: 250px; word-wrap: break-word; white-space: normal;">${escapeHTML(replyText)}</td>
    `;
    tbody.appendChild(row);
  });
}

// دالة تصدير البلاغات (Excel أو PDF)
async function exportComplaints(format = 'excel') {
  try {
    const from = document.getElementById('exportFrom')?.value || '';
    const to = document.getElementById('exportTo')?.value || '';
    const tickets = (document.getElementById('exportTickets')?.value || '').trim();
    
    // تحديد hospitalId
    const token = localStorage.getItem('token');
    let hospitalId = '';
    
    // محاولة الحصول على hospitalId من المستخدم
    let isClusterManager = false;
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const user = {
          UserID: payload.uid || payload.userId,
          RoleID: payload.roleId || payload.role,
          HospitalID: payload.hospitalId || payload.hosp,
          Permissions: payload.permissions || []
        };
        isClusterManager = getUserMode(user) === 'cluster' || getUserMode(user) === 'central';
        hospitalId = user.HospitalID || localStorage.getItem('hospitalId') || '';
      } catch (error) {
        console.error('❌ خطأ في قراءة التوكن:', error);
        hospitalId = localStorage.getItem('hospitalId') || '';
      }
    }
    
    const hospitalSelect = document.getElementById('hospitalSelect');
    const selectedHospitalId = hospitalSelect?.value;
    
    // ✅ لمدير التجمع: استخدم القيمة من القائمة المنسدلة (حتى لو كانت فارغة للـ "الكل")
    if (isClusterManager && hospitalSelect) {
      hospitalId = selectedHospitalId || 'ALL'; // إذا كانت فارغة، استخدم 'ALL'
    } else if (!hospitalId) {
      hospitalId = localStorage.getItem('hospitalId') || '';
    }

    // ✅ حالة خاصة لـ PDF: استخدام html2canvas
    if (format === 'pdf') {
      console.log('[Export] ✅ تقرير PDF - استخدام html2canvas');

      // جلب بيانات البلاغات
      const complaints = await fetchComplaintsForExport({ from, to, tickets, hospitalId, token });

      if (complaints.length === 0) {
        alert('لا توجد بيانات للتصدير. تأكد من اختيار الفلاتر الصحيحة.');
        return;
      }

      // ملء جدول التصدير
      renderExportTable(complaints);

      // تحديث معلومات الهيدر والفوتر
      const exportHeaderInfo = document.getElementById('exportHeaderInfo');
      const exportExportDate = document.getElementById('exportExportDate');
      
      if (exportHeaderInfo) {
        let infoText = `تاريخ التصدير: ${new Date().toLocaleDateString('ar-SA')}`;
        if (from || to) {
          infoText += ` | الفترة: ${from || 'بداية'} - ${to || 'نهاية'}`;
        }
        if (tickets) {
          infoText += ` | أرقام محددة: ${tickets}`;
        }
        exportHeaderInfo.textContent = infoText;
      }

      if (exportExportDate) {
        exportExportDate.textContent = `تاريخ التصدير: ${new Date().toLocaleDateString('ar-SA')} | إجمالي: ${complaints.length} بلاغ`;
      }

      // الحصول على حاوية التصدير
      const container = document.getElementById('exportCombinedArea');
      if (!container) {
        throw new Error('لم يتم العثور على عنصر exportCombinedArea');
      }

      // إظهار الحاوية (خارج viewport)
      container.classList.remove('hidden');
      container.style.display = 'block';

      // انتظار تطبيق CSS
      await new Promise(r => setTimeout(r, 300));

      // تصوير الحاوية باستخدام html2canvas
      const canvas = await html2canvas(container, {
        scale: 1.5,
        useCORS: true,
        scrollY: 0,
        backgroundColor: '#ffffff',
        logging: false,
        allowTaint: true,
        windowWidth: container.scrollWidth,
        windowHeight: container.scrollHeight
      });

      // إخفاء الحاوية مرة أخرى
      container.classList.add('hidden');
      container.style.display = 'none';

      // تحويل Canvas إلى base64
      const imageData = canvas.toDataURL('image/jpeg', 0.85);
      console.log('[Export] ✅ تم إنشاء صورة التقرير، حجم:', (imageData.length / 1024 / 1024).toFixed(2), 'MB');

      if (imageData.length < 100) {
        throw new Error('الصورة المُنشأة فارغة. تأكد من وجود بيانات في الجدول.');
      }

      // إرسال الصورة إلى backend
      const url = `${API_BASE}/api/complaints/export-pdf`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from,
          to,
          tickets,
          hospitalId,
          complaintsImage: imageData
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${res.status}`);
      }

      // تحميل الملف
      const blob = await res.blob();
      const urlObj = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = urlObj;
      a.download = `complaints_${from || 'all'}_${to || 'all'}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(urlObj);

      console.log('✅ تم تصدير PDF بنجاح');
      return;
    }

    // ✅ Excel: استخدام الطريقة القديمة (API مباشر)
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (tickets) params.set('tickets', tickets);
    if (!from && !to && !tickets) params.set('all', '1');
    
    // ✅ إرسال hospitalId حتى لو كان فارغاً (للخيار "الكل")
    if (hospitalId !== undefined && hospitalId !== null) {
      params.set('hospitalId', hospitalId);
    }
    
    console.log('📤 [EXPORT] إرسال طلب Excel:', {
      from,
      to,
      tickets,
      hospitalId,
      isAllHospitals: hospitalId === '' || hospitalId === 'ALL'
    });

    const headers = { 'Accept': 'application/octet-stream' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const url = `${API_BASE}/api/complaints/export-excel?${params.toString()}`;
    console.log('🔗 تصدير Excel:', url);

    const res = await fetch(url, { headers });
    
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP ${res.status}`);
    }

    const blob = await res.blob();
    const urlObj = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = urlObj;
    a.download = `complaints_${from || 'all'}_${to || 'all'}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(urlObj);

    console.log('✅ تم تصدير Excel بنجاح');
  } catch (err) {
    console.error(`❌ خطأ في تصدير ${format.toUpperCase()}:`, err);
    alert(`حدث خطأ أثناء التصدير: ${err.message}`);
  }
}

async function runSearch() {
  els.results.innerHTML = loaderHTML();
  els.noResults.classList.add('hidden');

  try {
    const filters = getFilters();
    
    // بناء الباراميترات بطريقة آمنة
    const params = new URLSearchParams();
    
    // إضافة الفلاتر فقط إذا كانت موجودة
    if (filters.name)     params.set('name', filters.name);
    if (filters.mobile)   params.set('mobile', filters.mobile);
    if (filters.file)     params.set('file', filters.file);
    if (filters.ticket)   params.set('ticket', filters.ticket);
    
    // 👇 تحويل الحالة "حرجة" إلى فلتر أولوية عاجلة
    const chosenStatus = filters.status || 'ALL';
    if (chosenStatus === 'CRITICAL') {
      // لا نرسل status نهائيًا — نرسل priority=urgent (lowercase لتوافق كل API)
      params.set('priority', 'urgent');
      console.log('🔄 status=CRITICAL → priority=urgent');
    } else if (chosenStatus !== 'ALL') {
      params.set('status', chosenStatus);
    }
    
    // لا نرسل hospitalId - السيرفر يحدده من التوكن
    if (filters.type && filters.type !== 'ALL')     params.set('type', filters.type);
    if (filters.from)     params.set('from', filters.from);
    if (filters.to)       params.set('to', filters.to);
    
    // إضافة فلتر "المسنّدة لي"
    if (assignedOnly) {
      params.set('assigned', 'me'); // يعتمد على الـ JWT في الباك-إند
    }
    
    // إضافة الترقيم
    params.set('page', String(page));
    params.set('pageSize', String(PAGE_SIZE));

    // إضافة hospitalId إذا كان متوفراً (لتفعيل fallback) - قبل بناء الرابط
    const hospitalId = localStorage.getItem('hospitalId');
    const hospitalSelect = document.getElementById('hospitalSelect');
    const selectedHospitalId = hospitalSelect?.value;
    
    // التحقق من نوع المستخدم
    const token = localStorage.getItem('token');
    let isClusterManager = false;
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const user = {
          UserID: payload.uid || payload.userId,
          RoleID: payload.roleId || payload.role,
          HospitalID: payload.hospitalId || payload.hosp,
          Permissions: payload.permissions || []
        };
        isClusterManager = getUserMode(user) === 'cluster' || getUserMode(user) === 'central';
      } catch (error) {
        console.error('❌ خطأ في قراءة التوكن:', error);
      }
    }
    
    if (isClusterManager) {
      // لمدير التجمع: استخدم المستشفى المحدد من القائمة فقط
      if (selectedHospitalId) {
        params.set('hospitalId', selectedHospitalId);
        console.log(`🏥 مدير التجمع يحدد المستشفى: ${selectedHospitalId}`);
      } else {
        console.log(`🏥 مدير التجمع يرى جميع البلاغات (لا hospitalId)`);
      }
    } else {
      // للموظفين العاديين: استخدم hospitalId من localStorage أو من النطاق الافتراضي
      const finalHospitalId = window.defaultHospitalId || hospitalId;
      if (finalHospitalId && finalHospitalId !== 'ALL') {
        params.set('hospitalId', finalHospitalId);
        console.log(`🏥 إرسال hospitalId: ${finalHospitalId}`);
      }
    }

    // تطبيق النطاق الافتراضي من الصفحة الرئيسية
    if (window.defaultHistoryScope === 'ASSIGNED') {
      // عندكم أصلاً فلتر "المسنّدة لي": استخدمي المطلوب
      params.set('assigned', 'me');
      console.log('🔍 تطبيق النطاق: المسنّدة لي');
      // وأي عناصر UI مرتبطة فعّليها بصريًا لو تحبين
    } else if (window.defaultHistoryScope === 'DEPARTMENT') {
      params.set('scope', 'department'); // أو أي باراميتر تستخدمينه لسيرفرك لتقييد القسم
      console.log('🔍 تطبيق النطاق: القسم');
    } else if (window.defaultHistoryScope === 'HOSPITAL') {
      params.set('scope', 'hospital');   // أو اتركيه فاضي لو السيرفر يفرضها من التوكن
      console.log('🔍 تطبيق النطاق: المستشفى');
    }

    // بناء الرابط الصحيح - انتبه: المسار الكامل واضح
    const url = `${API_BASE}/api/complaints/history?${params.toString()}`;
    
    console.log('🔗 طلب API:', url); // للتشخيص
    console.log('📊 الفلاتر:', filters); // للتشخيص
    console.log('📊 الباراميترات:', params.toString()); // للتشخيص

    // إضافة التوكن إذا كان متوفراً (للمستخدمين المسجلين)
    const headers = { 'Accept': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      console.log('🔑 إرسال التوكن مع طلب سجل البلاغات');
      console.log('🔑 التوكن:', token.substring(0, 50) + '...');
    } else {
      console.log('👤 طلب عام بدون توكن');
    }

    const res = await fetch(url, { headers });
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    if (!data.ok) throw new Error(data.message || 'خطأ في البيانات');

    // حساب عدد البلاغات العاجلة من العناصر الظاهرة في الصفحة الحالية
    const urgentCount = (data.items || []).filter(
      i => String(i.priority || '').toUpperCase() === 'URGENT'
    ).length;

    // ضَمّن kpis ثم خذ الأكبر (الذي يعكس الواقع في الواجهة)
    if (!data.kpis) data.kpis = { open: 0, closed: 0, critical: 0 };
    data.kpis.critical = Math.max(Number(data.kpis.critical || 0), urgentCount);

    lastResponse = data;
    updateKPIs(data);
    
    // معالجة النتائج الفارغة بنفس منطق تتبع البلاغ
    if (data.items && data.items.length === 0) {
      showNoResults('لا توجد بلاغات مطابقة للبحث');
      return;
    }
    
    render(data.items, data.page, data.pages);
    
  } catch (e) {
    console.error('❌ خطأ في جلب البيانات:', e);
    els.results.innerHTML = `
      <div class="p-6 bg-red-50 border border-red-200 rounded-lg text-center text-red-700">
        <div class="text-xl font-bold mb-2">⚠️ تعذر تحميل البيانات</div>
        <div class="text-sm">${escapeHTML(e.message)}</div>
        <button id="btnRetry" class="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
          إعادة المحاولة
        </button>
      </div>`;
    
    // ربط زر إعادة المحاولة
    document.getElementById('btnRetry')?.addEventListener('click', () => runSearch());
  }
}

function showNoResults(message) {
  els.results.innerHTML = `
    <div class="rounded-xl border border-gray-200 bg-white/70 p-6 text-center">
      <div class="text-4xl">🔍</div>
      <div class="mt-2 font-bold">${message}</div>
      <div class="text-sm text-gray-500 mt-1">جرّبي فلاتر أخرى أو تحققي من صحة البيانات المدخلة.</div>
    </div>
  `;
}

function resetFilters() {
  els.qName.value = '';
  els.qMobile.value = '';
  els.qFile.value = '';
  els.qTicket.value = '';
  els.fStatus.value = 'ALL';
  els.fHospital.value = 'ALL';
  els.fType.value = 'ALL';
  els.fFrom.value = '';
  els.fTo.value = '';
  page = 1;
  
  // إعادة ضبط زر "المسنّدة لي"
  assignedOnly = false;
  document.getElementById('btnAssignedMe')?.classList.remove('bg-blue-600','text-white','border-blue-600');
  
  runSearch();
}

function updateKPIs(data) {
  els.kpiTotal.textContent = data.total || 0;
  els.kpiOpen.textContent = data.kpis.open || 0;
  els.kpiClosed.textContent = data.kpis.closed || 0;
  els.kpiCritical.textContent = data.kpis.critical || 0;
}

function render(items, curPage, totalPages) {
  els.results.innerHTML = '';
  
  if (!items.length) {
    els.noResults.classList.remove('hidden');
    document.getElementById('pager').classList.add('hidden');
    els.pInfo.textContent = 'صفحة 1/1';
    return;
  }
  
  els.noResults.classList.add('hidden');
  document.getElementById('pager').classList.remove('hidden');

  items.forEach(c => {
    const card = document.createElement('div');
    
    // لمسة إضافية: البلاغات العاجلة تظهر بحدود حمراء حتى لو الحالة ليست CRITICAL
    const isUrgent = (c.priority || '').toUpperCase() === 'URGENT';
    const baseClass = cardClassForStatus(c.status);
    const classes = isUrgent 
      ? `rounded-2xl p-4 md:p-5 shadow-sm border border-gray-100 ring-2 ring-red-300 bg-rose-50 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition`
      : `rounded-2xl p-4 md:p-5 shadow-sm border border-gray-100 ${baseClass} cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition`;
    
    card.className = classes;

    const statusBadge = badgeForStatus(c.status);
    const priorityBadge = badgeForPriority(c.priority);

    card.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="text-[11px] md:text-xs text-gray-500">رقم البلاغ</div>
          <div class="font-extrabold text-base md:text-lg ${c.status === 'CRITICAL' ? 'text-red-600' : 'text-[#002B5B]'}">
            ${escapeHTML(c.ticket)}
          </div>
        </div>
        <div class="flex gap-2">${statusBadge}${priorityBadge}</div>
      </div>

      <div class="grid md:grid-cols-2 gap-3 mt-4 text-sm md:text-[15px] text-gray-700">
        <div><span class="font-semibold text-gray-800">الاسم:</span> ${escapeHTML(c.fullName || '')}</div>
        <div><span class="font-semibold text-gray-800">الجوال:</span> ${escapeHTML(c.mobile || '')}</div>
        <div><span class="font-semibold text-gray-800">رقم الملف:</span> ${escapeHTML(c.fileNumber || '')}</div>
        <div><span class="font-semibold text-gray-800">المستشفى:</span> ${escapeHTML(c.hospital || '')}</div>
        <div><span class="font-semibold text-gray-800">التصنيف:</span> ${escapeHTML(c.typeName || c.type || '—')}</div>
        <div><span class="font-semibold text-gray-800">آخر تحديث:</span> ${escapeHTML(c.lastUpdate || '')}</div>
      </div>
    `;

    card.addEventListener('click', () => {
      // ✅ إرسال HospitalID مع رقم التذكرة لضمان قراءة البيانات من القاعدة الصحيحة
      const hospitalId = c.hospitalId || c.HospitalID || '';
      const url = `complaint-details.html?ticket=${encodeURIComponent(c.ticket)}${hospitalId ? `&hid=${hospitalId}` : ''}`;
      
      console.log('🔗 فتح تفاصيل البلاغ:', { ticket: c.ticket, hospitalId, url });
      window.location.href = url;
    });

    els.results.appendChild(card);
  });

  els.pInfo.textContent = `صفحة ${curPage}/${totalPages}`;
  els.pPrev.disabled = curPage === 1;
  els.pNext.disabled = curPage === totalPages;
}

function changePage(delta) {
  const newPage = page + delta;
  if (newPage < 1 || newPage > (lastResponse.pages || 1)) return;
  page = newPage;
  runSearch();
}

// ==== دوال مساعدة للعرض ====

// 1) لون شارات "الأولوية"
function badgeForPriority(p) {
  const P = (p || '').toUpperCase();

  // خريطة ألوان نهائية
  const map = {
    URGENT: { // عاجلة = أحمر قوي
      text: 'عاجلة', 
      bg: '#FEF2F2', 
      ring: '#FECACA', 
      dot: '#DC2626' // red-600
    },
    HIGH: { // عالية = برتقالي
      text: 'عالية', 
      bg: '#FFF7ED', 
      ring: '#FFEDD5', 
      dot: '#F97316'
    },
    MED: { // متوسطة = أصفر
      text: 'متوسطة', 
      bg: '#FFFBEB', 
      ring: '#FEF3C7', 
      dot: '#F59E0B'
    },
    MEDIUM: { // متوسطة (نسخة أخرى)
      text: 'متوسطة', 
      bg: '#FFFBEB', 
      ring: '#FEF3C7', 
      dot: '#F59E0B'
    },
    LOW: { // منخفضة = أخضر
      text: 'منخفضة', 
      bg: '#ECFDF5', 
      ring: '#D1FAE5', 
      dot: '#10B981'
    }
  };

  // fallback لو جتنا قيمة غير معروفة
  const m = map[P] || { 
    text: (p || '—'), 
    bg: '#F3F4F6', 
    ring: '#E5E7EB', 
    dot: '#6B7280' 
  };

  return `
    <span style="background:${m.bg};border:1px solid ${m.ring};"
          class="px-3 py-1 rounded-full text-xs md:text-sm font-semibold inline-flex items-center gap-2">
      <span style="display:inline-block;width:8px;height:8px;border-radius:9999px;background:${m.dot}"></span>
      ${m.text}
    </span>`;
}

// 2) لون شارات "الحالة"
function badgeForStatus(st) {
  const S = (st || '').toUpperCase();
  
  const map = {
    OPEN: { 
      text: 'مفتوحة', 
      bg: '#EFF6FF', 
      ring: '#DBEAFE', 
      dot: '#2563EB' 
    },
    IN_PROGRESS: { 
      text: 'قيد المعالجة', 
      bg: '#FFFBEB', 
      ring: '#FEF3C7', 
      dot: '#F59E0B' 
    },
    ON_HOLD: { 
      text: 'قيد الانتظار', 
      bg: '#F3F4F6', 
      ring: '#E5E7EB', 
      dot: '#6B7280' 
    },
    CLOSED: { 
      text: 'مغلقة', 
      bg: '#ECFDF5', 
      ring: '#D1FAE5', 
      dot: '#10B981' 
    },
    CRITICAL: { 
      text: 'حرجة', 
      bg: '#FEF2F2', 
      ring: '#FECACA', 
      dot: '#DC2626' // أحمر قوي
    }
  };
  
  const m = map[S] || { 
    text: st || '—', 
    bg: '#F3F4F6', 
    ring: '#E5E7EB', 
    dot: '#6B7280' 
  };

  return `
    <span style="background:${m.bg};border:1px solid ${m.ring};"
          class="px-3 py-1 rounded-full text-xs md:text-sm font-semibold inline-flex items-center gap-2">
      <span style="display:inline-block;width:8px;height:8px;border-radius:9999px;background:${m.dot}"></span>
      ${m.text}
    </span>`;
}

// 3) كلاس البطاقة حسب الحالة
function cardClassForStatus(st) {
  const S = (st || '').toUpperCase();
  
  switch (S) {
    case 'CRITICAL':
      return 'ring-2 ring-red-200 bg-rose-50';
    case 'OPEN':
      return 'ring-1 ring-blue-100 bg-white';
    case 'IN_PROGRESS':
      return 'ring-1 ring-amber-100 bg-white';
    case 'ON_HOLD':
      return 'ring-1 ring-gray-200 bg-white';
    case 'CLOSED':
      return 'ring-1 ring-emerald-100 bg-white';
    default:
      return 'ring-1 ring-gray-100 bg-white';
  }
}

function escapeHTML(str = '') { 
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;'); 
}

function loaderHTML() { 
  return `
    <div class="text-center py-8 text-gray-600">
      <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#002B5B] mb-3"></div>
      <div>جاري تحميل البيانات...</div>
    </div>`; 
}

// ✅ تشغيل البحث عند الضغط على Enter في أي حقل داخل نموذج البحث
document.addEventListener('DOMContentLoaded', () => {
  // البحث عن جميع حقول الإدخال والاختيار في منطقة البحث
  document.querySelectorAll('input[type="text"], input[type="search"], select').forEach(el => {
    el.addEventListener('keypress', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        // تشغيل البحث تلقائياً
        const btnSearch = document.getElementById('btnSearch');
        if (btnSearch) {
          btnSearch.click();
          console.log('🔍 تشغيل البحث تلقائياً عند الضغط على Enter');
        }
      }
    });
  });
});
