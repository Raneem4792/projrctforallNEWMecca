// test-multipart-fix.js
// اختبار سريع لإصلاح مشكلة multipart/form-data

import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3001/api';

async function testMultipartFix() {
  console.log('🧪 اختبار إصلاح مشكلة multipart/form-data...\n');

  try {
    // 1. تسجيل دخول للحصول على توكن
    console.log('1️⃣ تسجيل الدخول...');
    const loginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'cluster_admin', // أو أي مستخدم موجود
        password: 'admin123'
      })
    });

    if (!loginRes.ok) {
      throw new Error(`فشل تسجيل الدخول: ${loginRes.status}`);
    }

    const loginData = await loginRes.json();
    const token = loginData.token;
    console.log('✅ تم تسجيل الدخول بنجاح');

    // 2. اختبار إرسال FormData مع X-Hospital-Id header
    console.log('\n2️⃣ اختبار إرسال FormData مع X-Hospital-Id...');
    
    const formData = new FormData();
    formData.append('DepartmentID', '1');
    formData.append('PatientFullName', 'اختبار المريض');
    formData.append('Description', 'وصف البلاغ للاختبار');
    formData.append('PriorityCode', 'MEDIUM');
    formData.append('SubmissionType', '937');

    const complaintRes = await fetch(`${API_BASE}/complaints`, {
      method: 'POST',
      body: formData,
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Hospital-Id': '1' // 👈 هذا هو الحل الجديد
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
  }
}

// تشغيل الاختبار
testMultipartFix();
