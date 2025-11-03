// middleware/resolveHospitalId.js
export function resolveHospitalId(req, res, next) {
  // أسماء المسارات العامة (بدون /api)
  const PUBLIC_SEGMENTS = [
    'genders',
    'complaint-types',
    'complaint-subtypes',
    'health'
  ];

  // طبّقي تطبيع للمسار
  const normalized = (req.baseUrl || '') + (req.path || ''); // مثال: '/api' + '/genders' => '/api/genders'
  const original = req.originalUrl || '';

  const isPublic = PUBLIC_SEGMENTS.some(seg =>
    normalized.includes(`/${seg}`) || original.includes(`/${seg}`)
  );

  if (isPublic) {
    console.log('✅ [resolveHospitalId] مسار عام - تخطي تحديد المستشفى:', { normalized, original, path: req.path });
    return next();
  }
  console.log('🔍 [resolveHospitalId] تحديد المستشفى:', {
    queryHospitalId: req.query.hospitalId,
    bodyHospitalId: req.body?.hospitalId,
    headerHospitalId: req.headers['x-hospital-id'],
    userHospitalId: req.user?.HospitalID,
    userHospitalIdAlt: req.user?.hospitalId,
    user: req.user?.UserID || req.user?.username,
    method: req.method,
    path: req.path,
    originalUrl: req.originalUrl
  });

  // 1) من الكويري (الأولوية الأولى - حتى للمستخدمين المركزيين)
  let hospitalId = Number(req.query.hospitalId || 0);
  
  // 2) من الهيدر (للمشكلة multipart/form-data)
  if (!hospitalId) hospitalId = Number(req.headers['x-hospital-id'] || 0);
  
  // 3) من البودي
  if (!hospitalId) hospitalId = Number(req.body?.hospitalId || req.body?.HospitalID || 0);
  
  // 4) من المستخدم (للموظف المصادق عليه) - فقط إذا لم يتم تحديده من query
  if (!hospitalId) hospitalId = Number(req.user?.HospitalID || req.user?.hospitalId || 0);

  console.log('🎯 [resolveHospitalId] المستشفى المحدد:', hospitalId);

  if (!hospitalId || isNaN(hospitalId)) {
    console.error('❌ [resolveHospitalId] لم يتم تحديد المستشفى');
    return res.status(400).json({ 
      ok: false, 
      message: 'hospitalId غير محدد - يجب تحديد المستشفى في query/body أو تسجيل الدخول كموظف مستشفى' 
    });
  }

  req.hospitalId = hospitalId;
  next();
}
