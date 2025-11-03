// run-hospitals-update.js
// ملف لتشغيل تحديثات جدول المستشفيات

import { pool } from './config/db.js';
import fs from 'fs';
import path from 'path';

async function runHospitalsUpdate() {
  console.log('🏥 بدء تحديث جدول المستشفيات...\n');
  
  try {
    // قراءة ملف SQL
    const sqlFile = path.join(process.cwd(), 'sql', 'update-hospitals-table.sql');
    const sqlContent = fs.readFileSync(sqlFile, 'utf8');
    
    // تقسيم الاستعلامات
    const queries = sqlContent
      .split(';')
      .map(q => q.trim())
      .filter(q => q.length > 0 && !q.startsWith('--'));
    
    console.log(`📝 تم العثور على ${queries.length} استعلام\n`);
    
    // تنفيذ الاستعلامات
    for (let i = 0; i < queries.length; i++) {
      const query = queries[i];
      if (query.includes('SELECT')) {
        console.log(`🔍 تنفيذ استعلام ${i + 1}:`);
        console.log(`   ${query.substring(0, 50)}...`);
        
        const [results] = await pool.query(query);
        console.log(`   ✅ تم تنفيذ الاستعلام بنجاح`);
        
        if (Array.isArray(results) && results.length > 0) {
          console.log(`   📊 النتائج:`);
          results.forEach((row, idx) => {
            if (idx < 3) { // عرض أول 3 نتائج فقط
              console.log(`      ${JSON.stringify(row)}`);
            }
          });
          if (results.length > 3) {
            console.log(`      ... و ${results.length - 3} صفوف أخرى`);
          }
        }
      } else {
        console.log(`⚙️  تنفيذ استعلام ${i + 1}:`);
        console.log(`   ${query.substring(0, 50)}...`);
        
        await pool.query(query);
        console.log(`   ✅ تم تنفيذ الاستعلام بنجاح`);
      }
      console.log('');
    }
    
    console.log('🎉 تم تحديث جدول المستشفيات بنجاح!');
    console.log('\n📋 ملخص التحديثات:');
    console.log('   ✅ إضافة أعمدة: CityAr, CityEn, RegionAr, RegionEn, IsActive, SortOrder');
    console.log('   ✅ إضافة فهرس فريد لكود المستشفى');
    console.log('   ✅ إضافة فهارس للأداء');
    console.log('   ✅ إدراج بيانات تجريبية');
    
  } catch (error) {
    console.error('❌ خطأ في تحديث جدول المستشفيات:', error.message);
    
    if (error.code === 'ER_DUP_ENTRY') {
      console.log('\n💡 يبدو أن البيانات موجودة مسبقاً. هذا طبيعي إذا تم تشغيل السكريبت من قبل.');
    } else if (error.code === 'ER_DUP_KEYNAME') {
      console.log('\n💡 يبدو أن الفهارس موجودة مسبقاً. هذا طبيعي إذا تم تشغيل السكريبت من قبل.');
    }
    
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// تشغيل التحديث
runHospitalsUpdate();
