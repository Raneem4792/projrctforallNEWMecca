// test-trash-operations.js
// اختبار عمليات سلة المحذوفات المحدثة

const API_BASE = 'http://localhost:3001';

// بيانات اختبار
const testData = {
  token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjIwLCJ1c2VySWQiOjIwLCJyb2xlSWQiOjIsImhvc3AiOjExLCJob3NwaXRhbElkIjoxMSwic2NvcGUiOiJ0ZW5hbnQiLCJpYXQiOjE3NjEwMzk2NjksImV4cCI6MTc2MTY0NDQ2OX0.example',
  hospitalId: 11,
  expectedBehavior: 'يجب أن تعمل عمليات الاسترجاع والحذف النهائي بشكل صحيح'
};

async function testTrashOperations() {
  console.log('🧪 بدء اختبار عمليات سلة المحذوفات المحدثة\n');
  
  console.log(`🏥 اختبار المستشفى: ${testData.hospitalId}`);
  console.log(`📋 المتوقع: ${testData.expectedBehavior}`);
  
  try {
    // 1. جلب قائمة المحذوفات
    console.log('\n1️⃣ اختبار جلب قائمة المحذوفات');
    const trashResponse = await fetch(`${API_BASE}/api/trash?hospitalId=${testData.hospitalId}`, {
      headers: {
        'Authorization': `Bearer ${testData.token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`📊 حالة الاستجابة: ${trashResponse.status} ${trashResponse.statusText}`);
    
    if (trashResponse.ok) {
      const trashResult = await trashResponse.json();
      console.log(`✅ نجح جلب المحذوفات: ${trashResult.count || 0} عنصر`);
      
      if (trashResult.items && trashResult.items.length > 0) {
        const firstItem = trashResult.items[0];
        console.log(`📋 أول عنصر في السلة:`);
        console.log(`   - معرف السلة: ${firstItem.TrashID}`);
        console.log(`   - نوع العنصر: ${firstItem.EntityType}`);
        console.log(`   - معرف العنصر: ${firstItem.EntityID}`);
        console.log(`   - عنوان العنصر: ${firstItem.EntityTitle}`);
        console.log(`   - تاريخ الحذف: ${firstItem.DeletedAt}`);
        console.log(`   - سبب الحذف: ${firstItem.DeleteReason}`);
        
        // 2. اختبار الاسترجاع
        console.log('\n2️⃣ اختبار استرجاع العنصر');
        const restoreResponse = await fetch(`${API_BASE}/api/trash/${firstItem.TrashID}/restore`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${testData.token}`,
            'Content-Type': 'application/json'
          }
        });
        
        console.log(`📊 حالة الاستجابة: ${restoreResponse.status} ${restoreResponse.statusText}`);
        
        if (restoreResponse.ok) {
          const restoreResult = await restoreResponse.json();
          console.log(`✅ نجح الاسترجاع: ${restoreResult.message}`);
          console.log(`📋 تفاصيل الاسترجاع:`, restoreResult.data);
          
          // 3. التحقق من أن العنصر تم استرجاعه
          console.log('\n3️⃣ التحقق من الاسترجاع');
          const verifyResponse = await fetch(`${API_BASE}/api/trash/${firstItem.TrashID}`, {
            headers: {
              'Authorization': `Bearer ${testData.token}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (verifyResponse.ok) {
            const verifyResult = await verifyResponse.json();
            if (verifyResult.data && verifyResult.data.RestoredAt) {
              console.log(`✅ تم تأكيد الاسترجاع: ${verifyResult.data.RestoredAt}`);
              console.log(`👤 تم الاسترجاع بواسطة: ${verifyResult.data.RestoredByUserName || 'غير محدد'}`);
            } else {
              console.log(`❌ لم يتم تأكيد الاسترجاع`);
            }
          }
          
        } else {
          const errorText = await restoreResponse.text();
          console.log(`❌ فشل الاسترجاع: ${errorText}`);
        }
        
      } else {
        console.log(`ℹ️ لا توجد عناصر في السلة للاختبار`);
      }
      
    } else {
      const errorText = await trashResponse.text();
      console.log(`❌ فشل جلب المحذوفات: ${errorText}`);
    }
    
    // 4. اختبار جلب البلاغات المحذوفة فقط
    console.log('\n4️⃣ اختبار جلب البلاغات المحذوفة فقط');
    const complaintsResponse = await fetch(`${API_BASE}/api/trash/complaints?hospitalId=${testData.hospitalId}`, {
      headers: {
        'Authorization': `Bearer ${testData.token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`📊 حالة الاستجابة: ${complaintsResponse.status} ${complaintsResponse.statusText}`);
    
    if (complaintsResponse.ok) {
      const complaintsResult = await complaintsResponse.json();
      console.log(`✅ نجح جلب البلاغات المحذوفة: ${complaintsResult.length || 0} بلاغ`);
      
      if (complaintsResult.length > 0) {
        const firstComplaint = complaintsResult[0];
        console.log(`📋 أول بلاغ محذوف:`);
        console.log(`   - معرف البلاغ: ${firstComplaint.ComplaintID}`);
        console.log(`   - عنوان البلاغ: ${firstComplaint.EntityTitle}`);
        console.log(`   - تاريخ الحذف: ${firstComplaint.DeletedAt}`);
        console.log(`   - سبب الحذف: ${firstComplaint.DeleteReason}`);
        console.log(`   - حذف بواسطة: ${firstComplaint.DeletedByUserName || 'غير محدد'}`);
      }
    } else {
      const errorText = await complaintsResponse.text();
      console.log(`❌ فشل جلب البلاغات المحذوفة: ${errorText}`);
    }
    
    // 5. اختبار إحصائيات السلة
    console.log('\n5️⃣ اختبار إحصائيات السلة');
    const statsResponse = await fetch(`${API_BASE}/api/trash/stats?hospitalId=${testData.hospitalId}`, {
      headers: {
        'Authorization': `Bearer ${testData.token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`📊 حالة الاستجابة: ${statsResponse.status} ${statsResponse.statusText}`);
    
    if (statsResponse.ok) {
      const statsResult = await statsResponse.json();
      console.log(`✅ نجح جلب الإحصائيات:`, statsResult.data);
    } else {
      const errorText = await statsResponse.text();
      console.log(`❌ فشل جلب الإحصائيات: ${errorText}`);
    }
    
  } catch (error) {
    console.log(`❌ خطأ في الطلب: ${error.message}`);
  }
  
  // 6. اختبار بدون توكن
  console.log('\n6️⃣ اختبار بدون توكن (يجب أن يفشل)');
  try {
    const response = await fetch(`${API_BASE}/api/trash?hospitalId=${testData.hospitalId}`);
    console.log(`📊 حالة الاستجابة: ${response.status} ${response.statusText}`);
    
    if (response.status === 401) {
      console.log('✅ تم رفض الطلب بدون توكن كما هو متوقع');
    } else {
      console.log('❌ كان يجب رفض الطلب بدون توكن');
    }
  } catch (error) {
    console.log(`❌ خطأ في الطلب: ${error.message}`);
  }
  
  console.log('\n🏁 انتهى اختبار عمليات سلة المحذوفات');
  console.log('\n📝 ملاحظات:');
  console.log('   - الاسترجاع يحدث IsDeleted=0 في قاعدة المستشفى');
  console.log('   - الحذف النهائي يحذف البلاغ فعلياً من قاعدة المستشفى');
  console.log('   - يتم تحديث trash_bin لتسجيل العمليات');
  console.log('   - النظام يدعم الحذف التسلسلي للمرفقات والردود');
}

// تشغيل الاختبار
testTrashOperations().catch(console.error);
