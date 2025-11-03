// middleware/roleGuard.js - حارس الأدوار
export function allowRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        message: 'مطلوب تسجيل الدخول' 
      });
    }

    const userRole = req.user.RoleID || req.user.roleId;
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ 
        success: false, 
        message: 'ليس لديك صلاحية للوصول لهذا المورد' 
      });
    }

    next();
  };
}
