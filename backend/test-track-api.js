// اختبار سريع لمسار /api/complaints/track
// التشغيل: node test-track-api.js

const API_BASE = 'http://localhost:3001';

// دالة مساعدة للطلبات
async function testEndpoint(name, url) {
  console.log(`\n🧪 اختبار: ${name}`);
  console.log(`📡 URL: ${url}`);
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ نجح!');
      console.log('📊 النتيجة:', JSON.stringify(data, null, 2));
    } else {
      console.log('❌ فشل!');
      console.log('Status:', response.status);
      console.log('Response:', data);
    }
  } catch (error) {
    console.log('❌ خطأ في الاتصال:');
    console.log(error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n⚠️  السيرفر غير شغّال! شغّله بـ:');
      console.log('   cd backend');
      console.log('   npm start');
    }
  }
}

// الاختبارات
async function runTests() {
  console.log('🚀 بدء اختبار API تتبع البلاغات\n');
  console.log('=' .repeat(50));
  
  // 1. Health Check
  await testEndpoint(
    'Health Check',
    `${API_BASE}/api/health`
  );
  
  // 2. Track - بدون معاملات
  await testEndpoint(
    'Track - بدون معاملات',
    `${API_BASE}/api/complaints/track`
  );
  
  // 3. Track - حسب الحالة
  await testEndpoint(
    'Track - البلاغات المفتوحة',
    `${API_BASE}/api/complaints/track?status=open`
  );
  
  // 4. Track - برقم جوال
  await testEndpoint(
    'Track - برقم جوال',
    `${API_BASE}/api/complaints/track?mobile=0551234567`
  );
  
  // 5. Track - بالاسم
  await testEndpoint(
    'Track - بالاسم',
    `${API_BASE}/api/complaints/track?name=محمد`
  );
  
  // 6. Track - مركب
  await testEndpoint(
    'Track - بحث مركب',
    `${API_BASE}/api/complaints/track?name=محمد&status=open`
  );
  
  console.log('\n' + '='.repeat(50));
  console.log('✨ انتهى الاختبار!');
}

// تشغيل الاختبارات
runTests();

