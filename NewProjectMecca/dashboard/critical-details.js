// critical-details.js — يجلب من قاعدة البيانات

const API_BASE = (location.port === '3001') ? '' : 'http://localhost:3001';

function escapeHTML(s){
  return String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

// استدعاء تفاصيل البلاغ من الباك-إند (نفس مسار open-details)
async function getComplaintById(id){
  const res = await fetch(`${API_BASE}/api/complaints/${encodeURIComponent(id)}`);
  if(!res.ok) throw new Error('HTTP '+res.status);
  return await res.json(); // { id, complaintId, hospital, dept, category, status, createdAt, updatedAt, reporter, assignee, source, description, attachments[], history[] }
}

function setChip(el, text, cls){
  el.textContent = text;
  el.className = `pill ${cls}`;
}

function renderAttachments(list){
  const wrap = document.getElementById('attachments');
  const items = Array.isArray(list) ? list : [];
  wrap.innerHTML = items.length
    ? items.map(a => `<a class="px-3 py-2 rounded-lg border hover:bg-gray-50" href="${escapeHTML(a.url||'#')}" target="_blank">${escapeHTML(a.name||'ملف')}</a>`).join('')
    : `<span class="text-gray-400">لا توجد مرفقات</span>`;
}

function renderTimeline(items){
  const ol = document.getElementById('timeline');
  const rows = Array.isArray(items) ? items : [];
  ol.innerHTML = rows.length ? rows.map(x => `
    <li class="relative">
      <span class="absolute -right-2.5 top-1 w-5 h-5 rounded-full bg-blue-600 border-4 border-white"></span>
      <div class="bg-gray-50 rounded-xl p-4">
        <div class="text-sm text-gray-500 mb-1">${escapeHTML(x.at||'')}</div>
        <div class="font-semibold text-slate-800">${escapeHTML(x.action||'')}</div>
        ${x.by ? `<div class="text-sm text-gray-600 mt-1">بواسطة: ${escapeHTML(x.by)}</div>` : ''}
        ${x.note ? `<div class="text-sm text-gray-600 mt-1">${escapeHTML(x.note)}</div>` : ''}
      </div>
    </li>
  `).join('') : `<li class="text-gray-400">لا توجد حركات.</li>`;
}

function setHeader(r){
  document.getElementById('pageTitle').textContent = `تفاصيل البلاغ (${r.id || r.complaintId})`;
  document.getElementById('pageSubtitle').textContent = r.hospital || '—';
  document.getElementById('rptId').textContent = r.id || r.complaintId;

  // أولوية/فئة
  const priorityChip = document.getElementById('priorityChip');
  if ((r.category || '').toLowerCase() === 'critical') {
    setChip(priorityChip, 'حرج', 'pill-red');
  } else {
    // لو مو حرج (انفتح الرابط مباشرة)، نعرضها كتنبيه ونقدر نحول لصفحة open-details
    setChip(priorityChip, 'غير حرج', 'pill-yellow');
  }

  // الحالة
  const st = (r.status || '').trim().toLowerCase();
  const statusEl = document.getElementById('statusChip');
  if (st.includes('closed') || st.includes('مغل')) setChip(statusEl, 'مغلق', 'pill-green');
  else if (st.includes('in_progress') || st.includes('قيد')) setChip(statusEl, 'قيد المعالجة', 'pill-blue');
  else setChip(statusEl, 'مفتوح', 'pill-orange');
}

function fillBasics(r){
  document.getElementById('hospital').textContent   = r.hospital || '—';
  document.getElementById('dept').textContent       = r.dept || '—';
  document.getElementById('createdAt').textContent  = r.createdAt || '—';
  document.getElementById('reporter').textContent   = r.reporter || '—';
  document.getElementById('assignee').textContent   = r.assignee || '—';
  document.getElementById('contact').textContent    = r.contact || '—'; // لو تبين تجي من Mobile/Email أضفناها لاحقًا
  document.getElementById('updatedAt').textContent  = r.updatedAt || '—';
  document.getElementById('source').textContent     = r.source || '—';
  document.getElementById('description').textContent= r.description || '—';
}

function initActions(){
  document.getElementById('printBtn').addEventListener('click', ()=> window.print());
  // زر الرجوع يترك كما هو (critical.html) — أو استخدمي from= في الرابط إن تبين
}

(async function boot(){
  const id = new URLSearchParams(location.search).get('id');
  if(!id){ alert('لا يوجد معرف بلاغ.'); return; }

  try{
    const rpt = await getComplaintById(id);

    // تأكيد أن البلاغ حرج فعلاً — إن لم يكن، نحول المستخدم لصفحة التفاصيل العادية
    if ((rpt.category || '').toLowerCase() !== 'critical') {
      // بإمكانك تحويل المستخدم تلقائياً:
      // location.href = `open-details.html?id=${encodeURIComponent(id)}`;
      // أو فقط نعرضه كغير حرج داخل نفس الصفحة:
    }

    setHeader(rpt);
    fillBasics(rpt);
    renderAttachments(rpt.attachments);
    renderTimeline(rpt.history);
    initActions();
  }catch(err){
    console.error('critical-details boot error', err);
    alert('تعذر جلب بيانات البلاغ.');
  }
})();