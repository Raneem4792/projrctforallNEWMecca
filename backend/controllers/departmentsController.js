// controllers/departmentsController.js
export async function listDepartments(req, res) {
  try {
    const [rows] = await req.hospitalPool.query(
      `SELECT DepartmentID, Code, NameAr, NameEn, ParentDepartmentID, SortOrder, HospitalID
       FROM departments
       WHERE COALESCE(IsActive,1)=1
       ORDER BY COALESCE(SortOrder,9999), NameAr`
    );
    res.json({ ok:true, items: rows });
  } catch (e) {
    console.error('listDepartments error:', e);
    res.status(500).json({ ok:false, message:'Server error' });
  }
}
