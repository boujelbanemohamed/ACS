jest.mock('ssh2-sftp-client');
jest.mock('basic-ftp');

const fs = require('fs');
const path = require('path');
const remoteFileService = require('../../utils/remoteFileService');

const mockSftpClient = {
  connect: jest.fn().mockResolvedValue(),
  list: jest.fn().mockResolvedValue([]),
  end: jest.fn().mockResolvedValue(),
  mkdir: jest.fn().mockResolvedValue(),
  put: jest.fn().mockResolvedValue(),
  fastGet: jest.fn().mockResolvedValue(),
  fastPut: jest.fn().mockResolvedValue(),
  rename: jest.fn().mockResolvedValue(),
  delete: jest.fn().mockResolvedValue(),
  createReadStream: jest.fn().mockReturnValue({
    [Symbol.asyncIterator]: function*() { yield Buffer.from('test content'); }
  }),
  exists: jest.fn().mockResolvedValue(true)
};

const mockFtpClient = {
  ftp: { verbose: false },
  access: jest.fn().mockResolvedValue(),
  list: jest.fn().mockResolvedValue([]),
  close: jest.fn(),
  downloadTo: jest.fn().mockResolvedValue(),
  ensureDir: jest.fn().mockResolvedValue(),
  uploadFrom: jest.fn().mockResolvedValue(),
  remove: jest.fn().mockResolvedValue(),
  rename: jest.fn().mockResolvedValue()
};

let SFTPMock;
let FTPClientMock;

beforeEach(() => {
  jest.clearAllMocks();
  SFTPMock = require('ssh2-sftp-client');
  SFTPMock.mockImplementation(() => mockSftpClient);
  FTPClientMock = require('basic-ftp').Client;
  FTPClientMock.mockImplementation(() => mockFtpClient);
});

describe('RemoteFileService', () => {
  describe('getProtocol', () => {
    it('returns sftp for sftp:// url', () => {
      expect(remoteFileService.getProtocol('sftp://example.com/file.txt')).toBe('sftp');
    });

    it('returns ftp for ftp:// url', () => {
      expect(remoteFileService.getProtocol('ftp://example.com/file.txt')).toBe('ftp');
    });

    it('returns null for http:// url', () => {
      expect(remoteFileService.getProtocol('http://example.com/file.txt')).toBeNull();
    });

    it('returns null for null url', () => {
      expect(remoteFileService.getProtocol(null)).toBeNull();
    });
  });

  describe('isRemote', () => {
    it('returns true for sftp:// url', () => {
      expect(remoteFileService.isRemote('sftp://example.com/file.txt')).toBe(true);
    });

    it('returns false for http:// url', () => {
      expect(remoteFileService.isRemote('http://example.com/file.txt')).toBe(false);
    });

    it('returns false for file:// url', () => {
      expect(remoteFileService.isRemote('file:///tmp/file.txt')).toBe(false);
    });
  });

  describe('parseUrl', () => {
    it('parses all components from full sftp URL', () => {
      const parsed = remoteFileService.parseUrl('sftp://user:pass@host:2222/path/to/file');
      expect(parsed.protocol).toBe('sftp');
      expect(parsed.host).toBe('host');
      expect(parsed.port).toBe(2222);
      expect(parsed.username).toBe('user');
      expect(parsed.password).toBe('pass');
      expect(parsed.remotePath).toBe('/path/to/file');
    });

    it('returns default port 22 for sftp', () => {
      const parsed = remoteFileService.parseUrl('sftp://user:pass@host/path');
      expect(parsed.port).toBe(22);
    });

    it('returns default port 21 for ftp', () => {
      const parsed = remoteFileService.parseUrl('ftp://user:pass@host/path');
      expect(parsed.port).toBe(21);
    });
  });

  describe('listFiles', () => {
    it('SFTP: connects, lists at remotePath, filters by extension, disconnects', async () => {
      mockSftpClient.list.mockResolvedValueOnce([
        { type: '-', name: 'file1.csv' },
        { type: '-', name: 'file2.txt' },
        { type: 'd', name: 'subdir' }
      ]);

      const files = await remoteFileService.listFiles('sftp://user:pass@host/path', '.csv');

      expect(mockSftpClient.connect).toHaveBeenCalled();
      expect(mockSftpClient.list).toHaveBeenCalledWith('/path');
      expect(files).toEqual(['file1.csv']);
      expect(mockSftpClient.end).toHaveBeenCalled();
    });

    it('FTP: connects, lists, filters, closes', async () => {
      mockFtpClient.list.mockResolvedValueOnce([
        { name: 'data.csv', isFile: true },
        { name: 'readme.txt', isFile: true },
        { name: 'subdir', isFile: false }
      ]);

      const files = await remoteFileService.listFiles('ftp://user:pass@host/path', '.csv');

      expect(mockFtpClient.access).toHaveBeenCalled();
      expect(mockFtpClient.list).toHaveBeenCalledWith('/path');
      expect(files).toEqual(['data.csv']);
      expect(mockFtpClient.close).toHaveBeenCalled();
    });

    it('throws on unsupported protocol', async () => {
      await expect(remoteFileService.listFiles('http://example.com/path', '.csv'))
        .rejects.toThrow('Unsupported protocol');
    });

    it('SFTP: returns all files when no extension filter', async () => {
      mockSftpClient.list.mockResolvedValueOnce([
        { type: '-', name: 'file1.csv' },
        { type: '-', name: 'file2.txt' }
      ]);

      const files = await remoteFileService.listFiles('sftp://user:pass@host/path');

      expect(files).toEqual(['file1.csv', 'file2.txt']);
      expect(mockSftpClient.end).toHaveBeenCalled();
    });
  });

  describe('readFile', () => {
    it('SFTP: creates read stream, collects chunks, returns utf8 string', async () => {
      const content = await remoteFileService.readFile('sftp://user:pass@host/path/file.txt');

      expect(mockSftpClient.connect).toHaveBeenCalled();
      expect(mockSftpClient.createReadStream).toHaveBeenCalledWith('/path/file.txt');
      expect(content).toBe('test content');
      expect(mockSftpClient.end).toHaveBeenCalled();
    });

    it('FTP: downloads to temp, reads file, cleans up temp', async () => {
      jest.spyOn(fs, 'readFileSync').mockReturnValueOnce('ftp file content');
      jest.spyOn(fs, 'unlinkSync').mockImplementationOnce(() => {});

      const content = await remoteFileService.readFile('ftp://user:pass@host/path/file.txt');

      expect(mockFtpClient.access).toHaveBeenCalled();
      expect(mockFtpClient.downloadTo).toHaveBeenCalled();
      expect(fs.readFileSync).toHaveBeenCalled();
      expect(fs.unlinkSync).toHaveBeenCalled();
      expect(content).toBe('ftp file content');
      expect(mockFtpClient.close).toHaveBeenCalled();
    });

    it('throws on unsupported protocol', async () => {
      await expect(remoteFileService.readFile('http://example.com/file.txt'))
        .rejects.toThrow('Unsupported protocol');
    });
  });

  describe('writeFile', () => {
    it('SFTP: mkdir dir, put content, end', async () => {
      await remoteFileService.writeFile('sftp://user:pass@host/path/file.txt', 'hello');

      expect(mockSftpClient.connect).toHaveBeenCalled();
      expect(mockSftpClient.mkdir).toHaveBeenCalledWith('/path/', true);
      expect(mockSftpClient.put).toHaveBeenCalledWith(expect.any(Buffer), '/path/file.txt');
      expect(mockSftpClient.end).toHaveBeenCalled();
    });

    it('FTP: ensureDir, upload from temp, close, cleanup temp', async () => {
      jest.spyOn(fs, 'writeFileSync').mockImplementationOnce(() => {});
      jest.spyOn(fs, 'unlinkSync').mockImplementationOnce(() => {});

      await remoteFileService.writeFile('ftp://user:pass@host/path/file.txt', 'hello');

      expect(mockFtpClient.access).toHaveBeenCalled();
      expect(mockFtpClient.ensureDir).toHaveBeenCalledWith('/path/');
      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(mockFtpClient.uploadFrom).toHaveBeenCalled();
      expect(fs.unlinkSync).toHaveBeenCalled();
      expect(mockFtpClient.close).toHaveBeenCalled();
    });

    it('throws on unsupported protocol', async () => {
      await expect(remoteFileService.writeFile('http://example.com/file.txt', 'hello'))
        .rejects.toThrow('Unsupported protocol');
    });
  });

  describe('moveFile', () => {
    it('cross-protocol throws error', async () => {
      await expect(remoteFileService.moveFile(
        'sftp://user:pass@host/source.txt',
        'ftp://user:pass@host/dest.txt'
      )).rejects.toThrow('Cross-protocol move not supported');
    });

    it('SFTP same-server: mkdir dest dir, rename', async () => {
      mockSftpClient.rename.mockResolvedValueOnce();

      await remoteFileService.moveFile(
        'sftp://user:pass@host/path/source.txt',
        'sftp://user:pass@host/path/dest.txt'
      );

      expect(mockSftpClient.connect).toHaveBeenCalled();
      expect(mockSftpClient.mkdir).toHaveBeenCalledWith('/path/', true);
      expect(mockSftpClient.rename).toHaveBeenCalledWith('/path/source.txt', '/path/dest.txt');
      expect(mockSftpClient.end).toHaveBeenCalled();
    });

    it('FTP same-server: ensureDir dest dir, rename', async () => {
      mockFtpClient.rename.mockResolvedValueOnce();

      await remoteFileService.moveFile(
        'ftp://user:pass@host/path/source.txt',
        'ftp://user:pass@host/path/dest.txt'
      );

      expect(mockFtpClient.access).toHaveBeenCalled();
      expect(mockFtpClient.ensureDir).toHaveBeenCalledWith('/path/');
      expect(mockFtpClient.rename).toHaveBeenCalledWith('/path/source.txt', '/path/dest.txt');
      expect(mockFtpClient.close).toHaveBeenCalled();
    });

    it('SFTP cross-server throws error', async () => {
      await expect(remoteFileService.moveFile(
        'sftp://user:pass@host1/path/source.txt',
        'sftp://user:pass@host2/path/dest.txt'
      )).rejects.toThrow('Cross-server SFTP move not supported');
    });
  });

  describe('deleteFile', () => {
    it('SFTP: delete remote path', async () => {
      await remoteFileService.deleteFile('sftp://user:pass@host/path/file.txt');

      expect(mockSftpClient.connect).toHaveBeenCalled();
      expect(mockSftpClient.delete).toHaveBeenCalledWith('/path/file.txt');
      expect(mockSftpClient.end).toHaveBeenCalled();
    });

    it('FTP: remove remote path', async () => {
      await remoteFileService.deleteFile('ftp://user:pass@host/path/file.txt');

      expect(mockFtpClient.access).toHaveBeenCalled();
      expect(mockFtpClient.remove).toHaveBeenCalledWith('/path/file.txt');
      expect(mockFtpClient.close).toHaveBeenCalled();
    });
  });

  describe('copyToLocal', () => {
    it('SFTP: fastGet', async () => {
      await remoteFileService.copyToLocal('sftp://user:pass@host/path/remote.txt', '/local/path.txt');

      expect(mockSftpClient.connect).toHaveBeenCalled();
      expect(mockSftpClient.fastGet).toHaveBeenCalledWith('/path/remote.txt', '/local/path.txt');
      expect(mockSftpClient.end).toHaveBeenCalled();
    });

    it('FTP: downloadTo', async () => {
      await remoteFileService.copyToLocal('ftp://user:pass@host/path/remote.txt', '/local/path.txt');

      expect(mockFtpClient.access).toHaveBeenCalled();
      expect(mockFtpClient.downloadTo).toHaveBeenCalledWith('/local/path.txt', '/path/remote.txt');
      expect(mockFtpClient.close).toHaveBeenCalled();
    });
  });

  describe('copyFromLocal', () => {
    it('SFTP: mkdir dir, fastPut', async () => {
      await remoteFileService.copyFromLocal('/local/path.txt', 'sftp://user:pass@host/path/remote.txt');

      expect(mockSftpClient.connect).toHaveBeenCalled();
      expect(mockSftpClient.mkdir).toHaveBeenCalledWith('/path/', true);
      expect(mockSftpClient.fastPut).toHaveBeenCalledWith('/local/path.txt', '/path/remote.txt');
      expect(mockSftpClient.end).toHaveBeenCalled();
    });

    it('FTP: ensureDir, uploadFrom', async () => {
      await remoteFileService.copyFromLocal('/local/path.txt', 'ftp://user:pass@host/path/remote.txt');

      expect(mockFtpClient.access).toHaveBeenCalled();
      expect(mockFtpClient.ensureDir).toHaveBeenCalledWith('/path/');
      expect(mockFtpClient.uploadFrom).toHaveBeenCalledWith('/local/path.txt', '/path/remote.txt');
      expect(mockFtpClient.close).toHaveBeenCalled();
    });
  });

  describe('cleanup in finally blocks', () => {
    it('SFTP: ensures end() is called even on error', async () => {
      mockSftpClient.list.mockRejectedValueOnce(new Error('list failed'));

      await expect(remoteFileService.listFiles('sftp://user:pass@host/path'))
        .rejects.toThrow('list failed');
      expect(mockSftpClient.end).toHaveBeenCalled();
    });

    it('FTP: ensures close() is called even on error', async () => {
      mockFtpClient.list.mockRejectedValueOnce(new Error('list failed'));

      await expect(remoteFileService.listFiles('ftp://user:pass@host/path'))
        .rejects.toThrow('list failed');
      expect(mockFtpClient.close).toHaveBeenCalled();
    });
  });
});
