// middleware/resolveHospitalId.js
export function resolveHospitalId(req, res, next) {
  try {
    let hospitalId =
      req.hospitalId ??
      req.headers['x-hospital-id'] ??
      req.headers['X-Hospital-Id'] ??
      req.headers['X-hospital-id'] ??
      req.body?.HospitalID ??
      req.body?.hospitalId ??
      req.query?.hospitalId ??
      req.user?.HospitalID ??
      req.user?.hospitalId ??
      null;

    if (typeof hospitalId === 'string') hospitalId = hospitalId.trim();
    if (hospitalId && !isNaN(hospitalId)) {
      hospitalId = Number(hospitalId);
    } else {
      hospitalId = null;
    }

    if (!hospitalId) {
      console.warn('⚠️ [resolveHospitalId] لم يتم تمرير hospitalId — سيتم السماح بالمتابعة بدون إرفاق المستشفى');
      req.hospitalId = null;
      return next();
    }

    req.hospitalId = hospitalId;
    return next();
  } catch (err) {
    console.error('❌ [resolveHospitalId] فشل:', err);
    return res.status(400).json({
      success: false,
      message: 'فشل استخراج hospitalId من الطلب',
      error: err.message
    });
  }
}
