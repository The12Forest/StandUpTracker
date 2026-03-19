const { authenticator } = require('otplib');
const crypto = require('crypto');

function generateSecret() {
  return authenticator.generateSecret();
}

function generateTotpUri(secret, email, issuer = 'StandUpTracker') {
  const safeIssuer = issuer.replace(/[:/]/g, '_');
  return authenticator.keyuri(email, safeIssuer, secret);
}

function verifyTotp(token, secret) {
  return authenticator.verify({ token, secret });
}

function generateRecoveryCodes(count = 8) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    codes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
  }
  return codes;
}

function generateEmailCode() {
  return crypto.randomInt(100000, 1000000).toString();
}

module.exports = {
  generateSecret,
  generateTotpUri,
  verifyTotp,
  generateRecoveryCodes,
  generateEmailCode,
};
