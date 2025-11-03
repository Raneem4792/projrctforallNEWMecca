// controllers/lookupsController.js
import { pool } from '../config/db.js';

export async function getActiveDepartments(req, res, next) {
  try {
    const { hospitalId } = req.query;
    
    let query = `
      SELECT d.DepartmentID, d.NameAr, d.NameEn, d.HospitalID, h.NameAr AS HospitalNameAr
      FROM departments d
      JOIN hospitals h ON h.HospitalID = d.HospitalID
      WHERE d.IsActive = 1
    `;
    const params = [];
    
    if (hospitalId) {
      query += ' AND d.HospitalID = ?';
      params.push(Number(hospitalId));
    }
    
    query += ' ORDER BY h.NameAr, d.NameAr';
    
    const [rows] = await pool.query(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
}

export async function getActiveHospitals(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT HospitalID, NameAr, NameEn FROM hospitals 
       WHERE IsActive = 1 
       ORDER BY NameAr`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
}

export async function getComplaintCategories(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT CategoryID, NameAr, NameEn FROM complaint_categories 
       WHERE IsActive = 1 
       ORDER BY NameAr`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
}

// إرجاع شجرة الأقسام لمستشفى محدد
export async function getDepartmentsTree(req, res, next) {
  try {
    const { hospitalId } = req.query;
    const params = [];
    let where = 'd.IsActive = 1';
    if (hospitalId) { 
      where += ' AND d.HospitalID = ?'; 
      params.push(hospitalId); 
    }

    const [rows] = await pool.query(
      `SELECT d.DepartmentID, d.NameAr, d.HospitalID, d.ParentDepartmentID, d.Depth, d.SortOrder
         FROM departments d
        WHERE ${where}
        ORDER BY d.Depth ASC, d.SortOrder ASC, d.NameAr ASC`,
      params
    );

    // ابني شجرة (رئيسي ← فرعي)
    const byId = new Map(rows.map(r => [r.DepartmentID, { ...r, children: [] }]));
    const roots = [];
    rows.forEach(r => {
      const node = byId.get(r.DepartmentID);
      if (r.ParentDepartmentID && byId.has(r.ParentDepartmentID)) {
        byId.get(r.ParentDepartmentID).children.push(node);
      } else {
        roots.push(node);
      }
    });

    res.json({ success: true, data: roots });
  } catch (err) { 
    next(err); 
  }
}

// إرجاع الأقسام الرئيسية فقط
export async function getMainDepartments(req, res, next) {
  try {
    const { hospitalId } = req.query;
    const params = [];
    let where = 'd.IsActive = 1 AND d.ParentDepartmentID IS NULL';
    if (hospitalId) { 
      where += ' AND d.HospitalID = ?'; 
      params.push(hospitalId); 
    }

    const [rows] = await pool.query(
      `SELECT d.DepartmentID, d.NameAr, d.HospitalID
         FROM departments d
        WHERE ${where}
        ORDER BY d.SortOrder ASC, d.NameAr ASC`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) { 
    next(err); 
  }
}

// إرجاع الأقسام الفرعية لقسم معيّن
export async function getChildrenDepartments(req, res, next) {
  try {
    const { parentId } = req.params;
    const [rows] = await pool.query(
      `SELECT d.DepartmentID, d.NameAr, d.HospitalID, d.ParentDepartmentID
         FROM departments d
        WHERE d.IsActive = 1 AND d.ParentDepartmentID = ?
        ORDER BY d.SortOrder ASC, d.NameAr ASC`,
      [parentId]
    );
    res.json({ success: true, data: rows });
  } catch (err) { 
    next(err); 
  }
}
