const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

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

    currentRun.summary = {
      total: all.totalTests,
      passed: all.passedTests,
      failed: all.failedTests,
      totalDuration: Date.now() - currentRun.startTime,
      timestamp: new Date().toISOString(),
    };
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

  const isFrontend = phase.name === 'frontend';
  const dir = isFrontend ? FRONTEND_DIR : BACKEND_DIR;
  const cmd = isFrontend
    ? 'CI=true npx react-scripts test --watchAll=false 2>&1'
    : 'npx jest 2>&1';

  phase.status = 'running';
  const child = spawn(cmd, [], { cwd: dir, shell: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let lineBuf = '';

  const onData = (data) => {
    lineBuf += data.toString();
    const lines = lineBuf.split('\n');
    lineBuf = lines.pop();

    for (const line of lines) {
      const t = line.trim();
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
    phase.done = true;
    currentRun.currentPhase = idx + 1;
    runPhase(idx + 1);
  });
}

async function runPreflightChecks(phase) {
  const checks = [
    { name: 'Variables d\'environnement', run: checkEnvVars },
    { name: 'Connexion à la base de données', run: checkDatabase },
    { name: 'Connexion Redis', run: checkRedis },
    { name: 'Permissions système de fichiers', run: checkFileSystem },
    { name: 'Dépendances Node.js', run: checkDependencies },
  ];
  phase.totalSuites = checks.length;

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
  try {
    let Redis;
    try { Redis = require('ioredis'); } catch { Redis = require('redis'); }
    const client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    await new Promise((resolve, reject) => {
      const done = (fn) => (v) => { try { client.quit(); } catch {} fn(v); };
      client.on('ready', done(resolve));
      client.on('error', done(reject));
      setTimeout(() => { done(reject)(new Error('Timeout (3s)')); }, 3000);
    });
    return { passed: true, message: '✅ Redis connecté' };
  } catch (e) {
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
      { name: 'preflight', label: 'Pré-vérifications', status: 'running', suites: [], completedSuites: 0, totalSuites: 5, totalTests: 0, passedTests: 0, failedTests: 0, done: false },
      { name: 'backend', label: 'Backend', status: 'pending', suites: [], completedSuites: 0, totalSuites: 0, totalTests: 0, passedTests: 0, failedTests: 0, done: false },
      { name: 'frontend', label: 'Frontend', status: 'pending', suites: [], completedSuites: 0, totalSuites: 0, totalTests: 0, passedTests: 0, failedTests: 0, done: false },
    ],
    currentPhase: 0,
    summary: null,
    finished: false,
  };

  res.json({ success: true, data: { runId } });

  runPhase(0);
});

router.get('/progress', (req, res) => {
  if (!currentRun) return res.json({ success: true, data: null });
  res.json({ success: true, data: currentRun });
});

router.get('/status', (req, res) => {
  res.json({ success: true, data: { isRunning } });
});

module.exports = router;
