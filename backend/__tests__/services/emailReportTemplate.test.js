const { generateReportHtml } = require('../../services/emailReportTemplate');

describe('emailReportTemplate', () => {
  describe('generateReportHtml', () => {
    const baseStats = {
      date: '2026-05-21',
      files: { totalFiles: 5 },
      csv: {
        totalRecords: 120,
        enrollmentSuccess: 100,
        enrollmentError: 15,
        enrollmentPending: 5
      },
      xml: { totalXml: 3 }
    };

    it('returns a string that starts with <!DOCTYPE html>', () => {
      const html = generateReportHtml('Banque Test', baseStats);
      expect(html.trim()).toMatch(/^<!DOCTYPE html>/);
    });

    it('contains the bank name in the body', () => {
      const html = generateReportHtml('BNP Paribas', baseStats);
      expect(html).toContain('BNP Paribas');
    });

    it('contains "Rapport Quotidien ACS" in the header', () => {
      const html = generateReportHtml('Test Bank', baseStats);
      expect(html).toContain('Rapport Quotidien ACS');
    });

    it('contains formatted French date with "mai" for May', () => {
      const html = generateReportHtml('Test Bank', baseStats);
      expect(html).toContain('mai');
    });

    it('contains stat values for files.totalFiles and csv.totalRecords', () => {
      const html = generateReportHtml('Test Bank', baseStats);
      expect(html).toContain('5');
      expect(html).toContain('120');
    });

    it('contains enrollment stats: success, error, pending values', () => {
      const html = generateReportHtml('Test Bank', baseStats);
      expect(html).toContain('100');
      expect(html).toContain('15');
      expect(html).toContain('5');
    });

    it('contains XML total', () => {
      const html = generateReportHtml('Test Bank', baseStats);
      expect(html).toContain('3');
    });

    it('has footer text about automatic generation', () => {
      const html = generateReportHtml('Test Bank', baseStats);
      expect(html).toContain('généré automatiquement');
      expect(html).toContain('Ne pas répondre');
    });

    it('handles stats with zero values correctly', () => {
      const zeroStats = {
        date: '2026-01-01',
        files: { totalFiles: 0 },
        csv: {
          totalRecords: 0,
          enrollmentSuccess: 0,
          enrollmentError: 0,
          enrollmentPending: 0
        },
        xml: { totalXml: 0 }
      };
      const html = generateReportHtml('Zero Bank', zeroStats);
      expect(html).toContain('0');
      expect(html).toContain('Zero Bank');
    });

    it('displays bank name with special characters correctly', () => {
      const html = generateReportHtml('Caisse d\'Épargne & Crédit Agricole', baseStats);
      expect(html).toContain('Caisse');
      expect(html).toContain('Épargne');
      expect(html).toContain('Crédit Agricole');
    });
  });
});
