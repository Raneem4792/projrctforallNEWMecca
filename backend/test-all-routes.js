// اختبار شامل لجميع مسارات البلاغات
// الاستخدام: node test-all-routes.js

const API_BASE = 'http://localhost:3001';

// ألوان للطباعة
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

async function testRoute(name, url, expectedStatus = 200) {
  try {
    log(`\n📌 اختبار: ${name}`, 'cyan');
    log(`   URL: ${url}`, 'blue');
    
    const res = await fetch(url);
    const status = res.status;
    
    log(`   Status: ${status}`, status === expectedStatus ? 'green' : 'red');
    
    if (res.ok) {
      const data = await res.json();
      
      if (data.ok !== undefined) {
        log(`   Response OK: ${data.ok}`, data.ok ? 'green' : 'yellow');
      }
      
      if (data.items) {
        log(`   Items Count: ${data.items.length}`, 'green');
      }
      
      if (data.total !== undefined) {
        log(`   Total: ${data.total}`, 'green');
      }
      
      if (data.page !== undefined) {
        log(`   Page: ${data.page}/${data.pages || 1}`, 'green');
      }
      
      return { success: true, status, data };
    } else {
      const errorText = await res.text();
      log(`   ❌ Error: ${errorText}`, 'red');
      return { success: false, status, error: errorText };
    }
  } catch (err) {
    log(`   ❌ Exception: ${err.message}`, 'red');
    return { success: false, error: err.message };
  }
}

async function runTests() {
  log('\n╔════════════════════════════════════════════╗', 'bright');
  log('║   🧪 اختبار شامل لمسارات API البلاغات   ║', 'bright');
  log('╚════════════════════════════════════════════╝', 'bright');
  
  const tests = [];
  
  // 1. Health Check
  tests.push(await testRoute(
    'Health Check',
    `${API_BASE}/api/health`
  ));
  
  // 2. سجل البلاغات - طلب بسيط
  tests.push(await testRoute(
    'سجل البلاغات - بدون فلاتر',
    `${API_BASE}/api/complaints/history?page=1&pageSize=9`
  ));
  
  // 3. سجل البلاغات - مع فلاتر
  const historyParams = new URLSearchParams({
    page: '1',
    pageSize: '9',
    status: 'ALL',
    hospital: 'ALL',
    type: 'ALL'
  });
  tests.push(await testRoute(
    'سجل البلاغات - مع فلاتر',
    `${API_BASE}/api/complaints/history?${historyParams.toString()}`
  ));
  
  // 4. تتبع البلاغ - طلب صحيح (قد يعطي 404 إذا البلاغ غير موجود)
  const trackParams = new URLSearchParams({ ticket: 'C-2025-000001' });
  const trackResult = await testRoute(
    'تتبع البلاغ - برقم التذكرة',
    `${API_BASE}/api/complaints/track?${trackParams.toString()}`,
    null // نقبل أي status
  );
  tests.push(trackResult);
  
  if (trackResult.status === 404) {
    log('   ℹ️  البلاغ غير موجود (هذا طبيعي إذا لم يُنشأ بعد)', 'yellow');
  }
  
  // 5. تتبع البلاغ - بدون ticket (يجب أن يعطي 400)
  tests.push(await testRoute(
    'تتبع البلاغ - بدون رقم (خطأ متوقع)',
    `${API_BASE}/api/complaints/track`,
    400
  ));
  
  // ملخص النتائج
  log('\n╔════════════════════════════════════════════╗', 'bright');
  log('║            📊 ملخص نتائج الاختبار          ║', 'bright');
  log('╚════════════════════════════════════════════╝', 'bright');
  
  const successful = tests.filter(t => t.success).length;
  const failed = tests.filter(t => !t.success).length;
  
  log(`\n✅ نجح: ${successful}`, 'green');
  log(`❌ فشل: ${failed}`, failed > 0 ? 'red' : 'green');
  log(`📊 إجمالي: ${tests.length}\n`, 'cyan');
  
  // نصائح إذا فشل أي اختبار
  if (failed > 0) {
    log('💡 نصائح لحل المشاكل:', 'yellow');
    log('   1. تأكد من تشغيل الخادم: npm start', 'yellow');
    log('   2. تحقق من المنفذ: http://localhost:3001', 'yellow');
    log('   3. راجع ملفات التوثيق في المجلد الرئيسي', 'yellow');
    log('   4. افحص console الخادم للأخطاء\n', 'yellow');
  }
  
  // اختبارات محددة للـ URL
  log('╔════════════════════════════════════════════╗', 'bright');
  log('║        🔍 اختبار بناء URLs              ║', 'bright');
  log('╚════════════════════════════════════════════╝', 'bright');
  
  // اختبار URLSearchParams
  const testParams = new URLSearchParams({
    page: '1',
    pageSize: '9',
    name: 'محمد',
    status: 'OPEN'
  });
  
  const testUrl = `${API_BASE}/api/complaints/history?${testParams.toString()}`;
  
  log('\n✅ اختبار بناء URL:', 'cyan');
  log(`   Input: { page: 1, pageSize: 9, name: 'محمد', status: 'OPEN' }`, 'blue');
  log(`   Output: ${testUrl}`, 'green');
  
  // التحققات
  const checks = [
    { test: testUrl.includes('/api/complaints/history?'), name: 'المسار الصحيح' },
    { test: testUrl.includes('page=1'), name: 'page كرقم' },
    { test: testUrl.includes('pageSize=9'), name: 'pageSize كرقم' },
    { test: !testUrl.includes('pageSize=9-1'), name: 'لا يوجد pageSize=9-1' },
    { test: !testUrl.includes('/api/c_page'), name: 'لا يوجد /api/c_page' },
    { test: testUrl.includes('name='), name: 'فلتر name موجود' },
    { test: testUrl.includes('status=OPEN'), name: 'فلتر status موجود' }
  ];
  
  log('\n   📋 التحققات:', 'cyan');
  checks.forEach(check => {
    const icon = check.test ? '✅' : '❌';
    const color = check.test ? 'green' : 'red';
    log(`   ${icon} ${check.name}`, color);
  });
  
  const allChecksPassed = checks.every(c => c.test);
  
  log('\n' + '═'.repeat(48), 'bright');
  if (allChecksPassed && failed === 0) {
    log('\n🎉 جميع الاختبارات نجحت! النظام يعمل بشكل صحيح ✅\n', 'green');
  } else if (allChecksPassed && failed > 0) {
    log('\n⚠️  بناء URLs صحيح لكن بعض المسارات فشلت\n', 'yellow');
  } else {
    log('\n❌ يوجد مشاكل تحتاج إلى إصلاح\n', 'red');
  }
}

// تشغيل الاختبارات
runTests().catch(err => {
  log(`\n❌ خطأ عام في الاختبار: ${err.message}\n`, 'red');
  process.exit(1);
});

