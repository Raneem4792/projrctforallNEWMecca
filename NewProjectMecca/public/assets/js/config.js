// ملف تكوين API - يحتوي على عنوان الخادم
const API_CONFIG = {
  BASE_URL: 'http://localhost:3001',
  API_URL: 'http://localhost:3001/api',
  ENDPOINTS: {
    auth: '/auth',
    complaints: '/complaints',
    departments: '/departments',
    hospitals: '/hospitals',
    users: '/users',
    health: '/health',
    lookups: '/lookups',
    uploads: '/uploads'
  }
};

// دالة مساعدة للحصول على URL كامل
function getApiUrl(endpoint) {
  return `${API_CONFIG.API_URL}${endpoint}`;
}

// دالة مساعدة للحصول على URL الملفات المرفوعة
function getUploadUrl(filepath) {
  return `${API_CONFIG.BASE_URL}/api/uploads/${filepath}`;
}

// تصدير للاستخدام في الملفات الأخرى
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { API_CONFIG, getApiUrl, getUploadUrl };
}

