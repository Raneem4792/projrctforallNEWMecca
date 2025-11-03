// فحص صلاحيات الاستيراد في قاعدة بيانات المستشفى
import { getTenantPoolByHospitalId } from './db/tenantManager.js';

async function checkTenantPermissions() {
  try {
    // استبدل بـ HospitalID الصحيح
    const hospitalId = 10; // استبدل بمعرف المستشفى المطلوب
    const tenant = await getTenantPoolByHospitalId(hospitalId);
    
    // 1. فحص الصلاحيات في قاعدة بيانات المستشفى
    console.log(`🔍 فحص صلاحيات الاستيراد في قاعدة بيانات المستشفى ${hospitalId}:`);
    const [permissions] = await tenant.query(`
      SELECT PermissionKey, NameAr, Category 
      FROM permissions 
      WHERE PermissionKey LIKE 'IMPORTS_%'
    `);
    console.table(permissions);
    
    // 2. فحص صلاحيات مستخدم معين
    const testUserId = 1; // استبدل بمعرف المستخدم
    
    console.log(`\n🔍 فحص صلاحيات المستخدم ${testUserId} في المستشفى ${hospitalId}:`);
    const [userPerms] = await tenant.query(`
      SELECT PermissionKey, ViewScope, GrantedAt
      FROM user_permissions 
      WHERE UserID = ? AND HospitalID = ? AND PermissionKey LIKE 'IMPORTS_%'
    `, [testUserId, hospitalId]);
    console.table(userPerms);
    
    // 3. فحص جميع صلاحيات المستخدم
    console.log(`\n🔍 جميع صلاحيات المستخدم ${testUserId}:`);
    const [allUserPerms] = await tenant.query(`
      SELECT PermissionKey, ViewScope, GrantedAt
      FROM user_permissions 
      WHERE UserID = ? AND HospitalID = ?
    `, [testUserId, hospitalId]);
    console.table(allUserPerms);
    
  } catch (error) {
    console.error('❌ خطأ:', error.message);
  } finally {
    process.exit(0);
  }
}

checkTenantPermissions();
