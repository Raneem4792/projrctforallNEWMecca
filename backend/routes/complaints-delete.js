// routes/complaints-delete.js
import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { deleteComplaint } from '../controllers/complaintsController.js';

const router = express.Router();

// مسار حذف البلاغ مع تقييد :id بالأرقام لتجنب التعارض مع /complaints/statuses
router.delete('/complaints/:id(\\d+)', requireAuth, deleteComplaint);

export default router;
