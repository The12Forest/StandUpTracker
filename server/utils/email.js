const nodemailer = require('nodemailer');
const Settings = require('../models/Settings');
const { getSmtpConfig, getAppConfig } = require('./settings');

let transporter = null;
let lastSmtpHash = '';

function smtpHash(smtp) {
  return `${smtp.host}:${smtp.port}:${smtp.user}:${smtp.secure}`;
}

async function getTransporter() {
  const smtp = await getSmtpConfig();
  const hash = smtpHash(smtp);

  // Recreate transporter if config changed
  if (transporter && hash === lastSmtpHash) return transporter;

  const opts = {
    host: smtp.host,
    port: smtp.port,
    auth: {
      user: smtp.user,
      pass: smtp.pass,
    },
  };

  if (smtp.port === 465) {
    opts.secure = true;
  } else {
    opts.secure = false;
    if (smtp.secure || smtp.port === 587) {
      opts.requireTLS = true;
    }
  }

  opts.tls = { rejectUnauthorized: false };

  const debugMode = await Settings.get('debugMode');
  if (debugMode) {
    opts.debug = true;
    opts.logger = true;
  }

  transporter = nodemailer.createTransport(opts);
  lastSmtpHash = hash;
  return transporter;
}

function resetTransporter() {
  transporter = null;
  lastSmtpHash = '';
}

async function sendMail(to, subject, html) {
  const smtp = await getSmtpConfig();
  if (!smtp.host) {
    throw Object.assign(new Error('SMTP not configured. Configure SMTP settings in the Admin Console.'), { code: 'SMTP_NOT_CONFIGURED' });
  }

  const t = await getTransporter();

  try {
    await t.verify();
  } catch (verifyErr) {
    resetTransporter();
    const msg = verifyErr.code === 'ECONNREFUSED'
      ? `SMTP host unreachable: ${smtp.host}:${smtp.port}`
      : verifyErr.responseCode === 535
        ? `SMTP authentication failed for user ${smtp.user}`
        : `SMTP connection failed: ${verifyErr.message}`;
    const err = new Error(msg);
    err.code = verifyErr.code;
    err.responseCode = verifyErr.responseCode;
    err.command = verifyErr.command;
    err.stack = verifyErr.stack;
    throw err;
  }

  return t.sendMail({
    from: smtp.from,
    to,
    subject,
    html,
  });
}

async function sendVerificationEmail(email, token) {
  const { appUrl, appName } = await getAppConfig();
  const link = `${appUrl}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <h2 style="color:#36d1c4;">${appName}</h2>
      <p>Please verify your email address by clicking the button below:</p>
      <a href="${link}" style="display:inline-block;background:linear-gradient(90deg,#36d1c4,#5b86e5);color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Verify Email</a>
      <p style="margin-top:16px;color:#888;font-size:13px;">Or copy this link: ${link}</p>
      <p style="color:#888;font-size:12px;">This link expires in 24 hours.</p>
    </div>
  `;
  return sendMail(email, `${appName} - Verify your email`, html);
}

async function send2faCode(email, code) {
  const { appName } = await getAppConfig();
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <h2 style="color:#36d1c4;">${appName}</h2>
      <p>Your 2FA verification code:</p>
      <div style="font-size:32px;font-weight:700;letter-spacing:6px;color:#5b86e5;margin:16px 0;">${code}</div>
      <p style="color:#888;font-size:12px;">This code expires in 10 minutes. If you didn't request this, ignore this email.</p>
    </div>
  `;
  return sendMail(email, `${appName} - 2FA Code`, html);
}

async function testSmtpConnection(smtpConfig) {
  const opts = {
    host: smtpConfig.host,
    port: parseInt(smtpConfig.port, 10) || 587,
    auth: { user: smtpConfig.user, pass: smtpConfig.pass },
    tls: { rejectUnauthorized: false },
  };
  if (opts.port === 465) opts.secure = true;
  else {
    opts.secure = false;
    if (smtpConfig.secure || opts.port === 587) opts.requireTLS = true;
  }
  const testTransporter = nodemailer.createTransport(opts);
  await testTransporter.verify();
  return true;
}

module.exports = { sendMail, sendVerificationEmail, send2faCode, resetTransporter, testSmtpConnection };

