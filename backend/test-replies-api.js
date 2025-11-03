// اختبار سريع لـ API الردود (مُحدّث لجدول complaint_responses)
// التشغيل: node test-replies-api.js

const API_BASE = 'http://localhost:3001';

// دالة مساعدة للطلبات
async function testEndpoint(name, url, options = {}) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🧪 اختبار: ${name}`);
  console.log(`📡 URL: ${url}`);
  if (options.method) console.log(`📨 Method: ${options.method}`);
  
  try {
    const response = await fetch(url, options);
    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ نجح!');
      console.log('📊 النتيجة:', JSON.stringify(data, null, 2));
      return data;
    } else {
      console.log('❌ فشل!');
      console.log('Status:', response.status);
      console.log('Response:', data);
      return null;
    }
  } catch (error) {
    console.log('❌ خطأ في الاتصال:');
    console.log(error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n⚠️  السيرفر غير شغّال! شغّله بـ:');
      console.log('   cd backend');
      console.log('   npm start');
    }
    return null;
  }
}

// الاختبارات
async function runTests() {
  console.log('🚀 بدء اختبار API الردود (complaint_responses)\n');
  console.log('=' .repeat(60));
  
  // 1. Health Check
  await testEndpoint(
    'Health Check',
    `${API_BASE}/api/health`
  );
  
  // 2. جلب أنواع الردود
  const replyTypes = await testEndpoint(
    'جلب أنواع الردود',
    `${API_BASE}/api/reply-types`
  );
  
  if (replyTypes && replyTypes.items && replyTypes.items.length > 0) {
    console.log(`\n✅ تم العثور على ${replyTypes.items.length} نوع رد:`);
    replyTypes.items.forEach(type => {
      console.log(`   - ${type.ReplyTypeID}: ${type.NameAr || type.NameEn}`);
    });
  }
  
  // 3. جلب ردود بلاغ تجريبي - عامة فقط
  await testEndpoint(
    'جلب ردود بلاغ (عامة فقط)',
    `${API_BASE}/api/complaints/TEST-20251012-00001/replies`
  );
  
  // 4. جلب كل الردود (عامة + داخلية)
  await testEndpoint(
    'جلب كل الردود (عامة + داخلية)',
    `${API_BASE}/api/complaints/TEST-20251012-00001/replies?all=1`
  );
  
  // 5. معلومات الاختبار اليدوي
  console.log('\n' + '='.repeat(60));
  console.log('📝 اختبارات إضافة رد يدوياً:');
  console.log('\n1️⃣  رد عام:');
  console.log('   • افتح صفحة تفاصيل بلاغ');
  console.log('   • اضغط "إضافة رد"');
  console.log('   • اكتب رسالة');
  console.log('   • IsInternal: ❌ غير مُفعّل');
  console.log('   • احفظ → يظهر للجمهور ✅');
  
  console.log('\n2️⃣  رد داخلي:');
  console.log('   • افتح صفحة تفاصيل بلاغ');
  console.log('   • اضغط "إضافة رد"');
  console.log('   • اكتب رسالة');
  console.log('   • IsInternal: ✅ مُفعّل');
  console.log('   • احفظ → لا يظهر للجمهور ❌');
  console.log('   • في واجهة الموظفين: يظهر مع علامة 🔒');
  
  console.log('\n3️⃣  رد مع تحديث الحالة:');
  console.log('   • افتح صفحة تفاصيل بلاغ');
  console.log('   • اضغط "إضافة رد"');
  console.log('   • اكتب رسالة');
  console.log('   • اختر TargetStatusCode: "closed"');
  console.log('   • احفظ → يُحدّث StatusCode في البلاغ 🔄');
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 الجدول المُستخدم: complaint_responses');
  console.log('📌 الحقول الجديدة:');
  console.log('   • Message (بدلاً من ResponseText)');
  console.log('   • ResponderUserID (بدلاً من CreatedByUserID)');
  console.log('   • TargetStatusCode (جديد)');
  console.log('   • IsInternal (جديد)');
  
  console.log('\n' + '='.repeat(60));
  console.log('✨ انتهى الاختبار!');
  console.log('\nملاحظات:');
  console.log('• استخدم رقم بلاغ حقيقي للاختبار الكامل');
  console.log('• للموظفين: أضف ?all=1 لرؤية الردود الداخلية');
  console.log('• راجع COMPLAINT-RESPONSES-FINAL.md للتفاصيل الكاملة');
}

// تشغيل الاختبارات
runTests();

