// فحص بنية قاعدة البيانات
import { getCentralPool } from './db/centralPool.js';

async function checkDatabaseStructure() {
  try {
    const central = await getCentralPool();
    
    // 1. فحص الجداول الموجودة
    console.log('🔍 الجداول الموجودة في قاعدة البيانات المركزية:');
    const [tables] = await central.query('SHOW TABLES');
    console.table(tables);
    
    // 2. فحص بنية جدول permissions إذا كان موجوداً
    try {
      const [permissionsStructure] = await central.query('DESCRIBE permissions');
      console.log('\n🔍 بنية جدول permissions:');
      console.table(permissionsStructure);
    } catch (e) {
      console.log('\n❌ جدول permissions غير موجود');
    }
    
    // 3. فحص جدول user_permissions إذا كان موجوداً
    try {
      const [userPermsStructure] = await central.query('DESCRIBE user_permissions');
      console.log('\n🔍 بنية جدول user_permissions:');
      console.table(userPermsStructure);
    } catch (e) {
      console.log('\n❌ جدول user_permissions غير موجود');
    }
    
  } catch (error) {
    console.error('❌ خطأ:', error.message);
  } finally {
    process.exit(0);
  }
}

checkDatabaseStructure();
