// اختبار المسار العام للأقسام
const API_BASE = 'http://localhost:3001';

async function testPublicDepartments() {
  console.log('🧪 اختبار المسار العام للأقسام\n');

  try {
    // اختبار المسار الجديد
    console.log('1. اختبار GET /api/departments/public?hospitalId=12:');
    const response = await fetch(`${API_BASE}/api/departments/public?hospitalId=12`);
    
    console.log(`   Status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`   Error: ${errorText}`);
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`   Success: ${data.success}`);
    console.log(`   Total departments: ${data.total || 0}`);
    
    if (data.data && data.data.length > 0) {
      console.log(`   First department:`, {
        DepartmentID: data.data[0].DepartmentID,
        NameAr: data.data[0].NameAr,
        NameEn: data.data[0].NameEn
      });
    }
    
    console.log('✅ المسار العام يعمل بشكل صحيح');
    
  } catch (error) {
    console.error('❌ خطأ في الاختبار:', error.message);
    console.log('\n💡 تأكد من أن السيرفر يعمل:');
    console.log('   cd backend && npm start');
  }
}

testPublicDepartments();
