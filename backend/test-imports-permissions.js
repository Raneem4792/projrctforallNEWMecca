// اختبار صلاحيات الاستيراد
import { getCentralPool } from './db/centralPool.js';

async function testImportsPermissions() {
  try {
    const central = await getCentralPool();
    
    // 1. فحص الصلاحيات في قاعدة البيانات المركزية
    console.log('🔍 فحص صلاحيات الاستيراد في قاعدة البيانات المركزية:');
    const [permissions] = await central.query(`
      SELECT PermissionKey, NameAr, Category 
      FROM permissions 
      WHERE PermissionKey LIKE 'IMPORTS_%'
    `);
    console.table(permissions);
    
    // 2. فحص صلاحيات مستخدم معين (استبدل UserID و HospitalID)
    const testUserId = 1; // استبدل بمعرف المستخدم
    const testHospitalId = 1; // استبدل بمعرف المستشفى
    
    console.log(`\n🔍 فحص صلاحيات المستخدم ${testUserId} في المستشفى ${testHospitalId}:`);
    const [userPerms] = await central.query(`
      SELECT PermissionKey, ViewScope, GrantedAt
      FROM user_permissions 
      WHERE UserID = ? AND HospitalID = ? AND PermissionKey LIKE 'IMPORTS_%'
    `, [testUserId, testHospitalId]);
    console.table(userPerms);
    
  } catch (error) {
    console.error('❌ خطأ:', error.message);
  } finally {
    process.exit(0);
  }
}

testImportsPermissions();
