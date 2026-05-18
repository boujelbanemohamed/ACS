let SFTPClient;
const ftp = require('basic-ftp');

function lazySFTP() {
  if (!SFTPClient) SFTPClient = require('ssh2-sftp-client');
  return new SFTPClient();
}

class RemoteFileService {
  getProtocol(url) {
    if (!url) return null;
    if (url.startsWith('sftp://')) return 'sftp';
    if (url.startsWith('ftp://')) return 'ftp';
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
      port: parseInt(parsed.port) || (parsed.protocol === 'ftp:' ? 21 : 22),
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
      readyTimeout: 10000
    });
    return client;
  }

  async connectFtp(url) {
    const client = new ftp.Client();
    client.ftp.verbose = false;
    const config = this.parseUrl(url);
    await client.access({
      host: config.host,
      port: config.port,
      user: config.username,
      password: config.password,
      secure: false
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
        const tmp = '/tmp/ftp_' + Date.now() + '_' + Math.random().toString(36).slice(2);
        await client.downloadTo(tmp, config.remotePath);
        const fs = require('fs');
        const content = fs.readFileSync(tmp, 'utf8');
        fs.unlinkSync(tmp);
        return content;
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
        const tmp = '/tmp/ftp_' + Date.now() + '_' + Math.random().toString(36).slice(2);
        require('fs').writeFileSync(tmp, content, 'utf8');
        await client.uploadFrom(tmp, config.remotePath);
        require('fs').unlinkSync(tmp);
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
