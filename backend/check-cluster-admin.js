// check-cluster-admin.js
// فحص حساب مدير التجمع

import { centralDb } from './config/db.js';

async function checkClusterAdmin() {
  try {
    console.log('🔍 فحص حساب مدير التجمع...\n');

    // 1) البحث عن جميع المستخدمين مع RoleID = 1
    const [users] = await centralDb.query(`
      SELECT UserID, Username, RoleID, HospitalID, FullName, IsActive 
      FROM users 
      WHERE RoleID = 1
      ORDER BY UserID
    `);

    console.log(`📊 عدد المستخدمين مع RoleID = 1: ${users.length}`);
    
    if (users.length === 0) {
      console.log('❌ لا يوجد مستخدمين مع RoleID = 1');
      console.log('💡 قم بتشغيل: mysql -u root -p hospitals_mecca3 < backend/sql/setup_cluster_admin.sql');
      return;
    }

    console.log('\n👥 المستخدمون مع RoleID = 1:');
    users.forEach((user, index) => {
      console.log(`${index + 1}. UserID: ${user.UserID}`);
      console.log(`   Username: ${user.Username}`);
      console.log(`   RoleID: ${user.RoleID}`);
      console.log(`   HospitalID: ${user.HospitalID}`);
      console.log(`   FullName: ${user.FullName}`);
      console.log(`   IsActive: ${user.IsActive}`);
      console.log('');
    });

    // 2) البحث عن cluster.admin تحديداً
    const [clusterAdmin] = await centralDb.query(`
      SELECT UserID, Username, RoleID, HospitalID, FullName, IsActive 
      FROM users 
      WHERE Username = 'cluster.admin'
    `);

    if (clusterAdmin.length > 0) {
      const admin = clusterAdmin[0];
      console.log('✅ تم العثور على cluster.admin:');
      console.log(`   UserID: ${admin.UserID}`);
      console.log(`   Username: ${admin.Username}`);
      console.log(`   RoleID: ${admin.RoleID}`);
      console.log(`   HospitalID: ${admin.HospitalID}`);
      console.log(`   FullName: ${admin.FullName}`);
      console.log(`   IsActive: ${admin.IsActive}`);
      
      if (admin.RoleID === 1 && admin.HospitalID === null) {
        console.log('\n🎉 حساب مدير التجمع صحيح!');
        console.log('💡 معلومات تسجيل الدخول:');
        console.log('   Username: cluster.admin');
        console.log('   Password: 123456');
      } else {
        console.log('\n⚠️ حساب cluster.admin غير صحيح:');
        if (admin.RoleID !== 1) {
          console.log(`   ❌ RoleID يجب أن يكون 1، لكنه ${admin.RoleID}`);
        }
        if (admin.HospitalID !== null) {
          console.log(`   ❌ HospitalID يجب أن يكون NULL، لكنه ${admin.HospitalID}`);
        }
      }
    } else {
      console.log('❌ لم يتم العثور على cluster.admin');
      console.log('💡 قم بتشغيل: mysql -u root -p hospitals_mecca3 < backend/sql/setup_cluster_admin.sql');
    }

    // 3) فحص المستخدم الحالي (UserID = 4)
    const [currentUser] = await centralDb.query(`
      SELECT UserID, Username, RoleID, HospitalID, FullName, IsActive 
      FROM users 
      WHERE UserID = 4
    `);

    if (currentUser.length > 0) {
      const user = currentUser[0];
      console.log('\n👤 المستخدم الحالي (UserID = 4):');
      console.log(`   UserID: ${user.UserID}`);
      console.log(`   Username: ${user.Username}`);
      console.log(`   RoleID: ${user.RoleID}`);
      console.log(`   HospitalID: ${user.HospitalID}`);
      console.log(`   FullName: ${user.FullName}`);
      console.log(`   IsActive: ${user.IsActive}`);
      
      if (user.RoleID === 1) {
        console.log('✅ هذا المستخدم مدير تجمع!');
      } else {
        console.log('❌ هذا المستخدم ليس مدير تجمع');
        console.log(`   RoleID = ${user.RoleID} (يجب أن يكون 1)`);
      }
    }

  } catch (error) {
    console.error('❌ خطأ في فحص حساب مدير التجمع:', error);
  } finally {
    await centralDb.end();
  }
}

checkClusterAdmin();
