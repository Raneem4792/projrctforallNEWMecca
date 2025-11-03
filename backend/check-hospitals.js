// فحص المستشفيات الموجودة
import { getCentralPool } from './db/centralPool.js';

async function checkHospitals() {
  try {
    const central = await getCentralPool();
    
    // فحص المستشفيات
    console.log('🔍 المستشفيات الموجودة:');
    const [hospitals] = await central.query(`
      SELECT HospitalID, NameAr, NameEn, IsActive 
      FROM hospitals 
      ORDER BY HospitalID
    `);
    console.table(hospitals);
    
  } catch (error) {
    console.error('❌ خطأ:', error.message);
  } finally {
    process.exit(0);
  }
}

checkHospitals();
