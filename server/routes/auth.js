const express = require('express');
const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const QRCode = require('qrcode');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');
const { impersonationGuard, softBanCheck, lastActiveTouch } = require('../middleware/guards');
const { sendVerificationEmail, send2faCode } = require('../utils/email');
const totp = require('../utils/totp');
const logger = require('../utils/logger');
const { getJwtSecret, getJwtExpiresIn, getAppConfig, getSetting } = require('../utils/settings');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many attempts, please try again later' },
});

async function signToken(user) {
  const secret = await getJwtSecret();
  const expiresIn = await getJwtExpiresIn();
  return jwt.sign(
    { userId: user.userId, role: user.role },
    secret,
    { expiresIn }
  );
}

async function setAuthCookie(res, token) {
  const { sessionSecure } = await getAppConfig();
  const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
  res.cookie('sut_session', token, {
    httpOnly: true,
    secure: sessionSecure,
    sameSite: 'lax',
    maxAge,
    path: '/',
  });
}

// Register
router.post('/register', authLimiter, async (req, res) => {
  try {
    const regEnabled = await getSetting('registrationEnabled');
    if (regEnabled === false) {
      return res.status(403).json({ error: 'Registration is currently disabled' });
    }

    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
      return res.status(400).json({ error: 'Username must be 3-30 chars, alphanumeric or underscore' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const existing = await User.findOne({ $or: [{ email }, { username }] });
    if (existing) {
      return res.status(409).json({ error: 'Username or email already taken' });
    }

    const passwordHash = await argon2.hash(password);
    const emailVerifyToken = crypto.randomBytes(32).toString('hex');

    const user = new User({
      username,
      email,
      passwordHash,
      emailVerifyToken,
      emailVerifyExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    await user.save();

    // Send verification email (don't block on failure)
    if (user.role !== 'super_admin') {
      sendVerificationEmail(email, emailVerifyToken).catch(err => {
        const errorDetail = {
          type: err.constructor?.name || 'UnknownError',
          message: err.message,
          code: err.code,
          responseCode: err.responseCode,
          command: err.command,
          stack: err.stack,
        };
        logger.error('Failed to send verification email', {
          source: 'auth',
          userId: user.userId,
          meta: { email, errorDetail },
        });
      });
      logger.info(`User registered: ${username}`, { source: 'auth', userId: user.userId });
      return res.status(201).json({
        needsVerification: true,
        message: 'Registration successful! Please check your email to verify your account.',
      });
    }

    // Super admin auto-verified, issue token immediately
    const token = await signToken(user);
    await setAuthCookie(res, token);
    logger.info(`User registered (super_admin): ${username}`, { source: 'auth', userId: user.userId });

    res.status(201).json({
      token,
      user: {
        userId: user.userId,
        username: user.username,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified,
        theme: user.theme,
      },
    });
  } catch (err) {
    logger.error('Registration error', { source: 'auth', meta: { error: err.message } });
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { login, password, totpCode, email2faCode: emailCode } = req.body;
    if (!login || !password) {
      return res.status(400).json({ error: 'Login and password are required' });
    }

    const user = await User.findOne({
      $or: [{ email: login.toLowerCase() }, { username: login }],
    });
    if (!user) {
      logger.warn(`Login failed: user not found`, { source: 'auth', meta: { login } });
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (!user.active) {
      logger.warn(`Login failed: account deactivated`, { source: 'auth', meta: { login, userId: user.userId } });
      return res.status(403).json({ error: 'Your account has been deactivated. Contact an administrator.' });
    }

    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) {
      logger.warn(`Login failed: wrong password`, { source: 'auth', meta: { login, userId: user.userId } });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Block unverified users (except super_admin)
    if (!user.emailVerified && user.role !== 'super_admin') {
      return res.status(200).json({ needsVerification: true, email: user.email, message: 'Please verify your email before logging in' });
    }

    // Check TOTP 2FA
    if (user.totpEnabled) {
      if (!totpCode) {
        return res.status(200).json({ requires2fa: 'totp', message: 'TOTP code required' });
      }
      const totpValid = totp.verifyTotp(totpCode, user.totpSecret);
      if (!totpValid) {
        // Check recovery codes
        const codeIndex = user.totpRecoveryCodes.indexOf(totpCode.toUpperCase());
        if (codeIndex === -1) {
          return res.status(401).json({ error: 'Invalid 2FA code' });
        }
        // Consume recovery code
        user.totpRecoveryCodes.splice(codeIndex, 1);
        await user.save();
      }
    }

    // Check Email 2FA
    if (user.email2faEnabled && !user.totpEnabled) {
      if (!emailCode) {
        // Generate and send code
        const code = totp.generateEmailCode();
        user.email2faCode = await argon2.hash(code);
        user.email2faExpires = new Date(Date.now() + 10 * 60 * 1000);
        await user.save();
        try {
          await send2faCode(user.email, code);
        } catch (emailErr) {
          user.email2faCode = undefined;
          user.email2faExpires = undefined;
          await user.save();
          logger.error('Failed to send 2FA email', {
            source: 'auth',
            meta: {
              type: emailErr.constructor?.name,
              message: emailErr.message,
              code: emailErr.code,
              responseCode: emailErr.responseCode,
              command: emailErr.command,
            },
          });
          return res.status(500).json({ error: 'Failed to send 2FA code. Please try again.' });
        }
        return res.status(200).json({ requires2fa: 'email', message: '2FA code sent to your email' });
      }
      // Verify email code
      if (!user.email2faCode || new Date() > user.email2faExpires) {
        return res.status(401).json({ error: '2FA code expired, please login again' });
      }
      const codeValid = await argon2.verify(user.email2faCode, emailCode);
      if (!codeValid) {
        return res.status(401).json({ error: 'Invalid 2FA code' });
      }
      // Clear the code
      user.email2faCode = undefined;
      user.email2faExpires = undefined;
      await user.save();
    }

    const token = await signToken(user);
    await setAuthCookie(res, token);
    logger.info(`User logged in: ${user.username}`, { source: 'auth', userId: user.userId });

    const enforce2fa = await getSetting('enforce2fa');
    const has2fa = user.totpEnabled || user.email2faEnabled;

    res.json({
      token,
      user: {
        userId: user.userId,
        username: user.username,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified,
        theme: user.theme,
        totpEnabled: user.totpEnabled,
        email2faEnabled: user.email2faEnabled,
        enforce2fa: !!enforce2fa,
        needs2faSetup: !!enforce2fa && !has2fa,
      },
    });
  } catch (err) {
    logger.error('Login error', { source: 'auth', meta: { error: err.message, login: req.body?.login } });
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// Verify email
router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).send('Missing token');

    // Check for pending email change first
    const pendingUser = await User.findOne({
      pendingEmailToken: token,
      pendingEmailExpires: { $gt: new Date() },
    });
    if (pendingUser) {
      pendingUser.email = pendingUser.pendingEmail;
      pendingUser.emailVerified = true;
      pendingUser.pendingEmail = undefined;
      pendingUser.pendingEmailToken = undefined;
      pendingUser.pendingEmailExpires = undefined;
      await pendingUser.save();
      logger.info(`Pending email verified: ${pendingUser.username}`, { source: 'auth', userId: pendingUser.userId });
      return res.redirect('/login?verified=true');
    }

    // Standard email verification
    const user = await User.findOne({
      emailVerifyToken: token,
      emailVerifyExpires: { $gt: new Date() },
    });
    if (!user) return res.status(400).send('Invalid or expired verification link');

    user.emailVerified = true;
    user.emailVerifyToken = undefined;
    user.emailVerifyExpires = undefined;
    await user.save();

    logger.info(`Email verified: ${user.username}`, { source: 'auth', userId: user.userId });
    res.redirect('/login?verified=true');
  } catch (err) {
    res.status(500).send('Verification failed');
  }
});

// Resend verification (public — accepts email without auth)
router.post('/resend-verification', authLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || user.emailVerified) {
      // Don't reveal whether user exists
      return res.json({ message: 'If that email exists and is unverified, a verification email has been sent.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    user.emailVerifyToken = token;
    user.emailVerifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save();
    await sendVerificationEmail(user.email, token);
    res.json({ message: 'If that email exists and is unverified, a verification email has been sent.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send verification email' });
  }
});

// Get current user
router.get('/me', authenticate, softBanCheck, lastActiveTouch, async (req, res) => {
  const u = req.user;
  const enforceDailyGoal = await getSetting('enforceDailyGoal');
  const enforce2fa = await getSetting('enforce2fa');
  const masterGoal = enforceDailyGoal ? await getSetting('masterDailyGoalMinutes') : null;
  const has2fa = u.totpEnabled || u.email2faEnabled;
  res.json({
    user: {
      userId: u.userId,
      username: u.username,
      email: u.email,
      role: u.role,
      emailVerified: u.emailVerified,
      theme: u.theme,
      dailyGoalMinutes: enforceDailyGoal ? (masterGoal || 60) : u.dailyGoalMinutes,
      totpEnabled: u.totpEnabled,
      email2faEnabled: u.email2faEnabled,
      totalStandingSeconds: u.totalStandingSeconds,
      totalDays: u.totalDays,
      currentStreak: u.currentStreak,
      bestStreak: u.bestStreak,
      level: u.level,
      createdAt: u.createdAt,
      pendingEmail: u.pendingEmail || null,
      geminiOptIn: u.geminiOptIn,
      impersonator: req.impersonator || null,
      enforceDailyGoal: !!enforceDailyGoal,
      enforce2fa: !!enforce2fa,
      needs2faSetup: !!enforce2fa && !has2fa,
    },
  });
});

// Logout (clears HttpOnly cookie)
router.post('/logout', (req, res) => {
  res.clearCookie('sut_session', { path: '/' });
  res.json({ message: 'Logged out' });
});

// Update profile
router.put('/profile', authenticate, softBanCheck, async (req, res) => {
  try {
    const { theme, dailyGoalMinutes, geminiOptIn } = req.body;
    if (theme && ['dark', 'light', 'system'].includes(theme)) {
      req.user.theme = theme;
    }
    if (dailyGoalMinutes && dailyGoalMinutes >= 1 && dailyGoalMinutes <= 480) {
      const enforced = await getSetting('enforceDailyGoal');
      if (enforced) {
        return res.status(403).json({ error: 'Daily goal is set by your administrator and cannot be changed' });
      }
      req.user.dailyGoalMinutes = dailyGoalMinutes;
    }
    if (typeof geminiOptIn === 'boolean') {
      req.user.geminiOptIn = geminiOptIn;
    }
    await req.user.save();
    res.json({ message: 'Profile updated' });
  } catch (err) {
    res.status(500).json({ error: 'Update failed' });
  }
});

// Change password
router.put('/password', authenticate, impersonationGuard, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Both passwords required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    const valid = await argon2.verify(req.user.passwordHash, currentPassword);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    req.user.passwordHash = await argon2.hash(newPassword);
    await req.user.save();
    logger.info(`Password changed: ${req.user.username}`, { source: 'auth', userId: req.user.userId });
    res.json({ message: 'Password updated' });
  } catch (err) {
    res.status(500).json({ error: 'Password change failed' });
  }
});

// Change email — uses pending email flow
router.put('/email', authenticate, impersonationGuard, async (req, res) => {
  try {
    const { newEmail, password } = req.body;
    if (!newEmail || !password) return res.status(400).json({ error: 'New email and password required' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const valid = await argon2.verify(req.user.passwordHash, password);
    if (!valid) return res.status(401).json({ error: 'Password is incorrect' });

    const taken = await User.findOne({ email: newEmail.toLowerCase() });
    if (taken) return res.status(409).json({ error: 'Email already in use' });

    const token = crypto.randomBytes(32).toString('hex');
    req.user.pendingEmail = newEmail.toLowerCase();
    req.user.pendingEmailToken = token;
    req.user.pendingEmailExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await req.user.save();

    sendVerificationEmail(newEmail, token).catch(err => {
      logger.error('Failed to send email change verification', {
        source: 'auth',
        userId: req.user.userId,
        meta: {
          type: err.constructor?.name,
          message: err.message,
          code: err.code,
          responseCode: err.responseCode,
        },
      });
    });
    logger.info(`Email change requested: ${req.user.username}`, { source: 'auth', userId: req.user.userId });
    res.json({ message: 'Verification sent to new email. Confirm to complete the change.' });
  } catch (err) {
    res.status(500).json({ error: 'Email change failed' });
  }
});

// Enable TOTP 2FA - Step 1: Generate secret
router.post('/2fa/totp/setup', authenticate, impersonationGuard, async (req, res) => {
  try {
    const secret = totp.generateSecret();
    const uri = totp.generateTotpUri(secret, req.user.email);
    const qrDataUrl = await QRCode.toDataURL(uri);
    // Store secret temporarily (not enabled yet)
    req.user.totpSecret = secret;
    await req.user.save();
    res.json({ secret, qrDataUrl, uri });
  } catch (err) {
    res.status(500).json({ error: 'TOTP setup failed' });
  }
});

// Enable TOTP 2FA - Step 2: Verify and enable
router.post('/2fa/totp/enable', authenticate, impersonationGuard, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code || !req.user.totpSecret) {
      return res.status(400).json({ error: 'Setup required first' });
    }
    const valid = totp.verifyTotp(code, req.user.totpSecret);
    if (!valid) return res.status(401).json({ error: 'Invalid TOTP code' });

    const recoveryCodes = totp.generateRecoveryCodes();
    req.user.totpEnabled = true;
    req.user.totpRecoveryCodes = recoveryCodes;
    await req.user.save();

    logger.info(`TOTP enabled: ${req.user.username}`, { source: 'auth', userId: req.user.userId });
    res.json({ message: 'TOTP 2FA enabled', recoveryCodes });
  } catch (err) {
    res.status(500).json({ error: 'TOTP enable failed' });
  }
});

// Disable TOTP 2FA
router.post('/2fa/totp/disable', authenticate, impersonationGuard, async (req, res) => {
  try {
    const enforce2fa = await getSetting('enforce2fa');
    if (enforce2fa && !req.user.email2faEnabled) {
      return res.status(403).json({ error: '2FA is required by your administrator and cannot be disabled' });
    }
    const { password } = req.body;
    const valid = await argon2.verify(req.user.passwordHash, password);
    if (!valid) return res.status(401).json({ error: 'Password is incorrect' });

    req.user.totpEnabled = false;
    req.user.totpSecret = undefined;
    req.user.totpRecoveryCodes = [];
    await req.user.save();

    logger.info(`TOTP disabled: ${req.user.username}`, { source: 'auth', userId: req.user.userId });
    res.json({ message: 'TOTP 2FA disabled' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to disable TOTP' });
  }
});

// Enable Email 2FA
router.post('/2fa/email/enable', authenticate, impersonationGuard, async (req, res) => {
  try {
    req.user.email2faEnabled = true;
    await req.user.save();
    logger.info(`Email 2FA enabled: ${req.user.username}`, { source: 'auth', userId: req.user.userId });
    res.json({ message: 'Email 2FA enabled' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to enable email 2FA' });
  }
});

// Disable Email 2FA
router.post('/2fa/email/disable', authenticate, impersonationGuard, async (req, res) => {
  try {
    const enforce2fa = await getSetting('enforce2fa');
    if (enforce2fa && !req.user.totpEnabled) {
      return res.status(403).json({ error: '2FA is required by your administrator and cannot be disabled' });
    }
    const { password } = req.body;
    const valid = await argon2.verify(req.user.passwordHash, password);
    if (!valid) return res.status(401).json({ error: 'Password is incorrect' });

    req.user.email2faEnabled = false;
    await req.user.save();
    logger.info(`Email 2FA disabled: ${req.user.username}`, { source: 'auth', userId: req.user.userId });
    res.json({ message: 'Email 2FA disabled' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to disable email 2FA' });
  }
});

module.exports = router;
