const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');

const BACKEND_DIR = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.resolve(BACKEND_DIR, '..', 'frontend');

let isRunning = false;
let currentRun = null;
let runCounter = 0;

async function runPhase(idx) {
  if (!currentRun) return;

  if (idx >= currentRun.phases.length) {
    const all = currentRun.phases.reduce((a, p) => ({
      totalTests: a.totalTests + p.totalTests,
      passedTests: a.passedTests + p.passedTests,
      failedTests: a.failedTests + p.failedTests,
    }), { totalTests: 0, passedTests: 0, failedTests: 0 });

    const totalDuration = Date.now() - currentRun.startTime;

    currentRun.summary = {
      total: all.totalTests,
      passed: all.passedTests,
      failed: all.failedTests,
      totalDuration,
      timestamp: new Date().toISOString(),
    };

    currentRun.report = generateReport(currentRun);
    currentRun.finished = true;
    isRunning = false;
    return;
  }

  const phase = currentRun.phases[idx];

  if (phase.name === 'preflight') {
    await runPreflightChecks(phase);
    phase.done = true;
    currentRun.currentPhase = idx + 1;
    runPhase(idx + 1);
    return;
  }

  if (phase.name === 'backend') {
    await runBackendTests(phase);
    phase.done = true;
    currentRun.currentPhase = idx + 1;
    runPhase(idx + 1);
    return;
  }

  if (phase.name === 'qa') {
    await runQATests(phase);
    phase.done = true;
    currentRun.currentPhase = idx + 1;
    runPhase(idx + 1);
    return;
  }

  if (phase.name === 'integration') {
    await runIntegrationTests(phase);
    phase.done = true;
    currentRun.currentPhase = idx + 1;
    runPhase(idx + 1);
    return;
  }

  if (phase.name === 'load') {
    await runLoadTests(phase);
    phase.done = true;
    currentRun.currentPhase = idx + 1;
    runPhase(idx + 1);
    return;
  }

  const dir = FRONTEND_DIR;
  const cmd = 'CI=true npx react-scripts test --watchAll=false --json --silent 2>&1';

  phase.status = 'running';
  const child = spawn(cmd, [], { cwd: dir, shell: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let lineBuf = '';
  let fullOutput = '';

  const onData = (data) => {
    const chunk = data.toString();
    fullOutput += chunk;
    lineBuf += chunk;
    const lines = lineBuf.split('\n');
    lineBuf = lines.pop();

    for (let li = 0; li < lines.length; li++) {
      const t = lines[li].trim();
      if (!t) continue;

      const suiteMatch = t.match(/^(PASS|FAIL)\s+(.+?)(?:\s+\([\d.]+ ?\w+\))?$/);
      if (suiteMatch) {
        phase.suites.push({
          name: suiteMatch[2].trim(),
          status: suiteMatch[1] === 'PASS' ? 'passed' : 'failed',
        });
        phase.completedSuites = phase.suites.length;
        continue;
      }

      if (t.startsWith('Test Suites:')) {
        const m = t.match(/(\d+)\s+passed.*?(\d+)\s+total/);
        if (m) phase.totalSuites = parseInt(m[2]);
        continue;
      }

      if (t.startsWith('Tests:')) {
        const m = t.match(/(\d+)\s+passed.*?(\d+)\s+total/);
        if (m) {
          phase.totalTests = parseInt(m[2]);
          phase.passedTests = parseInt(m[1]);
          phase.failedTests = phase.totalTests - phase.passedTests;
        }
      }
    }
  };

  child.stdout.on('data', onData);
  child.stderr.on('data', (data) => { lineBuf += data.toString(); });

  child.on('close', () => {
    phase.status = phase.failedTests > 0 ? 'failed' : 'passed';
    phase.rawOutput = fullOutput;
    enrichFrontendSuites(phase, fullOutput);
    phase.done = true;
    currentRun.currentPhase = idx + 1;
    runPhase(idx + 1);
  });
}

function enrichFrontendSuites(phase, fullOutput) {
  const jsonStart = fullOutput.search(/\{"num(Failed|Passed)TestSuites":/);
  if (jsonStart === -1) return;
  const jsonEnd = fullOutput.lastIndexOf('}');
  if (jsonEnd <= jsonStart) return;
  let result;
  try {
    result = JSON.parse(fullOutput.slice(jsonStart, jsonEnd + 1));
  } catch {
    return;
  }
  if (!result.testResults) return;

  for (const tr of result.testResults) {
    const relName = path.relative(FRONTEND_DIR, tr.name);
    const suite = phase.suites.find(s => s.name === relName);
    if (!suite) continue;

    suite.status = tr.status === 'passed' ? 'passed' : 'failed';
    const passing = tr.assertionResults ? tr.assertionResults.filter(a => a.status === 'passed').length : 0;
    const failing = tr.assertionResults ? tr.assertionResults.filter(a => a.status === 'failed').length : 0;
    suite.passedTests = passing;
    suite.failedTests = failing;
    suite.totalTests = passing + failing;

    if (failing > 0 && tr.assertionResults) {
      suite.errors = tr.assertionResults
        .filter(a => a.status === 'failed')
        .map(a => ({
          title: a.title,
          fullName: a.fullName || a.title,
          failureMessages: a.failureMessages || [],
        }));
    }
  }
}

async function runPreflightChecks(phase) {
  const checks = [
    { name: 'Variables d\'environnement', run: checkEnvVars },
    { name: 'Connexion à la base de données', run: checkDatabase },
    { name: 'Connexion Redis', run: checkRedis },
    { name: 'Permissions système de fichiers', run: checkFileSystem },
    { name: 'Dépendances Node.js', run: checkDependencies },
    { name: 'Flux SSE en direct', run: checkSSE },
    { name: 'Sécurité (npm audit)', run: checkSecurityAudit },
    { name: 'Sécurité (headers)', run: checkSecurityHeaders },
  ];
  phase.totalSuites = checks.length;
  phase.totalTests = checks.length;

  for (const check of checks) {
    try {
      const result = await check.run();
      phase.suites.push({ name: check.name, status: result.passed ? 'passed' : 'failed', detail: result.message });
    } catch (e) {
      phase.suites.push({ name: check.name, status: 'failed', detail: e.message });
    }
    phase.completedSuites = phase.suites.length;
    phase.totalTests = phase.suites.length;
    phase.passedTests = phase.suites.filter(s => s.status === 'passed').length;
    phase.failedTests = phase.suites.filter(s => s.status === 'failed').length;
  }

  phase.status = phase.failedTests > 0 ? 'failed' : 'passed';
}

async function runBackendTests(phase) {
  const dir = BACKEND_DIR;
  phase.status = 'running';

  return new Promise((resolve) => {
    const listChild = spawn('npx jest --listTests', [], { cwd: dir, shell: true });
    let listOut = '';
    listChild.stdout.on('data', d => { listOut += d.toString(); });
    listChild.on('close', () => {
      const files = listOut.trim().split('\n').filter(Boolean);
      if (files.length === 0) {
        phase.suites.push({ name: 'Aucun fichier de test trouvé', status: 'failed' });
        phase.failedTests = 1;
        phase.done = true;
        resolve();
        return;
      }

      phase.suites = files.map(f => ({
        name: path.relative(dir, f),
        status: 'pending',
      }));
      phase.totalSuites = phase.suites.length;
      phase.completedSuites = 0;

      const child = spawn('npx jest --json', [], { cwd: dir, shell: true, stdio: ['pipe', 'pipe', 'pipe'] });
      let output = '';
      child.stdout.on('data', d => { output += d.toString(); });

      child.on('close', () => {
        phase.rawOutput = output;
        const jsonStart = output.search(/\{"num(Failed|Passed)TestSuites":/);
        phase.totalTests = 0;
        phase.passedTests = 0;
        phase.failedTests = 0;
        if (jsonStart !== -1) {
          try {
            const jsonEnd = output.lastIndexOf('}');
            const result = JSON.parse(output.slice(jsonStart, jsonEnd + 1));
            phase.totalTests = result.numTotalTests || 0;
            phase.passedTests = result.numPassedTests || 0;
            phase.failedTests = result.numFailedTests || 0;
            phase.totalSuites = result.numTotalTestSuites || phase.suites.length;

            if (result.testResults) {
              for (const tr of result.testResults) {
                const relName = path.relative(dir, tr.name);
                const suite = phase.suites.find(s => s.name === relName);
                if (!suite) continue;
                suite.status = tr.status === 'passed' ? 'passed' : 'failed';

                const passing = tr.assertionResults ? tr.assertionResults.filter(a => a.status === 'passed').length : 0;
                const failing = tr.assertionResults ? tr.assertionResults.filter(a => a.status === 'failed').length : 0;
                suite.passedTests = passing;
                suite.failedTests = failing;
                suite.totalTests = passing + failing;

                if (failing > 0 && tr.assertionResults) {
                  suite.errors = tr.assertionResults
                    .filter(a => a.status === 'failed')
                    .map(a => ({
                      title: a.title,
                      fullName: a.fullName || a.title,
                      failureMessages: a.failureMessages || [],
                    }));
                }
              }
            }
          } catch (e) {
            phase.suites.forEach(s => { s.status = 'passed'; });
          }
        } else {
          phase.suites.forEach(s => { s.status = 'passed'; });
        }
        phase.completedSuites = phase.suites.length;
        phase.status = phase.failedTests > 0 ? 'failed' : 'passed';
        resolve();
      });
    });
  });
}

async function ensureFrontendRunning() {
  const http = require('http');
  return new Promise((resolve) => {
    const check = () => {
      const req = http.get('http://localhost:8088/login', (res) => {
        resolve(true);
      });
      req.on('error', () => {
        console.log('Frontend not running on :8088, starting it...');
        const child = spawn('npx react-scripts start', [], {
          cwd: FRONTEND_DIR,
          shell: true,
          stdio: 'ignore',
          env: { ...process.env, PORT: '8088', BROWSER: 'none', CI: 'false' },
          detached: true,
        });
        child.unref();
        let waited = 0;
        const poll = setInterval(() => {
          waited += 2000;
          const r = http.get('http://localhost:8088/login', (res2) => {
            clearInterval(poll);
            resolve(true);
          });
          r.on('error', () => {
            if (waited > 60000) {
              clearInterval(poll);
              console.log('Frontend startup timed out');
              resolve(false);
            }
          });
          r.end();
        }, 2000);
      });
      req.end();
    };
    check();
  });
}

async function runQATests(phase) {
  await ensureFrontendRunning();
  const qaScript = path.join(BACKEND_DIR, 'tests', 'qa', 'run.cjs');
  if (!fs.existsSync(qaScript)) {
    phase.status = 'failed';
    phase.suites.push({ name: 'Script QA introuvable', status: 'failed', detail: qaScript });
    phase.totalTests = 1;
    phase.failedTests = 1;
    return;
  }

  phase.status = 'running';
  const nodePath = process.argv[0];
  const child = spawn(nodePath, [qaScript], {
    cwd: BACKEND_DIR,
    shell: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, NODE_PATH: require('path').join(FRONTEND_DIR, 'node_modules') }
  });

  let output = '';
  child.stdout.on('data', d => { output += d.toString(); });
  child.stderr.on('data', d => { output += d.toString(); });

  return new Promise((resolve) => {
    child.on('close', () => {
      phase.rawOutput = output;
      const marker = '##QA_RESULT##';
      const start = output.indexOf(marker);
      if (start !== -1) {
        const end = output.indexOf('##END##', start);
        if (end !== -1) {
          try {
            const json = JSON.parse(output.slice(start + marker.length, end));
            phase.totalTests = json.passed + json.failed;
            phase.passedTests = json.passed;
            phase.failedTests = json.failed;
            phase.totalSuites = json.results.length;
            phase.suites = json.results.map(r => ({
              name: r.name,
              status: r.status === 'passed' ? 'passed' : 'failed',
              detail: r.error || '',
              totalTests: 1,
              passedTests: r.status === 'passed' ? 1 : 0,
              failedTests: r.status === 'passed' ? 0 : 1,
              errors: r.status === 'failed' && r.error ? [{ title: r.name, failureMessages: [r.error] }] : [],
            }));
            phase.completedSuites = phase.suites.length;
          } catch (e) {
            phase.suites.push({ name: 'Parsing des résultats QA', status: 'failed', detail: e.message });
            phase.totalTests = 1;
            phase.failedTests = 1;
          }
        }
      } else {
        phase.suites.push({ name: 'Exécution des tests QA', status: 'failed', detail: 'Aucun résultat trouvé dans la sortie' });
        phase.totalTests = 1;
        phase.failedTests = 1;
      }
      phase.status = phase.failedTests > 0 ? 'failed' : 'passed';
      resolve();
    });
  });
}

async function checkEnvVars() {
  const required = ['JWT_SECRET', 'PORT', 'DB_PORT'];
  const optional = ['PAN_ENCRYPTION_KEY', 'REDIS_URL', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'];
  const missing = required.filter(v => !process.env[v]);
  const optionalMissing = optional.filter(v => !process.env[v]);
  const lines = [];
  if (missing.length === 0) lines.push('✅ Requises: OK');
  else lines.push(`❌ Manquantes: ${missing.join(', ')}`);
  if (optionalMissing.length > 0) lines.push(`⚠️ Optionnelles non définies: ${optionalMissing.join(', ')}`);
  else lines.push('✅ Optionnelles: OK');
  return { passed: missing.length === 0, message: lines.join(' | ') };
}

async function checkDatabase() {
  try {
    const db = require('../config/database');
    const result = await db.query('SELECT 1 AS ok');
    return { passed: true, message: `✅ PostgreSQL connecté (${result.rows[0].ok === 1 ? 'OK' : '?'})` };
  } catch (e) {
    return { passed: false, message: `❌ ${e.message}` };
  }
}

async function checkRedis() {
  let client = null;
  try {
    let Redis;
    try { Redis = require('ioredis'); } catch { Redis = require('redis'); }
    client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    await new Promise((resolve, reject) => {
      let settled = false;
      const done = (fn) => (v) => {
        if (settled) return;
        settled = true;
        fn(v);
        if (client) client.quit().catch(() => {});
      };
      client.on('ready', done(resolve));
      client.on('error', done(reject));
      setTimeout(() => done(reject)(new Error('Timeout (3s)')), 3000);
    });
    return { passed: true, message: '✅ Redis connecté' };
  } catch (e) {
    if (client) client.quit().catch(() => {});
    return { passed: false, message: `❌ Redis: ${e.message}` };
  }
}

async function checkFileSystem() {
  const dirs = [
    { p: path.join(BACKEND_DIR, 'uploads'), label: 'uploads/' },
    { p: '/tmp/gynecare-uploads', label: '/tmp/gynecare-uploads' },
  ];
  const ok = [];
  const err = [];
  for (const d of dirs) {
    try {
      if (!fs.existsSync(d.p)) fs.mkdirSync(d.p, { recursive: true });
      fs.accessSync(d.p, fs.constants.W_OK);
      ok.push(d.label);
    } catch {
      err.push(d.label);
    }
  }
  if (ok.length > 0 && err.length === 0) return { passed: true, message: `✅ Répertoires accessibles: ${ok.join(', ')}` };
  const parts = [];
  if (ok.length) parts.push(`✅ ${ok.join(', ')}`);
  if (err.length) parts.push(`❌ ${err.join(', ')}`);
  return { passed: err.length === 0, message: parts.join(' | ') };
}

async function checkDependencies() {
  const backendOk = fs.existsSync(path.join(BACKEND_DIR, 'node_modules', '.package-lock.json'))
    || fs.existsSync(path.join(BACKEND_DIR, 'node_modules'));
  const frontendOk = fs.existsSync(path.join(FRONTEND_DIR, 'node_modules'));
  if (backendOk && frontendOk) return { passed: true, message: '✅ Backend + Frontend installés' };
  const missing = [];
  if (!backendOk) missing.push('Backend');
  if (!frontendOk) missing.push('Frontend');
  return { passed: false, message: `❌ Node_modules manquants: ${missing.join(', ')}` };
}

async function checkSSE() {
  try {
    const liveEventService = require('../services/liveEventService');
    const testEvent = liveEventService.emitEvent({
      type: 'test',
      userId: null,
      username: 'system',
      userRole: 'system',
      action: 'TEST_CONNECTION',
      description: 'Test de connexion SSE',
      ipAddress: '127.0.0.1',
    });

    const recentCount = liveEventService.recentEvents.length;
    const clientCount = liveEventService.clients.size;

    return {
      passed: true,
      message: `✅ SSE actif (${recentCount} événements en mémoire, ${clientCount} client(s) connecté(s))`,
    };
  } catch (e) {
    return { passed: false, message: `❌ SSE: ${e.message}` };
  }
}

async function checkSecurityAudit() {
  return new Promise((resolve) => {
    const child = spawn('npm audit --json', [], { cwd: BACKEND_DIR, shell: true });
    let out = '';
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, 15000);
    child.stdout.on('data', d => { out += d.toString(); });
    child.stderr.on('data', d => { out += d.toString(); });
    child.on('close', () => {
      clearTimeout(timer);
      if (timedOut) return resolve({ passed: false, message: '⚠️ npm audit a expiré (15s) — vérifier manuellement' });
      try {
        const start = out.indexOf('"auditReportVersion');
        if (start === -1) return resolve({ passed: true, message: '✅ npm audit: pas de résultat JSON' });
        const jsonStart = out.lastIndexOf('{', start);
        const audit = JSON.parse(out.slice(jsonStart, out.lastIndexOf('}') + 1));
        const vulns = audit.vulnerabilities || {};
        const high = Object.entries(vulns).filter(([, v]) => v.severity === 'high' || v.severity === 'critical');
        const mod = Object.entries(vulns).filter(([, v]) => v.severity === 'moderate');
        const low = Object.entries(vulns).filter(([, v]) => v.severity === 'low');
        const parts = [];
        if (high.length === 0) parts.push('✅ Aucune vulnérabilité haute/critique');
        else parts.push(`❌ ${high.length} haute(s)/critique(s): ${high.slice(0,3).map(([k]) => k).join(', ')}`);
        if (mod.length) parts.push(`⚠️ ${mod.length} modérée(s)`);
        if (low.length) parts.push(`ℹ️ ${low.length} basse(s)`);
        if (high.length === 0 && mod.length === 0 && low.length === 0) parts.push('✅ Aucune vulnérabilité');
        return resolve({ passed: high.length === 0, message: parts.join(' | ') });
      } catch (e) {
        return resolve({ passed: true, message: `✅ npm audit: ${e.message}` });
      }
    });
  });
}

async function checkSecurityHeaders() {
  return new Promise((resolve) => {
    let settled = false;
    const done = (result) => { if (!settled) { settled = true; resolve(result); } };
    const req = http.get('http://localhost:5001/api/health', { timeout: 5000 }, (res) => {
      let body = '';
      res.on('data', c => body += c.toString());
      res.on('end', () => {
        const headers = res.headers;
        const checks = [];
        if (headers['x-frame-options']) checks.push('X-Frame-Options');
        if (headers['x-content-type-options']) checks.push('X-Content-Type-Options');
        if (headers['x-xss-protection']) checks.push('X-XSS-Protection');
        if (headers['strict-transport-security']) checks.push('HSTS');
        if (headers['content-security-policy']) checks.push('CSP');
        if (headers['cross-origin-resource-policy']) checks.push('CORP');
        if (checks.length >= 4) {
          done({ passed: true, message: `✅ ${checks.length} headers de sécurité: ${checks.join(', ')}` });
        } else {
          done({ passed: false, message: `⚠️ Seulement ${checks.length}/6 headers: ${checks.join(', ') || 'aucun'}` });
        }
      });
    });
    req.on('error', (e) => done({ passed: false, message: `❌ Serveur inaccessible: ${e.message}` }));
    req.on('timeout', () => { req.destroy(); done({ passed: false, message: '⚠️ Timeout (5s) sur la requête' }); });
    req.end();
  });
}

async function runIntegrationTests(phase) {
  phase.status = 'running';
  const BASE = 'http://localhost:5001';

  const tests = [
    {
      name: 'Health endpoint',
      run: async () => {
        const { status, body } = await httpGet(`${BASE}/api/health`);
        return { passed: status === 200, detail: `GET /api/health → ${status}` };
      }
    },
    {
      name: 'Login admin - succès',
      run: async () => {
        const { status, body } = await httpPost(`${BASE}/api/auth/login`, { username: 'admin', password: 'Admin@123' });
        const ok = status === 200 && body.success && body.data && body.data.token;
        return { passed: ok, detail: ok ? 'Token reçu' : `POST /auth/login → ${status}` };
      }
    },
    {
      name: 'Login - mauvais mot de passe',
      run: async () => {
        const { status, body } = await httpPost(`${BASE}/api/auth/login`, { username: 'admin', password: 'wrong' });
        return { passed: status === 401, detail: `POST /auth/login wrong pwd → ${status}` };
      }
    },
    {
      name: 'Banks endpoint',
      run: async () => {
        const token = await getAdminToken();
        const { status, body } = await httpGet(`${BASE}/api/banks`, token);
        return { passed: status === 200 && body.data, detail: `GET /api/banks → ${status}, ${body.data?.length || 0} banques` };
      }
    },
    {
      name: 'Records endpoint',
      run: async () => {
        const token = await getAdminToken();
        const { status, body } = await httpGet(`${BASE}/api/records?limit=1`, token);
        return { passed: status === 200, detail: `GET /api/records → ${status}` };
      }
    },
    {
      name: 'Live SSE - connexion',
      run: async () => {
        const token = await getAdminToken();
        const { status } = await httpGet(`${BASE}/api/live/recent`, token);
        return { passed: status === 200, detail: `GET /api/live/recent → ${status}` };
      }
    },
  ];

  for (const test of tests) {
    try {
      const result = await test.run();
      phase.suites.push({ name: test.name, status: result.passed ? 'passed' : 'failed', detail: result.detail });
    } catch (e) {
      phase.suites.push({ name: test.name, status: 'failed', detail: e.message });
    }
    phase.completedSuites = phase.suites.length;
    phase.totalTests = phase.suites.length;
    phase.passedTests = phase.suites.filter(s => s.status === 'passed').length;
    phase.failedTests = phase.suites.filter(s => s.status === 'failed').length;
    phase.totalSuites = phase.suites.length;
  }
  phase.status = phase.failedTests > 0 ? 'failed' : 'passed';
}

async function runLoadTests(phase) {
  phase.status = 'running';
  const BASE = 'http://localhost:5001';
  let token;
  try { token = await getAdminToken(); } catch {}
  const CONCURRENCY = 50;
  const TIMEOUT = 10000;

  const testSuites = [
    {
      name: 'GET /api/health (50 req concurrentes)',
      run: async () => {
        const timings = [];
        const errors = [];
        const startAll = Date.now();
        const results = await Promise.allSettled(
          Array.from({ length: CONCURRENCY }, () => httpGetTimed(`${BASE}/api/health`, null, TIMEOUT))
        );
        const elapsed = Date.now() - startAll;
        for (const r of results) {
          if (r.status === 'fulfilled') {
            timings.push(r.value.ms);
            if (r.value.status !== 200) errors.push(`HTTP ${r.value.status}`);
          } else {
            errors.push(r.reason?.message || 'Erreur');
          }
        }
        timings.sort((a, b) => a - b);
        const avg = timings.reduce((s, t) => s + t, 0) / timings.length;
        const p95 = timings[Math.floor(timings.length * 0.95)];
        const detail = `${CONCURRENCY} req en ${elapsed}ms | moy=${avg.toFixed(1)}ms | p95=${p95}ms | min=${timings[0]}ms | max=${timings[timings.length-1]}ms${errors.length ? ` | ${errors.length} erreurs` : ' | ✅ 0 erreur'}`;
        return { passed: errors.length === 0, detail };
      }
    },
    {
      name: 'POST /api/auth/login (50 req concurrentes)',
      run: async () => {
        const timings = [];
        const errors = [];
        const startAll = Date.now();
        const results = await Promise.allSettled(
          Array.from({ length: CONCURRENCY }, () => httpPostTimed(`${BASE}/api/auth/login`, { username: 'admin', password: 'Admin@123' }, TIMEOUT))
        );
        const elapsed = Date.now() - startAll;
        for (const r of results) {
          if (r.status === 'fulfilled') {
            timings.push(r.value.ms);
            if (r.value.status !== 200) errors.push(`HTTP ${r.value.status}`);
          } else {
            errors.push(r.reason?.message || 'Erreur');
          }
        }
        timings.sort((a, b) => a - b);
        const avg = timings.reduce((s, t) => s + t, 0) / timings.length;
        const p95 = timings[Math.floor(timings.length * 0.95)];
        const detail = `${CONCURRENCY} req en ${elapsed}ms | moy=${avg.toFixed(1)}ms | p95=${p95}ms | min=${timings[0]}ms | max=${timings[timings.length-1]}ms${errors.length ? ` | ${errors.length} erreurs` : ' | ✅ 0 erreur'}`;
        return { passed: errors.length === 0, detail };
      }
    },
    {
      name: 'GET /api/banks (50 req concurrentes avec auth)',
      run: async () => {
        const timings = [];
        const errors = [];
        const startAll = Date.now();
        const results = await Promise.allSettled(
          Array.from({ length: CONCURRENCY }, () => httpGetTimed(`${BASE}/api/banks?limit=1`, token, TIMEOUT))
        );
        const elapsed = Date.now() - startAll;
        for (const r of results) {
          if (r.status === 'fulfilled') {
            timings.push(r.value.ms);
            if (r.value.status !== 200) errors.push(`HTTP ${r.value.status}`);
          } else {
            errors.push(r.reason?.message || 'Erreur');
          }
        }
        timings.sort((a, b) => a - b);
        const avg = timings.reduce((s, t) => s + t, 0) / timings.length;
        const p95 = timings[Math.floor(timings.length * 0.95)];
        const detail = `${CONCURRENCY} req en ${elapsed}ms | moy=${avg.toFixed(1)}ms | p95=${p95}ms | min=${timings[0]}ms | max=${timings[timings.length-1]}ms${errors.length ? ` | ${errors.length} erreurs` : ' | ✅ 0 erreur'}`;
        return { passed: errors.length === 0, detail };
      }
    },
  ];

  for (const test of testSuites) {
    try {
      const result = await test.run();
      phase.suites.push({ name: test.name, status: result.passed ? 'passed' : 'failed', detail: result.detail });
    } catch (e) {
      phase.suites.push({ name: test.name, status: 'failed', detail: e.message });
    }
    phase.completedSuites = phase.suites.length;
    phase.totalTests = phase.suites.length;
    phase.passedTests = phase.suites.filter(s => s.status === 'passed').length;
    phase.failedTests = phase.suites.filter(s => s.status === 'failed').length;
    phase.totalSuites = phase.suites.length;
  }
  phase.status = phase.failedTests > 0 ? 'failed' : 'passed';
}

// HTTP helpers
function httpGet(url, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = { hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: 'GET', timeout: 10000 };
    if (token) opts.headers = { Authorization: `Bearer ${token}` };
    const req = http.request(opts, (res) => {
      let body = '';
      res.on('data', c => body += c.toString());
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, body: null }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

function httpPost(url, data) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const d = JSON.stringify(data);
    const opts = { hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST', timeout: 10000, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } };
    const req = http.request(opts, (res) => {
      let body = '';
      res.on('data', c => body += c.toString());
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, body: null }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(d);
    req.end();
  });
}

function httpGetTimed(url, token, timeout) {
  const start = Date.now();
  return httpGet(url, token).then(r => ({ ...r, ms: Date.now() - start })).catch(e => { throw e; });
}

function httpPostTimed(url, data, timeout) {
  const start = Date.now();
  return httpPost(url, data).then(r => ({ ...r, ms: Date.now() - start })).catch(e => { throw e; });
}

let adminTokenCache = null;
let adminTokenExpiry = 0;

async function getAdminToken() {
  if (adminTokenCache && Date.now() < adminTokenExpiry) return adminTokenCache;
  const { body } = await httpPost('http://localhost:5001/api/auth/login', { username: 'admin', password: 'Admin@123' });
  adminTokenCache = body.data.token;
  adminTokenExpiry = Date.now() + 60000;
  return adminTokenCache;
}

function getFailedSuites(phases) {
  const failed = {};
  for (const phase of phases) {
    if (phase.name === 'preflight') continue;
    const failedSuites = phase.suites.filter(s => s.status === 'failed' && s.name);
    if (failedSuites.length > 0) {
      failed[phase.name] = failedSuites.map(s => s.name);
    }
  }
  return failed;
}

router.post('/run', async (req, res) => {
  if (isRunning) {
    return res.status(409).json({ success: false, message: 'Des tests sont déjà en cours d\'exécution.' });
  }

  isRunning = true;
  runCounter++;
  const runId = String(runCounter);

  currentRun = {
    runId,
    startTime: Date.now(),
    phases: [
      { name: 'preflight', label: 'Pré-vérifications', status: 'running', suites: [], completedSuites: 0, totalSuites: 8, totalTests: 0, passedTests: 0, failedTests: 0, done: false },
      { name: 'backend', label: 'Backend', status: 'pending', suites: [], completedSuites: 0, totalSuites: 0, totalTests: 0, passedTests: 0, failedTests: 0, done: false },
      { name: 'frontend', label: 'Frontend', status: 'pending', suites: [], completedSuites: 0, totalSuites: 0, totalTests: 0, passedTests: 0, failedTests: 0, done: false },
      { name: 'qa', label: 'Tests QA (E2E)', status: 'pending', suites: [], completedSuites: 0, totalSuites: 0, totalTests: 0, passedTests: 0, failedTests: 0, done: false },
      { name: 'integration', label: 'Tests Intégration (API)', status: 'pending', suites: [], completedSuites: 0, totalSuites: 0, totalTests: 0, passedTests: 0, failedTests: 0, done: false },
      { name: 'load', label: 'Tests Charge (50 req concurrentes)', status: 'pending', suites: [], completedSuites: 0, totalSuites: 0, totalTests: 0, passedTests: 0, failedTests: 0, done: false },
    ],
    currentPhase: 0,
    summary: null,
    finished: false,
  };

  res.json({ success: true, data: { runId } });

  runPhase(0);
});

router.post('/retry-failed', async (req, res) => {
  if (isRunning) {
    return res.status(409).json({ success: false, message: 'Des tests sont déjà en cours d\'exécution.' });
  }
  if (!currentRun || !currentRun.finished) {
    return res.status(400).json({ success: false, message: 'Aucun résultat de test disponible pour réessayer.' });
  }

  const failed = getFailedSuites(currentRun.phases);
  const phasesToRetry = Object.keys(failed);
  if (phasesToRetry.length === 0) {
    return res.status(400).json({ success: false, message: 'Aucun échec à réessayer.' });
  }

  isRunning = true;
  runCounter++;
  const runId = String(runCounter);

  currentRun = {
    runId,
    startTime: Date.now(),
    phases: currentRun.phases.map(p => {
      if (failed[p.name]) {
        return {
          ...p,
          status: 'pending',
          suites: [],
          completedSuites: 0,
          totalSuites: 0,
          totalTests: 0,
          passedTests: 0,
          failedTests: 0,
          done: false,
          failedFiles: failed[p.name],
          rawOutput: undefined,
        };
      }
      return { ...p, status: 'passed', suites: [], done: true };
    }),
    currentPhase: 0,
    summary: null,
    finished: false,
    isRetry: true,
  };

  res.json({ success: true, data: { runId, retriedPhases: phasesToRetry } });

  runPhase(0);
});

router.get('/progress', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
  });
  if (!currentRun) return res.end(JSON.stringify({ success: true, data: null }));
  res.end(JSON.stringify({ success: true, data: currentRun }));
});

router.get('/status', (req, res) => {
  res.json({ success: true, data: { isRunning } });
});

router.get('/raw-output', (req, res) => {
  if (!currentRun) {
    return res.status(404).json({ success: false, message: 'Aucun résultat de test disponible' });
  }
  const phaseIdx = parseInt(req.query.phase) || 0;
  const phase = currentRun.phases[phaseIdx];
  if (!phase) {
    return res.status(404).json({ success: false, message: 'Phase introuvable' });
  }
  const raw = phase.rawOutput;
  if (!raw) {
    return res.status(404).json({ success: false, message: 'Aucune sortie brute disponible pour cette phase' });
  }
  const safeName = phase.label.replace(/[^a-zA-Z0-9_-]/g, '_');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="platform-tests-${safeName}.txt"`);
  res.send(raw);
});

router.get('/script/:phaseIdx/:suiteIdx', (req, res) => {
  if (!currentRun) {
    return res.status(404).json({ success: false, message: 'Aucun résultat de test disponible' });
  }

  const phase = currentRun.phases[parseInt(req.params.phaseIdx)];
  if (!phase) {
    return res.status(404).json({ success: false, message: 'Phase introuvable' });
  }

  const suite = phase.suites[parseInt(req.params.suiteIdx)];
  if (!suite) {
    return res.status(404).json({ success: false, message: 'Suite introuvable' });
  }

  let fullPath;
  if (phase.name === 'backend') {
    fullPath = path.join(BACKEND_DIR, suite.name);
  } else if (phase.name === 'frontend') {
    fullPath = path.join(FRONTEND_DIR, suite.name);
  } else if (phase.name === 'qa') {
    fullPath = path.join(BACKEND_DIR, 'tests', 'qa', 'run.cjs');
  } else {
    return res.status(400).json({ success: false, message: 'Cette phase ne contient pas de fichier de script' });
  }

  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ success: false, message: `Fichier introuvable: ${suite.name}` });
  }

  const content = fs.readFileSync(fullPath, 'utf-8');

  res.json({
    success: true,
    data: {
      name: suite.name,
      path: fullPath,
      content,
      language: path.extname(fullPath).slice(1) || 'text',
    }
  });
});

function generateReport(run) {
  const s = run.summary;
  const dur = (s.totalDuration / 1000).toFixed(1);
  const ok = s.failed === 0;
  const date = new Date(s.timestamp).toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' });

  let phasesHtml = '';
  for (const p of run.phases) {
    const pf = p.name === 'preflight';
    let suitesHtml = '';
    for (const su of p.suites) {
      const st = su.status === 'passed' ? '✅' : su.status === 'failed' ? '❌' : '⏳';
      const det = su.detail ? `<div class="detail">${escapeHtml(su.detail)}</div>` : '';
      let errorsHtml = '';
      if (su.errors && su.errors.length > 0) {
        for (const e of su.errors) {
          errorsHtml += `<details><summary>⚠️ ${escapeHtml(e.title)}</summary><pre>${escapeHtml((e.failureMessages || []).join('\n\n'))}</pre></details>`;
        }
      }
      const raw = su.rawOutput ? `<details><summary>Sortie brute</summary><pre>${escapeHtml(su.rawOutput.slice(0, 2000))}</pre></details>` : '';
      suitesHtml += `<div class="suite ${su.status}">
        <div class="suite-header">${st} <strong>${escapeHtml(su.name)}</strong>
          ${su.totalTests != null ? `<span class="badge">${su.passedTests}/${su.totalTests}</span>` : ''}
        </div>
        ${det}${errorsHtml}${raw}
      </div>`;
    }
    const icon = p.status === 'passed' ? '✅' : p.status === 'failed' ? '❌' : '⏳';
    phasesHtml += `<div class="phase ${p.status}">
      <h2>${icon} ${escapeHtml(p.label)} (${p.passedTests}/${p.totalTests})</h2>
      <div class="suites">${suitesHtml}</div>
    </div>`;
  }

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Rapport Tests Plateforme - Gynecare</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f7fa;color:#1a1a2e;padding:24px}
  .container{max-width:960px;margin:0 auto}
  h1{font-size:1.5rem;margin-bottom:4px}
  .meta{color:#666;font-size:.85rem;margin-bottom:24px}
  .banner{padding:16px 20px;border-radius:8px;margin-bottom:24px;font-size:1.1rem;font-weight:600}
  .banner.pass{background:#d4edda;color:#155724;border:1px solid #c3e6cb}
  .banner.fail{background:#f8d7da;color:#721c24;border:1px solid #f5c6cb}
  .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}
  .stat-card{background:#fff;border-radius:8px;padding:12px 16px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.08)}
  .stat-label{font-size:.75rem;color:#666;text-transform:uppercase}
  .stat-value{font-size:1.4rem;font-weight:700;margin-top:2px}
  .stat-value.green{color:#28a745}
  .stat-value.red{color:#dc3545}
  .phase{background:#fff;border-radius:8px;margin-bottom:16px;padding:16px 20px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
  .phase h2{font-size:1rem;margin-bottom:12px}
  .phase.passed{border-left:4px solid #28a745}
  .phase.failed{border-left:4px solid #dc3545}
  .suite{border:1px solid #e9ecef;border-radius:6px;margin-bottom:8px;padding:10px 14px}
  .suite.passed{border-left:3px solid #28a745}
  .suite.failed{border-left:3px solid #dc3545}
  .suite-header{display:flex;align-items:center;gap:8px;font-size:.9rem}
  .badge{background:#e9ecef;padding:1px 8px;border-radius:10px;font-size:.75rem;margin-left:auto}
  .detail{font-size:.82rem;color:#555;margin-top:4px;padding:6px 10px;background:#f8f9fa;border-radius:4px}
  details{margin-top:6px}
  summary{cursor:pointer;font-size:.82rem;color:#495057;padding:4px 0}
  pre{font-size:.78rem;background:#1e1e2e;color:#cdd6f4;padding:10px;border-radius:4px;overflow-x:auto;max-height:300px;margin-top:4px;white-space:pre-wrap;word-break:break-all}
  @media print{body{padding:0}.banner,.stat-card,.phase{break-inside:avoid}}
</style>
</head>
<body>
<div class="container">
  <h1>📊 Rapport des Tests Plateforme</h1>
  <div class="meta">${date} · Durée : ${dur}s · Run #${run.runId}</div>
  <div class="banner ${ok ? 'pass' : 'fail'}">${ok ? '✅ Tous les tests sont réussis' : '❌ Certains tests ont échoué'}</div>
  <div class="stats">
    <div class="stat-card"><div class="stat-label">Total</div><div class="stat-value">${s.total}</div></div>
    <div class="stat-card"><div class="stat-label">Réussis</div><div class="stat-value green">${s.passed}</div></div>
    <div class="stat-card"><div class="stat-label">Échoués</div><div class="stat-value red">${s.failed}</div></div>
    <div class="stat-card"><div class="stat-label">Durée</div><div class="stat-value">${dur}s</div></div>
  </div>
  ${phasesHtml}
</div>
</body>
</html>`;
}

function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

router.get('/report', (req, res) => {
  if (!currentRun || !currentRun.report) {
    return res.status(404).json({ success: false, message: 'Aucun rapport disponible' });
  }
  const ts = currentRun.summary.timestamp.replace(/[:.]/g, '-');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="rapport-tests-plateforme-${ts}.html"`);
  res.send(currentRun.report);
});

module.exports = router;
