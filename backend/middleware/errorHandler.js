// middleware/errorHandler.js
export function notFound(req, res, next) {
  res.status(404).json({ success: false, message: 'المورد غير موجود' });
}

export function errorHandler(err, req, res, next) {
  console.error('[API ERROR]', err);
  const status = err.status || 500;
  const message = err.publicMessage || 'حدث خطأ غير متوقع';
  res.status(status).json({ success: false, message });
}
