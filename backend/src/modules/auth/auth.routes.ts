import { Router } from 'express';
import { authController } from './auth.controller';
import { validate } from '../../middlewares/validate.middleware';
import { authenticate } from '../../middlewares/auth.middleware';
import {
  registerSchema,
  verifyOtpSchema,
  loginSchema,
  loginMfaSchema,
  googleLoginSchema,
  refreshTokenSchema,
  resendOtpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from './auth.schemas';

const router = Router();

// POST /api/v1/auth/register
router.post('/register',
  validate(registerSchema),
  authController.register
);

// POST /api/v1/auth/verify-otp
router.post('/verify-otp',
  validate(verifyOtpSchema),
  authController.verifyOtp
);

// POST /api/v1/auth/resend-otp
router.post('/resend-otp',
  validate(resendOtpSchema),
  authController.resendOtp
);

// POST /api/v1/auth/login
router.post('/login',
  validate(loginSchema),
  authController.login
);

// POST /api/v1/auth/login/verify-mfa
router.post('/login/verify-mfa',
  validate(loginMfaSchema),
  authController.verifyMfa
);

// POST /api/v1/auth/google
router.post('/google',
  validate(googleLoginSchema),
  authController.googleLogin
);

// POST /api/v1/auth/forgot-password
router.post('/forgot-password',
  validate(forgotPasswordSchema),
  authController.forgotPassword
);

// POST /api/v1/auth/reset-password
router.post('/reset-password',
  validate(resetPasswordSchema),
  authController.resetPassword
);

// POST /api/v1/auth/refresh-token
router.post('/refresh-token',
  validate(refreshTokenSchema),
  authController.refreshToken
);

// POST /api/v1/auth/logout
router.post('/logout',
  authenticate,
  authController.logout
);

export default router;
