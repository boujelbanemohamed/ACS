const dns = require('dns');

const lookupMap = {
  'public.example.com': [{ address: '93.184.216.34', family: 4 }],
  'rebind.example.com': [{ address: '10.1.2.3', family: 4 }],
  'mixed.example.com': [{ address: '93.184.216.34', family: 4 }, { address: '127.0.0.1', family: 4 }],
  'api.bank.internal': [{ address: '10.0.0.8', family: 4 }]
};

jest.spyOn(dns.promises, 'lookup').mockImplementation(async (host) => {
  if (lookupMap[host]) return lookupMap[host];
  throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' });
});

const { assertSafeUrl, isSafeUrl, isPrivateAddress, isAllowlistedUrl, safeLookup, safeAxiosOptions } = require('../../utils/urlSafety');

describe('urlSafety', () => {
  afterEach(() => {
    delete process.env.ALLOWED_API_DOMAINS;
    delete process.env.ALLOW_PRIVATE_URLS;
  });

  it('detects private, loopback, link-local and mapped addresses', () => {
    ['127.0.0.1', '10.0.0.1', '172.16.5.4', '192.168.1.1', '169.254.169.254', '0.0.0.0', '::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1']
      .forEach(ip => expect(isPrivateAddress(ip)).toBe(true));
    ['93.184.216.34', '8.8.8.8', '2606:4700::1111'].forEach(ip => expect(isPrivateAddress(ip)).toBe(false));
  });

  it('accepts a public host', async () => {
    await expect(assertSafeUrl('https://public.example.com/data')).resolves.toBeDefined();
  });

  it('refuses internal targets whatever their notation', async () => {
    const urls = [
      'http://localhost:6379/',
      'http://127.0.0.1/',
      'http://169.254.169.254/latest/meta-data',
      'http://[::1]/',
      'http://[::ffff:127.0.0.1]/',
      'http://0177.0.0.1/',
      'http://2130706433/',
      'http://rebind.example.com/',
      'http://mixed.example.com/'
    ];
    for (const url of urls) {
      await expect(isSafeUrl(url)).resolves.toBe(false);
    }
  });

  it('refuses unknown hosts, invalid URLs and forbidden protocols', async () => {
    await expect(assertSafeUrl('http://does-not-exist.example')).rejects.toThrow('introuvable');
    await expect(assertSafeUrl('not a url')).rejects.toThrow('URL invalide');
    await expect(assertSafeUrl('file:///etc/passwd')).rejects.toThrow('Protocole');
    await expect(assertSafeUrl('sftp://public.example.com/in')).rejects.toThrow('Protocole');
    await expect(assertSafeUrl('sftp://public.example.com/in', { protocols: ['sftp'] })).resolves.toBeDefined();
  });

  it('ALLOWED_API_DOMAINS: only listed domains, which may be internal', async () => {
    process.env.ALLOWED_API_DOMAINS = 'bank.internal';
    await expect(assertSafeUrl('https://api.bank.internal/cards')).resolves.toBeDefined();
    await expect(assertSafeUrl('https://public.example.com/')).rejects.toThrow('Domaine non autorisé');
    expect(isAllowlistedUrl('https://api.bank.internal/x')).toBe(true);
    expect(isAllowlistedUrl('https://evilbank.internal.attacker.com/x')).toBe(false);
  });

  it('ALLOW_PRIVATE_URLS=true lifts the private network restriction', async () => {
    process.env.ALLOW_PRIVATE_URLS = 'true';
    await expect(assertSafeUrl('http://127.0.0.1/')).resolves.toBeDefined();
  });

  it('safeLookup refuses a name resolving to an internal address at connection time', (done) => {
    const spy = jest.spyOn(dns, 'lookup').mockImplementation((host, opts, cb) => cb(null, [{ address: '10.0.0.1', family: 4 }]));
    safeLookup('rebind.example.com', {}, (err) => {
      expect(err).toBeTruthy();
      expect(err.message).toContain('interne');
      spy.mockRestore();
      done();
    });
  });

  it('safeLookup returns the address of a public host', (done) => {
    const spy = jest.spyOn(dns, 'lookup').mockImplementation((host, opts, cb) => cb(null, [{ address: '93.184.216.34', family: 4 }]));
    safeLookup('public.example.com', {}, (err, address, family) => {
      expect(err).toBeNull();
      expect(address).toBe('93.184.216.34');
      expect(family).toBe(4);
      spy.mockRestore();
      done();
    });
  });

  it('safeAxiosOptions disables redirects and limits the response size', () => {
    const options = safeAxiosOptions({ maxContentLength: 1000 });
    expect(options.maxRedirects).toBe(0);
    expect(options.maxContentLength).toBe(1000);
    expect(options.httpAgent).toBeDefined();
    expect(options.httpsAgent).toBeDefined();
    expect(safeAxiosOptions({ allowPrivate: true }).httpAgent).toBeUndefined();
  });
});
