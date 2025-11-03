// test-employee-target.js
// ملف اختبار سريع للتحقق من ميزة الموظف المستهدف

import { pool } from './config/db.js';

async function testEmployeeTargetFeature() {
  console.log('🧪 اختبار ميزة الموظف المستهدف...\n');

  try {
    // 1️⃣ التحقق من وجود جدول complaint_targets
    console.log('1️⃣ التحقق من وجود جدول complaint_targets...');
    const [tables] = await pool.query(`SHOW TABLES LIKE 'complaint_targets'`);
    
    if (tables.length === 0) {
      console.log('❌ الجدول complaint_targets غير موجود!');
      console.log('🔧 قم بتنفيذ: backend/sql/create-complaint-targets.sql\n');
      return;
    }
    console.log('✅ الجدول موجود\n');

    // 2️⃣ التحقق من هيكل الجدول
    console.log('2️⃣ التحقق من أعمدة الجدول...');
    const [columns] = await pool.query(`DESCRIBE complaint_targets`);
    console.log('✅ الأعمدة الموجودة:');
    columns.forEach(col => {
      console.log(`   - ${col.Field} (${col.Type})`);
    });
    console.log('');

    // 3️⃣ التحقق من البيانات الموجودة
    console.log('3️⃣ البحث عن بيانات موجودة...');
    const [targets] = await pool.query(`
      SELECT 
        ct.*,
        c.TicketNumber,
        c.Description
      FROM complaint_targets ct
      LEFT JOIN complaints c ON c.ComplaintID = ct.ComplaintID
      ORDER BY ct.CreatedAt DESC
      LIMIT 5
    `);
    
    if (targets.length === 0) {
      console.log('⚠️  لا توجد بيانات موظفين مستهدفين بعد');
      console.log('💡 جرّب إنشاء بلاغ جديد مع تفعيل "بلاغ على موظف"\n');
    } else {
      console.log(`✅ وُجد ${targets.length} سجل(سجلات):\n`);
      targets.forEach((t, i) => {
        console.log(`   ${i + 1}. التذكرة: ${t.TicketNumber || 'N/A'}`);
        console.log(`      الموظف: ${t.TargetEmployeeName || 'N/A'} (#${t.TargetEmployeeID || 'N/A'})`);
        console.log(`      القسم: ${t.TargetDepartmentName || 'N/A'}`);
        console.log(`      التاريخ: ${t.CreatedAt}\n`);
      });
    }

    // 4️⃣ إحصائيات الموظفين الأكثر تكراراً
    console.log('4️⃣ الموظفين الأكثر تكراراً في البلاغات:');
    const [stats] = await pool.query(`
      SELECT 
        TargetEmployeeID,
        TargetEmployeeName,
        TargetDepartmentName,
        COUNT(*) AS ComplaintCount
      FROM complaint_targets
      GROUP BY TargetEmployeeID, TargetEmployeeName, TargetDepartmentName
      ORDER BY ComplaintCount DESC
      LIMIT 10
    `);
    
    if (stats.length === 0) {
      console.log('⚠️  لا توجد إحصائيات بعد\n');
    } else {
      console.log('✅ الإحصائيات:\n');
      stats.forEach((s, i) => {
        console.log(`   ${i + 1}. ${s.TargetEmployeeName} - ${s.ComplaintCount} بلاغ(بلاغات)`);
        console.log(`      القسم: ${s.TargetDepartmentName || 'غير محدد'}\n`);
      });
    }

    // 5️⃣ التحقق من وجود راوتر الموظفين
    console.log('5️⃣ تحقق يدوياً من:');
    console.log('   ✓ السيرفر شغال: http://localhost:3001/api/health');
    console.log('   ✓ البحث عن موظف: http://localhost:3001/api/employees/search?query=test');
    console.log('   ✓ صفحة التقديم: افتحي submit-complaint.html وفعّلي checkbox\n');

    console.log('🎉 الاختبار انتهى بنجاح!');

  } catch (error) {
    console.error('❌ خطأ في الاختبار:', error.message);
    console.error(error);
  } finally {
    await pool.end();
  }
}

// تشغيل الاختبار
testEmployeeTargetFeature();

