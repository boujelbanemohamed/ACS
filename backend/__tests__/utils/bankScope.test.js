const {
  isBankScoped, canAccessBank, effectiveBankId, redactUrlCredentials, redactBankUrls, restoreRedactedUrl
} = require('../../utils/bankScope');

describe('bankScope', () => {
  const superAdmin = { role: 'super_admin', bank_id: null };
  const bankAdmin = { role: 'bank_admin', bank_id: 3 };
  const bankUser = { role: 'bank', bank_id: 3 };
  const orphan = { role: 'bank', bank_id: null };
  const unknownRole = { role: 'admin', bank_id: null };

  it('only super_admin is unrestricted (unknown roles are restricted)', () => {
    expect(isBankScoped(superAdmin)).toBe(false);
    expect(isBankScoped(bankAdmin)).toBe(true);
    expect(isBankScoped(bankUser)).toBe(true);
    expect(isBankScoped(unknownRole)).toBe(true);
  });

  it('canAccessBank compares the user bank (bank_admin included)', () => {
    expect(canAccessBank(superAdmin, 99)).toBe(true);
    expect(canAccessBank(bankAdmin, 3)).toBe(true);
    expect(canAccessBank(bankAdmin, '3')).toBe(true);
    expect(canAccessBank(bankAdmin, 4)).toBe(false);
    expect(canAccessBank(bankUser, 4)).toBe(false);
    expect(canAccessBank(orphan, 3)).toBe(false);
    expect(canAccessBank(undefined, 3)).toBe(false);
  });

  it('effectiveBankId ignores the requested bank for restricted users', () => {
    expect(effectiveBankId(superAdmin, '7')).toBe(7);
    expect(effectiveBankId(superAdmin, undefined)).toBeNull();
    expect(effectiveBankId(bankAdmin, '7')).toBe(3);
    expect(effectiveBankId(orphan, '7')).toBe(-1);
  });

  it('redacts passwords embedded in URLs', () => {
    expect(redactUrlCredentials('sftp://user:s3cr3t@host:22/in')).toBe('sftp://user:***@host:22/in');
    expect(redactUrlCredentials('ftp://user@host/in')).toBe('ftp://user@host/in');
    expect(redactUrlCredentials('/data/banks/BT')).toBe('/data/banks/BT');
    expect(redactUrlCredentials(null)).toBeNull();
  });

  it('redacts every URL column of a bank / file log row', () => {
    const row = redactBankUrls({
      id: 1,
      source_url: 'sftp://u:p1@h/in',
      destination_url: 'sftp://u:p2@h/out',
      original_path: 'sftp://u:p3@h/in/file.csv',
      xml_file_path: 'sftp://u:p4@h/xml/a.xml',
      name: 'Bank'
    });
    expect(JSON.stringify(row)).not.toMatch(/p[1-4]@/);
    expect(row.name).toBe('Bank');
  });

  it('restoreRedactedUrl keeps the stored password when the masked URL is sent back', () => {
    const stored = 'sftp://user:s3cr3t@host/in';
    expect(restoreRedactedUrl('sftp://user:***@host/in', stored)).toBe(stored);
    // URL réellement modifiée : la nouvelle valeur est conservée
    expect(restoreRedactedUrl('sftp://user:***@other/in', stored)).toBe('sftp://user:***@other/in');
    expect(restoreRedactedUrl('sftp://user:new@host/in', stored)).toBe('sftp://user:new@host/in');
    expect(restoreRedactedUrl(undefined, stored)).toBeUndefined();
  });
});
