// اختبار سريع لإصلاح سجل البلاغات
const API_BASE = 'http://localhost:3001';

async function testHistoryAPI() {
  console.log('🧪 اختبار API سجل البلاغات بعد الإصلاح\n');

  try {
    // اختبار بدون فلاتر
    console.log('1. اختبار بدون فلاتر:');
    const response1 = await fetch(`${API_BASE}/api/complaints/history?page=1&pageSize=9`);
    const data1 = await response1.json();
    console.log(`   Status: ${response1.status}`);
    console.log(`   Results: ${data1.items?.length || 0} items`);
    console.log(`   Total: ${data1.total || 0}`);
    console.log(`   Source: ${data1.source || 'unknown'}`);
    console.log('');

    // اختبار مع hospitalId
    console.log('2. اختبار مع hospitalId=11:');
    const response2 = await fetch(`${API_BASE}/api/complaints/history?page=1&pageSize=9&hospitalId=11`);
    const data2 = await response2.json();
    console.log(`   Status: ${response2.status}`);
    console.log(`   Results: ${data2.items?.length || 0} items`);
    console.log(`   Total: ${data2.total || 0}`);
    console.log(`   Source: ${data2.source || 'unknown'}`);
    console.log('');

    // اختبار مع hospitalId=12
    console.log('3. اختبار مع hospitalId=12:');
    const response3 = await fetch(`${API_BASE}/api/complaints/history?page=1&pageSize=9&hospitalId=12`);
    const data3 = await response3.json();
    console.log(`   Status: ${response3.status}`);
    console.log(`   Results: ${data3.items?.length || 0} items`);
    console.log(`   Total: ${data3.total || 0}`);
    console.log(`   Source: ${data3.source || 'unknown'}`);
    console.log('');

    console.log('✅ تم اختبار API بنجاح');
    
  } catch (error) {
    console.error('❌ خطأ في الاختبار:', error.message);
    console.log('\n💡 تأكد من أن السيرفر يعمل:');
    console.log('   cd backend && npm start');
  }
}

testHistoryAPI();
