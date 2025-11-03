// routes/auth.js
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { signup } from '../controllers/authController.js';
import { login } from '../controllers/loginController.js';
import { signupRules, loginRules } from '../utils/validators.js';

const router = Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: 50, // 50 محاولة لكل IP (زيادة لتسجيل الدخول)
  message: { success: false, message: 'محاولات كثيرة، حاول لاحقًا' }
});

// تسجيل مستخدم جديد
router.post('/signup', limiter, signupRules, signup);

// تسجيل دخول
router.post('/login', limiter, loginRules, login);

// اختبار تسجيل الدخول (للتطوير فقط)
router.post('/test-login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password required' });
    }
    
    // محاكاة تسجيل الدخول
    const result = await login({ 
      body: { usernameOrEmail: username, password } 
    }, res, () => {});
    
  } catch (error) {
    res.status(500).json({ success: false, message: 'Test login error', error: error.message });
  }
});

export default router;
