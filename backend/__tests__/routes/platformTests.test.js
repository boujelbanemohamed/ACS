const express = require('express');
const request = require('supertest');

const platformTests = require('../../routes/platformTests');

const app = () => {
  const a = express();
  a.use(express.json());
  a.use('/api/platform-tests', platformTests);
  return a;
};

describe('Platform tests routes', () => {
  it('GET /report returns 404 before any finished run', async () => {
    const res = await request(app()).get('/api/platform-tests/report');
    expect(res.status).toBe(404);
  });

  it('GET /raw-output returns 404 without a current run', async () => {
    const res = await request(app()).get('/api/platform-tests/raw-output?phase=0');
    expect(res.status).toBe(404);
  });

  it('POST /retry-failed returns 404 without a current run', async () => {
    const res = await request(app()).post('/api/platform-tests/retry-failed');
    expect(res.status).toBe(404);
  });

  it('GET /status reports that nothing is running', async () => {
    const res = await request(app()).get('/api/platform-tests/status');
    expect(res.body.data.isRunning).toBe(false);
  });
});
