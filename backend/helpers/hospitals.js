// helpers/hospitals.js
// مساعد لجلب خريطة المستشفيات من القاعدة المركزية

import { centralDb } from '../config/db.js';

/**
 * جلب خريطة المستشفيات من القاعدة المركزية
 * @returns {Promise<Map>} خريطة HospitalID -> { nameAr, nameEn }
 */
export async function getHospitalsMap() {
  try {
    const [rows] = await centralDb.query(`
      SELECT HospitalID, NameAr, NameEn 
      FROM hospitals 
      WHERE IFNULL(IsActive, Active) = 1
    `);
    
    const map = new Map();
    for (const row of rows) {
      map.set(row.HospitalID, { 
        nameAr: row.NameAr, 
        nameEn: row.NameEn 
      });
    }
    
    console.log(`🏥 تم تحميل ${map.size} مستشفى من القاعدة المركزية`);
    return map;
  } catch (error) {
    console.error('❌ خطأ في جلب خريطة المستشفيات:', error);
    return new Map();
  }
}

/**
 * جلب معلومات مستشفى واحد
 * @param {number} hospitalId 
 * @returns {Promise<Object|null>}
 */
export async function getHospitalInfo(hospitalId) {
  try {
    const [rows] = await centralDb.query(`
      SELECT HospitalID, NameAr, NameEn, DbHost, DbUser, DbPass, DbName
      FROM hospitals 
      WHERE HospitalID = ? AND IFNULL(IsActive, Active) = 1
      LIMIT 1
    `, [hospitalId]);
    
    return rows[0] || null;
  } catch (error) {
    console.error(`❌ خطأ في جلب معلومات المستشفى ${hospitalId}:`, error);
    return null;
  }
}
