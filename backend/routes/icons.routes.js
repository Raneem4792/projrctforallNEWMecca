import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import fsPromises from 'fs/promises';
import { fileURLToPath } from 'url';
import { getCentralPool } from '../db/centralPool.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.join(__dirname, '..');
const iconsUploadDir = path.join(backendRoot, 'uploads', 'icons');

fs.mkdirSync(iconsUploadDir, { recursive: true });

const allowedMimeTypes = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/svg+xml',
  'image/webp'
];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, iconsUploadDir);
  },
  filename: (_req, file, cb) => {
    const randomSuffix = Math.round(Math.random() * 1e9);
    const time = Date.now();
    const ext = normalizeExtension(path.extname(file.originalname));
    cb(null, `${time}-${randomSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('صيغة الملف غير مدعومة. نرجو رفع PNG أو JPG أو SVG.'));
    }
  },
  limits: {
    fileSize: 4 * 1024 * 1024 // 4MB
  }
});

function normalizeExtension(ext) {
  if (!ext) return '.png';
  const normalized = ext.toLowerCase();
  const allowed = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'];
  return allowed.includes(normalized) ? normalized : '.png';
}

function normalizeIconPath(iconPath) {
  if (!iconPath) return '';
  const trimmed = iconPath.trim();
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('data:')) {
    return trimmed;
  }
  return trimmed.replace(/^\/+/, '');
}

async function deleteOldIconFile(oldPath) {
  if (!oldPath) return;
  const normalized = normalizeIconPath(oldPath);
  if (!normalized.startsWith('uploads/icons/')) return;

  const absolutePath = path.join(backendRoot, normalized.replace(/\//g, path.sep));
  try {
    await fsPromises.unlink(absolutePath);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn('⚠️ فشل حذف ملف الأيقونة القديم:', err.message);
    }
  }
}

function buildPublicPath(filename) {
  return `uploads/icons/${filename}`;
}

router.get('/', async (_req, res, next) => {
  try {
    const pool = await getCentralPool();
    const [rows] = await pool.query(
      'SELECT IconKey, TitleAr, TitleEn, IconPath, UpdatedAt FROM system_icons ORDER BY IconKey ASC'
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.post('/update', upload.single('IconFile'), async (req, res, next) => {
  try {
    const { IconKey, TitleAr, TitleEn, IconPath } = req.body;

    if (!IconKey) {
      return res.status(400).json({ message: 'IconKey مطلوب' });
    }

    const pool = await getCentralPool();
    const [existingRows] = await pool.query('SELECT * FROM system_icons WHERE IconKey = ?', [IconKey]);

    if (existingRows.length === 0) {
      return res.status(404).json({ message: 'IconKey غير موجود في النظام' });
    }

    const existing = existingRows[0];
    const updates = [];
    const params = [];

    if (typeof TitleAr === 'string' && TitleAr.trim()) {
      updates.push('TitleAr = ?');
      params.push(TitleAr.trim());
    }

    if (typeof TitleEn !== 'undefined') {
      updates.push('TitleEn = ?');
      params.push(TitleEn && TitleEn.trim() ? TitleEn.trim() : null);
    }

    let newIconPath = '';

    if (req.file) {
      newIconPath = buildPublicPath(req.file.filename);
      updates.push('IconPath = ?');
      params.push(newIconPath);
    } else if (IconPath && IconPath.trim()) {
      newIconPath = normalizeIconPath(IconPath);
      updates.push('IconPath = ?');
      params.push(newIconPath);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: 'لا يوجد بيانات لتحديثها' });
    }

    const sql = `UPDATE system_icons SET ${updates.join(', ')}, UpdatedAt = CURRENT_TIMESTAMP WHERE IconKey = ?`;
    await pool.query(sql, [...params, IconKey]);

    if (req.file && existing.IconPath && existing.IconPath !== newIconPath) {
      await deleteOldIconFile(existing.IconPath);
    }

    const [updatedRows] = await pool.query(
      'SELECT IconKey, TitleAr, TitleEn, IconPath, UpdatedAt FROM system_icons WHERE IconKey = ?',
      [IconKey]
    );

    res.json({
      success: true,
      icon: updatedRows[0]
    });
  } catch (error) {
    if (error instanceof multer.MulterError) {
      return res.status(400).json({ message: error.message });
    }
    next(error);
  }
});

export default router;


