import { parseCsvRows, splitCsvLine, maskPan, isBlockingError, isDuplicateError, isRowEmpty } from '../csvRows';

describe('csvRows', () => {
  it('reads rows like the server: BOM, header aliases, numbering and blank lines', () => {
    const rows = parseCsvRows('﻿language;prenom;nom;PAN;expiry;telephone;behaviour;action\r\nfr;Ali;Ben;4111111111111111;12/28;21612345678;otp;update\r\n\r\nar;Sami;Tr;5555555555554444;06/29;21698765432;sms;create\n');
    expect(rows.size).toBe(3);
    expect(rows.get(1)).toMatchObject({ rowNumber: 1, language: 'fr', firstName: 'Ali', lastName: 'Ben', pan: '4111111111111111', phone: '21612345678' });
    expect(isRowEmpty(rows.get(2))).toBe(true);
    expect(rows.get(3)).toMatchObject({ rowNumber: 3, behaviour: 'sms', action: 'create' });
  });

  it('keeps separators inside quotes', () => {
    expect(splitCsvLine('fr;"Ben; Ali";"a ""b"""')).toEqual(['fr', 'Ben; Ali', 'a "b"']);
  });

  it('masks a PAN like the server', () => {
    expect(maskPan('4111111111111111')).toBe('************1111');
    expect(maskPan('************1111')).toBe('************1111');
    expect(maskPan('123')).toBe('123');
  });

  it('only duplicates and errors block a row', () => {
    const luhn = { fieldName: 'pan', severity: 'warning', errorMessage: 'PAN invalide (échec de la validation Luhn)' };
    const dup = { fieldName: 'pan', severity: 'warning', code: 'DUPLICATE_PAN', errorMessage: 'PAN en double' };
    expect(isBlockingError(luhn)).toBe(false);
    expect(isDuplicateError(luhn)).toBe(false);
    expect(isBlockingError(dup)).toBe(true);
    expect(isBlockingError({ fieldName: 'expiry', severity: 'error' })).toBe(true);
  });
});
