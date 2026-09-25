let SFTPClient;
const ftp = require('basic-ftp');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const fs = require('fs');

// Fichier temporaire unique (évite les collisions entre traitements concurrents)
const tempFile = (prefix) => path.join(os.tmpdir(), `${prefix}_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`);

let warnedHostKey = false;
let warnedPlainFtp = false;

// Empreintes attendues : SFTP_HOST_FINGERPRINTS="host[:port]=SHA256:base64,autre=SHA256:..."
function parseFingerprints() {
  const map = new Map();
  (process.env.SFTP_HOST_FINGERPRINTS || '').split(',').map(s => s.trim()).filter(Boolean).forEach(entry => {
    const idx = entry.indexOf('=');
    if (idx > 0) map.set(entry.slice(0, idx).trim().toLowerCase(), entry.slice(idx + 1).trim().replace(/^SHA256:/i, ''));
  });
  return map;
}

// Vérification de la clé d'hôte SSH (protection contre l'interception)
function buildHostVerifier(host, port) {
  const fingerprints = parseFingerprints();
  const expected = fingerprints.get(`${host}:${port}`.toLowerCase()) || fingerprints.get(String(host).toLowerCase());
  const strict = process.env.SFTP_STRICT_HOST_KEY === 'true';

  return (key) => {
    const actual = crypto.createHash('sha256').update(key).digest('base64').replace(/=+$/, '');
    if (expected) return actual === expected.replace(/=+$/, '');
    if (strict) {
      console.error(`SFTP: empreinte inconnue pour ${host}:${port} (SHA256:${actual}) - connexion refusée`);
      return false;
    }
    if (!warnedHostKey) {
      warnedHostKey = true;
      console.warn(`SFTP: clé d'hôte non vérifiée pour ${host}:${port} (SHA256:${actual}). Configurez SFTP_HOST_FINGERPRINTS et SFTP_STRICT_HOST_KEY=true.`);
    }
    return true;
  };
}

function lazySFTP() {
  if (!SFTPClient) SFTPClient = require('ssh2-sftp-client');
  return new SFTPClient();
}

class RemoteFileService {
  getProtocol(url) {
    if (!url) return null;
    if (url.startsWith('sftp://')) return 'sftp';
    if (url.startsWith('ftp://') || url.startsWith('ftps://')) return 'ftp';
    return null;
  }

  isRemote(url) {
    return this.getProtocol(url) !== null;
  }

  parseUrl(url) {
    const cleaned = url.includes('://') ? url : 'sftp://' + url;
    const parsed = new URL(cleaned);
    return {
      protocol: parsed.protocol.replace(':', ''),
      host: parsed.hostname,
      port: parseInt(parsed.port) || (parsed.protocol === 'ftp:' || parsed.protocol === 'ftps:' ? 21 : 22),
      username: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      remotePath: parsed.pathname
    };
  }

  async connectSftp(url) {
    const client = lazySFTP();
    const config = this.parseUrl(url);
    await client.connect({
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.password,
      readyTimeout: 10000,
      hostVerifier: buildHostVerifier(config.host, config.port)
    });
    return client;
  }

  async connectFtp(url) {
    const client = new ftp.Client();
    client.ftp.verbose = false;
    const config = this.parseUrl(url);
    // ftps:// ou FTP_SECURE=true => FTP sur TLS (identifiants et données chiffrés)
    const secure = config.protocol === 'ftps' || process.env.FTP_SECURE === 'true';
    if (!secure && !warnedPlainFtp) {
      warnedPlainFtp = true;
      console.warn('FTP sans TLS : identifiants et données circulent en clair. Utilisez sftp:// ou ftps://.');
    }
    await client.access({
      host: config.host,
      port: config.port,
      user: config.username,
      password: config.password,
      secure,
      secureOptions: secure ? { rejectUnauthorized: process.env.FTP_TLS_INSECURE !== 'true' } : undefined
    });
    return client;
  }

  async listFiles(url, extension) {
    const proto = this.getProtocol(url);
    if (proto === 'sftp') {
      let client;
      try {
        client = await this.connectSftp(url);
        const config = this.parseUrl(url);
        const list = await client.list(config.remotePath);
        const files = list.filter(item => item.type === '-').map(item => item.name);
        return extension ? files.filter(f => f.endsWith(extension)) : files;
      } finally {
        if (client) await client.end();
      }
    } else if (proto === 'ftp') {
      let client;
      try {
        client = await this.connectFtp(url);
        const config = this.parseUrl(url);
        const list = await client.list(config.remotePath);
        const files = list.filter(item => item.isFile).map(item => item.name);
        return extension ? files.filter(f => f.endsWith(extension)) : files;
      } finally {
        if (client) client.close();
      }
    }
    throw new Error('Unsupported protocol: ' + url);
  }

  async readFile(url) {
    const proto = this.getProtocol(url);
    if (proto === 'sftp') {
      let client;
      try {
        client = await this.connectSftp(url);
        const config = this.parseUrl(url);
        const chunks = [];
        const stream = client.createReadStream(config.remotePath);
        for await (const chunk of stream) chunks.push(chunk);
        return Buffer.concat(chunks).toString('utf8');
      } finally {
        if (client) await client.end();
      }
    } else if (proto === 'ftp') {
      let client;
      try {
        client = await this.connectFtp(url);
        const config = this.parseUrl(url);
        const tmp = tempFile('ftp');
        try {
          await client.downloadTo(tmp, config.remotePath);
          return fs.readFileSync(tmp, 'utf8');
        } finally {
          fs.rmSync(tmp, { force: true });
        }
      } finally {
        if (client) client.close();
      }
    }
    throw new Error('Unsupported protocol: ' + url);
  }

  async writeFile(url, content) {
    const proto = this.getProtocol(url);
    if (proto === 'sftp') {
      let client;
      try {
        client = await this.connectSftp(url);
        const config = this.parseUrl(url);
        const dir = config.remotePath.substring(0, config.remotePath.lastIndexOf('/') + 1) || '/';
        try { await client.mkdir(dir, true); } catch {}
        await client.put(Buffer.from(content, 'utf8'), config.remotePath);
      } finally {
        if (client) await client.end();
      }
    } else if (proto === 'ftp') {
      let client;
      try {
        client = await this.connectFtp(url);
        const config = this.parseUrl(url);
        const dir = config.remotePath.substring(0, config.remotePath.lastIndexOf('/') + 1) || '/';
        try { await client.ensureDir(dir); } catch {}
        const tmp = tempFile('ftp');
        try {
          fs.writeFileSync(tmp, content, 'utf8');
          await client.uploadFrom(tmp, config.remotePath);
        } finally {
          fs.rmSync(tmp, { force: true });
        }
      } finally {
        if (client) client.close();
      }
    } else {
      throw new Error('Unsupported protocol: ' + url);
    }
  }

  async moveFile(sourceUrl, destUrl) {
    const srcProto = this.getProtocol(sourceUrl);
    const dstProto = this.getProtocol(destUrl);

    if (srcProto !== dstProto) {
      throw new Error('Cross-protocol move not supported');
    }

    if (srcProto === 'sftp') {
      let client;
      try {
        client = await this.connectSftp(sourceUrl);
        const srcConfig = this.parseUrl(sourceUrl);
        const dstConfig = this.parseUrl(destUrl);
        if (srcConfig.host !== dstConfig.host || srcConfig.port !== dstConfig.port) {
          throw new Error('Cross-server SFTP move not supported');
        }
        const destDir = dstConfig.remotePath.substring(0, dstConfig.remotePath.lastIndexOf('/') + 1) || '/';
        try { await client.mkdir(destDir, true); } catch {}
        await client.rename(srcConfig.remotePath, dstConfig.remotePath);
      } finally {
        if (client) await client.end();
      }
    } else if (srcProto === 'ftp') {
      let client;
      try {
        client = await this.connectFtp(sourceUrl);
        const srcConfig = this.parseUrl(sourceUrl);
        const dstConfig = this.parseUrl(destUrl);
        const destDir = dstConfig.remotePath.substring(0, dstConfig.remotePath.lastIndexOf('/') + 1) || '/';
        try { await client.ensureDir(destDir); } catch {}
        await client.rename(srcConfig.remotePath, dstConfig.remotePath);
      } finally {
        if (client) client.close();
      }
    } else {
      throw new Error('Unsupported protocol: ' + sourceUrl);
    }
  }

  async exists(url) {
    const proto = this.getProtocol(url);
    if (proto === 'sftp') {
      let client;
      try {
        client = await this.connectSftp(url);
        const config = this.parseUrl(url);
        return !!(await client.exists(config.remotePath));
      } finally {
        if (client) await client.end();
      }
    } else if (proto === 'ftp') {
      let client;
      try {
        client = await this.connectFtp(url);
        const config = this.parseUrl(url);
        try {
          await client.size(config.remotePath);
          return true;
        } catch {
          return false;
        }
      } finally {
        if (client) client.close();
      }
    }
    throw new Error('Unsupported protocol: ' + url);
  }

  async deleteFile(url) {
    const proto = this.getProtocol(url);
    if (proto === 'sftp') {
      let client;
      try {
        client = await this.connectSftp(url);
        const config = this.parseUrl(url);
        await client.delete(config.remotePath);
      } finally {
        if (client) await client.end();
      }
    } else if (proto === 'ftp') {
      let client;
      try {
        client = await this.connectFtp(url);
        const config = this.parseUrl(url);
        await client.remove(config.remotePath);
      } finally {
        if (client) client.close();
      }
    } else {
      throw new Error('Unsupported protocol: ' + url);
    }
  }

  async copyToLocal(remoteUrl, localPath) {
    const proto = this.getProtocol(remoteUrl);
    if (proto === 'sftp') {
      let client;
      try {
        client = await this.connectSftp(remoteUrl);
        const config = this.parseUrl(remoteUrl);
        await client.fastGet(config.remotePath, localPath);
      } finally {
        if (client) await client.end();
      }
    } else if (proto === 'ftp') {
      let client;
      try {
        client = await this.connectFtp(remoteUrl);
        const config = this.parseUrl(remoteUrl);
        await client.downloadTo(localPath, config.remotePath);
      } finally {
        if (client) client.close();
      }
    } else {
      throw new Error('Unsupported protocol: ' + remoteUrl);
    }
  }

  async copyFromLocal(localPath, remoteUrl) {
    const proto = this.getProtocol(remoteUrl);
    if (proto === 'sftp') {
      let client;
      try {
        client = await this.connectSftp(remoteUrl);
        const config = this.parseUrl(remoteUrl);
        const dir = config.remotePath.substring(0, config.remotePath.lastIndexOf('/') + 1) || '/';
        try { await client.mkdir(dir, true); } catch {}
        await client.fastPut(localPath, config.remotePath);
      } finally {
        if (client) await client.end();
      }
    } else if (proto === 'ftp') {
      let client;
      try {
        client = await this.connectFtp(remoteUrl);
        const config = this.parseUrl(remoteUrl);
        const dir = config.remotePath.substring(0, config.remotePath.lastIndexOf('/') + 1) || '/';
        try { await client.ensureDir(dir); } catch {}
        await client.uploadFrom(localPath, config.remotePath);
      } finally {
        if (client) client.close();
      }
    } else {
      throw new Error('Unsupported protocol: ' + remoteUrl);
    }
  }
}

module.exports = new RemoteFileService();
