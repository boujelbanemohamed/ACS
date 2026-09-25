// Validation commune des cartes reçues hors fichier CSV
// (API publique, appel d'API externe, saisie manuelle).

const CSVValidator = require('./csvValidator');

const luhn = new CSVValidator();

const VALID_LANGUAGES = ['fr', 'en', 'ar'];
const VALID_BEHAVIOURS = ['otp', 'sms', 'email'];
const VALID_ACTIONS = ['update', 'create', 'delete'];
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

const str = (value) => (value === undefined || value === null ? '' : String(value).trim());

// Normalise un numéro : retire espaces/points/tirets et préfixe international, 8 chiffres => Tunisie
function normalizePhone(phone) {
  let value = str(phone).replace(/[\s.()-]/g, '');
  if (value.startsWith('+')) value = value.slice(1);
  else if (value.startsWith('00')) value = value.slice(2);
  if (/^\d{8}$/.test(value)) value = '216' + value;
  return value;
}

function normalizeCard(card) {
  const c = card && typeof card === 'object' ? card : {};
  return {
    language: str(c.language || c.lang || 'fr').toLowerCase(),
    firstName: str(c.firstName ?? c.first_name ?? c.prenom),
    lastName: str(c.lastName ?? c.last_name ?? c.nom),
    pan: str(c.pan ?? c.cardNumber ?? c.card_number).replace(/\s/g, ''),
    expiry: str(c.expiry ?? c.expiryDate ?? c.expiry_date),
    phone: normalizePhone(c.phone ?? c.phoneNumber ?? c.phone_number ?? c.telephone),
    behaviour: str(c.behaviour || c.behavior || 'otp').toLowerCase(),
    action: str(c.action || 'update').toLowerCase(),
  };
}

/**
 * Valide une carte. Les erreurs bloquent la carte, les avertissements non.
 * @returns {{ isValid: boolean, errors: object[], warnings: object[], card: object }}
 */
function validateCard(card, now = new Date()) {
  const n = normalizeCard(card);
  const errors = [];
  const warnings = [];
  const addError = (field, message) => errors.push({ field, message });

  if (!/^\d{13,19}$/.test(n.pan)) {
    addError('pan', 'PAN invalide (13-19 chiffres requis)');
  } else if (!luhn.luhnCheck(n.pan)) {
    warnings.push({ field: 'pan', message: 'PAN invalide (échec de la validation Luhn)' });
  }

  if (!n.phone) {
    addError('phone', 'Telephone requis');
  } else if (!/^\d{8,15}$/.test(n.phone)) {
    addError('phone', 'Format téléphone invalide (indicatif + numéro, ex: +21624080852)');
  }

  if (!/^\d{2}\/\d{2}$/.test(n.expiry)) {
    addError('expiry', 'Format expiry invalide (MM/YY)');
  } else {
    const [monthStr, yearStr] = n.expiry.split('/');
    const month = parseInt(monthStr, 10);
    const year = parseInt(yearStr, 10) + 2000;
    if (month < 1 || month > 12) {
      addError('expiry', 'Mois invalide (doit être 01-12)');
    } else if (year > now.getFullYear() + 30) {
      addError('expiry', 'Année invalide');
    } else if (new Date(year, month, 1) <= now) {
      // La carte reste valable jusqu'à la fin du mois d'expiration
      addError('expiry', 'Carte expirée');
    }
  }

  for (const field of ['firstName', 'lastName']) {
    if (n[field].length > 255) addError(field, `${field} ne doit pas dépasser 255 caractères`);
    else if (CONTROL_CHARS.test(n[field])) addError(field, `${field} contient des caractères invalides`);
  }

  if (!VALID_LANGUAGES.includes(n.language)) {
    addError('language', `Language invalide. Valeurs acceptées: ${VALID_LANGUAGES.join(', ')}`);
  }
  if (!VALID_BEHAVIOURS.includes(n.behaviour)) {
    addError('behaviour', `Behaviour invalide. Valeurs acceptées: ${VALID_BEHAVIOURS.join(', ')}`);
  }
  if (!VALID_ACTIONS.includes(n.action)) {
    addError('action', `Action invalide. Valeurs acceptées: ${VALID_ACTIONS.join(', ')}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    card: { ...n, phone: n.phone ? '+' + n.phone : n.phone },
  };
}

/**
 * Valide un lot de cartes et détecte les PAN en double dans le lot.
 */
function validateCards(cards, now = new Date()) {
  const valid = [];
  const invalid = [];
  const seen = new Set();

  (Array.isArray(cards) ? cards : []).forEach((card, index) => {
    const result = validateCard(card, now);
    if (result.isValid && seen.has(result.card.pan)) {
      result.isValid = false;
      result.errors.push({ field: 'pan', message: 'PAN en double dans la requête' });
    }
    if (result.isValid) {
      seen.add(result.card.pan);
      valid.push({ index, card: result.card, warnings: result.warnings });
    } else {
      invalid.push({ index, errors: result.errors, warnings: result.warnings });
    }
  });

  return { valid, invalid };
}

module.exports = { validateCard, validateCards, normalizeCard, normalizePhone };
