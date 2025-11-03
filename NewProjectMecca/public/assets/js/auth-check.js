/**
 * نظام التحقق من تسجيل الدخول
 * Auth Check System
 */

// قائمة الصفحات المحمية
const PROTECTED_PAGES = [
    '/NewProjectMecca/index/index.html',
    '/NewProjectMecca/public/complaints/submit/submit-complaint.html',
    '/NewProjectMecca/public/complaints/track/track-complaint.html',
    '/NewProjectMecca/public/complaints/history/complaints-history.html',
    '/NewProjectMecca/public/complaints/history/complaint-details.html',
    '/NewProjectMecca/public/admin/admin-hub.html'
];

// صفحة تسجيل الدخول
const LOGIN_PAGE = '/NewProjectMecca/public/auth/login.html';

/**
 * التحقق من حالة تسجيل الدخول
 * @returns {boolean} true إذا كان مسجل دخول، false إذا لم يكن
 */
function isUserLoggedIn() {
    try {
        console.log('🔍 التحقق من تسجيل الدخول...');
        
        // التحقق من وجود token في localStorage (دعم كلا المفتاحين)
        const token = localStorage.getItem('authToken') || localStorage.getItem('token');
        const userData = localStorage.getItem('userData') || localStorage.getItem('user');
        
        console.log('📦 localStorage.authToken:', localStorage.getItem('authToken') ? 'موجود ✅' : 'غير موجود ❌');
        console.log('📦 localStorage.token:', localStorage.getItem('token') ? 'موجود ✅' : 'غير موجود ❌');
        console.log('📦 localStorage.userData:', localStorage.getItem('userData') ? 'موجود ✅' : 'غير موجود ❌');
        console.log('📦 localStorage.user:', localStorage.getItem('user') ? 'موجود ✅' : 'غير موجود ❌');
        
        if (!token) {
            console.log('❌ لا يوجد توكِن تسجيل دخول في localStorage');
            return false;
        }
        
        console.log('✅ التوكِن موجود');
        
        // userData اختياري - بعض الأنظمة قد لا تخزنه
        if (!userData) {
            console.log('⚠️ لا توجد بيانات مستخدم محفوظة، لكن التوكِن موجود');
            // نسمح بالاستمرار إذا كان التوكِن موجوداً
            return true;
        }
        
        console.log('✅ بيانات المستخدم موجودة');
        
        // التحقق من صحة البيانات
        try {
            const user = JSON.parse(userData);
            console.log('📋 بيانات المستخدم:', user);
            console.log('🆔 UserID:', user.UserID);
            console.log('👤 Username:', user.Username);
            
            if (!user.UserID && !user.Username) {
                console.log('❌ بيانات المستخدم غير صحيحة - لا يوجد UserID أو Username');
                return false;
            }
            
            console.log('✅ بيانات المستخدم صحيحة');
        } catch (parseError) {
            console.log('❌ خطأ في تحليل بيانات المستخدم:', parseError);
            return false;
        }
        
        console.log('✅ المستخدم مسجل دخول بنجاح');
        return true;
    } catch (error) {
        console.error('❌ خطأ في التحقق من تسجيل الدخول:', error);
        return false;
    }
}

/**
 * التحقق من أن الصفحة الحالية محمية
 * @returns {boolean} true إذا كانت الصفحة محمية
 */
function isCurrentPageProtected() {
    const currentPath = window.location.pathname;
    const currentHref = window.location.href;
    console.log('🔍 المسار الحالي:', currentPath);
    console.log('🌐 الرابط الكامل:', currentHref);
    
    // ✅ استثناء صفحات تسجيل الدخول والمسجلة
    const excludedPages = [
        'login.html',
        'signup.html',
        'forgot-password.html',
        'reset-password.html'
    ];
    
    const isExcludedPage = excludedPages.some(page => {
        const found = currentPath.includes(page);
        console.log(`🔍 فحص الصفحات المستثناة: ${page} = ${found}`);
        return found;
    });
    
    if (isExcludedPage) {
        console.log('✅ الصفحة مستثناة من الحماية (صفحة تسجيل دخول/مسجلة)');
        return false;
    }
    
    console.log('📋 الصفحات المحمية:', PROTECTED_PAGES);
    
    // فحص بسيط - البحث عن الملفات المحمية في المسار
    const protectedFiles = [
        'complaint-details.html',
        'complaints-history.html',
        'submit-complaint.html',
        'track-complaint.html',
        'admin-hub.html',
        'index.html'
    ];
    
    const isProtectedFile = protectedFiles.some(file => {
        const found = currentPath.includes(file);
        console.log(`🔍 فحص الملف: ${file} = ${found}`);
        return found;
    });
    
    if (isProtectedFile) {
        console.log('✅ تم العثور على ملف محمي - الصفحة محمية');
        return true;
    }
    
    // فحص أكثر مرونة - البحث عن جزء من المسار
    const isProtected = PROTECTED_PAGES.some(protectedPath => {
        const matches = currentPath.includes(protectedPath) || protectedPath.includes(currentPath);
        console.log(`🔍 فحص: ${protectedPath} vs ${currentPath} = ${matches}`);
        return matches;
    });
    
    console.log('🛡️ هل الصفحة محمية؟', isProtected);
    return isProtected;
}

/**
 * إعادة التوجيه إلى صفحة تسجيل الدخول
 */
function redirectToLogin() {
    // منع التكرار - إذا كنا بالفعل في صفحة تسجيل الدخول
    if (window.location.pathname.includes('login.html')) {
        console.log('✅ نحن بالفعل في صفحة تسجيل الدخول - لا حاجة لإعادة التوجيه');
        return;
    }
    
    console.log('🔄 إعادة التوجيه إلى صفحة تسجيل الدخول...');
    console.log('📍 من:', window.location.href);
    console.log('📍 إلى:', LOGIN_PAGE);
    
    // إعادة توجيه واحدة فقط
    window.location.replace(LOGIN_PAGE);
}

// متغير لمنع التكرار
let authProtectionInitialized = false;

/**
 * تهيئة نظام الحماية
 */
function initializeAuthProtection() {
    // منع التكرار
    if (authProtectionInitialized) {
        console.log('⚠️ نظام الحماية مهيأ بالفعل - تجاهل');
        return;
    }
    
    authProtectionInitialized = true;
    console.log('🚀 تهيئة نظام الحماية...');
    
    // التحقق من أن الصفحة الحالية محمية
    if (!isCurrentPageProtected()) {
        console.log('✅ الصفحة ليست محمية، لا حاجة للتحقق');
        return; // الصفحة ليست محمية، لا حاجة للتحقق
    }
    
    console.log('🔐 الصفحة محمية - التحقق من حالة تسجيل الدخول...');
    
    // التحقق من حالة تسجيل الدخول
    if (!isUserLoggedIn()) {
        console.log('❌ المستخدم غير مسجل دخول، إعادة التوجيه...');
        redirectToLogin();
        return;
    }
    
    console.log('✅ المستخدم مسجل دخول بنجاح');
}

/**
 * تسجيل خروج المستخدم
 */
function logout() {
    try {
        // حذف بيانات المستخدم من localStorage (كلا المفتاحين)
        localStorage.removeItem('authToken');
        localStorage.removeItem('token');
        localStorage.removeItem('userData');
        localStorage.removeItem('user');
        localStorage.removeItem('userRole');
        
        // حذف من sessionStorage أيضاً
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');
        
        console.log('تم تسجيل الخروج بنجاح');
        
        // إعادة التوجيه إلى صفحة تسجيل الدخول
        redirectToLogin();
    } catch (error) {
        console.error('خطأ في تسجيل الخروج:', error);
    }
}

/**
 * حفظ بيانات تسجيل الدخول
 * @param {string} token - رمز المصادقة
 * @param {Object} userData - بيانات المستخدم
 */
function saveLoginData(token, userData) {
    try {
        // حفظ في كلا المفتاحين للتوافق
        localStorage.setItem('authToken', token);
        localStorage.setItem('token', token);
        localStorage.setItem('userData', JSON.stringify(userData));
        localStorage.setItem('user', JSON.stringify(userData));
        localStorage.setItem('userRole', userData.role || userData.RoleID || 'user');
        
        console.log('✅ تم حفظ بيانات تسجيل الدخول');
        console.log('📦 Token saved in: authToken, token');
        console.log('📦 User data saved in: userData, user');
    } catch (error) {
        console.error('خطأ في حفظ بيانات تسجيل الدخول:', error);
    }
}

/**
 * الحصول على بيانات المستخدم الحالي
 * @returns {Object|null} بيانات المستخدم أو null
 */
function getCurrentUser() {
    try {
        // دعم كلا المفتاحين
        const userData = localStorage.getItem('userData') || localStorage.getItem('user');
        return userData ? JSON.parse(userData) : null;
    } catch (error) {
        console.error('خطأ في الحصول على بيانات المستخدم:', error);
        return null;
    }
}

/**
 * الحصول على دور المستخدم الحالي
 * @returns {string} دور المستخدم
 */
function getCurrentUserRole() {
    return localStorage.getItem('userRole') || 'user';
}

// تشغيل نظام الحماية عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', initializeAuthProtection);

// جعل الدوال متاحة عالمياً للاستخدام في الصفحات الأخرى
window.AuthSystem = {
    isLoggedIn: isUserLoggedIn,
    logout: logout,
    saveLoginData: saveLoginData,
    getCurrentUser: getCurrentUser,
    getCurrentUserRole: getCurrentUserRole,
    redirectToLogin: redirectToLogin
};
