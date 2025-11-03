// اختبار API المستشفيات
const API_BASE = 'http://localhost:3001';

async function testHospitalsAPI() {
  console.log('🧪 اختبار API المستشفيات\n');

  try {
    // اختبار المسار الأساسي
    console.log('1. اختبار GET /api/hospitals:');
    const response = await fetch(`${API_BASE}/api/hospitals`);
    
    console.log(`   Status: ${response.status}`);
    console.log(`   Headers:`, Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`   Data type: ${Array.isArray(data) ? 'Array' : typeof data}`);
    console.log(`   Length: ${Array.isArray(data) ? data.length : 'N/A'}`);
    
    if (Array.isArray(data) && data.length > 0) {
      console.log(`   First hospital:`, {
        HospitalID: data[0].HospitalID,
        NameAr: data[0].NameAr,
        NameEn: data[0].NameEn
      });
    }
    
    console.log('✅ API يعمل بشكل صحيح');
    
  } catch (error) {
    console.error('❌ خطأ في الاختبار:', error.message);
    console.log('\n💡 تأكد من أن السيرفر يعمل:');
    console.log('   cd backend && npm start');
  }
}

testHospitalsAPI();