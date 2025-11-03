// test-complaint-targets.js
// اختبار نظام بلاغات الموظفين

import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3001/api';

// بيانات تجريبية للاختبار
const testData = {
  // مستخدم للاختبار
  user: {
    UserID: 20,
    RoleID: 2,
    HospitalID: 11,
    username: 'test_user',
    FullName: 'مستخدم تجريبي'
  },
  
  // بيانات بلاغ على موظف
  complaintTarget: {
    complaintId: 5, // يجب أن يكون موجود في قاعدة البيانات
    targetEmployeeId: 1,
    targetEmployeeName: 'أحمد محمد',
    targetDepartmentId: 1,
    targetDepartmentName: 'قسم التمريض'
  }
};

async function testComplaintTargetsSystem() {
  console.log('🧪 بدء اختبار نظام بلاغات الموظفين...\n');
  
  try {
    // 1. اختبار الخادم
    console.log('1️⃣ اختبار الخادم...');
    const healthResponse = await fetch(`${API_BASE}/health`);
    if (!healthResponse.ok) {
      throw new Error('الخادم لا يعمل');
    }
    console.log('✅ الخادم يعمل');
    
    // 2. اختبار البحث عن موظفين
    console.log('\n2️⃣ اختبار البحث عن موظفين...');
    
    try {
      const searchResponse = await fetch(`${API_BASE}/complaint-targets/search-employees?q=أحمد`, {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer mock_jwt_token`,
          'X-User-Data': JSON.stringify(testData.user)
        }
      });
      
      if (searchResponse.status === 401) {
        console.log('⚠️ تم رفض الطلب بسبب عدم وجود token صحيح (401 Unauthorized)');
        console.log('💡 هذا متوقع لأننا نستخدم mock token');
      } else if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        console.log('✅ البحث عن الموظفين يعمل');
        console.log('📋 النتائج:', searchData);
      } else {
        console.log('❌ فشل في البحث عن الموظفين:', searchResponse.status);
      }
      
    } catch (error) {
      console.log('⚠️ خطأ في البحث عن الموظفين (متوقع):', error.message);
    }
    
    // 3. اختبار إنشاء بلاغ على موظف
    console.log('\n3️⃣ اختبار إنشاء بلاغ على موظف...');
    
    try {
      const createResponse = await fetch(`${API_BASE}/complaint-targets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer mock_jwt_token`,
          'X-User-Data': JSON.stringify(testData.user)
        },
        body: JSON.stringify(testData.complaintTarget)
      });
      
      if (createResponse.status === 401) {
        console.log('⚠️ تم رفض الطلب بسبب عدم وجود token صحيح (401 Unauthorized)');
        console.log('💡 هذا متوقع لأننا نستخدم mock token');
      } else if (createResponse.ok) {
        const createData = await createResponse.json();
        console.log('✅ إنشاء بلاغ على موظف يعمل');
        console.log('📋 النتيجة:', createData);
      } else {
        console.log('❌ فشل في إنشاء بلاغ على موظف:', createResponse.status);
        const errorData = await createResponse.json().catch(() => ({}));
        console.log('📋 تفاصيل الخطأ:', errorData);
      }
      
    } catch (error) {
      console.log('⚠️ خطأ في إنشاء بلاغ على موظف (متوقع):', error.message);
    }
    
    // 4. اختبار جلب جميع البلاغات على الموظفين
    console.log('\n4️⃣ اختبار جلب جميع البلاغات على الموظفين...');
    
    try {
      const getAllResponse = await fetch(`${API_BASE}/complaint-targets`, {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer mock_jwt_token`,
          'X-User-Data': JSON.stringify(testData.user)
        }
      });
      
      if (getAllResponse.status === 401) {
        console.log('⚠️ تم رفض الطلب بسبب عدم وجود token صحيح (401 Unauthorized)');
        console.log('💡 هذا متوقع لأننا نستخدم mock token');
      } else if (getAllResponse.ok) {
        const getAllData = await getAllResponse.json();
        console.log('✅ جلب البلاغات على الموظفين يعمل');
        console.log('📋 النتائج:', getAllData);
      } else {
        console.log('❌ فشل في جلب البلاغات على الموظفين:', getAllResponse.status);
      }
      
    } catch (error) {
      console.log('⚠️ خطأ في جلب البلاغات على الموظفين (متوقع):', error.message);
    }
    
    console.log('\n🎉 انتهى الاختبار!');
    console.log('\n📝 ملاحظات:');
    console.log('- تأكد من تشغيل الخادم: npm start');
    console.log('- تأكد من وجود جدول complaint_targets في قاعدة البيانات');
    console.log('- في البيئة الحقيقية، ستحتاج JWT tokens صحيحة للاختبار');
    console.log('- تأكد من وجود بلاغات في قاعدة البيانات للاختبار');
    
  } catch (error) {
    console.error('❌ خطأ في الاختبار:', error.message);
  }
}

// تشغيل الاختبار
testComplaintTargetsSystem();
