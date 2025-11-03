// test-timeline-api.js
// ملف اختبار لـ API الخاص بـ Timeline

const API_BASE = 'http://localhost:3001/api';

async function testTimelineAPI() {
  console.log('🧪 بدء اختبار Timeline API\n');
  
  try {
    // 1. جلب أول بلاغ من قاعدة البيانات
    console.log('1️⃣ جلب بلاغ للاختبار...');
    const trackResponse = await fetch(`${API_BASE}/complaints/track`);
    const trackData = await trackResponse.json();
    
    if (!trackData.ok || !trackData.items || trackData.items.length === 0) {
      console.error('❌ لا توجد بلاغات في قاعدة البيانات');
      console.log('\n💡 قم بإضافة بلاغ أولاً من صفحة تقديم البلاغات');
      return;
    }
    
    const firstComplaint = trackData.items[0];
    const ticketNumber = firstComplaint.ticket;
    
    console.log(`✅ تم إيجاد البلاغ: ${ticketNumber}`);
    console.log(`   - المريض: ${firstComplaint.fullName}`);
    console.log(`   - الحالة: ${firstComplaint.status} (${firstComplaint.statusLabelAr || 'N/A'})`);
    console.log(`   - الأولوية: ${firstComplaint.priority} (${firstComplaint.priorityLabelAr || 'N/A'})\n`);
    
    // 2. اختبار Timeline API
    console.log('2️⃣ جلب Timeline للبلاغ...');
    const timelineResponse = await fetch(`${API_BASE}/complaints/${encodeURIComponent(ticketNumber)}/timeline`);
    
    if (!timelineResponse.ok) {
      throw new Error(`HTTP ${timelineResponse.status}: ${timelineResponse.statusText}`);
    }
    
    const timelineData = await timelineResponse.json();
    
    if (!timelineData.ok) {
      throw new Error(timelineData.message || 'فشل في جلب Timeline');
    }
    
    console.log(`✅ تم جلب Timeline بنجاح`);
    console.log(`   - عدد الأحداث: ${timelineData.items.length}\n`);
    
    // 3. عرض الأحداث
    if (timelineData.items.length === 0) {
      console.log('⚠️  Timeline فارغ - لا توجد أحداث مسجلة لهذا البلاغ');
      console.log('\n💡 النصائح:');
      console.log('   - أضف رداً على البلاغ من صفحة التفاصيل');
      console.log('   - غيّر حالة البلاغ');
    } else {
      console.log('📅 الأحداث المسجلة:\n');
      timelineData.items.forEach((item, index) => {
        const icon = getIconForKind(item.kind);
        console.log(`${icon} ${index + 1}. ${item.title || 'حدث'}`);
        console.log(`   ⏰ ${formatDate(item.at)}`);
        if (item.detail) {
          console.log(`   📝 ${item.detail}`);
        }
        if (item.meta) {
          console.log(`   👤 ${item.meta}`);
        }
        console.log('');
      });
    }
    
    // 4. اختبار التسميات العربية
    console.log('3️⃣ اختبار التسميات العربية...');
    const hasStatusLabel = trackData.items.some(item => item.statusLabelAr);
    const hasPriorityLabel = trackData.items.some(item => item.priorityLabelAr);
    
    if (hasStatusLabel && hasPriorityLabel) {
      console.log('✅ التسميات العربية تعمل بشكل صحيح');
    } else {
      console.log('⚠️  التسميات العربية مفقودة:');
      if (!hasStatusLabel) console.log('   - statusLabelAr غير موجودة');
      if (!hasPriorityLabel) console.log('   - priorityLabelAr غير موجودة');
      console.log('\n💡 تأكد من وجود الأعمدة LabelAr في جداول complaint_statuses و complaint_priorities');
    }
    
    console.log('\n✅ انتهى الاختبار بنجاح!');
    console.log(`\n🌐 رابط الصفحة:`);
    console.log(`   file:///.../NewProjectMecca/public/complaints/history/complaint-timeline.html?ticket=${ticketNumber}`);
    
  } catch (error) {
    console.error('\n❌ حدث خطأ أثناء الاختبار:');
    console.error(`   ${error.message}`);
    console.error('\n💡 تأكد من:');
    console.error('   - تشغيل الخادم (npm start في مجلد backend)');
    console.error('   - الخادم يعمل على المنفذ 3001');
    console.error('   - قاعدة البيانات متصلة');
  }
}

function getIconForKind(kind) {
  const icons = {
    'created': '🟢',
    'status_change': '🟠',
    'reply': '🔵',
    'transfer': '🟣'
  };
  return icons[kind] || '⚪';
}

function formatDate(dateString) {
  if (!dateString) return 'غير محدد';
  const date = new Date(dateString);
  return date.toLocaleString('ar-SA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// تشغيل الاختبار
testTimelineAPI();

