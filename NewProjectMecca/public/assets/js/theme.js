(function () {
  const root = document.documentElement;
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  /**
   * استرجاع التفضيل المخزن أو استخدام تفضيل النظام
   */
  const getPreferredTheme = () => {
    const stored = localStorage.getItem('theme');
    if (stored === 'dark' || stored === 'light') {
      return stored;
    }
    return mediaQuery.matches ? 'dark' : 'light';
  };

  /**
   * تطبيق الثيم على عنصر html
   */
  const applyTheme = (theme) => {
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    root.dataset.theme = theme;
  };

  /**
   * تحديث النص والأيقونة في زر التبديل إن وجد
   */
  const syncToggleUI = () => {
    const isDark = root.classList.contains('dark');
    const icon = document.getElementById('darkToggleIcon');
    const text = document.getElementById('darkToggleText');
    if (icon) {
      icon.textContent = isDark ? '☀️' : '🌙';
    }
    if (text) {
      text.textContent = isDark ? 'الوضع الفاتح' : 'الوضع الداكن';
    }
  };

  /**
   * تغيير الثيم وحفظه
   */
  const setTheme = (theme) => {
    applyTheme(theme);
    localStorage.setItem('theme', theme);
    syncToggleUI();
  };

  /**
   * تهيئة الوضع عند تحميل الملف مباشرة قبل رسم الصفحة
   */
  applyTheme(getPreferredTheme());

  document.addEventListener('DOMContentLoaded', () => {
    syncToggleUI();
    const toggle = document.getElementById('darkToggle');
    if (!toggle) return;

    toggle.addEventListener('click', () => {
      const nextTheme = root.classList.contains('dark') ? 'light' : 'dark';
      setTheme(nextTheme);
    });
  });

  const handleSystemChange = (event) => {
    const stored = localStorage.getItem('theme');
    if (stored === 'dark' || stored === 'light') {
      return;
    }
    applyTheme(event.matches ? 'dark' : 'light');
    syncToggleUI();
  };

  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', handleSystemChange);
  } else if (typeof mediaQuery.addListener === 'function') {
    mediaQuery.addListener(handleSystemChange);
  }

  window.themeManager = {
    toggle() {
      const nextTheme = root.classList.contains('dark') ? 'light' : 'dark';
      setTheme(nextTheme);
      return nextTheme;
    },
    set(theme) {
      setTheme(theme === 'dark' ? 'dark' : 'light');
    },
    current() {
      return root.classList.contains('dark') ? 'dark' : 'light';
    }
  };
})();
