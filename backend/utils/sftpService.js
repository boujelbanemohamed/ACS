let SFTPClient;

class SftpService {
  async getClient() {
    if (!SFTPClient) SFTPClient = require('ssh2-sftp-client');
    return new SFTPClient();
  }

  parseUrl(url) {
    const cleaned = url.startsWith('sftp://') ? url : 'sftp://' + url;
    const parsed = new URL(cleaned);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port) || 22,
      username: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      remotePath: parsed.pathname
    };
  }

  getDirFromUrl(url) {
    const parsed = this.parseUrl(url);
    const dirPath = parsed.remotePath.endsWith('/') ? parsed.remotePath.slice(0, -1) : parsed.remotePath;
    const dir = dirPath.substring(0, dirPath.lastIndexOf('/') + 1) || '/';
    return this.buildUrl({ ...parsed, remotePath: dir });
  }

  buildUrl(config) {
    let url = 'sftp://';
    if (config.username) {
      url += encodeURIComponent(config.username);
      if (config.password) url += ':' + encodeURIComponent(config.password);
      url += '@';
    }
    url += config.host;
    if (config.port && config.port !== 22) url += ':' + config.port;
    url += config.remotePath;
    return url;
  }

  async connect(url) {
    const sftp = await this.getClient();
    const config = this.parseUrl(url);
    await sftp.connect({
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.password,
      readyTimeout: 10000
    });
    return sftp;
  }

  async listFiles(url, extension) {
    let sftp;
    try {
      sftp = await this.connect(url);
      const config = this.parseUrl(url);
      const list = await sftp.list(config.remotePath);
      const files = list
        .filter(item => item.type === '-')
        .map(item => item.name);
      return extension ? files.filter(f => f.endsWith(extension)) : files;
    } finally {
      if (sftp) await sftp.end();
    }
  }

  async readFile(url) {
    let sftp;
    try {
      sftp = await this.connect(url);
      const config = this.parseUrl(url);
      const chunks = [];
      const stream = sftp.createReadStream(config.remotePath);
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks).toString('utf8');
    } finally {
      if (sftp) await sftp.end();
    }
  }

  async writeFile(url, content) {
    let sftp;
    try {
      sftp = await this.connect(url);
      const config = this.parseUrl(url);
      const dir = config.remotePath.substring(0, config.remotePath.lastIndexOf('/') + 1) || '/';
      try { await sftp.mkdir(dir, true); } catch {}
      await sftp.put(Buffer.from(content, 'utf8'), config.remotePath);
    } finally {
      if (sftp) await sftp.end();
    }
  }

  async moveFile(sourceUrl, destUrl) {
    let sftp;
    try {
      sftp = await this.connect(sourceUrl);
      const srcConfig = this.parseUrl(sourceUrl);
      const dstConfig = this.parseUrl(destUrl);
      if (srcConfig.host !== dstConfig.host || srcConfig.port !== dstConfig.port) {
        throw new Error('Cross-server SFTP move not supported, use copy+delete');
      }
      const destDir = dstConfig.remotePath.substring(0, dstConfig.remotePath.lastIndexOf('/') + 1) || '/';
      try { await sftp.mkdir(destDir, true); } catch {}
      await sftp.rename(srcConfig.remotePath, dstConfig.remotePath);
    } finally {
      if (sftp) await sftp.end();
    }
  }

  async deleteFile(url) {
    let sftp;
    try {
      sftp = await this.connect(url);
      const config = this.parseUrl(url);
      await sftp.delete(config.remotePath);
    } finally {
      if (sftp) await sftp.end();
    }
  }

  async copyToLocal(sftpUrl, localPath) {
    let sftp;
    try {
      sftp = await this.connect(sftpUrl);
      const config = this.parseUrl(sftpUrl);
      await sftp.fastGet(config.remotePath, localPath);
    } finally {
      if (sftp) await sftp.end();
    }
  }

  async copyFromLocal(localPath, sftpUrl) {
    let sftp;
    try {
      sftp = await this.connect(sftpUrl);
      const config = this.parseUrl(sftpUrl);
      const dir = config.remotePath.substring(0, config.remotePath.lastIndexOf('/') + 1) || '/';
      try { await sftp.mkdir(dir, true); } catch {}
      await sftp.fastPut(localPath, config.remotePath);
    } finally {
      if (sftp) await sftp.end();
    }
  }

  isSftpUrl(url) {
    return url && url.startsWith('sftp://');
  }
}

module.exports = new SftpService();
