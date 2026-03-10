const express = require('express');
const argon2 = require('argon2');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Settings = require('../models/Settings');
const { isSetupComplete, invalidateCache, getJwtSecret } = require('../utils/settings');
const { testSmtpConnection } = require('../utils/email');
const logger = require('../utils/logger');

const router = express.Router();

// Guard: all onboarding routes only work when setup is NOT complete
async function onboardingGuard(req, res, next) {
  try {
    const complete = await isSetupComplete();
    if (complete) {
      return res.status(403).json({ error: 'Setup already complete' });
    }
    next();
  } catch {
    next();
  }
}

router.use(onboardingGuard);

// POST /api/setup/complete — Run the full onboarding wizard in one request
router.post('/complete', async (req, res) => {
  try {
    const {
      // Admin account
      username, email, password,
      // SMTP settings
      smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass, smtpFrom,
      // App settings
      appUrl, appName, serverPort,
      // Security
      sessionSecure,
    } = req.body;

    // Validate required fields
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Admin username, email, and password are required' });
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

    // Check if any user already exists (re-onboarding prevention)
    const existingUsers = await User.countDocuments();
    if (existingUsers > 0) {
      return res.status(403).json({ error: 'Setup already complete — users exist' });
    }

    // 1. Generate JWT secret
    const jwtSecret = crypto.randomBytes(64).toString('hex');
    await Settings.set('jwtSecret', jwtSecret);

    // 2. Save all settings
    if (smtpHost !== undefined) await Settings.set('smtpHost', smtpHost);
    if (smtpPort !== undefined) await Settings.set('smtpPort', parseInt(smtpPort, 10) || 587);
    if (smtpSecure !== undefined) await Settings.set('smtpSecure', !!smtpSecure);
    if (smtpUser !== undefined) await Settings.set('smtpUser', smtpUser);
    if (smtpPass !== undefined) await Settings.set('smtpPass', smtpPass);
    if (smtpFrom !== undefined) await Settings.set('smtpFrom', smtpFrom);
    if (appUrl) await Settings.set('appUrl', appUrl);
    if (appName) await Settings.set('appName', appName);
    if (serverPort) await Settings.set('serverPort', parseInt(serverPort, 10) || 3000);
    if (sessionSecure !== undefined) await Settings.set('sessionSecure', !!sessionSecure);

    // 3. Create admin user (pre-save hook makes first user super_admin)
    const passwordHash = await argon2.hash(password);
    const user = new User({
      username,
      email: email.toLowerCase(),
      passwordHash,
      emailVerified: true,
    });
    await user.save();

    // Invalidate settings cache
    invalidateCache();

    // 4. Sign a JWT so the admin is immediately logged in
    const token = jwt.sign(
      { userId: user.userId, role: user.role },
      jwtSecret,
      { expiresIn: '7d' }
    );

    res.cookie('sut_session', token, {
      httpOnly: true,
      secure: !!sessionSecure,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    logger.info(`Onboarding completed by ${username}`, { source: 'setup', userId: user.userId });

    res.status(201).json({
      message: 'Setup complete',
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
    logger.error('Onboarding failed', { source: 'setup', meta: { error: err.message } });
    res.status(500).json({ error: 'Setup failed: ' + err.message });
  }
});

// POST /api/setup/test-smtp — Test SMTP connection
router.post('/test-smtp', async (req, res) => {
  try {
    const { smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass } = req.body;
    if (!smtpHost) {
      return res.status(400).json({ error: 'SMTP host is required' });
    }
    await testSmtpConnection({ host: smtpHost, port: smtpPort, secure: smtpSecure, user: smtpUser, pass: smtpPass });
    res.json({ success: true, message: 'SMTP connection successful' });
  } catch (err) {
    res.status(400).json({ success: false, error: `SMTP test failed: ${err.message}` });
  }
});

module.exports = router;
