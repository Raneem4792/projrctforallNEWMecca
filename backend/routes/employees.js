// backend/routes/employees.js
// راوتر البحث عن الموظفين

import express from 'express';
import { pool } from '../config/db.js';

const router = express.Router();

/**
 * GET /api/employees/search
 * البحث عن موظفين بالاسم أو الرقم الوظيفي
 * Query params:
 *   - query: نص البحث (اسم أو رقم)
 * Returns: Array من الموظفين مع بياناتهم وأقسامهم
 */
router.get('/search', async (req, res) => {
  try {
    const q = (req.query.query || '').trim();
    
    // إذا لم يتم إدخال نص بحث، نرجع مصفوفة فارغة
    if (!q) {
      return res.json([]);
    }
    
    // البحث في جدول المستخدمين مع ربط القسم
    const [rows] = await pool.query(
      `SELECT 
        u.UserID AS EmployeeID,
        u.FullName,
        u.DepartmentID,
        d.NameAr AS DepartmentName,
        d.NameEn AS DepartmentNameEn
       FROM users u
       LEFT JOIN departments d ON d.DepartmentID = u.DepartmentID
       WHERE u.FullName LIKE ? 
          OR u.UserID LIKE ?
          OR u.Username LIKE ?
       ORDER BY u.FullName
       LIMIT 25`,
      [`%${q}%`, `%${q}%`, `%${q}%`]
    );
    
    // إرجاع النتائج
    res.json(rows);
    
  } catch (error) {
    console.error('❌ خطأ في البحث عن موظف:', error);
    res.status(500).json({ 
      error: 'employee_search_failed',
      message: 'فشل البحث عن الموظفين. حاول مرة أخرى.'
    });
  }
});

/**
 * GET /api/employees/:id
 * الحصول على تفاصيل موظف محدد
 */
router.get('/:id', async (req, res) => {
  try {
    const employeeId = req.params.id;
    
    const [rows] = await pool.query(
      `SELECT 
        u.UserID AS EmployeeID,
        u.FullName,
        u.Username,
        u.Email,
        u.DepartmentID,
        d.NameAr AS DepartmentName,
        d.NameEn AS DepartmentNameEn,
        u.RoleID,
        r.RoleName
       FROM users u
       LEFT JOIN departments d ON d.DepartmentID = u.DepartmentID
       LEFT JOIN roles r ON r.RoleID = u.RoleID
       WHERE u.UserID = ?`,
      [employeeId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ 
        error: 'employee_not_found',
        message: 'الموظف غير موجود'
      });
    }
    
    res.json(rows[0]);
    
  } catch (error) {
    console.error('❌ خطأ في جلب بيانات الموظف:', error);
    res.status(500).json({ 
      error: 'employee_fetch_failed',
      message: 'فشل جلب بيانات الموظف'
    });
  }
});

export default router;

