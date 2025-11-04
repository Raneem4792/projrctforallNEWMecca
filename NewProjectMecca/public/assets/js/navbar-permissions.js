/* ========================================
   ملف JavaScript لإخفاء روابط navbar والبطاقات بناءً على الصلاحيات
   Hide Navbar Links and Cards Based on Permissions
   - التقارير والإحصائيات: يتطلب REPORTS_PAGE
   - لوحة التحكم: يتطلب DASH_PAGE
   - بطاقة الزائر السري: يتطلب MYSTERY_MODULE
   ======================================== */

// إخفاء روابط navbar والبطاقات بناءً على الصلاحيات
async function hideNavLinksIfNoPermission() {
  try {
    const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'http://localhost:3001'
      : '';
    const token = localStorage.getItem('token') || localStorage.getItem('authToken');
    
    if (!token) {
      console.warn('⚠️ لا يوجد token، سيتم إخفاء الروابط والبطاقات كإجراء أمان');
      hideReportsLink();
      hideDashboardLink();
      hideMysteryCard();
      return;
    }

    const res = await fetch(`${API_BASE}/api/permissions/me`, {
      headers: { 
        'Accept': 'application/json', 
        'Authorization': `Bearer ${token}` 
      },
      credentials: 'include'
    });
    
    if (!res.ok) {
      console.warn('⚠️ فشل تحميل الصلاحيات للـ navbar:', res.status);
      hideReportsLink(); // إخفاء كإجراء أمان
      hideDashboardLink(); // إخفاء كإجراء أمان
      hideMysteryCard(); // إخفاء كإجراء أمان
      return;
    }
    
    const json = await res.json();
    const p = json.data || {};

    // ====== تبويب التقارير والإحصائيات ======
    if (!p.reportsPage) {
      hideReportsLink();
      console.log('🔒 تم إخفاء تبويب التقارير والإحصائيات (reportsPage=false)');
    } else {
      showReportsLink();
      console.log('✅ رابط التقارير مرئي - الصلاحية موجودة');
    }

    // ====== تبويب لوحة التحكم ======
    if (!p.dashPage) {
      hideDashboardLink();
      console.log('🔒 تم إخفاء تبويب لوحة التحكم (dashPage=false)');
    } else {
      showDashboardLink();
      console.log('✅ رابط لوحة التحكم مرئي - الصلاحية موجودة');
    }

    // ====== بطاقة الزائر السري ======
    if (!p.mysteryModule) {
      hideMysteryCard();
      console.log('🔒 تم إخفاء بطاقة الزائر السري (لا توجد صلاحية MYSTERY_MODULE)');
    } else {
      showMysteryCard();
      console.log('✅ بطاقة الزائر السري مرئية - الصلاحية موجودة');
    }
  } catch (err) {
    console.error('❌ فشل التحقق من صلاحيات navbar:', err);
    hideReportsLink(); // إخفاء كإجراء أمان في حالة الخطأ
    hideDashboardLink(); // إخفاء كإجراء أمان في حالة الخطأ
    hideMysteryCard(); // إخفاء كإجراء أمان في حالة الخطأ
  }
}

// دالة مساعدة لإخفاء رابط التقارير
function hideReportsLink() {
  // البحث عن جميع الروابط التي تحتوي على reports.html
  const reportsLinks = document.querySelectorAll('a[href*="reports.html"]');
  reportsLinks.forEach(link => {
    // التحقق من أن النص يحتوي على "التقارير" أو "reports"
    const linkText = link.textContent.trim();
    if (linkText.includes('التقارير') || linkText.includes('reports') || linkText.includes('الإحصائيات')) {
      // إخفاء الرابط نفسه أو العنصر الأب (li) إذا كان موجوداً
      if (link.parentElement && link.parentElement.tagName === 'LI') {
        link.parentElement.style.display = 'none';
      } else {
        link.style.display = 'none';
      }
    }
  });
}

// دالة مساعدة لإظهار رابط التقارير
function showReportsLink() {
  const reportsLinks = document.querySelectorAll('a[href*="reports.html"]');
  reportsLinks.forEach(link => {
    const linkText = link.textContent.trim();
    if (linkText.includes('التقارير') || linkText.includes('reports') || linkText.includes('الإحصائيات')) {
      if (link.parentElement && link.parentElement.tagName === 'LI') {
        link.parentElement.style.display = '';
      } else {
        link.style.display = '';
      }
    }
  });
}

// دالة مساعدة لإخفاء بطاقة الزائر السري
function hideMysteryCard() {
  const mysteryCard = document.querySelector('[data-card="mystery"]');
  if (mysteryCard) {
    mysteryCard.style.display = 'none';
  }
}

// دالة مساعدة لإظهار بطاقة الزائر السري
function showMysteryCard() {
  const mysteryCard = document.querySelector('[data-card="mystery"]');
  if (mysteryCard) {
    mysteryCard.style.display = '';
  }
}

// دالة مساعدة لإخفاء رابط لوحة التحكم
function hideDashboardLink() {
  const dashboardLinks = document.querySelectorAll('a[href*="dashboard.html"], a[href*="dashboard/index.html"]');
  dashboardLinks.forEach(link => {
    const linkText = link.textContent.trim();
    if (linkText.includes('لوحة التحكم') || linkText.includes('لوحة') || linkText.includes('dashboard') || linkText.includes('Dashboard')) {
      if (link.parentElement && link.parentElement.tagName === 'LI') {
        link.parentElement.style.display = 'none';
      } else {
        link.style.display = 'none';
      }
    }
  });
}

// دالة مساعدة لإظهار رابط لوحة التحكم
function showDashboardLink() {
  const dashboardLinks = document.querySelectorAll('a[href*="dashboard.html"], a[href*="dashboard/index.html"]');
  dashboardLinks.forEach(link => {
    const linkText = link.textContent.trim();
    if (linkText.includes('لوحة التحكم') || linkText.includes('لوحة') || linkText.includes('dashboard') || linkText.includes('Dashboard')) {
      if (link.parentElement && link.parentElement.tagName === 'LI') {
        link.parentElement.style.display = '';
      } else {
        link.style.display = '';
      }
    }
  });
}

// تشغيل عند تحميل الصفحة
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', hideNavLinksIfNoPermission);
} else {
  // إذا كان DOM محمّل بالفعل
  hideNavLinksIfNoPermission();
}

