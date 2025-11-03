// أداة تشخيص مشكلة التوكن
import jwt from 'jsonwebtoken';

function debugToken() {
  console.log('🔍 تشخيص مشكلة التوكن...\n');

  // 1. فحص JWT_SECRET
  console.log('1. فحص JWT_SECRET:');
  if (process.env.JWT_SECRET) {
    console.log('   ✅ JWT_SECRET موجود');
    console.log('   طول المفتاح:', process.env.JWT_SECRET.length);
  } else {
    console.log('   ❌ JWT_SECRET مفقود');
  }

  // 2. فحص التوكن من localStorage (محاكاة)
  console.log('\n2. فحص التوكن:');
  const sampleToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsInJvbGVJZCI6MiwiaG9zcGl0YWxJZCI6MTEsInVzZXJuYW1lIjoiYWRtaW4iLCJpYXQiOjE3Mzg5NzQwMDB9.example';
  
  try {
    const payload = jwt.verify(sampleToken, process.env.JWT_SECRET || 'default-secret');
    console.log('   ✅ التوكن صالح');
    console.log('   المستخدم:', payload);
  } catch (error) {
    console.log('   ❌ التوكن غير صالح:', error.message);
  }

  // 3. فحص بنية التوكن المتوقعة
  console.log('\n3. بنية التوكن المتوقعة:');
  const expectedPayload = {
    userId: 1,
    roleId: 2,
    hospitalId: 11,
    username: 'admin'
  };
  
  try {
    const testToken = jwt.sign(expectedPayload, process.env.JWT_SECRET || 'default-secret');
    console.log('   ✅ يمكن إنشاء توكن');
    console.log('   التوكن التجريبي:', testToken.substring(0, 50) + '...');
    
    const decoded = jwt.verify(testToken, process.env.JWT_SECRET || 'default-secret');
    console.log('   المحتوى المفكوك:', decoded);
  } catch (error) {
    console.log('   ❌ خطأ في إنشاء التوكن:', error.message);
  }

  // 4. توصيات
  console.log('\n4. التوصيات:');
  console.log('   - تأكد من وجود JWT_SECRET في .env');
  console.log('   - تأكد من صحة التوكن في localStorage');
  console.log('   - تأكد من أن التوكن يحتوي على hospitalId');
  console.log('   - راجع console المتصفح للتحقق من إرسال التوكن');
}

debugToken();
