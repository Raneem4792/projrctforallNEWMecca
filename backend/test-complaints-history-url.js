// اختبار مسار سجل البلاغات - التحقق من URL وباراميترات
// استخدام: node test-complaints-history-url.js

const API_BASE = 'http://localhost:3001';

async function testHistoryAPI() {
  console.log('🧪 اختبار مسار سجل البلاغات\n');

  // Test 1: طلب بسيط
  console.log('📌 الاختبار 1: طلب بسيط (page=1, pageSize=9)');
  const params1 = new URLSearchParams({
    page: '1',
    pageSize: '9'
  });
  const url1 = `${API_BASE}/api/complaints/history?${params1.toString()}`;
  console.log('   URL:', url1);
  
  try {
    const res1 = await fetch(url1);
    console.log('   Status:', res1.status);
    if (res1.ok) {
      const data1 = await res1.json();
      console.log('   ✅ النتيجة:', {
        ok: data1.ok,
        total: data1.total,
        page: data1.page,
        pageSize: data1.pageSize,
        itemsCount: data1.items?.length || 0
      });
    } else {
      console.log('   ❌ فشل:', res1.statusText);
    }
  } catch (e) {
    console.log('   ❌ خطأ:', e.message);
  }

  console.log('\n');

  // Test 2: طلب مع فلاتر
  console.log('📌 الاختبار 2: طلب مع فلاتر (status=open)');
  const params2 = new URLSearchParams({
    page: '1',
    pageSize: '9',
    status: 'open'
  });
  const url2 = `${API_BASE}/api/complaints/history?${params2.toString()}`;
  console.log('   URL:', url2);
  
  try {
    const res2 = await fetch(url2);
    console.log('   Status:', res2.status);
    if (res2.ok) {
      const data2 = await res2.json();
      console.log('   ✅ النتيجة:', {
        ok: data2.ok,
        total: data2.total,
        openCount: data2.kpis?.open || 0,
        itemsCount: data2.items?.length || 0
      });
    } else {
      console.log('   ❌ فشل:', res2.statusText);
    }
  } catch (e) {
    console.log('   ❌ خطأ:', e.message);
  }

  console.log('\n');

  // Test 3: طلب مع جميع الفلاتر
  console.log('📌 الاختبار 3: طلب مع جميع الفلاتر');
  const params3 = new URLSearchParams({
    name: 'محمد',
    mobile: '0500000000',
    file: '12345',
    ticket: 'TCK-001',
    status: 'ALL',
    hospital: 'ALL',
    type: 'ALL',
    from: '2024-01-01',
    to: '2024-12-31',
    page: '1',
    pageSize: '9'
  });
  const url3 = `${API_BASE}/api/complaints/history?${params3.toString()}`;
  console.log('   URL:', url3);
  console.log('   Length:', url3.length);
  
  // التحقق من أن URL لا يحتوي على أخطاء
  const checks = [
    { test: url3.includes('/api/complaints/history?'), name: 'المسار الصحيح' },
    { test: url3.includes('page=1'), name: 'page كرقم' },
    { test: url3.includes('pageSize=9'), name: 'pageSize كرقم' },
    { test: !url3.includes('pageSize=9-1'), name: 'لا يوجد pageSize=9-1' },
    { test: !url3.includes('/api/c_page'), name: 'لا يوجد /api/c_page' },
    { test: url3.includes('name='), name: 'فلتر name موجود' },
    { test: url3.includes('mobile='), name: 'فلتر mobile موجود' },
  ];
  
  console.log('\n   التحققات:');
  checks.forEach(check => {
    console.log(`   ${check.test ? '✅' : '❌'} ${check.name}`);
  });

  console.log('\n');
  
  try {
    const res3 = await fetch(url3);
    console.log('   Status:', res3.status);
    if (res3.ok) {
      const data3 = await res3.json();
      console.log('   ✅ النتيجة:', {
        ok: data3.ok,
        total: data3.total,
        itemsCount: data3.items?.length || 0
      });
    } else {
      console.log('   ❌ فشل:', res3.statusText);
    }
  } catch (e) {
    console.log('   ❌ خطأ:', e.message);
  }

  console.log('\n✅ انتهى الاختبار!');
}

// تشغيل الاختبار
testHistoryAPI().catch(console.error);

