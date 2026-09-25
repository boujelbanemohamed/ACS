let mockMkdir, mockWriteFile, mockAccess, mockUnlink, mockRename;
jest.mock('fs', () => {
  mockMkdir = jest.fn().mockResolvedValue();
  mockWriteFile = jest.fn().mockResolvedValue();
  mockAccess = jest.fn();
  mockUnlink = jest.fn().mockResolvedValue();
  mockRename = jest.fn().mockResolvedValue();
  return {
    promises: { mkdir: mockMkdir, writeFile: mockWriteFile, access: mockAccess, unlink: mockUnlink, rename: mockRename }
  };
});
jest.mock('../../config/database');
jest.mock('../../utils/remoteFileService', () => ({
  isRemote: jest.fn(),
  writeFile: jest.fn(),
  exists: jest.fn(),
  moveFile: jest.fn(),
  deleteFile: jest.fn()
}));

const enoent = () => Object.assign(new Error('not found'), { code: 'ENOENT' });

const db = require('../../config/database');
const remoteFileService = require('../../utils/remoteFileService');
const xmlGenerator = require('../../services/xmlGenerator');

describe('XMLGenerator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockReset();
    remoteFileService.isRemote.mockReset();
    remoteFileService.writeFile.mockReset();
    remoteFileService.exists.mockReset().mockResolvedValue(false);
    remoteFileService.moveFile.mockReset().mockResolvedValue();
    mockWriteFile.mockReset().mockResolvedValue();
    mockAccess.mockReset().mockRejectedValue(enoent());
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

    it('propagates DB errors instead of using an identifier outside the sequence', async () => {
      db.query.mockRejectedValue(new Error('connection refused'));

      await expect(xmlGenerator.getNextId(10)).rejects.toThrow('connection refused');
    });

    it('throws when the sequence row is missing', async () => {
      db.query.mockResolvedValue({ rows: [] });

      await expect(xmlGenerator.getNextId(2)).rejects.toThrow('xml_id_sequence');
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

    it('skips records with missing/invalid PAN and reserves ids only for kept cards', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ last_id: '11' }] });

      const badRecords = [
        { id: 1, pan: '4741000000000006', phone: '98765432' },
        { id: 2, pan: '', phone: '12345678' },
        { id: 3, pan: '123', phone: '87654321' }
      ];
      const doc = await xmlGenerator.generateXMLDocument(badRecords, bankCode);

      expect(doc.xmlContent.match(/<add /g)).toHaveLength(1);
      expect(doc.entriesCount).toBe(2);
      expect(doc.skipped.map(s => s.recordId)).toEqual([2, 3]);
      // 2 identifiants réservés (1 carte retenue), pas 6
      expect(db.query.mock.calls[0][1]).toEqual([2]);
    });

    it('escapes the profile id in XML attributes', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ last_id: '2' }] });

      const xml = await xmlGenerator.generateXML([{ id: 1, pan: '4741000000000006', phone: '98765432' }], 'A"B<C');

      expect(xml).toContain('profileId="A&quot;B&lt;C"');
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
    it('local path: writes a temporary file then renames it (atomic), returns filePath', async () => {
      const result = await xmlGenerator.saveXML('<xml/>', '/output', 'test.xml');

      expect(mockMkdir).toHaveBeenCalledWith('/output', { recursive: true });
      expect(mockWriteFile).toHaveBeenCalledWith('/output/test.xml.tmp', '<xml/>', { encoding: 'latin1', flag: 'wx' });
      expect(mockRename).toHaveBeenCalledWith('/output/test.xml.tmp', '/output/test.xml');
      expect(result).toBe('/output/test.xml');
    });

    it('local path: never overwrites an existing XML file', async () => {
      mockAccess.mockReset()
        .mockResolvedValueOnce()              // test.xml existe déjà
        .mockRejectedValueOnce(enoent());     // test_1.xml est libre

      const result = await xmlGenerator.saveXML('<xml/>', '/output', 'test.xml');

      expect(result).toBe('/output/test_1.xml');
      expect(mockUnlink).toHaveBeenCalledWith('/output/test.xml.tmp');
      expect(mockRename).toHaveBeenCalledWith('/output/test_1.xml.tmp', '/output/test_1.xml');
    });

    it('local path: skips a name reserved concurrently by another job (EEXIST)', async () => {
      mockWriteFile.mockReset()
        .mockRejectedValueOnce(Object.assign(new Error('exists'), { code: 'EEXIST' }))
        .mockResolvedValueOnce();

      const result = await xmlGenerator.saveXML('<xml/>', '/output', 'test.xml');

      expect(result).toBe('/output/test_1.xml');
    });

    it('remote sftp path writes a temporary file then moves it', async () => {
      remoteFileService.isRemote.mockReturnValue(true);
      remoteFileService.writeFile.mockResolvedValue();

      const result = await xmlGenerator.saveXML('<xml/>', 'sftp://host/xml', 'test.xml');

      expect(remoteFileService.writeFile).toHaveBeenCalledWith('sftp://host/xml/test.xml.tmp', '<xml/>');
      expect(remoteFileService.moveFile).toHaveBeenCalledWith('sftp://host/xml/test.xml.tmp', 'sftp://host/xml/test.xml');
      expect(result).toBe('sftp://host/xml/test.xml');
    });

    it('remote ftp path picks a free name when the file already exists', async () => {
      remoteFileService.isRemote.mockReturnValue(true);
      remoteFileService.writeFile.mockResolvedValue();
      remoteFileService.exists.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

      const result = await xmlGenerator.saveXML('<xml/>', 'ftp://host/xml', 'test.xml');

      expect(result).toBe('ftp://host/xml/test_1.xml');
    });

    it('throws if fs.writeFile fails', async () => {
      mockWriteFile.mockRejectedValue(new Error('disk full'));

      await expect(xmlGenerator.saveXML('<xml/>', '/output', 'test.xml')).rejects.toThrow('disk full');
    });
  });

  describe('processAndGenerateXML', () => {
    const bank = { code: 'BNK', xml_output_url: '/xml/output' };

    it('orchestrates generation and save, and counts only the cards written', async () => {
      jest.spyOn(xmlGenerator, 'generateXMLDocument').mockResolvedValue({ xmlContent: '<xml/>', entriesCount: 4, recordsCount: 2, skipped: [{ recordId: 3 }] });
      jest.spyOn(xmlGenerator, 'generateFileName').mockReturnValue('ACS_CARDS_BNK_20250101120000.xml');
      jest.spyOn(xmlGenerator, 'saveXMLFile').mockResolvedValue({ filePath: '/xml/output/ACS_CARDS_BNK_20250101120000.xml', fileName: 'ACS_CARDS_BNK_20250101120000.xml' });

      const result = await xmlGenerator.processAndGenerateXML([{ id: 1 }, { id: 2 }, { id: 3 }], bank);

      expect(result).toEqual({
        success: true,
        filePath: '/xml/output/ACS_CARDS_BNK_20250101120000.xml',
        fileName: 'ACS_CARDS_BNK_20250101120000.xml',
        xmlEntriesCount: 4,
        recordsCount: 2,
        skipped: [{ recordId: 3 }]
      });
      expect(xmlGenerator.saveXMLFile).toHaveBeenCalledWith('<xml/>', '/xml/output', 'ACS_CARDS_BNK_20250101120000.xml');
    });

    it('writes no file when no card is usable', async () => {
      jest.spyOn(xmlGenerator, 'generateXMLDocument').mockResolvedValue({ xmlContent: '<x/>', entriesCount: 0, recordsCount: 0, skipped: [{ recordId: 1 }] });
      const saveSpy = jest.spyOn(xmlGenerator, 'saveXMLFile');

      const result = await xmlGenerator.processAndGenerateXML([{ id: 1 }], bank);

      expect(result.success).toBe(false);
      expect(result.xmlEntriesCount).toBe(0);
      expect(saveSpy).not.toHaveBeenCalled();
    });

    it('throws when generation fails', async () => {
      jest.spyOn(xmlGenerator, 'generateXMLDocument').mockRejectedValue(new Error('generation failed'));
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      await expect(xmlGenerator.processAndGenerateXML(
        [{ id: 1, pan: '4741000000000006', phone: '98765432' }], bank
      )).rejects.toThrow('generation failed');
      errorSpy.mockRestore();
    });

    afterEach(() => jest.restoreAllMocks());
  });
});
