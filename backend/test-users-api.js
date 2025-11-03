// test-users-api.js
// اختبار API المستخدمين

import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3001';

async function testUsersAPI() {
  console.log('🧪 بدء اختبار API المستخدمين...\n');

  try {
    // 1. اختبار جلب جميع المستخدمين
    console.log('1️⃣ اختبار جلب جميع المستخدمين...');
    const usersRes = await fetch(`${API_BASE}/api/users`);
    if (usersRes.ok) {
      const users = await usersRes.json();
      console.log(`✅ تم جلب ${users.length} مستخدم`);
      console.log('📋 عينة من المستخدمين:', users.slice(0, 2));
    } else {
      console.log('❌ فشل جلب المستخدمين:', usersRes.status);
    }

    // 2. اختبار جلب مستخدم واحد (إذا كان هناك مستخدمين)
    if (usersRes.ok) {
      const users = await usersRes.json();
      if (users.length > 0) {
        console.log('\n2️⃣ اختبار جلب مستخدم واحد...');
        const userRes = await fetch(`${API_BASE}/api/users/${users[0].UserID}`);
        if (userRes.ok) {
          const user = await userRes.json();
          console.log('✅ تم جلب المستخدم:', user.FullName);
        } else {
          console.log('❌ فشل جلب المستخدم:', userRes.status);
        }
      }
    }

    // 3. اختبار إضافة مستخدم جديد
    console.log('\n3️⃣ اختبار إضافة مستخدم جديد...');
    const newUser = {
      RoleID: 2,
      HospitalID: 1,
      DepartmentID: 1,
      FullName: "مستخدم تجريبي",
      Username: "testuser",
      Email: "test@example.com",
      Mobile: "0550000000",
      NationalID: "1234567890",
      PasswordHash: "hashed-password",
      IsActive: 1
    };

    const addRes = await fetch(`${API_BASE}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newUser)
    });

    if (addRes.ok) {
      const result = await addRes.json();
      console.log('✅ تم إضافة المستخدم:', result.UserID);
      
      // 4. اختبار تعديل المستخدم
      console.log('\n4️⃣ اختبار تعديل المستخدم...');
      const updateData = {
        ...newUser,
        FullName: "مستخدم معدل",
        Email: "updated@example.com"
      };

      const updateRes = await fetch(`${API_BASE}/api/users/${result.UserID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      });

      if (updateRes.ok) {
        console.log('✅ تم تعديل المستخدم بنجاح');
      } else {
        console.log('❌ فشل تعديل المستخدم:', updateRes.status);
      }

      // 5. اختبار حذف المستخدم
      console.log('\n5️⃣ اختبار حذف المستخدم...');
      const deleteRes = await fetch(`${API_BASE}/api/users/${result.UserID}`, {
        method: 'DELETE'
      });

      if (deleteRes.ok) {
        console.log('✅ تم حذف المستخدم بنجاح');
      } else {
        console.log('❌ فشل حذف المستخدم:', deleteRes.status);
      }

    } else {
      console.log('❌ فشل إضافة المستخدم:', addRes.status);
      const error = await addRes.text();
      console.log('تفاصيل الخطأ:', error);
    }

  } catch (error) {
    console.error('❌ خطأ في الاختبار:', error.message);
  }

  console.log('\n🏁 انتهى الاختبار');
}

// تشغيل الاختبار
testUsersAPI();
