// test-cors-fix.js
// اختبار إصلاح CORS للـ X-Hospital-Id header

import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3001/api';

async function testCorsFix() {
  console.log('🧪 اختبار إصلاح CORS للـ X-Hospital-Id header...\n');

  try {
    // 1. اختبار preflight request
    console.log('1️⃣ اختبار preflight request (OPTIONS)...');
    const preflightRes = await fetch(`${API_BASE}/complaints`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://127.0.0.1:5500',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'X-Hospital-Id, Authorization'
      }
    });

    console.log(`📊 استجابة preflight: ${preflightRes.status} ${preflightRes.statusText}`);
    console.log('📋 CORS Headers:');
    console.log(`   Access-Control-Allow-Origin: ${preflightRes.headers.get('access-control-allow-origin')}`);
    console.log(`   Access-Control-Allow-Methods: ${preflightRes.headers.get('access-control-allow-methods')}`);
    console.log(`   Access-Control-Allow-Headers: ${preflightRes.headers.get('access-control-allow-headers')}`);

    if (preflightRes.ok) {
      console.log('✅ preflight request نجح!');
    } else {
      console.log('❌ preflight request فشل');
    }

    // 2. تسجيل دخول للحصول على توكن
    console.log('\n2️⃣ تسجيل الدخول...');
    const loginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'cluster_admin',
        password: 'admin123'
      })
    });

    if (!loginRes.ok) {
      throw new Error(`فشل تسجيل الدخول: ${loginRes.status}`);
    }

    const loginData = await loginRes.json();
    const token = loginData.token;
    console.log('✅ تم تسجيل الدخول بنجاح');

    // 3. اختبار إرسال FormData مع X-Hospital-Id header
    console.log('\n3️⃣ اختبار إرسال FormData مع X-Hospital-Id header...');
    
    const formData = new FormData();
    formData.append('DepartmentID', '1');
    formData.append('PatientFullName', 'اختبار المريض CORS');
    formData.append('Description', 'وصف البلاغ للاختبار CORS');
    formData.append('PriorityCode', 'MEDIUM');
    formData.append('SubmissionType', '937');

    const complaintRes = await fetch(`${API_BASE}/complaints`, {
      method: 'POST',
      body: formData,
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Hospital-Id': '1' // 👈 هذا يجب أن يعمل الآن
      }
    });

    console.log(`📊 استجابة HTTP: ${complaintRes.status} ${complaintRes.statusText}`);

    if (complaintRes.ok) {
      const result = await complaintRes.json();
      console.log('✅ تم إنشاء البلاغ بنجاح!');
      console.log('📋 النتيجة:', {
        success: result.success,
        ticketNumber: result.data?.TicketNumber,
        hospitalId: result.data?.HospitalID
      });
    } else {
      const errorData = await complaintRes.json().catch(() => ({}));
      console.log('❌ فشل إنشاء البلاغ:');
      console.log('📋 تفاصيل الخطأ:', errorData);
    }

  } catch (error) {
    console.error('❌ خطأ في الاختبار:', error.message);
    
    if (error.message.includes('CORS')) {
      console.log('\n💡 نصائح لحل مشكلة CORS:');
      console.log('1. تأكد من إعادة تشغيل الخادم بعد تحديث app.js');
      console.log('2. تحقق من أن الخادم يعمل على المنفذ 3001');
      console.log('3. تأكد من أن Origin في CORS يتطابق مع URL الفرونت');
    }
  }
}

// تشغيل الاختبار
testCorsFix();
