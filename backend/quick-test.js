// اختبار سريع للاتصال
import fetch from 'node-fetch';

async function quickTest() {
  console.log('🧪 اختبار سريع للاتصال...\n');

  try {
    // اختبار الاتصال بالسيرفر
    const response = await fetch('http://localhost:3001/api/complaints/history?page=1&pageSize=9', {
      headers: {
        'Accept': 'application/json',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjMsInJvbGUiOiJVU0VSIiwiaG9zcGl0YWxJZCI6MTEsInVzZXJuYW1lIjoiYWRtaW4iLCJpYXQiOjE3Mzg5NzQwMDB9.example'
      }
    });

    console.log(`Status: ${response.status}`);
    console.log(`Headers:`, Object.fromEntries(response.headers.entries()));

    if (response.ok) {
      const data = await response.json();
      console.log('Response:', JSON.stringify(data, null, 2));
    } else {
      const text = await response.text();
      console.log('Error Response:', text);
    }

  } catch (error) {
    console.error('❌ خطأ في الاتصال:', error.message);
    console.log('تأكد من أن السيرفر يعمل على المنفذ 3001');
  }
}

quickTest();
