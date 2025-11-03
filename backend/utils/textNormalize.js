// تطبيع النصوص العربية - إزالة التشكيل والأحرف الخاصة
const AR_DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;

/**
 * يزيل التشكيل والأحرف الخاصة من النص العربي
 * @param {string} s - النص المراد تطبيعه
 * @returns {string} النص المطبع
 */
export function stripDiacritics(s = '') {
  return s.normalize('NFKC').replace(AR_DIACRITICS, '');
}

/**
 * تطبيع النص للبحث - تحويل إلى أحرف صغيرة وإزالة التشكيل
 * @param {string} text - النص المراد تطبيعه
 * @returns {string} النص المطبع للبحث
 */
export function normalizeForSearch(text = '') {
  return stripDiacritics(text.toLowerCase().trim());
}
