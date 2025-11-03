// test-complaint-type-names.js
// اختبار عرض أسماء التصنيفات بدلاً من الأرقام

import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3001/api';

async function testComplaintTypeNames() {
  console.log('🧪 اختبار عرض أسماء التصنيفات...\n');
  
  try {
    // 1. اختبار الخادم
    console.log('1️⃣ اختبار الخادم...');
    const healthResponse = await fetch(`${API_BASE}/health`);
    if (!healthResponse.ok) {
      throw new Error('الخادم لا يعمل');
    }
    console.log('✅ الخادم يعمل');
    
    // 2. اختبار endpoint /api/complaints/history
    console.log('\n2️⃣ اختبار endpoint /api/complaints/history...');
    
    try {
      const historyResponse = await fetch(`${API_BASE}/complaints/history?page=1&pageSize=5`, {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer mock_jwt_token`
        }
      });
      
      if (historyResponse.status === 401) {
        console.log('⚠️ تم رفض الطلب بسبب عدم وجود token صحيح (401 Unauthorized)');
        console.log('💡 هذا متوقع لأننا نستخدم mock token');
      } else if (historyResponse.ok) {
        const historyData = await historyResponse.json();
        console.log('✅ endpoint /api/complaints/history يعمل');
        
        if (historyData.items && historyData.items.length > 0) {
          const firstComplaint = historyData.items[0];
          console.log('📋 عينة من البيانات:');
          console.log(`   - رقم البلاغ: ${firstComplaint.ticket || 'غير محدد'}`);
          console.log(`   - التصنيف (رقم): ${firstComplaint.type || 'غير محدد'}`);
          console.log(`   - التصنيف (اسم): ${firstComplaint.typeName || 'غير محدد'}`);
          
          if (firstComplaint.typeName) {
            console.log('✅ تم العثور على اسم التصنيف في البيانات');
          } else {
            console.log('⚠️ لم يتم العثور على اسم التصنيف - تحقق من JOIN');
          }
        } else {
          console.log('ℹ️ لا توجد بلاغات في قاعدة البيانات');
        }
      } else {
        console.log('❌ فشل في جلب البيانات:', historyResponse.status);
        const errorData = await historyResponse.json().catch(() => ({}));
        console.log('📋 تفاصيل الخطأ:', errorData);
      }
      
    } catch (error) {
      console.log('⚠️ خطأ في endpoint /api/complaints/history (متوقع):', error.message);
    }
    
    // 3. اختبار endpoint /api/complaints/track
    console.log('\n3️⃣ اختبار endpoint /api/complaints/track...');
    
    try {
      const trackResponse = await fetch(`${API_BASE}/complaints/track?name=C-2025-000001`, {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer mock_jwt_token`
        }
      });
      
      if (trackResponse.status === 401) {
        console.log('⚠️ تم رفض الطلب بسبب عدم وجود token صحيح (401 Unauthorized)');
        console.log('💡 هذا متوقع لأننا نستخدم mock token');
      } else if (trackResponse.ok) {
        const trackData = await trackResponse.json();
        console.log('✅ endpoint /api/complaints/track يعمل');
        
        if (trackData.items && trackData.items.length > 0) {
          const firstComplaint = trackData.items[0];
          console.log('📋 عينة من البيانات:');
          console.log(`   - رقم البلاغ: ${firstComplaint.TicketNumber || 'غير محدد'}`);
          console.log(`   - التصنيف (اسم): ${firstComplaint.ComplaintTypeNameAr || 'غير محدد'}`);
          
          if (firstComplaint.ComplaintTypeNameAr) {
            console.log('✅ تم العثور على اسم التصنيف في البيانات');
          } else {
            console.log('⚠️ لم يتم العثور على اسم التصنيف - تحقق من JOIN');
          }
        } else {
          console.log('ℹ️ لا توجد بلاغات مطابقة للبحث');
        }
      } else {
        console.log('❌ فشل في جلب البيانات:', trackResponse.status);
      }
      
    } catch (error) {
      console.log('⚠️ خطأ في endpoint /api/complaints/track (متوقع):', error.message);
    }
    
    console.log('\n🎉 انتهى الاختبار!');
    console.log('\n📝 ملاحظات:');
    console.log('- تأكد من تشغيل الخادم: npm start');
    console.log('- تأكد من وجود جدول complaint_types في قاعدة البيانات');
    console.log('- تأكد من وجود بيانات في جدول complaint_types');
    console.log('- في البيئة الحقيقية، ستحتاج JWT tokens صحيحة للاختبار');
    
    console.log('\n🔍 للتحقق من البيانات:');
    console.log('SELECT * FROM complaint_types;');
    console.log('SELECT c.ComplaintID, c.ComplaintTypeID, t.TypeName FROM complaints c LEFT JOIN complaint_types t ON c.ComplaintTypeID = t.ComplaintTypeID LIMIT 5;');
    
  } catch (error) {
    console.error('❌ خطأ في الاختبار:', error.message);
  }
}

// تشغيل الاختبار
testComplaintTypeNames();
