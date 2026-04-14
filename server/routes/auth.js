const express = require('express');
const argon2 = require('argon2');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const Session = require('../models/Session');
const AuditLog = require('../models/AuditLog');
const ApiKey = require('../models/ApiKey');
const Webhook = require('../models/Webhook');
const { authenticate } = require('../middleware/auth');
const { impersonationGuard, softBanCheck, lastActiveTouch } = require('../middleware/guards');
const { sendVerificationEmail, send2faCode } = require('../utils/email');
const totp = require('../utils/totp');
const logger = require('../utils/logger');
const { getAppConfig, getSetting } = require('../utils/settings');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many attempts, please try again later' },
});

/**
 * Create a database-backed session and set the httpOnly cookie.
 * Returns the session token (for socket auth and backward compat).
 */
async function createSession(res, user, req, { isImpersonation = false, impersonatorUserId = null, impersonatorRole = null } = {}) {
  const sessionId = Session.generateSessionId();
  const { sessionSecure } = await getAppConfig();

  let timeoutMs;
  if (isImpersonation) {
    // Impersonation sessions: 2 hours
    timeoutMs = 2 * 60 * 60 * 1000;
  } else {
    const timeoutDays = Math.min(365, Math.max(1, Number(await getSetting('sessionTimeoutDays')) || 30));
    timeoutMs = timeoutDays * 24 * 60 * 60 * 1000;
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + timeoutMs);

  await Session.create({
    sessionId,
    userId: user.userId,
    createdAt: now,
    lastActiveAt: now,
    expiresAt,
    userAgent: req.headers['user-agent'] || '',
    isImpersonation,
    impersonatorUserId,
    impersonatorRole,
  });

  const cookieOptions = {
    httpOnly: true,
    secure: sessionSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: timeoutMs,
  };

  res.cookie('sut_session', sessionId, cookieOptions);
  return sessionId;
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

    // Super admin auto-verified, issue session immediately
    const token = await createSession(res, user, req);
    logger.info(`User registered (super_admin): ${username}`, { source: 'auth', userId: user.userId });

    const enforceDailyGoal = await getSetting('enforceDailyGoal');
    const enforce2fa = await getSetting('enforce2fa');
    const masterGoal = enforceDailyGoal ? await getSetting('masterDailyGoalMinutes') : null;

    res.status(201).json({
      token,
      user: {
        userId: user.userId,
        username: user.username,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified,
        theme: user.theme,
        dailyGoalMinutes: enforceDailyGoal ? (masterGoal || 60) : (user.dailyGoalMinutes || 60),
        totpEnabled: user.totpEnabled || false,
        email2faEnabled: user.email2faEnabled || false,
        totalStandingSeconds: user.totalStandingSeconds || 0,
        totalDays: user.totalDays || 0,
        currentStreak: user.currentStreak || 0,
        bestStreak: user.bestStreak || 0,
        level: user.level || 1,
        createdAt: user.createdAt,
        geminiOptIn: user.geminiOptIn || false,
        pushEnabled: user.pushEnabled || false,
        pushPreferences: user.pushPreferences || {},
        standupReminderTime: user.standupReminderTime || '12:00',
        quietHoursFrom: user.quietHoursFrom || '22:00',
        quietHoursUntil: user.quietHoursUntil || '07:00',
        maxNotificationsPerDay: user.maxNotificationsPerDay ?? 3,
        enforceDailyGoal: !!enforceDailyGoal,
        enforce2fa: !!enforce2fa,
        needs2faSetup: !!enforce2fa && !(user.totpEnabled || user.email2faEnabled),
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

    // Check for temporary ban (blockedUntil set with account still active)
    if (user.blockedUntil && new Date(user.blockedUntil) > new Date()) {
      logger.warn(`Login failed: account temporarily suspended`, { source: 'auth', meta: { login, userId: user.userId } });
      return res.status(403).json({
        error: 'Account temporarily suspended',
        until: user.blockedUntil,
      });
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

    const token = await createSession(res, user, req);
    logger.info(`User logged in: ${user.username}`, { source: 'auth', userId: user.userId });

    const enforce2fa = await getSetting('enforce2fa');
    const enforceDailyGoal = await getSetting('enforceDailyGoal');
    const masterGoal = enforceDailyGoal ? await getSetting('masterDailyGoalMinutes') : null;
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
        dailyGoalMinutes: enforceDailyGoal ? (masterGoal || 60) : (user.dailyGoalMinutes || 60),
        totpEnabled: user.totpEnabled,
        email2faEnabled: user.email2faEnabled,
        totalStandingSeconds: user.totalStandingSeconds || 0,
        totalDays: user.totalDays || 0,
        currentStreak: user.currentStreak || 0,
        bestStreak: user.bestStreak || 0,
        level: user.level || 1,
        createdAt: user.createdAt,
        pendingEmail: user.pendingEmail || null,
        geminiOptIn: user.geminiOptIn || false,
        aiLanguage: user.aiLanguage || 'English',
        pushEnabled: user.pushEnabled || false,
        pushPreferences: user.pushPreferences || {},
        standupReminderTime: user.standupReminderTime || '12:00',
        quietHoursFrom: user.quietHoursFrom || '22:00',
        quietHoursUntil: user.quietHoursUntil || '07:00',
        maxNotificationsPerDay: user.maxNotificationsPerDay ?? 3,
        enforceDailyGoal: !!enforceDailyGoal,
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
    // Fire-and-forget: token is already saved; don't block the response on email delivery
    sendVerificationEmail(user.email, token).catch(err => {
      logger.error('Failed to resend verification email', {
        source: 'auth', meta: { email: user.email, error: err.message },
      });
    });
    res.json({ message: 'If that email exists and is unverified, a verification email has been sent.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send verification email' });
  }
});

// Get current user (also returns session token for socket auth on page reload)
router.get('/me', authenticate, softBanCheck, lastActiveTouch, async (req, res) => {
  try {
    const u = req.user;
    const enforceDailyGoal = await getSetting('enforceDailyGoal');
    const enforce2fa = await getSetting('enforce2fa');
    const allowUsernameChanges = await getSetting('allowUsernameChanges');
    const firstDayOfWeek = await getSetting('firstDayOfWeek') || 'sunday';
    const masterGoal = enforceDailyGoal ? await getSetting('masterDailyGoalMinutes') : null;
    const has2fa = u.totpEnabled || u.email2faEnabled;
    res.json({
      token: req.sessionDoc?.sessionId || null,
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
        aiLanguage: u.aiLanguage || 'English',
        pushEnabled: u.pushEnabled || false,
        pushPreferences: u.pushPreferences || {},
        standupReminderTime: u.standupReminderTime || '12:00',
        quietHoursFrom: u.quietHoursFrom || '22:00',
        quietHoursUntil: u.quietHoursUntil || '07:00',
        maxNotificationsPerDay: u.maxNotificationsPerDay ?? 3,
        impersonator: req.impersonator || null,
        enforceDailyGoal: !!enforceDailyGoal,
        enforce2fa: !!enforce2fa,
        needs2faSetup: !!enforce2fa && !has2fa,
        canChangeUsername: !!allowUsernameChanges && u.canChangeUsername !== false,
        firstDayOfWeek,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

// Logout (deletes DB session + clears cookie)
router.post('/logout', authenticate, async (req, res) => {
  try {
    if (req.sessionDoc) {
      await Session.deleteOne({ sessionId: req.sessionDoc.sessionId });
    }
  } catch { /* best effort */ }
  res.clearCookie('sut_session', { httpOnly: true, sameSite: 'lax', path: '/' });
  res.json({ message: 'Logged out' });
});

// Update profile
router.put('/profile', authenticate, softBanCheck, async (req, res) => {
  try {
    const { theme, dailyGoalMinutes, geminiOptIn, aiLanguage } = req.body;
    if (theme && ['dark', 'light', 'system'].includes(theme)) {
      req.user.theme = theme;
    }
    if (dailyGoalMinutes !== undefined && dailyGoalMinutes !== null) {
      const goal = Number(dailyGoalMinutes);
      if (!Number.isInteger(goal) || goal < 1 || goal > 480) {
        return res.status(400).json({ error: 'Daily goal must be a whole number between 1 and 480 minutes' });
      }
      const enforced = await getSetting('enforceDailyGoal');
      if (enforced) {
        return res.status(403).json({ error: 'Daily goal is set by your administrator and cannot be changed' });
      }
      req.user.dailyGoalMinutes = goal;
    }
    if (typeof geminiOptIn === 'boolean') {
      req.user.geminiOptIn = geminiOptIn;
    }
    if (aiLanguage && typeof aiLanguage === 'string' && aiLanguage.length <= 50) {
      req.user.aiLanguage = aiLanguage;
    }
    await req.user.save();
    res.json({ message: 'Profile updated' });
  } catch (err) {
    res.status(500).json({ error: 'Update failed' });
  }
});

// Change username
router.put('/username', authenticate, softBanCheck, impersonationGuard, async (req, res) => {
  try {
    const { username } = req.body;
    if (!username || typeof username !== 'string') {
      return res.status(400).json({ error: 'Username is required' });
    }

    const trimmed = username.trim();

    // Validation
    if (trimmed.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }
    if (trimmed.length > 32) {
      return res.status(400).json({ error: 'Username must be at most 32 characters' });
    }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      return res.status(400).json({ error: 'Username may only contain letters, numbers, and underscores' });
    }

    // Check global setting
    const allowed = await getSetting('allowUsernameChanges');
    if (!allowed) {
      return res.status(403).json({ error: 'Username changes are currently disabled by your administrator' });
    }

    // Check per-user permission
    if (!req.user.canChangeUsername) {
      return res.status(403).json({ error: 'Your account is not permitted to change its username' });
    }

    // No-op if same
    if (trimmed === req.user.username) {
      return res.json({ message: 'Username unchanged' });
    }

    // Uniqueness check (case-insensitive)
    const existing = await User.findOne({ username: { $regex: new RegExp(`^${trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } });
    if (existing && existing.userId !== req.user.userId) {
      return res.status(409).json({ error: 'That username is already taken' });
    }

    const oldUsername = req.user.username;
    req.user.username = trimmed;
    await req.user.save();

    // Audit log
    await AuditLog.create({
      actorId: req.user.userId,
      actorRole: req.user.role,
      targetId: req.user.userId,
      action: 'username_change',
      details: { oldUsername, newUsername: trimmed },
      ip: req.ip,
    });

    logger.info(`Username changed: ${oldUsername} -> ${trimmed}`, {
      source: 'auth', userId: req.user.userId,
    });

    res.json({ message: 'Username updated', username: trimmed });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'That username is already taken' });
    }
    res.status(500).json({ error: 'Failed to change username' });
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
    if (!password) return res.status(400).json({ error: 'Password required' });
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
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password required' });
    const valid = await argon2.verify(req.user.passwordHash, password);
    if (!valid) return res.status(401).json({ error: 'Password is incorrect' });

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
    if (!password) return res.status(400).json({ error: 'Password required' });
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

// ── API Key Management ──────────────────────────────────────────────────────

// List the calling user's API keys (never returns key hashes)
router.get('/api-keys', authenticate, softBanCheck, async (req, res) => {
  try {
    const keys = await ApiKey.find({ userId: req.user.userId })
      .select('keyId name prefix createdAt lastUsedAt')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ keys });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch API keys' });
  }
});

// Create a new API key — returns the full raw key ONCE; it is never stored in plaintext
router.post('/api-keys', authenticate, softBanCheck, impersonationGuard, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Key name is required' });
    }
    const trimmedName = name.trim().slice(0, 100);

    const existing = await ApiKey.countDocuments({ userId: req.user.userId });
    if (existing >= 10) {
      return res.status(400).json({ error: 'Maximum of 10 API keys per user' });
    }

    // Generate a URL-safe random key: "sut_" prefix + 40 hex chars
    const rawKey = 'sut_' + crypto.randomBytes(20).toString('hex');
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyId = uuidv4();

    await ApiKey.create({
      keyId,
      userId: req.user.userId,
      name: trimmedName,
      keyHash,
      prefix: rawKey.slice(0, 8),
    });

    logger.info(`API key created: ${trimmedName} for ${req.user.username}`, {
      source: 'auth', userId: req.user.userId,
    });

    // Return the raw key exactly once — it cannot be recovered after this response
    res.status(201).json({
      keyId,
      name: trimmedName,
      key: rawKey,
      prefix: rawKey.slice(0, 8),
      createdAt: new Date(),
      warning: 'Copy this key now. It will never be shown again.',
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

// Revoke (delete) an API key
router.delete('/api-keys/:keyId', authenticate, softBanCheck, impersonationGuard, async (req, res) => {
  try {
    const result = await ApiKey.deleteOne({ keyId: req.params.keyId, userId: req.user.userId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'API key not found' });
    }
    logger.info(`API key revoked: ${req.params.keyId} by ${req.user.username}`, {
      source: 'auth', userId: req.user.userId,
    });
    res.json({ message: 'API key revoked' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to revoke API key' });
  }
});

// ── Webhook Management ──────────────────────────────────────────────────────

// List the calling user's webhooks (never returns the secret)
router.get('/webhooks', authenticate, softBanCheck, async (req, res) => {
  try {
    const webhooks = await Webhook.find({ userId: req.user.userId })
      .select('webhookId name url events enabled createdAt')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ webhooks });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch webhooks' });
  }
});

// Create a new webhook — returns the signing secret ONCE
router.post('/webhooks', authenticate, softBanCheck, impersonationGuard, async (req, res) => {
  try {
    const { name, url, events } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Webhook name is required' });
    }
    if (!url || typeof url !== 'string' || !url.trim()) {
      return res.status(400).json({ error: 'Webhook URL is required' });
    }
    if (!/^https?:\/\/.+/.test(url.trim())) {
      return res.status(400).json({ error: 'Webhook URL must start with http:// or https://' });
    }
    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'At least one event type is required' });
    }

    const supportedEvents = Webhook.schema.path('events').caster.enumValues;
    const invalidEvents = events.filter(e => !supportedEvents.includes(e));
    if (invalidEvents.length > 0) {
      return res.status(400).json({ error: `Unsupported event types: ${invalidEvents.join(', ')}` });
    }

    const existing = await Webhook.countDocuments({ userId: req.user.userId });
    if (existing >= 5) {
      return res.status(400).json({ error: 'Maximum of 5 webhooks per user' });
    }

    const webhookId = uuidv4();
    const secret = 'whsec_' + crypto.randomBytes(24).toString('hex');

    await Webhook.create({
      webhookId,
      userId: req.user.userId,
      name: name.trim().slice(0, 100),
      url: url.trim(),
      events,
      enabled: true,
      secret,
    });

    logger.info(`Webhook created: ${name} for ${req.user.username}`, {
      source: 'auth', userId: req.user.userId,
    });

    res.status(201).json({
      webhookId,
      name: name.trim(),
      url: url.trim(),
      events,
      enabled: true,
      secret,
      warning: 'Copy this secret now. It will never be shown again.',
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create webhook' });
  }
});

// Update webhook (enable/disable or change events/url/name)
router.patch('/webhooks/:webhookId', authenticate, softBanCheck, impersonationGuard, async (req, res) => {
  try {
    const update = {};
    const { enabled, name, url, events } = req.body;
    if (typeof enabled === 'boolean') update.enabled = enabled;
    if (name && typeof name === 'string') update.name = name.trim().slice(0, 100);
    if (url && typeof url === 'string') {
      if (!/^https?:\/\/.+/.test(url.trim())) {
        return res.status(400).json({ error: 'Webhook URL must start with http:// or https://' });
      }
      update.url = url.trim();
    }
    if (Array.isArray(events) && events.length > 0) update.events = events;

    const result = await Webhook.findOneAndUpdate(
      { webhookId: req.params.webhookId, userId: req.user.userId },
      { $set: update },
      { new: true }
    ).select('webhookId name url events enabled');

    if (!result) return res.status(404).json({ error: 'Webhook not found' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update webhook' });
  }
});

// Delete a webhook permanently (including its secret)
router.delete('/webhooks/:webhookId', authenticate, softBanCheck, impersonationGuard, async (req, res) => {
  try {
    const result = await Webhook.deleteOne({ webhookId: req.params.webhookId, userId: req.user.userId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Webhook not found' });
    }
    logger.info(`Webhook deleted: ${req.params.webhookId} by ${req.user.username}`, {
      source: 'auth', userId: req.user.userId,
    });
    res.json({ message: 'Webhook deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete webhook' });
  }
});

module.exports = router;
// Export createSession for use by admin impersonation routes
module.exports.createSession = createSession;
