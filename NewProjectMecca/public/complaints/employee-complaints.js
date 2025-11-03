// employee-complaints.js
// JavaScript لصفحة بلاغات الموظفين

const API_BASE = 'http://localhost:3001/api';

// عناصر الصفحة
const els = {
  employeeSearch: document.getElementById('employeeSearch'),
  statusFilter: document.getElementById('statusFilter'),
  priorityFilter: document.getElementById('priorityFilter'),
  searchBtn: document.getElementById('searchBtn'),
  loadingIndicator: document.getElementById('loadingIndicator'),
  complaintsList: document.getElementById('complaintsList'),
  noResults: document.getElementById('noResults'),
  pagination: document.getElementById('pagination'),
  prevBtn: document.getElementById('prevBtn'),
  nextBtn: document.getElementById('nextBtn'),
  pageInfo: document.getElementById('pageInfo')
};

// متغيرات الترقيم
let currentPage = 1;
let totalPages = 1;
let currentFilters = {};

// تهيئة الصفحة
document.addEventListener('DOMContentLoaded', () => {
  loadComplaints();
  setupEventListeners();
});

// إعداد مستمعي الأحداث
function setupEventListeners() {
  // زر البحث
  if (els.searchBtn) {
    els.searchBtn.addEventListener('click', () => {
      currentPage = 1;
      loadComplaints();
    });
  }

  // البحث عند الضغط على Enter
  if (els.employeeSearch) {
    els.employeeSearch.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        currentPage = 1;
        loadComplaints();
      }
    });
  }

  // الترقيم
  if (els.prevBtn) {
    els.prevBtn.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        loadComplaints();
      }
    });
  }

  if (els.nextBtn) {
    els.nextBtn.addEventListener('click', () => {
      if (currentPage < totalPages) {
        currentPage++;
        loadComplaints();
      }
    });
  }
}

// جلب البلاغات
async function loadComplaints() {
  try {
    showLoading(true);
    
    // بناء الفلاتر
    const filters = {
      page: currentPage,
      pageSize: 10,
      employeeSearch: els.employeeSearch?.value?.trim() || '',
      status: els.statusFilter?.value || '',
      priority: els.priorityFilter?.value || ''
    };

    currentFilters = filters;

    // بناء URL
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });

    const url = `${API_BASE}/complaint-targets?${params.toString()}`;
    
    console.log('🔍 جلب بلاغات الموظفين:', url);

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        alert('انتهت جلستك. يرجى تسجيل الدخول مرة أخرى');
        window.location.href = '../../auth/login.html';
        return;
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    
    if (data.success) {
      renderComplaints(data.data || []);
      updatePagination(data.pagination || {});
    } else {
      throw new Error(data.message || 'فشل في جلب البيانات');
    }

  } catch (error) {
    console.error('❌ خطأ في جلب البلاغات:', error);
    showError('فشل في جلب البلاغات: ' + error.message);
  } finally {
    showLoading(false);
  }
}

// عرض البلاغات
function renderComplaints(complaints) {
  if (!els.complaintsList) return;

  if (complaints.length === 0) {
    els.complaintsList.innerHTML = '';
    showNoResults(true);
    return;
  }

  showNoResults(false);

  els.complaintsList.innerHTML = complaints.map(complaint => `
    <div class="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow">
      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <!-- معلومات البلاغ -->
        <div class="flex-1">
          <div class="flex items-center gap-3 mb-2">
            <h3 class="text-lg font-semibold text-gray-800">${complaint.ticket || 'غير محدد'}</h3>
            <span class="px-2 py-1 text-xs rounded-full ${getStatusClass(complaint.status)}">
              ${getStatusText(complaint.status)}
            </span>
            <span class="px-2 py-1 text-xs rounded-full ${getPriorityClass(complaint.priority)}">
              ${getPriorityText(complaint.priority)}
            </span>
          </div>
          
          <div class="grid md:grid-cols-2 gap-3 text-sm text-gray-600">
            <div><span class="font-semibold">المراجع:</span> ${complaint.fullName || 'غير محدد'}</div>
            <div><span class="font-semibold">الموظف المستهدف:</span> ${complaint.TargetEmployeeName || 'غير محدد'}</div>
            <div><span class="font-semibold">القسم:</span> ${complaint.TargetDepartmentName || complaint.DepartmentName || 'غير محدد'}</div>
            <div><span class="font-semibold">تاريخ الإنشاء:</span> ${formatDate(complaint.CreatedAt)}</div>
          </div>
          
          ${complaint.Description ? `
            <div class="mt-3">
              <p class="text-sm text-gray-700 line-clamp-2">${complaint.Description}</p>
            </div>
          ` : ''}
        </div>
        
        <!-- أزرار الإجراءات -->
        <div class="flex flex-col gap-2">
          <button onclick="viewComplaintDetails('${complaint.ticket}', ${complaint.ComplaintID})" 
                  class="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition">
            عرض التفاصيل
          </button>
          <button onclick="deleteComplaintTarget(${complaint.TargetID})" 
                  class="px-4 py-2 bg-red-500 text-white rounded-lg text-sm hover:bg-red-600 transition">
            حذف البلاغ
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

// تحديث الترقيم
function updatePagination(pagination) {
  if (!els.pagination || !pagination) return;

  currentPage = pagination.page || 1;
  totalPages = pagination.pages || 1;

  // إظهار/إخفاء الترقيم
  els.pagination.classList.toggle('hidden', totalPages <= 1);

  // تحديث معلومات الصفحة
  if (els.pageInfo) {
    els.pageInfo.textContent = `صفحة ${currentPage} من ${totalPages}`;
  }

  // تحديث أزرار التنقل
  if (els.prevBtn) {
    els.prevBtn.disabled = currentPage <= 1;
  }
  if (els.nextBtn) {
    els.nextBtn.disabled = currentPage >= totalPages;
  }
}

// عرض/إخفاء مؤشر التحميل
function showLoading(show) {
  if (els.loadingIndicator) {
    els.loadingIndicator.classList.toggle('hidden', !show);
  }
  if (els.complaintsList) {
    els.complaintsList.classList.toggle('hidden', show);
  }
}

// عرض/إخفاء رسالة عدم وجود نتائج
function showNoResults(show) {
  if (els.noResults) {
    els.noResults.classList.toggle('hidden', !show);
  }
}

// عرض رسالة خطأ
function showError(message) {
  if (els.complaintsList) {
    els.complaintsList.innerHTML = `
      <div class="text-center py-8">
        <div class="text-6xl mb-4">❌</div>
        <h3 class="text-xl font-semibold text-red-600 mb-2">حدث خطأ</h3>
        <p class="text-gray-600">${message}</p>
        <button onclick="loadComplaints()" class="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition">
          إعادة المحاولة
        </button>
      </div>
    `;
  }
}

// دوال مساعدة للعرض
function getStatusClass(status) {
  const classes = {
    'OPEN': 'bg-blue-100 text-blue-800',
    'IN_PROGRESS': 'bg-yellow-100 text-yellow-800',
    'CLOSED': 'bg-green-100 text-green-800',
    'CRITICAL': 'bg-red-100 text-red-800'
  };
  return classes[status] || 'bg-gray-100 text-gray-800';
}

function getStatusText(status) {
  const texts = {
    'OPEN': 'مفتوحة',
    'IN_PROGRESS': 'قيد المعالجة',
    'CLOSED': 'مغلقة',
    'CRITICAL': 'حرجة'
  };
  return texts[status] || status || 'غير محدد';
}

function getPriorityClass(priority) {
  const classes = {
    'HIGH': 'bg-orange-100 text-orange-800',
    'MEDIUM': 'bg-yellow-100 text-yellow-800',
    'LOW': 'bg-green-100 text-green-800',
    'URGENT': 'bg-red-100 text-red-800'
  };
  return classes[priority] || 'bg-gray-100 text-gray-800';
}

function getPriorityText(priority) {
  const texts = {
    'HIGH': 'عالية',
    'MEDIUM': 'متوسطة',
    'LOW': 'منخفضة',
    'URGENT': 'عاجلة'
  };
  return texts[priority] || priority || 'غير محدد';
}

function formatDate(dateString) {
  if (!dateString) return 'غير محدد';
  
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    return dateString;
  }
}

// دوال الإجراءات
function viewComplaintDetails(ticket, complaintId) {
  // التوجيه لصفحة تفاصيل البلاغ
  window.location.href = `history/complaint-details.html?ticket=${encodeURIComponent(ticket)}&hid=${complaintId}`;
}

async function deleteComplaintTarget(targetId) {
  if (!confirm('هل أنت متأكد من حذف هذا البلاغ على الموظف؟')) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/complaint-targets/${targetId}`, {
      method: 'DELETE',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        alert('انتهت جلستك. يرجى تسجيل الدخول مرة أخرى');
        window.location.href = '../../auth/login.html';
        return;
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    
    if (data.success) {
      alert('✅ تم حذف البلاغ على الموظف بنجاح');
      loadComplaints(); // إعادة تحميل القائمة
    } else {
      throw new Error(data.message || 'فشل في حذف البلاغ');
    }

  } catch (error) {
    console.error('❌ خطأ في حذف البلاغ:', error);
    alert('❌ فشل في حذف البلاغ: ' + error.message);
  }
}
