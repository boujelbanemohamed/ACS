/**
 * Service de connexion multi-protocoles
 * Supporte: local, http/https, sftp, ftp
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

class ConnectionService {
  constructor() {
    this.sftpClients = new Map(); // Cache des connexions SFTP
  }

  /**
   * Détecte le type de connexion à partir de l'URL
   */
  detectConnectionType(url) {
    if (!url) return 'local';
    
    if (url.startsWith('sftp://')) return 'sftp';
    if (url.startsWith('ftp://')) return 'ftp';
    if (url.startsWith('http://') || url.startsWith('https://')) return 'http';
    if (url.startsWith('/') || url.startsWith('./')) return 'local';
    
    return 'local';
  }

  /**
   * Liste les fichiers d'un répertoire
   */
  async listFiles(bank, urlType = 'source') {
    const url = this.getBankUrl(bank, urlType);
    const connectionType = bank.connection_type || this.detectConnectionType(url);

    console.log(`📂 Listing files from ${url} (type: ${connectionType})`);

    switch (connectionType) {
      case 'local':
        return this.listLocalFiles(url);
      case 'http':
        return this.listHttpFiles(url);
      case 'sftp':
        return this.listSftpFiles(bank, url);
      case 'ftp':
        return this.listFtpFiles(bank, url);
      default:
        return this.listLocalFiles(url);
    }
  }

  /**
   * Lit un fichier
   */
  async readFile(bank, filePath, urlType = 'source') {
    const baseUrl = this.getBankUrl(bank, urlType);
    const connectionType = bank.connection_type || this.detectConnectionType(baseUrl);
    const fullPath = this.buildFullPath(baseUrl, filePath);

    console.log(`📖 Reading file ${fullPath} (type: ${connectionType})`);

    switch (connectionType) {
      case 'local':
        return this.readLocalFile(fullPath);
      case 'http':
        return this.readHttpFile(fullPath);
      case 'sftp':
        return this.readSftpFile(bank, fullPath);
      case 'ftp':
        return this.readFtpFile(bank, fullPath);
      default:
        return this.readLocalFile(fullPath);
    }
  }

  /**
   * Écrit un fichier
   */
  async writeFile(bank, filePath, content, urlType = 'destination') {
    const baseUrl = this.getBankUrl(bank, urlType);
    const connectionType = bank.connection_type || this.detectConnectionType(baseUrl);
    const fullPath = this.buildFullPath(baseUrl, filePath);

    console.log(`✍️ Writing file ${fullPath} (type: ${connectionType})`);

    switch (connectionType) {
      case 'local':
        return this.writeLocalFile(fullPath, content);
      case 'http':
        return this.writeHttpFile(fullPath, content);
      case 'sftp':
        return this.writeSftpFile(bank, fullPath, content);
      case 'ftp':
        return this.writeFtpFile(bank, fullPath, content);
      default:
        return this.writeLocalFile(fullPath, content);
    }
  }

  /**
   * Copie un fichier
   */
  async copyFile(bank, sourcePath, destUrlType, destFileName) {
    const content = await this.readFile(bank, sourcePath, 'source');
    await this.writeFile(bank, destFileName, content, destUrlType);
    return true;
  }

  /**
   * Déplace un fichier (copie + suppression)
   */
  async moveFile(bank, sourcePath, destUrlType, destFileName) {
    await this.copyFile(bank, sourcePath, destUrlType, destFileName);
    await this.deleteFile(bank, sourcePath, 'source');
    return true;
  }

  /**
   * Supprime un fichier
   */
  async deleteFile(bank, filePath, urlType = 'source') {
    const baseUrl = this.getBankUrl(bank, urlType);
    const connectionType = bank.connection_type || this.detectConnectionType(baseUrl);
    const fullPath = this.buildFullPath(baseUrl, filePath);

    console.log(`🗑️ Deleting file ${fullPath} (type: ${connectionType})`);

    switch (connectionType) {
      case 'local':
        return this.deleteLocalFile(fullPath);
      case 'sftp':
        return this.deleteSftpFile(bank, fullPath);
      case 'ftp':
        return this.deleteFtpFile(bank, fullPath);
      default:
        return this.deleteLocalFile(fullPath);
    }
  }

  // ==================== HELPERS ====================

  getBankUrl(bank, urlType) {
    switch (urlType) {
      case 'source': return bank.source_url;
      case 'destination': return bank.destination_url;
      case 'archive': return bank.old_url;
      case 'xml': return bank.xml_output_url;
      case 'enrollment': return bank.enrollment_report_url;
      default: return bank.source_url;
    }
  }

  buildFullPath(baseUrl, filePath) {
    if (!filePath) return baseUrl;
    if (filePath.startsWith('/') || filePath.startsWith('http')) return filePath;
    return path.join(baseUrl, filePath);
  }

  // ==================== LOCAL ====================

  async listLocalFiles(dirPath) {
    try {
      if (!fs.existsSync(dirPath)) {
        console.log(`📁 Directory does not exist: ${dirPath}`);
        return [];
      }

      const files = fs.readdirSync(dirPath);
      return files
        .filter(f => f.endsWith('.csv') && !f.startsWith('OLD_'))
        .map(f => ({
          name: f,
          path: path.join(dirPath, f),
          size: fs.statSync(path.join(dirPath, f)).size,
          modifiedAt: fs.statSync(path.join(dirPath, f)).mtime
        }));
    } catch (error) {
      console.error(`Error listing local files: ${error.message}`);
      return [];
    }
  }

  async readLocalFile(filePath) {
    return fs.readFileSync(filePath);
  }

  async writeLocalFile(filePath, content) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, content);
    return true;
  }

  async deleteLocalFile(filePath) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return true;
  }

  // ==================== HTTP/HTTPS ====================

  async listHttpFiles(url) {
    try {
      // Pour HTTP, on suppose une API qui retourne une liste JSON
      const response = await axios.get(url, { timeout: 30000 });
      
      if (Array.isArray(response.data)) {
        return response.data.map(f => ({
          name: f.name || f.filename || f,
          path: `${url}/${f.name || f.filename || f}`,
          size: f.size || 0,
          modifiedAt: f.modifiedAt || f.modified || new Date()
        }));
      }
      
      return [];
    } catch (error) {
      console.error(`Error listing HTTP files: ${error.message}`);
      return [];
    }
  }

  async readHttpFile(url) {
    const response = await axios.get(url, { 
      responseType: 'arraybuffer',
      timeout: 30000 
    });
    return Buffer.from(response.data);
  }

  async writeHttpFile(url, content) {
    // Pour HTTP, on fait un PUT ou POST
    await axios.put(url, content, {
      headers: { 'Content-Type': 'application/octet-stream' },
      timeout: 30000
    });
    return true;
  }

  // ==================== SFTP ====================

  async getSftpClient(bank) {
    const Client = require('ssh2-sftp-client');
    const sftp = new Client();

    const config = {
      host: bank.sftp_host,
      port: bank.sftp_port || 22,
      username: bank.sftp_username,
    };

    // Authentification par mot de passe ou clé privée
    if (bank.sftp_private_key) {
      config.privateKey = bank.sftp_private_key;
      if (bank.sftp_passphrase) {
        config.passphrase = bank.sftp_passphrase;
      }
    } else if (bank.sftp_password) {
      config.password = bank.sftp_password;
    }

    await sftp.connect(config);
    return sftp;
  }

  extractSftpPath(url) {
    // sftp://user@host:port/path -> /path
    const match = url.match(/sftp:\/\/[^/]+(\/.*)/);
    return match ? match[1] : url;
  }

  async listSftpFiles(bank, url) {
    let sftp;
    try {
      sftp = await this.getSftpClient(bank);
      const remotePath = this.extractSftpPath(url);
      
      const files = await sftp.list(remotePath);
      
      return files
        .filter(f => f.name.endsWith('.csv') && !f.name.startsWith('OLD_') && f.type === '-')
        .map(f => ({
          name: f.name,
          path: `${remotePath}/${f.name}`,
          size: f.size,
          modifiedAt: new Date(f.modifyTime)
        }));
    } catch (error) {
      console.error(`Error listing SFTP files: ${error.message}`);
      return [];
    } finally {
      if (sftp) await sftp.end();
    }
  }

  async readSftpFile(bank, filePath) {
    let sftp;
    try {
      sftp = await this.getSftpClient(bank);
      const remotePath = this.extractSftpPath(filePath);
      return await sftp.get(remotePath);
    } finally {
      if (sftp) await sftp.end();
    }
  }

  async writeSftpFile(bank, filePath, content) {
    let sftp;
    try {
      sftp = await this.getSftpClient(bank);
      const remotePath = this.extractSftpPath(filePath);
      
      // Créer le répertoire si nécessaire
      const dir = path.dirname(remotePath);
      try {
        await sftp.mkdir(dir, true);
      } catch (e) {
        // Ignore si le répertoire existe déjà
      }
      
      await sftp.put(Buffer.from(content), remotePath);
      return true;
    } finally {
      if (sftp) await sftp.end();
    }
  }

  async deleteSftpFile(bank, filePath) {
    let sftp;
    try {
      sftp = await this.getSftpClient(bank);
      const remotePath = this.extractSftpPath(filePath);
      await sftp.delete(remotePath);
      return true;
    } finally {
      if (sftp) await sftp.end();
    }
  }

  // ==================== FTP ====================

  async getFtpClient(bank) {
    const ftp = require('basic-ftp');
    const client = new ftp.Client();
    
    await client.access({
      host: bank.sftp_host,
      port: bank.sftp_port || 21,
      user: bank.sftp_username,
      password: bank.sftp_password,
      secure: false
    });
    
    return client;
  }

  extractFtpPath(url) {
    // ftp://user@host:port/path -> /path
    const match = url.match(/ftp:\/\/[^/]+(\/.*)/);
    return match ? match[1] : url;
  }

  async listFtpFiles(bank, url) {
    let client;
    try {
      client = await this.getFtpClient(bank);
      const remotePath = this.extractFtpPath(url);
      
      const files = await client.list(remotePath);
      
      return files
        .filter(f => f.name.endsWith('.csv') && !f.name.startsWith('OLD_') && f.type === 1)
        .map(f => ({
          name: f.name,
          path: `${remotePath}/${f.name}`,
          size: f.size,
          modifiedAt: f.modifiedAt || new Date()
        }));
    } catch (error) {
      console.error(`Error listing FTP files: ${error.message}`);
      return [];
    } finally {
      if (client) client.close();
    }
  }

  async readFtpFile(bank, filePath) {
    let client;
    try {
      client = await this.getFtpClient(bank);
      const remotePath = this.extractFtpPath(filePath);
      
      const chunks = [];
      await client.downloadTo(
        { write: (chunk) => chunks.push(chunk) },
        remotePath
      );
      
      return Buffer.concat(chunks);
    } finally {
      if (client) client.close();
    }
  }

  async writeFtpFile(bank, filePath, content) {
    let client;
    try {
      client = await this.getFtpClient(bank);
      const remotePath = this.extractFtpPath(filePath);
      
      // Créer le répertoire si nécessaire
      const dir = path.dirname(remotePath);
      await client.ensureDir(dir);
      
      const { Readable } = require('stream');
      const stream = Readable.from([content]);
      await client.uploadFrom(stream, remotePath);
      
      return true;
    } finally {
      if (client) client.close();
    }
  }

  async deleteFtpFile(bank, filePath) {
    let client;
    try {
      client = await this.getFtpClient(bank);
      const remotePath = this.extractFtpPath(filePath);
      await client.remove(remotePath);
      return true;
    } finally {
      if (client) client.close();
    }
  }

  // ==================== TEST CONNECTION ====================

  async testConnection(bank) {
    const connectionType = bank.connection_type || this.detectConnectionType(bank.source_url);
    
    console.log(`🔍 Testing connection for ${bank.code} (type: ${connectionType})`);

    try {
      switch (connectionType) {
        case 'local':
          const exists = fs.existsSync(bank.source_url);
          return {
            success: exists,
            message: exists ? 'Dossier accessible' : 'Dossier non trouvé',
            type: 'local'
          };

        case 'http':
          const response = await axios.head(bank.source_url, { timeout: 10000 });
          return {
            success: response.status === 200,
            message: `HTTP Status: ${response.status}`,
            type: 'http'
          };

        case 'sftp':
          const sftp = await this.getSftpClient(bank);
          await sftp.list(this.extractSftpPath(bank.source_url));
          await sftp.end();
          return {
            success: true,
            message: 'Connexion SFTP réussie',
            type: 'sftp'
          };

        case 'ftp':
          const ftpClient = await this.getFtpClient(bank);
          await ftpClient.list(this.extractFtpPath(bank.source_url));
          ftpClient.close();
          return {
            success: true,
            message: 'Connexion FTP réussie',
            type: 'ftp'
          };

        default:
          return {
            success: false,
            message: 'Type de connexion non supporté',
            type: connectionType
          };
      }
    } catch (error) {
      return {
        success: false,
        message: error.message,
        type: connectionType
      };
    }
  }
}

module.exports = new ConnectionService();
