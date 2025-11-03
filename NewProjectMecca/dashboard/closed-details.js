// closed-details.js

/**
 * جلب بيانات البلاغ المغلق حسب المعرف
 * يحاول أولاً من API، ثم يتحقق من البيانات المحلية
 */
async function getClosedById(id) {
  // محاولة جلب من API
  try {
    const res = await fetch(`${window.API_BASE_URL || ''}/api/reports/${encodeURIComponent(id)}`, { 
      credentials: 'include' 
    });
    if (res.ok) return await res.json();
  } catch (err) {
    console.log('فشل الاتصال بـ API، استخدام البيانات المحلية...');
  }

  // البحث في البيانات المحلية
  if (window.hospitalsDataClosed) {
    for (const h of window.hospitalsDataClosed) {
      const hit = (h.closedReports || []).find(r => r.id === id);
      if (hit) {
        return {
          id: hit.id, 
          hospital: h.name, 
          dept: hit.dept,
          priority: 'green', 
          status: 'مغلقة',
          createdAt: hit.createdAt, 
          updatedAt: hit.createdAt,
          reporter: 'غير محدد', 
          contact: 'غير محدد', 
          source: 'منظومة 937',
          assignee: 'تم الحل', 
          description: 'تم حل البلاغ وإغلاقه بنجاح.', 
          attachments: [],
          history: [
            { at: hit.createdAt, action: 'تم إنشاء البلاغ', by: 'النظام' },
            { at: hit.createdAt, action: 'تم حل البلاغ وإغلاقه', by: 'فريق الدعم' }
          ]
        };
      }
    }
  }
  
  return null;
}

/**
 * تعيين نص وكلاس للشارة
 */
function setChip(el, text, cls) { 
  el.textContent = text; 
  el.className = `pill ${cls}`; 
}

/**
 * تهيئة الصفحة عند التحميل
 */
(function boot() {
  const id = new URLSearchParams(location.search).get('id');
  if (!id) {
    alert('لا يوجد معرف بلاغ.');
    return;
  }
  
  getClosedById(id).then(r => {
    if (!r) {
      alert('تعذر جلب بيانات البلاغ.');
      return;
    }
    
    // تحديث عنوان الصفحة
    document.getElementById('pageTitle').textContent = `تفاصيل البلاغ المغلق (${r.id})`;
    document.getElementById('pageSubtitle').textContent = r.hospital;
    document.getElementById('rptId').textContent = r.id;

    // تحديث شارة الأولوية
    const priorityChip = document.getElementById('priorityChip');
    priorityChip.textContent = 'مغلق ✓';
    priorityChip.className = 'pill pill-green';

    // تحديث شارة الحالة
    setChip(document.getElementById('statusChip'), 'مغلقة', 'pill-green');

    // تعبئة المعلومات
    document.getElementById('hospital').textContent = r.hospital;
    document.getElementById('dept').textContent = r.dept;
    document.getElementById('createdAt').textContent = r.createdAt;
    document.getElementById('updatedAt').textContent = r.updatedAt;
    document.getElementById('reporter').textContent = r.reporter;
    document.getElementById('assignee').textContent = r.assignee;
    document.getElementById('contact').textContent = r.contact;
    document.getElementById('source').textContent = r.source;
    document.getElementById('description').textContent = r.description;

    // المرفقات
    const attachmentsContainer = document.getElementById('attachments');
    if (r.attachments && r.attachments.length > 0) {
      attachmentsContainer.innerHTML = r.attachments.map(att => `
        <a href="${att.url}" target="_blank" 
           class="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition">
          <svg class="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/>
          </svg>
          <span class="text-sm text-emerald-700 font-medium">${att.name || 'مرفق'}</span>
        </a>
      `).join('');
    } else {
      attachmentsContainer.innerHTML = '<span class="text-gray-400 text-sm">لا توجد مرفقات</span>';
    }

    // التسلسل الزمني
    document.getElementById('timeline').innerHTML = (r.history || []).map(x => `
      <li class="relative">
        <span class="absolute -right-2.5 top-1 w-5 h-5 rounded-full bg-emerald-600 border-4 border-white"></span>
        <div class="bg-gray-50 rounded-xl p-4">
          <div class="text-sm text-gray-500 mb-1">${x.at}</div>
          <div class="font-semibold text-slate-800">${x.action}</div>
          ${x.by ? `<div class="text-xs text-gray-500 mt-1">بواسطة: ${x.by}</div>` : ''}
        </div>
      </li>
    `).join('');

    // زر الطباعة
    document.getElementById('printBtn')?.addEventListener('click', () => {
      window.print();
    });
  });
})();

