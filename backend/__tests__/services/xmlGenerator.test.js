let mockMkdir, mockWriteFile;
jest.mock('fs', () => {
  mockMkdir = jest.fn().mockResolvedValue();
  mockWriteFile = jest.fn().mockResolvedValue();
  return {
    promises: { mkdir: mockMkdir, writeFile: mockWriteFile }
  };
});
jest.mock('../../config/database');
jest.mock('../../utils/remoteFileService', () => ({
  isRemote: jest.fn(),
  writeFile: jest.fn()
}));

const db = require('../../config/database');
const remoteFileService = require('../../utils/remoteFileService');
const xmlGenerator = require('../../services/xmlGenerator');

describe('XMLGenerator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockReset();
    remoteFileService.isRemote.mockReset();
    remoteFileService.writeFile.mockReset();
  });

  describe('convertPAN', () => {
    it('strips non-numeric chars from PAN', () => {
      expect(xmlGenerator.convertPAN('4741-0000-0000-0006')).toBe('4741000000000006');
    });

    it('returns null for undefined', () => {
      expect(xmlGenerator.convertPAN(undefined)).toBeNull();
    });

    it('returns null for null', () => {
      expect(xmlGenerator.convertPAN(null)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(xmlGenerator.convertPAN('')).toBeNull();
    });

    it('returns null for PAN shorter than 13 digits', () => {
      expect(xmlGenerator.convertPAN('123456789012')).toBeNull();
    });

    it('returns null for PAN longer than 19 digits', () => {
      expect(xmlGenerator.convertPAN('12345678901234567890')).toBeNull();
    });

    it('converts numeric input to string', () => {
      expect(xmlGenerator.convertPAN(4741000000000006)).toBe('4741000000000006');
    });
  });

  describe('formatPhone', () => {
    it('8-digit number gets +216 prefix', () => {
      expect(xmlGenerator.formatPhone('98765432')).toBe('+21698765432');
    });

    it('already has +216 stays unchanged', () => {
      expect(xmlGenerator.formatPhone('+21698765432')).toBe('+21698765432');
    });

    it('00216 prefix converted to +216', () => {
      expect(xmlGenerator.formatPhone('0021698765432')).toBe('+21698765432');
    });

    it('216 prefix gets + prepended', () => {
      expect(xmlGenerator.formatPhone('21698765432')).toBe('+21698765432');
    });

    it('returns null for null', () => {
      expect(xmlGenerator.formatPhone(null)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(xmlGenerator.formatPhone('')).toBeNull();
    });

    it('strips non-numeric except plus', () => {
      expect(xmlGenerator.formatPhone('98 765 432')).toBe('+21698765432');
    });
  });

  describe('getNextId', () => {
    it('updates xml_id_sequence and returns calculated start ID', async () => {
      db.query.mockResolvedValue({ rows: [{ last_id: '105' }] });

      const result = await xmlGenerator.getNextId(4);

      expect(result).toBe(102);
      expect(db.query).toHaveBeenCalledWith(
        'UPDATE xml_id_sequence SET last_id = last_id + $1, updated_at = CURRENT_TIMESTAMP RETURNING last_id',
        [4]
      );
    });

    it('falls back to Date.now() on DB error', async () => {
      db.query.mockRejectedValue(new Error('connection refused'));

      const result = await xmlGenerator.getNextId(10);

      expect(result).toBeGreaterThan(0);
    });
  });

  describe('generateXML', () => {
    const bankCode = 'BNK';
    const records = [
      { id: 1, pan: '4741000000000006', phone: '98765432' },
      { id: 2, pan: '4000056655665556', phone: '+21612345678' }
    ];

    it('generates valid XML with add and setAuthMethod for each record', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ last_id: '10' }] });

      const xml = await xmlGenerator.generateXML(records, bankCode);

      expect(xml).toContain('<?xml version="1.0" encoding="ISO-8859-15"?>');
      expect(xml).toContain('<cardRegistryRecords');
      expect(xml).toContain('</cardRegistryRecords>');
      expect(xml.match(/<add /g)).toHaveLength(2);
      expect(xml.match(/<setAuthMethod /g)).toHaveLength(2);
    });

    it('uses convertPAN for cardNumber attribute', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ last_id: '10' }] });

      const xml = await xmlGenerator.generateXML(records, bankCode);

      expect(xml).toContain('cardNumber="4741000000000006"');
      expect(xml).toContain('cardNumber="4000056655665556"');
    });

    it('uses formatPhone for phoneNumber in oneTimePasswordSMS', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ last_id: '10' }] });

      const xml = await xmlGenerator.generateXML(records, bankCode);

      expect(xml).toContain('phoneNumber="+21698765432"');
      expect(xml).toContain('phoneNumber="+21612345678"');
    });

    it('increments IDs correctly (2 per record)', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ last_id: '100' }] });

      const xml = await xmlGenerator.generateXML(records, bankCode);

      expect(xml).toContain('id="97"');
      expect(xml).toContain('id="98"');
      expect(xml).toContain('id="99"');
      expect(xml).toContain('id="100"');
    });

    it('updates enrollment_xml_id for each mapping', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ last_id: '20' }] });

      await xmlGenerator.generateXML(records, bankCode);

      expect(db.query).toHaveBeenCalledWith(
        'UPDATE processed_records SET enrollment_xml_id = $1 WHERE id = $2', [17, 1]
      );
      expect(db.query).toHaveBeenCalledWith(
        'UPDATE processed_records SET enrollment_xml_id = $1 WHERE id = $2', [19, 2]
      );
    });

    it('skips records with missing/invalid PAN (console.warn)', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      db.query.mockResolvedValueOnce({ rows: [{ last_id: '10' }] });

      const badRecords = [
        { id: 1, pan: '4741000000000006', phone: '98765432' },
        { id: 2, pan: '', phone: '12345678' },
        { id: 3, pan: '123', phone: '87654321' }
      ];
      const xml = await xmlGenerator.generateXML(badRecords, bankCode);

      expect(xml.match(/<add /g)).toHaveLength(1);
      expect(warnSpy).toHaveBeenCalledTimes(2);
      warnSpy.mockRestore();
    });

    it('handles phone formatting for Tunisia (216...)', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ last_id: '10' }] });

      const xml = await xmlGenerator.generateXML(
        [{ id: 1, pan: '4741000000000006', phone: '21698765432' }], bankCode
      );

      expect(xml).toContain('phoneNumber="+21698765432"');
    });
  });

  describe('generateFileName', () => {
    it('formats ACS_CARDS_{bankCode}_{YYYYMMDDHHMMSS}.xml', () => {
      expect(xmlGenerator.generateFileName('BNK')).toMatch(/^ACS_CARDS_BNK_\d{14}\.xml$/);
    });

    it('different bankCode produces different filename', () => {
      expect(xmlGenerator.generateFileName('BNK')).toMatch(/BNK/);
      expect(xmlGenerator.generateFileName('XYZ')).toMatch(/XYZ/);
    });
  });

  describe('saveXML', () => {
    it('local path: calls fs.mkdir, fs.writeFile, returns filePath', async () => {
      const result = await xmlGenerator.saveXML('<xml/>', '/output', 'test.xml');

      expect(mockMkdir).toHaveBeenCalledWith('/output', { recursive: true });
      expect(mockWriteFile).toHaveBeenCalledWith('/output/test.xml', '<xml/>', 'utf8');
      expect(result).toBe('/output/test.xml');
    });

    it('remote sftp path calls remoteFileService.writeFile', async () => {
      remoteFileService.isRemote.mockReturnValue(true);
      remoteFileService.writeFile.mockResolvedValue();

      const result = await xmlGenerator.saveXML('<xml/>', 'sftp://host/xml', 'test.xml');

      expect(remoteFileService.writeFile).toHaveBeenCalledWith('sftp://host/xml/test.xml', '<xml/>');
      expect(result).toBe('sftp://host/xml/test.xml');
    });

    it('remote ftp path calls remoteFileService.writeFile', async () => {
      remoteFileService.isRemote.mockReturnValue(true);
      remoteFileService.writeFile.mockResolvedValue();

      const result = await xmlGenerator.saveXML('<xml/>', 'ftp://host/xml', 'test.xml');

      expect(remoteFileService.writeFile).toHaveBeenCalledWith('ftp://host/xml/test.xml', '<xml/>');
      expect(result).toBe('ftp://host/xml/test.xml');
    });

    it('throws if fs.writeFile fails', async () => {
      mockWriteFile.mockRejectedValue(new Error('disk full'));

      await expect(xmlGenerator.saveXML('<xml/>', '/output', 'test.xml')).rejects.toThrow('disk full');
    });
  });

  describe('processAndGenerateXML', () => {
    const bank = { code: 'BNK', xml_output_url: '/xml/output' };

    it('orchestrates generateXML + generateFileName + saveXML', async () => {
      jest.spyOn(xmlGenerator, 'generateXML').mockResolvedValue('<xml/>');
      jest.spyOn(xmlGenerator, 'generateFileName').mockReturnValue('ACS_CARDS_BNK_20250101120000.xml');
      jest.spyOn(xmlGenerator, 'saveXML').mockResolvedValue('/xml/output/ACS_CARDS_BNK_20250101120000.xml');

      const result = await xmlGenerator.processAndGenerateXML(
        [{ id: 1, pan: '4741000000000006', phone: '98765432' }], bank
      );

      expect(result).toEqual({
        success: true,
        filePath: '/xml/output/ACS_CARDS_BNK_20250101120000.xml',
        fileName: 'ACS_CARDS_BNK_20250101120000.xml',
        xmlEntriesCount: 2
      });
    });

    it('xmlEntriesCount = records.length * 2', async () => {
      jest.spyOn(xmlGenerator, 'generateXML').mockResolvedValue('<xml/>');
      jest.spyOn(xmlGenerator, 'generateFileName').mockReturnValue('test.xml');
      jest.spyOn(xmlGenerator, 'saveXML').mockResolvedValue('/path/test.xml');

      const result = await xmlGenerator.processAndGenerateXML(
        [{ id: 1 }, { id: 2 }, { id: 3 }], bank
      );

      expect(result.xmlEntriesCount).toBe(6);
    });

    it('throws when generateXML fails', async () => {
      jest.spyOn(xmlGenerator, 'generateXML').mockRejectedValue(new Error('generation failed'));

      await expect(xmlGenerator.processAndGenerateXML(
        [{ id: 1, pan: '4741000000000006', phone: '98765432' }], bank
      )).rejects.toThrow('generation failed');
    });
  });
});
