/* ========================================
   ملف JavaScript الخاص بالصفحة الرئيسية
   Index Page JavaScript File
   ======================================== */

// ========================================
// متغيرات عامة
// Global Variables
// ========================================

/**
 * متغيرات التطبيق العامة
 */
let isScrolled = false;
let animationObserver = null;
let counterObserver = null;

// ========================================
// وظائف إدارة شريط التنقل
// Navigation Bar Management Functions
// ========================================

/**
 * تهيئة شريط التنقل
 * إضافة تأثير التمرير وتغيير المظهر عند التمرير
 */
function initializeNavigation() {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;

  // إضافة مستمع للتمرير
  window.addEventListener('scroll', () => {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    
    if (scrollTop > 50 && !isScrolled) {
      navbar.classList.add('scrolled');
      isScrolled = true;
    } else if (scrollTop <= 50 && isScrolled) {
      navbar.classList.remove('scrolled');
      isScrolled = false;
    }
  });
}

/**
 * تهيئة القائمة المتنقلة للموبايل
 */
function initializeMobileMenu() {
  const mobileMenuButton = document.querySelector('.md\\:hidden button');
  if (!mobileMenuButton) return;

  mobileMenuButton.addEventListener('click', () => {
    // يمكن إضافة منطق القائمة المتنقلة هنا
    console.log('تم النقر على زر القائمة المتنقلة');
  });
}

// ========================================
// وظائف العدادات المتحركة
// Animated Counters Functions
// ========================================

/**
 * تشغيل عداد متحرك
 * @param {HTMLElement} element - عنصر العداد
 * @param {number} target - القيمة المستهدفة
 * @param {number} duration - مدة العد (بالميلي ثانية)
 */
function animateCounter(element, target, duration = 2000) {
  if (!element) return;

  const start = 0;
  const increment = target / (duration / 16); // 60 FPS
  let current = start;

  const timer = setInterval(() => {
    current += increment;
    
    if (current >= target) {
      current = target;
      clearInterval(timer);
    }
    
    // تنسيق الرقم مع فواصل الآلاف
    element.textContent = Math.floor(current).toLocaleString('ar-SA');
  }, 16);
}

/**
 * تهيئة مراقب العدادات
 * تشغيل العدادات عند ظهورها في الشاشة
 */
function initializeCounterObserver() {
  const counters = document.querySelectorAll('.counter');
  if (counters.length === 0) return;

  counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const target = parseInt(entry.target.getAttribute('data-target'));
        if (target && !entry.target.classList.contains('animated')) {
          entry.target.classList.add('animated');
          animateCounter(entry.target, target);
        }
      }
    });
  }, {
    threshold: 0.5
  });

  counters.forEach(counter => {
    counterObserver.observe(counter);
  });
}

// ========================================
// وظائف تأثيرات الحركة
// Animation Effects Functions
// ========================================

/**
 * تهيئة مراقب الحركات
 * تشغيل تأثيرات الظهور عند التمرير
 */
function initializeAnimationObserver() {
  const animatedElements = document.querySelectorAll('.animate-fade-in-up');
  if (animatedElements.length === 0) return;

  animationObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
      }
    });
  }, {
    threshold: 0.1
  });

  animatedElements.forEach(element => {
    animationObserver.observe(element);
  });
}

/**
 * إضافة تأثير التموج عند النقر
 * @param {HTMLElement} element - العنصر المراد إضافة التأثير إليه
 */
function addRippleEffect(element) {
  if (!element) return;

  element.addEventListener('click', function(e) {
    const ripple = document.createElement('span');
    const rect = this.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;

    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    ripple.classList.add('ripple');

    this.appendChild(ripple);

    setTimeout(() => {
      ripple.remove();
    }, 600);
  });
}

// ========================================
// وظائف إدارة الخدمات
// Services Management Functions
// ========================================

/**
 * تهيئة تفاعلات الخدمات
 * إضافة تأثيرات النقر والتمرير للخدمات
 */
function initializeServices() {
  const serviceCards = document.querySelectorAll('.card-hover');
  
  serviceCards.forEach(card => {
    // إضافة تأثير التموج
    addRippleEffect(card);
    
    // إضافة تأثير التركيز للوصولية
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        card.click();
      }
    });
    
    // إضافة تأثير النقر
    card.addEventListener('click', () => {
      // يمكن إضافة منطق التنقل هنا
      console.log('تم النقر على خدمة:', card.querySelector('h3')?.textContent);
    });
  });
}

/**
 * تهيئة تأثيرات الأيقونات
 */
function initializeServiceIcons() {
  const serviceIcons = document.querySelectorAll('.service-icon');
  
  serviceIcons.forEach(icon => {
    icon.addEventListener('mouseenter', () => {
      icon.style.transform = 'scale(1.1) rotate(5deg)';
    });
    
    icon.addEventListener('mouseleave', () => {
      icon.style.transform = 'scale(1) rotate(0deg)';
    });
  });
}

// ========================================
// وظائف إدارة النماذج
// Form Management Functions
// ========================================

/**
 * تهيئة النماذج
 * إضافة التحقق من صحة البيانات
 */
function initializeForms() {
  const forms = document.querySelectorAll('form');
  
  forms.forEach(form => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      
      // التحقق من صحة البيانات
      const isValid = validateForm(form);
      
      if (isValid) {
        // إرسال النموذج
        submitForm(form);
      }
    });
  });
}

/**
 * التحقق من صحة النموذج
 * @param {HTMLFormElement} form - النموذج المراد التحقق منه
 * @returns {boolean} - صحة النموذج
 */
function validateForm(form) {
  const inputs = form.querySelectorAll('input[required], textarea[required]');
  let isValid = true;
  
  inputs.forEach(input => {
    if (!input.value.trim()) {
      showFieldError(input, 'هذا الحقل مطلوب');
      isValid = false;
    } else {
      clearFieldError(input);
    }
  });
  
  return isValid;
}

/**
 * إظهار خطأ في حقل
 * @param {HTMLElement} field - الحقل
 * @param {string} message - رسالة الخطأ
 */
function showFieldError(field, message) {
  clearFieldError(field);
  
  const errorDiv = document.createElement('div');
  errorDiv.className = 'field-error text-red-500 text-sm mt-1';
  errorDiv.textContent = message;
  
  field.parentNode.appendChild(errorDiv);
  field.classList.add('border-red-500');
}

/**
 * مسح خطأ من حقل
 * @param {HTMLElement} field - الحقل
 */
function clearFieldError(field) {
  const errorDiv = field.parentNode.querySelector('.field-error');
  if (errorDiv) {
    errorDiv.remove();
  }
  field.classList.remove('border-red-500');
}

/**
 * إرسال النموذج
 * @param {HTMLFormElement} form - النموذج
 */
function submitForm(form) {
  // إظهار مؤشر التحميل
  showLoadingIndicator();
  
  // محاكاة إرسال النموذج
  setTimeout(() => {
    hideLoadingIndicator();
    showSuccessMessage('تم إرسال النموذج بنجاح');
  }, 2000);
}

// ========================================
// وظائف الرسائل والإشعارات
// Messages and Notifications Functions
// ========================================

/**
 * إظهار رسالة نجاح
 * @param {string} message - الرسالة
 */
function showSuccessMessage(message) {
  showNotification(message, 'success');
}

/**
 * إظهار رسالة خطأ
 * @param {string} message - الرسالة
 */
function showErrorMessage(message) {
  showNotification(message, 'error');
}

/**
 * إظهار إشعار
 * @param {string} message - الرسالة
 * @param {string} type - نوع الإشعار (success, error, info)
 */
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type} fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg transform translate-x-full transition-transform duration-300`;
  
  const colors = {
    success: 'bg-green-500 text-white',
    error: 'bg-red-500 text-white',
    info: 'bg-blue-500 text-white'
  };
  
  notification.className += ` ${colors[type]}`;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  // إظهار الإشعار
  setTimeout(() => {
    notification.classList.remove('translate-x-full');
  }, 100);
  
  // إخفاء الإشعار بعد 3 ثوان
  setTimeout(() => {
    notification.classList.add('translate-x-full');
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, 3000);
}

/**
 * إظهار مؤشر التحميل
 */
function showLoadingIndicator() {
  const loader = document.createElement('div');
  loader.id = 'loading-indicator';
  loader.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
  loader.innerHTML = '<div class="loading-spinner"></div>';
  
  document.body.appendChild(loader);
}

/**
 * إخفاء مؤشر التحميل
 */
function hideLoadingIndicator() {
  const loader = document.getElementById('loading-indicator');
  if (loader) {
    loader.remove();
  }
}

// ========================================
// وظائف إدارة الأحداث
// Event Management Functions
// ========================================

/**
 * تهيئة جميع الأحداث
 */
function initializeEventListeners() {
  // أحداث التمرير
  window.addEventListener('scroll', handleScroll);
  
  // أحداث تغيير حجم النافذة
  window.addEventListener('resize', handleResize);
  
  // أحداث لوحة المفاتيح
  document.addEventListener('keydown', handleKeydown);
}

/**
 * معالج التمرير
 */
function handleScroll() {
  // يمكن إضافة منطق إضافي للتمرير هنا
}

/**
 * معالج تغيير حجم النافذة
 */
function handleResize() {
  // إعادة حساب المواضع عند تغيير حجم النافذة
  if (animationObserver) {
    animationObserver.disconnect();
    initializeAnimationObserver();
  }
  
  if (counterObserver) {
    counterObserver.disconnect();
    initializeCounterObserver();
  }
}

/**
 * معالج لوحة المفاتيح
 * @param {KeyboardEvent} e - حدث لوحة المفاتيح
 */
function handleKeydown(e) {
  // إضافة اختصارات لوحة المفاتيح
  if (e.ctrlKey && e.key === 'k') {
    e.preventDefault();
    // فتح البحث
    console.log('فتح البحث');
  }
}

// ========================================
// وظائف إدارة الملف الشخصي
// Profile Management Functions
// ========================================

/**
 * إظهار رابط "ملفي الشخصي" إذا كان المستخدم مسجل دخول
 */
async function initializeProfileLink() {
  try {
    const token = localStorage.getItem('authToken') || localStorage.getItem('token');
    if (!token) return;
    
    const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'http://localhost:3001'
      : '';
    
    const res = await fetch(`${API_BASE}/api/auth/me`, { 
      credentials: 'include',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!res.ok) return;
    
    const me = await res.json();
    if (me?.authenticated || me?.UserID) {
      const profileLink = document.getElementById('nav-profile');
      if (profileLink) {
        profileLink.classList.remove('hidden');
      }
    }
  } catch (error) {
    console.log('Profile link check failed:', error);
  }
}

// ========================================
// وظائف التهيئة الرئيسية
// Main Initialization Functions
// ========================================

/**
 * تهيئة التطبيق
 */
function initializeApp() {
  // تهيئة شريط التنقل
  initializeNavigation();
  initializeMobileMenu();
  
  // تهيئة العدادات
  initializeCounterObserver();
  
  // تهيئة الحركات
  initializeAnimationObserver();
  
  // تهيئة الخدمات
  initializeServices();
  initializeServiceIcons();
  
  // تهيئة النماذج
  initializeForms();
  
  // تهيئة الأحداث
  initializeEventListeners();
  
  // تهيئة رابط الملف الشخصي
  initializeProfileLink();
  
  console.log('تم تهيئة التطبيق بنجاح');
}

/**
 * تنظيف الموارد
 */
function cleanup() {
  if (animationObserver) {
    animationObserver.disconnect();
  }
  
  if (counterObserver) {
    counterObserver.disconnect();
  }
  
  // إزالة مستمعي الأحداث
  window.removeEventListener('scroll', handleScroll);
  window.removeEventListener('resize', handleResize);
  document.removeEventListener('keydown', handleKeydown);
}

// ========================================
// تشغيل التهيئة عند تحميل الصفحة
// Run Initialization on Page Load
// ========================================

document.addEventListener('DOMContentLoaded', initializeApp);

// تنظيف الموارد عند إغلاق الصفحة
window.addEventListener('beforeunload', cleanup);
