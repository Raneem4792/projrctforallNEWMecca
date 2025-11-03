// complaint-responses.js
// إدارة الردود على البلاغات

class ComplaintResponses {
  constructor(complaintId) {
    this.complaintId = complaintId;
    this.replyTypes = [];
    this.responses = [];
    this.init();
  }

  async init() {
    await this.loadReplyTypes();
    await this.loadResponses();
    this.bindEvents();
  }

  // جلب أنواع الردود
  async loadReplyTypes() {
    try {
      const response = await fetch('/api/reply-types?active=1', {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('فشل في جلب أنواع الردود');
      }
      
      this.replyTypes = await response.json();
      this.populateReplyTypesSelect();
    } catch (error) {
      console.error('خطأ في جلب أنواع الردود:', error);
      this.showError('فشل في جلب أنواع الردود');
    }
  }

  // جلب الردود على البلاغ
  async loadResponses() {
    try {
      const response = await fetch(`/api/complaints/${this.complaintId}/responses`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('فشل في جلب الردود');
      }
      
      this.responses = await response.json();
      this.displayResponses();
    } catch (error) {
      console.error('خطأ في جلب الردود:', error);
      this.showError('فشل في جلب الردود');
    }
  }

  // ملء قائمة أنواع الردود
  populateReplyTypesSelect() {
    const select = document.getElementById('replyTypeSelect');
    if (!select) return;

    select.innerHTML = '<option value="">اختر نوع الرد</option>';
    this.replyTypes.forEach(type => {
      const option = document.createElement('option');
      option.value = type.ReplyTypeID;
      option.textContent = type.NameAr;
      select.appendChild(option);
    });
  }

  // عرض الردود
  displayResponses() {
    const container = document.getElementById('responsesTimeline');
    if (!container) return;

    if (this.responses.length === 0) {
      container.innerHTML = '<div class="no-responses">لا توجد ردود بعد</div>';
      return;
    }

    container.innerHTML = this.responses.map(response => `
      <div class="response-item ${response.IsInternal ? 'internal' : ''}">
        <div class="response-header">
          <span class="response-type">${response.ReplyTypeNameAr || ''}</span>
          <span class="response-date">${this.formatDate(response.CreatedAt)}</span>
        </div>
        <div class="response-message">${this.escapeHtml(response.Message)}</div>
        <div class="response-meta">
          <span class="responder">بواسطة: ${response.ResponderFullName}</span>
          ${response.TargetStatusCode ? `<span class="target-status">الحالة المستهدفة: ${response.TargetStatusCode}</span>` : ''}
          ${response.IsInternal ? '<span class="internal-badge">رد داخلي</span>' : ''}
        </div>
      </div>
    `).join('');
  }

  // ربط الأحداث
  bindEvents() {
    const saveBtn = document.getElementById('saveReplyBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.saveReply());
    }

    const clearBtn = document.getElementById('clearReplyBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clearForm());
    }
  }

  // حفظ الرد
  async saveReply() {
    const replyTypeId = document.getElementById('replyTypeSelect')?.value;
    const message = document.getElementById('replyMessage')?.value?.trim();
    const targetStatus = document.getElementById('targetStatusSelect')?.value || '';
    const isInternal = document.getElementById('isInternalCheck')?.checked ? 1 : 0;
    const files = document.getElementById('replyFiles')?.files;

    // التحقق من البيانات المطلوبة
    if (!replyTypeId || !message) {
      this.showError('الرجاء اختيار نوع الرد وكتابة نص الرد');
      return;
    }

    // إظهار مؤشر التحميل
    this.showLoading(true);

    try {
      const formData = new FormData();
      formData.append('ReplyTypeID', replyTypeId);
      formData.append('Message', message);
      if (targetStatus) formData.append('TargetStatusCode', targetStatus);
      formData.append('IsInternal', isInternal);
      
      // إضافة الملفات
      if (files && files.length > 0) {
        for (const file of files) {
          formData.append('files', file);
        }
      }

      const response = await fetch(`/api/complaints/${this.complaintId}/responses`, {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || 'فشل في حفظ الرد');
      }

      const savedResponse = await response.json();
      
      // تحديث قائمة الردود
      await this.loadResponses();
      
      // تحديث حالة البلاغ إذا تغيرت
      if (savedResponse.TargetStatusCode) {
        this.updateStatusBadge(savedResponse.TargetStatusCode);
      }

      // إغلاق النافذة ومسح النموذج
      this.closeModal();
      this.clearForm();
      
      this.showSuccess('تم حفظ الرد بنجاح');
      
    } catch (error) {
      console.error('خطأ في حفظ الرد:', error);
      this.showError(error.message || 'فشل في حفظ الرد');
    } finally {
      this.showLoading(false);
    }
  }

  // مسح النموذج
  clearForm() {
    const form = document.getElementById('replyForm');
    if (form) {
      form.reset();
    }
    
    // مسح الملفات المحددة
    const fileInput = document.getElementById('replyFiles');
    if (fileInput) {
      fileInput.value = '';
    }
  }

  // إغلاق النافذة المنبثقة
  closeModal() {
    const modal = document.getElementById('replyModal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  // تحديث شارة الحالة
  updateStatusBadge(newStatus) {
    const statusBadge = document.querySelector('.status-badge');
    if (statusBadge) {
      statusBadge.textContent = newStatus;
      statusBadge.className = `status-badge status-${newStatus.toLowerCase()}`;
    }
  }

  // تنسيق التاريخ
  formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('ar-SA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // حماية النص من HTML
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  // إظهار/إخفاء مؤشر التحميل
  showLoading(show) {
    const loading = document.getElementById('replyLoading');
    if (loading) {
      loading.style.display = show ? 'block' : 'none';
    }
  }

  // إظهار رسالة خطأ
  showError(message) {
    this.showMessage(message, 'error');
  }

  // إظهار رسالة نجاح
  showSuccess(message) {
    this.showMessage(message, 'success');
  }

  // إظهار رسالة
  showMessage(message, type) {
    // يمكن تخصيص هذا حسب نظام الإشعارات في التطبيق
    alert(message);
  }
}

// تصدير الكلاس للاستخدام
window.ComplaintResponses = ComplaintResponses;
