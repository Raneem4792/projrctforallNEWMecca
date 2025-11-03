// backend/test-redirect.js
// اختبار مسارات التوجيه
import fetch from 'node-fetch';

async function testRedirect() {
  console.log('🧪 اختبار مسارات التوجيه...\n');
  
  const baseUrl = 'http://localhost:3001/api';
  
  // اختبار تسجيل الدخول
  console.log('1️⃣ اختبار تسجيل الدخول:');
  try {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'cluster_admin',
        password: 'admin123'
      })
    });
    const data = await response.json();
    
    if (response.ok && data.success) {
      console.log(`✅ نجح تسجيل الدخول`);
      console.log(`📄 المسار المُوجه إليه: ${data.redirect}`);
      console.log(`👤 المستخدم: ${data.user.FullName}`);
      console.log(`🔑 الدور: ${data.user.RoleID}`);
    } else {
      console.log(`❌ فشل تسجيل الدخول: ${data.message}`);
    }
  } catch (error) {
    console.error('خطأ:', error.message);
  }
  
  console.log('\n2️⃣ اختبار مسار الصفحة الرئيسية:');
  try {
    const response = await fetch('http://127.0.0.1:5500/NewProjectMecca/index/index.html');
    if (response.ok) {
      console.log('✅ الصفحة الرئيسية متاحة');
    } else {
      console.log(`❌ الصفحة غير متاحة: ${response.status}`);
    }
  } catch (error) {
    console.error('خطأ في الوصول للصفحة:', error.message);
  }
  
  console.log('\n✅ انتهى الاختبار');
}

testRedirect();
