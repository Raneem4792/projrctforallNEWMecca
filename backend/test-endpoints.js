// اختبار سريع لجميع المسارات المطلوبة
// التشغيل: node test-endpoints.js

const API_BASE = 'http://localhost:3001';

async function testEndpoint(name, url) {
  console.log(`\n🧪 اختبار: ${name}`);
  console.log(`📡 URL: ${url}`);
  
  try {
    const response = await fetch(url);
    const text = await response.text();
    
    if (response.ok) {
      console.log('✅ نجح! Status:', response.status);
      try {
        const data = JSON.parse(text);
        console.log('📊 البيانات:', JSON.stringify(data, null, 2).substring(0, 200) + '...');
      } catch {
        console.log('📄 الاستجابة:', text.substring(0, 200));
      }
    } else {
      console.log('❌ فشل! Status:', response.status);
      console.log('Response:', text);
    }
  } catch (error) {
    console.log('❌ خطأ في الاتصال:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n⚠️  السيرفر غير شغّال!');
      console.log('شغّله بـ:');
      console.log('  cd backend');
      console.log('  npm start');
    }
  }
}

async function runTests() {
  console.log('═'.repeat(60));
  console.log('🚀 اختبار جميع المسارات المطلوبة');
  console.log('═'.repeat(60));
  
  // 1. Health Check
  await testEndpoint('Health Check', `${API_BASE}/api/health`);
  
  // 2. Reply Types (المشكلة الأولى)
  await testEndpoint('أنواع الردود', `${API_BASE}/api/reply-types`);
  
  // 3. Track Complaints
  await testEndpoint('تتبع البلاغات', `${API_BASE}/api/complaints/track`);
  
  // 4. Get Replies (المشكلة الثانية)
  await testEndpoint('جلب ردود بلاغ', `${API_BASE}/api/complaints/C-2025-000008/replies`);
  
  console.log('\n' + '═'.repeat(60));
  console.log('✨ انتهى الاختبار!');
  console.log('\nملاحظات:');
  console.log('• إذا كل المسارات ✅ → السيرفر شغّال والمسارات موجودة');
  console.log('• إذا في ❌ → راجع حل-خطأ-404.txt');
  console.log('• إذا "complaint not found" → البلاغ غير موجود (طبيعي)');
  console.log('═'.repeat(60));
}

runTests();

