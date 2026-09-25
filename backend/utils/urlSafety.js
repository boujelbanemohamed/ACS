// Protection SSRF pour les URL fournies par les utilisateurs.
// - protocole autorisé
// - liste blanche optionnelle ALLOWED_API_DOMAINS
// - résolution DNS et refus des adresses internes (loopback, privées, link-local, metadata...)

const dns = require('dns').promises;
const net = require('net');

const blockList = new net.BlockList();
// IPv4
blockList.addSubnet('0.0.0.0', 8, 'ipv4');
blockList.addSubnet('10.0.0.0', 8, 'ipv4');
blockList.addSubnet('100.64.0.0', 10, 'ipv4');
blockList.addSubnet('127.0.0.0', 8, 'ipv4');
blockList.addSubnet('169.254.0.0', 16, 'ipv4');
blockList.addSubnet('172.16.0.0', 12, 'ipv4');
blockList.addSubnet('192.0.0.0', 24, 'ipv4');
blockList.addSubnet('192.168.0.0', 16, 'ipv4');
blockList.addSubnet('198.18.0.0', 15, 'ipv4');
blockList.addSubnet('224.0.0.0', 4, 'ipv4');
blockList.addSubnet('240.0.0.0', 4, 'ipv4');
// IPv6
blockList.addAddress('::', 'ipv6');
blockList.addAddress('::1', 'ipv6');
blockList.addSubnet('fc00::', 7, 'ipv6');
blockList.addSubnet('fe80::', 10, 'ipv6');
blockList.addSubnet('ff00::', 8, 'ipv6');

const getAllowedDomains = () =>
  (process.env.ALLOWED_API_DOMAINS || '').split(',').map(d => d.trim().toLowerCase()).filter(Boolean);

const isAllowlistedHost = (hostname) => {
  const host = String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase();
  return getAllowedDomains().some(d => host === d || host.endsWith('.' + d));
};

// Vrai si l'URL vise un domaine de ALLOWED_API_DOMAINS (réseau interne alors permis)
const isAllowlistedUrl = (url) => {
  try {
    return isAllowlistedHost(new URL(url).hostname);
  } catch {
    return false;
  }
};

const isPrivateAddress = (address) => {
  let ip = address;
  // Adresse IPv4 encapsulée dans IPv6 (::ffff:127.0.0.1)
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) ip = mapped[1];
  const family = net.isIP(ip);
  if (family === 4) return blockList.check(ip, 'ipv4');
  if (family === 6) return blockList.check(ip, 'ipv6');
  return true;
};

class UnsafeUrlError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

/**
 * Vérifie qu'une URL peut être appelée par le serveur.
 * @param {string} url
 * @param {object} [options]
 * @param {string[]} [options.protocols] protocoles autorisés (sans ':')
 * @param {boolean} [options.allowPrivate] autorise les adresses internes (utilisateurs de confiance)
 */
async function assertSafeUrl(url, { protocols = ['http', 'https'], allowPrivate = false } = {}) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new UnsafeUrlError('URL invalide');
  }

  const protocol = parsed.protocol.replace(':', '');
  if (!protocols.includes(protocol)) {
    throw new UnsafeUrlError(`Protocole non autorisé: ${protocol}`);
  }

  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host) throw new UnsafeUrlError('Hôte manquant');

  const allowedDomains = getAllowedDomains();
  if (allowedDomains.length > 0) {
    if (!isAllowlistedHost(host)) {
      throw new UnsafeUrlError('Domaine non autorisé');
    }
    // Domaine explicitement autorisé par l'administrateur (peut être interne)
    return parsed;
  }

  if (allowPrivate || process.env.ALLOW_PRIVATE_URLS === 'true') return parsed;

  let addresses;
  if (net.isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = (await dns.lookup(host, { all: true, verbatim: true })).map(a => a.address);
    } catch {
      throw new UnsafeUrlError('Hôte introuvable');
    }
  }

  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new UnsafeUrlError('Adresse réseau interne non autorisée');
  }

  return parsed;
}

async function isSafeUrl(url, options) {
  try {
    await assertSafeUrl(url, options);
    return true;
  } catch {
    return false;
  }
}

// Résolveur DNS utilisé à la connexion : empêche le "DNS rebinding"
// (un nom qui résout vers une IP publique au contrôle puis interne à la connexion)
function safeLookup(hostname, options, callback) {
  require('dns').lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    const list = Array.isArray(addresses) ? addresses : [{ address: addresses, family: options.family || 4 }];
    if (list.length === 0 || list.some(a => isPrivateAddress(a.address))) {
      return callback(new UnsafeUrlError('Adresse réseau interne non autorisée'));
    }
    if (options.all) return callback(null, list);
    return callback(null, list[0].address, list[0].family);
  });
}

// Options axios sûres pour une URL externe : pas de redirection, taille limitée, résolveur filtrant
function safeAxiosOptions({ allowPrivate = false, maxContentLength = 10 * 1024 * 1024 } = {}) {
  const options = {
    maxRedirects: 0,
    maxContentLength,
    maxBodyLength: maxContentLength,
  };
  if (!allowPrivate && process.env.ALLOW_PRIVATE_URLS !== 'true') {
    const http = require('http');
    const https = require('https');
    options.httpAgent = new http.Agent({ lookup: safeLookup });
    options.httpsAgent = new https.Agent({ lookup: safeLookup });
  }
  return options;
}

module.exports = { assertSafeUrl, isSafeUrl, isPrivateAddress, isAllowlistedUrl, safeLookup, safeAxiosOptions, UnsafeUrlError };
