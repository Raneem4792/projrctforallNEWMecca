// اختبار تدفق التوكن
import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3001';

async function testTokenFlow() {
  console.log('🧪 اختبار تدفق التوكن...\n');

  // 1. اختبار بدون توكن
  console.log('1. اختبار بدون توكن:');
  try {
    const response = await fetch(`${API_BASE}/api/complaints/history?page=1&pageSize=9`);
    console.log(`   Status: ${response.status}`);
    if (response.status === 401) {
      console.log('   ✅ تم رفض الطلب بدون توكن (مطلوب)');
    } else {
      console.log('   ❌ يجب أن يكون 401');
    }
  } catch (error) {
    console.log('   ❌ خطأ:', error.message);
  }

  // 2. اختبار مع توكن صالح
  console.log('\n2. اختبار مع توكن صالح:');
  const validToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsInJvbGVJZCI6MiwiaG9zcGl0YWxJZCI6MTEsInVzZXJuYW1lIjoiYWRtaW4iLCJpYXQiOjE3Mzg5NzQwMDB9.example';
  
  try {
    const response = await fetch(`${API_BASE}/api/complaints/history?page=1&pageSize=9`, {
      headers: {
        'Authorization': `Bearer ${validToken}`,
        'Accept': 'application/json'
      }
    });
    
    console.log(`   Status: ${response.status}`);
    if (response.status === 200) {
      const data = await response.json();
      console.log('   ✅ تم قبول الطلب مع توكن');
      console.log('   OK:', data.ok);
      console.log('   Items:', data.items?.length || 0);
      console.log('   Source:', data.source || 'unknown');
    } else if (response.status === 401) {
      console.log('   ❌ تم رفض التوكن (قد يكون منتهي الصلاحية)');
    } else {
      console.log('   ❌ خطأ غير متوقع');
    }
  } catch (error) {
    console.log('   ❌ خطأ:', error.message);
  }

  // 3. اختبار مع توكن غير صالح
  console.log('\n3. اختبار مع توكن غير صالح:');
  const invalidToken = 'invalid-token';
  
  try {
    const response = await fetch(`${API_BASE}/api/complaints/history?page=1&pageSize=9`, {
      headers: {
        'Authorization': `Bearer ${invalidToken}`,
        'Accept': 'application/json'
      }
    });
    
    console.log(`   Status: ${response.status}`);
    if (response.status === 401) {
      console.log('   ✅ تم رفض التوكن غير الصالح (مطلوب)');
    } else {
      console.log('   ❌ يجب أن يكون 401');
    }
  } catch (error) {
    console.log('   ❌ خطأ:', error.message);
  }

  // 4. توصيات
  console.log('\n4. التوصيات:');
  console.log('   - تأكد من وجود JWT_SECRET في .env');
  console.log('   - تأكد من صحة التوكن في localStorage');
  console.log('   - راجع console المتصفح للتحقق من إرسال التوكن');
  console.log('   - راجع console السيرفر للتحقق من استقبال التوكن');
}

testTokenFlow().then(() => {
  console.log('\n✅ انتهى الاختبار');
  process.exit(0);
}).catch(error => {
  console.error('❌ فشل الاختبار:', error);
  process.exit(1);
});
