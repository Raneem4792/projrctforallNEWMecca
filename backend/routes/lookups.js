// routes/lookups.js
import { Router } from 'express';
import { 
  getActiveDepartments, 
  getActiveHospitals, 
  getComplaintCategories,
  getDepartmentsTree,
  getMainDepartments,
  getChildrenDepartments
} from '../controllers/lookupsController.js';
const router = Router();

// المسارات الأساسية
router.get('/departments', getActiveDepartments);
router.get('/hospitals', getActiveHospitals);
router.get('/categories', getComplaintCategories);

// المسارات المتقدمة للأقسام
router.get('/departments/tree', getDepartmentsTree);
router.get('/departments/mains', getMainDepartments);
router.get('/departments/by-parent/:parentId', getChildrenDepartments);

export default router;
