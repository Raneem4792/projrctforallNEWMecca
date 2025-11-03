// open-details.js

const API_BASE = (location.port === '3001') ? '' : 'http://localhost:3001';

// خرائط عرض التصنيف
const CAT_LABEL = { complaint: 'بلاغ', suggestion: 'اقتراح', critical: 'بلاغ حرج' };
const CAT_CHIP = {
  complaint: 'pill pill-orange',
  suggestion: 'pill priority-yellow',
  critical:   'pill pill-red'
};
const BANNER_CLASS = {
  complaint: 'banner banner--open',
  suggestion: 'banner banner--suggestion',
  critical:   'banner banner--critical'
};
const ICON_EMOJI = { complaint:'🟠', suggestion:'✅', critical:'🔴' };

// جلب تفاصيل البلاغ من قاعدة البيانات
async function getOpenById(id) {
  try {
    const r = await fetch(`${API_BASE}/api/complaints/${encodeURIComponent(id)}`);
    if (!r.ok) throw new Error('HTTP '+r.status);
    return await r.json();
  } catch (e) {
    console.error('getOpenById error', e);
    return null;
  }
}

function setText(id, val){ const el = document.getElementById(id); if(el) el.textContent = val ?? '—'; }

// تحويل الحالة إلى شريحة عرض
function statusToChip(status) {
  const s = (status || '').toLowerCase();
  if (s.includes('closed') || s.includes('مغل')) return { cls:'pill bg-gray-100 text-gray-700', text:'مغلق' };
  if (s.includes('in_progress') || s.includes('جاري')) return { cls:'pill bg-blue-50 text-blue-700 border border-blue-200', text:'قيد المعالجة' };
  return { cls:'pill pill-orange', text:'مفتوح' };
}

(function boot(){
  const id = new URLSearchParams(location.search).get('id');
  if(!id){ alert('لا يوجد معرف بلاغ.'); return; }

  getOpenById(id).then(data => {
    if(!data){ alert('تعذر جلب بيانات البلاغ.'); return; }

    // عنوان/بانر
    document.getElementById('pageTitle').textContent   = `تفاصيل البلاغ (${data.id || data.complaintId})`;
    document.getElementById('pageSubtitle').textContent= data.hospital;
    document.getElementById('banner').className        = BANNER_CLASS[data.category] || 'banner banner--open';
    document.getElementById('bannerIcon').textContent  = ICON_EMOJI[data.category]   || '🟠';
    const catChip = document.getElementById('catChip');
    catChip.className = CAT_CHIP[data.category] || 'pill pill-orange';
    catChip.textContent = CAT_LABEL[data.category] || 'بلاغ';

    // بيانات أساسية
    setText('rptId', data.id || data.complaintId);
    setText('hospital', data.hospital);
    setText('dept', data.dept);
    const st = statusToChip(data.status);
    const statusEl = document.getElementById('statusChip');
    statusEl.className = st.cls;
    statusEl.textContent = st.text;

    const catInline = document.getElementById('catInline');
    catInline.className = CAT_CHIP[data.category] || 'pill pill-orange';
    catInline.textContent = CAT_LABEL[data.category] || 'بلاغ';

    setText('createdAt', data.createdAt);
    setText('updatedAt', data.updatedAt);
    setText('reporter', data.reporter);
    setText('assignee', data.assignee || '—');
    setText('source', data.source);
    setText('description', data.description || '—');

    // المرفقات
    const attWrap = document.getElementById('attachments');
    const atts = Array.isArray(data.attachments) ? data.attachments : [];
    attWrap.innerHTML = atts.length
      ? atts.map((f,i)=>`
        <a href="${f.url || '#'}" class="block px-4 py-2 rounded-lg border hover:bg-gray-50">
          📎 ${f.name || ('ملف #' + (i+1))}
        </a>
      `).join('')
      : 'لا توجد مرفقات';

    // السجل الزمني
    const timeline = document.getElementById('timeline');
    const hist = Array.isArray(data.history) ? data.history : [];
    timeline.innerHTML = hist.length
      ? hist.map(x => `
          <li class="relative">
            <span class="absolute -right-2.5 top-1 w-5 h-5 rounded-full bg-amber-500 border-4 border-white"></span>
            <div class="bg-gray-50 rounded-xl p-4">
              <div class="text-sm text-gray-500 mb-1">${x.at || ''}</div>
              <div class="font-semibold text-slate-800">${x.action || ''}</div>
              ${x.by ? `<div class="text-xs text-gray-500 mt-1">بواسطة: ${x.by}</div>` : ''}
            </div>
          </li>
        `).join('')
      : '<li>لا يوجد سجل.</li>';
  });
})();
