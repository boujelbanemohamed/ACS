const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getKey() {
  const secret = process.env.PAN_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('PAN_ENCRYPTION_KEY non définie dans les variables d\'environnement');
  }
  return crypto.scryptSync(secret, 'pan-encryption-salt', 32);
}

function encrypt(plaintext) {
  if (!plaintext) return plaintext;
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext.toString(), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted;
}

function decrypt(ciphertext) {
  if (!ciphertext) return ciphertext;
  if (typeof ciphertext !== 'string' || !ciphertext.includes(':')) return ciphertext;
  try {
    const key = getKey();
    const parts = ciphertext.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return ciphertext;
  }
}

function maskPan(pan) {
  if (!pan) return pan;
  const clean = pan.toString().replace(/[^0-9]/g, '');
  if (clean.length <= 4) return clean;
  return '*'.repeat(clean.length - 4) + clean.slice(-4);
}

function maskResponseData(data) {
  if (Array.isArray(data)) {
    return data.map(maskResponseData);
  }
  if (data instanceof Date) {
    return data;
  }
  if (data && typeof data === 'object') {
    const masked = {};
    for (const [key, value] of Object.entries(data)) {
      if (key === 'pan' && typeof value === 'string') {
        masked[key] = maskPan(value);
      } else if (key === 'data_received' && value && typeof value === 'object') {
        masked[key] = maskResponseData(value);
      } else {
        masked[key] = maskResponseData(value);
      }
    }
    return masked;
  }
  return data;
}

function hashPan(pan) {
  if (!pan) return pan;
  return crypto.createHash('sha256').update(pan.toString()).digest('hex');
}

module.exports = { encrypt, decrypt, maskPan, maskResponseData, hashPan };