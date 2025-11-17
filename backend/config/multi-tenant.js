// backend/config/multi-tenant.js
export default {
  // اتصال القاعدة المركزية
  central: {
    host: process.env.CENTRAL_DB_HOST || '127.0.0.1',
    user: process.env.CENTRAL_DB_USER || 'root',
    password: process.env.CENTRAL_DB_PASS || 'SamarAmer12345@',
    database: process.env.CENTRAL_DB_NAME || 'hospitals_mecca3'
  },
  
  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'superscret_jwt_key',
    expires: process.env.JWT_EXPIRES || '7d'
  },
  
  // أدوار المستخدمين
  roles: {
    CLUSTER_MANAGER: 1,
    HOSPITAL_ADMIN: 2,
    EMPLOYEE: 3
  },
  
  // نطاقات الصلاحيات
  scopes: {
    CENTRAL: 'central',
    TENANT: 'tenant'
  }
};
