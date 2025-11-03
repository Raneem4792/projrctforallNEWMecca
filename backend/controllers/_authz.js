// controllers/_authz.js
/**
 * هيلبرز للتحقق من الصلاحيات
 */

/**
 * التحقق من أن المستخدم مدير تجمّع
 */
export function isClusterManager(user) {
  return Number(user?.RoleID) === 1; // مدير التجمّع
}

/**
 * التحقق من أن المستخدم يستطيع الوصول لمستشفى معيّن
 */
export function canAccessHospital(user, hospitalId) {
  const hid = Number(hospitalId);
  if (!hid) return false;
  
  // مدير التجمّع → وصول كامل لجميع المستشفيات
  if (isClusterManager(user)) return true;
  
  // موظف → مستشفاه فقط
  return Number(user?.HospitalID) === hid;
}

