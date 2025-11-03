// اختبار سريع لـ API سجل البلاغات
import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3001';

async function testHistoryAPI() {
  console.log('🧪 اختبار API سجل البلاغات...\n');

  const tests = [
    {
      name: 'اختبار بدون فلاتر',
      url: `${API_BASE}/api/complaints/history?page=1&pageSize=9`
    },
    {
      name: 'اختبار مع hospitalId=11',
      url: `${API_BASE}/api/complaints/history?page=1&pageSize=9&hospitalId=11`
    },
    {
      name: 'اختبار مع hospitalId=12',
      url: `${API_BASE}/api/complaints/history?page=1&pageSize=9&hospitalId=12`
    },
    {
      name: 'اختبار مع status=OPEN',
      url: `${API_BASE}/api/complaints/history?page=1&pageSize=9&status=OPEN`
    }
  ];

  for (const test of tests) {
    console.log(`🔍 ${test.name}:`);
    console.log(`   URL: ${test.url}`);
    
    try {
      const response = await fetch(test.url);
      const data = await response.json();
      
      console.log(`   Status: ${response.status}`);
      console.log(`   OK: ${data.ok}`);
      console.log(`   Items: ${data.items?.length || 0}`);
      console.log(`   Total: ${data.total || 0}`);
      console.log(`   Source: ${data.source || 'unknown'}`);
      
      if (data.items && data.items.length > 0) {
        console.log(`   أول بلاغ: ${data.items[0].ticket} - ${data.items[0].fullName}`);
      }
      
    } catch (error) {
      console.log(`   ❌ خطأ: ${error.message}`);
    }
    
    console.log('');
  }
}

// تشغيل الاختبار
testHistoryAPI().then(() => {
  console.log('✅ انتهى الاختبار');
  process.exit(0);
}).catch(error => {
  console.error('❌ فشل الاختبار:', error);
  process.exit(1);
});
