const { checkPassword, isPasswordExpired, rateLimitDisabled } = require('../../utils/passwordPolicy');

describe('passwordPolicy', () => {
  it('accepts a compliant password', () => {
    expect(checkPassword('Admin@123')).toBeNull();
  });

  it.each([
    [undefined, 'requis'],
    ['', 'requis'],
    ['Ab1!', 'au moins 8'],
    ['A'.repeat(120) + 'a1!aaaaaaaa', 'trop long'],
    ['alllowercase1!', 'majuscule'],
    ['ALLUPPERCASE1!', 'minuscule'],
    ['NoDigitsHere!', 'chiffre'],
    ['NoSpecial123', 'spécial']
  ])('rejects %p', (password, message) => {
    expect(checkPassword(password)).toContain(message);
  });

  it('detects an expired password', () => {
    expect(isPasswordExpired({ password_changed_at: new Date(Date.now() - 91 * 86400000) })).toBe(true);
    expect(isPasswordExpired({ password_changed_at: new Date() })).toBe(false);
    expect(isPasswordExpired({ password_changed_at: null })).toBe(false);
    expect(isPasswordExpired(null)).toBe(false);
  });

  it('rate limits are disabled in tests unless explicitly enabled', () => {
    expect(rateLimitDisabled()).toBe(true);
    process.env.ENABLE_RATE_LIMIT_IN_TESTS = 'true';
    expect(rateLimitDisabled()).toBe(false);
    delete process.env.ENABLE_RATE_LIMIT_IN_TESTS;
  });
});
