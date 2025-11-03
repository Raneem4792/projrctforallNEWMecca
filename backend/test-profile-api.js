// اختبار سريع لنهايات API الملف الشخصي
import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3001';

async function testProfileAPI() {
  console.log('🧪 اختبار نهايات API الملف الشخصي...\n');

  try {
    // 1. اختبار تسجيل دخول أولاً
    console.log('1️⃣ اختبار تسجيل الدخول...');
    const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Username: 'admin', // استخدم بيانات مستخدم موجود
        Password: 'admin123'
      })
    });

    if (!loginRes.ok) {
      console.log('❌ فشل في تسجيل الدخول - تأكد من وجود مستخدم admin');
      return;
    }

    const loginData = await loginRes.json();
    const token = loginData.token;
    console.log('✅ تم تسجيل الدخول بنجاح');

    // 2. اختبار جلب بيانات الملف الشخصي
    console.log('\n2️⃣ اختبار GET /api/users/me...');
    const profileRes = await fetch(`${API_BASE}/api/users/me`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (profileRes.ok) {
      const profileData = await profileRes.json();
      console.log('✅ تم جلب بيانات الملف الشخصي:', profileData.data);
    } else {
      console.log('❌ فشل في جلب بيانات الملف الشخصي:', await profileRes.text());
    }

    // 3. اختبار تحديث بيانات الملف الشخصي
    console.log('\n3️⃣ اختبار PUT /api/users/me...');
    const updateRes = await fetch(`${API_BASE}/api/users/me`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        FullName: 'اسم محدث للاختبار',
        Email: 'test@example.com',
        Mobile: '0501234567'
      })
    });

    if (updateRes.ok) {
      const updateData = await updateRes.json();
      console.log('✅ تم تحديث بيانات الملف الشخصي:', updateData.message);
    } else {
      console.log('❌ فشل في تحديث بيانات الملف الشخصي:', await updateRes.text());
    }

    // 4. اختبار تغيير كلمة المرور
    console.log('\n4️⃣ اختبار PUT /api/users/me/password...');
    const passwordRes = await fetch(`${API_BASE}/api/users/me/password`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        oldPassword: 'admin123',
        newPassword: 'newpassword123'
      })
    });

    if (passwordRes.ok) {
      const passwordData = await passwordRes.json();
      console.log('✅ تم تحديث كلمة المرور:', passwordData.message);
    } else {
      console.log('❌ فشل في تحديث كلمة المرور:', await passwordRes.text());
    }

    console.log('\n🎉 انتهى الاختبار!');

  } catch (error) {
    console.error('❌ خطأ في الاختبار:', error.message);
  }
}

// تشغيل الاختبار
testProfileAPI();
