const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

// La dérivation scrypt est coûteuse : la clé est calculée une seule fois par secret
const keyCache = new Map();

function getKey() {
  const secret = process.env.PAN_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('PAN_ENCRYPTION_KEY non définie dans les variables d\'environnement');
  }
  if (!keyCache.has(secret)) {
    keyCache.clear();
    keyCache.set(secret, crypto.scryptSync(secret, 'pan-encryption-salt', 32));
  }
  return keyCache.get(secret);
}

// Clé HMAC de l'empreinte du PAN : PAN_HASH_KEY, sinon dérivée de PAN_ENCRYPTION_KEY
function getHashKey() {
  if (process.env.PAN_HASH_KEY) return process.env.PAN_HASH_KEY;
  if (process.env.PAN_ENCRYPTION_KEY) {
    return crypto.createHmac('sha256', process.env.PAN_ENCRYPTION_KEY).update('pan-hash-v2').digest();
  }
  return null;
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
  } catch (error) {
    // Valeur chiffrée illisible (mauvaise clé ou donnée corrompue) : ne jamais renvoyer le texte chiffré
    console.error('Déchiffrement impossible:', error.message);
    return null;
  }
}

function maskPan(pan) {
  if (!pan) return pan;
  // Déjà masqué : ne pas re-masquer (sinon "****1234" deviendrait "1234")
  if (pan.toString().includes('*')) return pan.toString();
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

// Ancienne empreinte (SHA-256 sans clé, vulnérable à la force brute) : conservée pour la migration
function hashPanLegacy(pan) {
  if (!pan) return pan;
  return crypto.createHash('sha256').update(pan.toString()).digest('hex');
}

// Empreinte du PAN pour les recherches et la déduplication : HMAC-SHA256 avec clé secrète
function hashPan(pan) {
  if (!pan) return pan;
  const key = getHashKey();
  if (!key) return hashPanLegacy(pan);
  return crypto.createHmac('sha256', key).update(pan.toString()).digest('hex');
}

module.exports = { encrypt, decrypt, maskPan, maskResponseData, hashPan, hashPanLegacy };