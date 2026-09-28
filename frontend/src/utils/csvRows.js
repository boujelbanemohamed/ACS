// Outils pour corriger un fichier importé dans le navigateur.
// Le serveur ne renvoie jamais les PAN en clair : pour proposer la correction d'un fichier
// envoyé depuis ce poste, la page relit le fichier local avec les mêmes règles que le serveur.

export const CSV_FIELDS = ['language', 'firstName', 'lastName', 'pan', 'expiry', 'phone', 'behaviour', 'action'];

// Mêmes alias d'en-têtes que csvProcessor.normalizeRowData côté serveur
const FIELD_ALIASES = {
  language: ['language', 'Language', 'LANGUAGE'],
  firstName: ['firstName', 'firstname', 'FirstName', 'FIRSTNAME', 'first_name', 'prenom', 'Prenom', 'PRENOM'],
  lastName: ['lastName', 'lastname', 'LastName', 'LASTNAME', 'last_name', 'nom', 'Nom', 'NOM'],
  pan: ['pan', 'Pan', 'PAN'],
  expiry: ['expiry', 'Expiry', 'EXPIRY', 'expiration', 'Expiration'],
  phone: ['phone', 'Phone', 'PHONE', 'telephone', 'Telephone', 'TELEPHONE'],
  behaviour: ['behaviour', 'Behaviour', 'BEHAVIOUR'],
  action: ['action', 'Action', 'ACTION']
};

// Découpe une ligne CSV séparée par ";" en tenant compte des guillemets
export function splitCsvLine(line, separator = ';') {
  const values = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') quoted = false;
      else current += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === separator) {
      values.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  values.push(current);
  return values;
}

/**
 * Lit le contenu d'un CSV et renvoie ses lignes normalisées, indexées par numéro de ligne
 * (1 = première ligne après l'en-tête, comme côté serveur).
 */
export function parseCsvRows(text) {
  const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  const headers = splitCsvLine(lines.shift() || '').map(h => h.trim());
  const rows = new Map();

  lines.forEach((line, index) => {
    const values = splitCsvLine(line);
    const raw = {};
    headers.forEach((header, i) => { raw[header] = values[i] || ''; });
    const row = { rowNumber: index + 1 };
    CSV_FIELDS.forEach(field => {
      const alias = FIELD_ALIASES[field].find(name => raw[name]);
      row[field] = alias ? raw[alias] : '';
    });
    rows.set(index + 1, row);
  });
  return rows;
}

export function isRowEmpty(row) {
  return CSV_FIELDS.every(field => !row[field] || String(row[field]).trim() === '');
}

// Même rendu que encryptionService.maskPan côté serveur
export function maskPan(pan) {
  if (!pan) return pan;
  const value = String(pan);
  if (value.includes('*')) return value;
  const clean = value.replace(/[^0-9]/g, '');
  if (clean.length <= 4) return clean;
  return '*'.repeat(clean.length - 4) + clean.slice(-4);
}

export const isMaskedPan = (pan) => String(pan || '').includes('*');

export function isDuplicateError(error) {
  return error.code === 'DUPLICATE_PAN'
    || (error.fieldName === 'pan' && error.severity === 'warning' && /double|duplicate/i.test(error.errorMessage || ''));
}

// Une erreur bloque la ligne ; un avertissement (clé de Luhn par exemple) ne la bloque pas, sauf un doublon
export function isBlockingError(error) {
  return error.severity !== 'warning' || isDuplicateError(error);
}
