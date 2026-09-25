// Politique de mot de passe unique pour toute l'application
const MIN_LENGTH = 8;
const PASSWORD_EXPIRY_DAYS = parseInt(process.env.PASSWORD_EXPIRY_DAYS, 10) || 90;

// Mot de passe plus ancien que PASSWORD_EXPIRY_DAYS
const isPasswordExpired = (user) => !!(user && user.password_changed_at) &&
  new Date(user.password_changed_at).getTime() + PASSWORD_EXPIRY_DAYS * 24 * 60 * 60 * 1000 < Date.now();

// Les limites de débit sont désactivées pendant les tests automatisés, sauf demande explicite
const rateLimitDisabled = () => process.env.NODE_ENV === 'test' && process.env.ENABLE_RATE_LIMIT_IN_TESTS !== 'true';
const MAX_LENGTH = 128;

/**
 * @returns {string|null} message d'erreur, ou null si le mot de passe est conforme
 */
function checkPassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    return 'Mot de passe requis';
  }
  if (password.length < MIN_LENGTH) {
    return `Le mot de passe doit contenir au moins ${MIN_LENGTH} caractères`;
  }
  if (password.length > MAX_LENGTH) {
    return 'Le mot de passe est trop long';
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return 'Le mot de passe doit contenir une minuscule, une majuscule, un chiffre et un caractère spécial';
  }
  return null;
}

module.exports = { checkPassword, isPasswordExpired, rateLimitDisabled, MIN_LENGTH, MAX_LENGTH, PASSWORD_EXPIRY_DAYS };
