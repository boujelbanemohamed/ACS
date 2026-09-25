// Helpers de cloisonnement multi-banques.
// Tout utilisateur autre que super_admin est limité à sa propre banque.

const isBankScoped = (user) => !!user && user.role !== 'super_admin';

// Retourne true si l'utilisateur peut accéder aux données de la banque bankId
const canAccessBank = (user, bankId) => {
  if (!user) return false;
  if (!isBankScoped(user)) return true;
  if (user.bank_id === null || user.bank_id === undefined) return false;
  return Number(user.bank_id) === Number(bankId);
};

// Filtre banque effectif : super_admin -> valeur demandée (ou null), sinon sa banque.
// Un utilisateur restreint sans banque reçoit -1 (aucune ligne ne correspond).
const effectiveBankId = (user, requested) => {
  if (!isBankScoped(user)) {
    const parsed = parseInt(requested, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return user.bank_id === null || user.bank_id === undefined ? -1 : Number(user.bank_id);
};

const denyBankAccess = (res) => res.status(403).json({
  success: false,
  message: 'Accès non autorisé à cette banque'
});

// Masque le mot de passe éventuellement présent dans une URL (sftp://user:pass@host)
const redactUrlCredentials = (url) => {
  if (!url || typeof url !== 'string') return url;
  return url.replace(/^([a-z][a-z0-9+.-]*:\/\/)([^:/@\s]+):([^@/\s]*)@/i, '$1$2:***@');
};

const URL_FIELDS = ['source_url', 'destination_url', 'old_url', 'xml_output_url', 'enrollment_report_url', 'original_path',
  'xml_file_path', 'output_path', 'destination_path', 'archive_path'];

// Supprime les identifiants des URL d'une banque (ou d'une ligne jointe à une banque)
const redactBankUrls = (row) => {
  if (!row || typeof row !== 'object') return row;
  const copy = { ...row };
  for (const field of URL_FIELDS) {
    if (field in copy) copy[field] = redactUrlCredentials(copy[field]);
  }
  return copy;
};

// Lors d'une mise à jour, une URL renvoyée masquée (":***@") garde le mot de passe existant
const restoreRedactedUrl = (newUrl, oldUrl) => {
  if (!newUrl || typeof newUrl !== 'string' || !newUrl.includes(':***@')) return newUrl;
  if (!oldUrl || redactUrlCredentials(oldUrl) !== newUrl) return newUrl;
  return oldUrl;
};

module.exports = {
  isBankScoped,
  restoreRedactedUrl,
  URL_FIELDS,
  canAccessBank,
  effectiveBankId,
  denyBankAccess,
  redactUrlCredentials,
  redactBankUrls,
};
