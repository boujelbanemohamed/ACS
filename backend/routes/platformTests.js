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
      { name: 'preflight', label: 'Pré-vérifications', status: 'running', suites: [], completedSuites: 0, totalSuites: 5, totalTests: 0, passedTests: 0, failedTests: 0, done: false, rawOutput: '' },
      { name: 'backend', label: 'Backend', status: 'pending', suites: [], completedSuites: 0, totalSuites: 0, totalTests: 0, passedTests: 0, failedTests: 0, done: false, rawOutput: '' },
      { name: 'frontend', label: 'Frontend', status: 'pending', suites: [], completedSuites: 0, totalSuites: 0, totalTests: 0, passedTests: 0, failedTests: 0, done: false, rawOutput: '' },
    ],
    currentPhase: 0,
    summary: null,
    finished: false,
  };

  res.json({ success: true, data: { runId } });

  runPhase(0);
});

function runPhase(idx) {
  if (!currentRun) return;
  if (idx >= currentRun.phases.length) return finishRun();

  const phase = currentRun.phases[idx];

  if (phase.name === 'preflight') {
    runPreflight(phase, () => {
      phase.done = true;
      currentRun.currentPhase = idx + 1;
      runPhase(idx + 1);
    });
    return;
  }

  phase.status = 'running';
  const isFrontend = phase.name === 'frontend';
  const dir = isFrontend ? FRONTEND_DIR : BACKEND_DIR;
  const cmd = isFrontend
    ? 'CI=true npx react-scripts test --watchAll=false --verbose 2>&1'
    : 'npx jest --verbose 2>&1';

  const child = spawn(cmd, [], { cwd: dir, shell: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let lineBuf = '';
  let lastSuiteIdx = -1;

  child.stdout.on('data', (data) => {
    phase.rawOutput += data.toString();
    lineBuf += data.toString();
    const lines = lineBuf.split('\n');
    lineBuf = lines.pop();

    for (const line of lines) {
      const t = line.trimRight();
      if (!t) continue;

      const suiteMatch = t.match(/^(PASS|FAIL)\s+(.+?)(?:\s+\([\d.]+ ?\w+\))?$/);
      if (suiteMatch) {
        phase.suites.push({
          name: suiteMatch[2].trim(),
          status: suiteMatch[1] === 'PASS' ? 'passed' : 'failed',
          passedTests: 0,
          totalTests: 0,
          failedTests: 0,
          errors: [],
        });
        lastSuiteIdx = phase.suites.length - 1;
        phase.completedSuites = phase.suites.length;
        continue;
      }

      const testMatch = t.match(/^\s*(✓|✕|×|√)\s+(.+?)\s+\((\d+\s*\w+)\)$/);
      if (testMatch && lastSuiteIdx >= 0) {
        const suite = phase.suites[lastSuiteIdx];
        suite.totalTests = (suite.totalTests || 0) + 1;
        if (testMatch[1] !== '✓') {
          suite.failedTests = (suite.failedTests || 0) + 1;
        }
        continue;
      }

      const errorMatch = t.match(/^\s*●\s+(.+)/);
      if (errorMatch && lastSuiteIdx >= 0) {
        const suite = phase.suites[lastSuiteIdx];
        if (!suite.errors) suite.errors = [];
        if (suite.errors.length === 0 || !suite.errors[suite.errors.length - 1].includes('\n' + errorMatch[1])) {
          suite.errors.push(errorMatch[1]);
        }
      }

      if (t.startsWith('Test Suites:')) {
        const s = t.match(/(\d+)\s+passed.*?(\d+)\s+total/);
        if (s) phase.totalSuites = parseInt(s[2]);
        continue;
      }

      if (t.startsWith('Tests:')) {
        const s = t.match(/(\d+)\s+passed.*?(\d+)\s+total/);
        if (s) {
          phase.totalTests = parseInt(s[2]);
          phase.passedTests = parseInt(s[1]);
          phase.failedTests = phase.totalTests - phase.passedTests;
        }
      }
    }
  });

  child.stderr.on('data', (data) => {
    phase.rawOutput += data.toString();
    lineBuf += data.toString();
  });

  child.on('close', () => {
    phase.done = true;
    phase.status = phase.failedTests > 0 ? 'failed' : 'passed';
    currentRun.currentPhase = idx + 1;
    runPhase(idx + 1);
  });
}

function finishRun() {
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
}

function runPreflight(phase, done) {
  const checks = [
    { name: 'Variables d\'environnement', fn: checkEnvVars },
    { name: 'Connexion à la base de données', fn: checkDatabase },
    { name: 'Connexion Redis', fn: checkRedis },
    { name: 'Permissions système de fichiers', fn: checkFileSystem },
    { name: 'Dépendances Node.js', fn: checkDependencies },
  ];
  phase.totalSuites = checks.length;
  let i = 0;

  const next = () => {
    if (i >= checks.length) {
      phase.failedTests = phase.suites.filter(s => s.status === 'failed').length;
      phase.passedTests = phase.suites.filter(s => s.status === 'passed').length;
      phase.totalTests = phase.suites.length;
      phase.status = phase.failedTests > 0 ? 'failed' : 'passed';
      done();
      return;
    }
    const check = checks[i];
    check.fn().then(result => {
      phase.suites.push({ name: check.name, detail: result.message, status: result.passed ? 'passed' : 'failed', passedTests: result.passed ? 1 : 0, totalTests: 1, failedTests: result.passed ? 0 : 1, errors: [] });
      phase.rawOutput += `[${check.name}] ${result.message}\n`;
      phase.completedSuites = phase.suites.length;
      i++;
      next();
    }).catch(err => {
      phase.suites.push({ name: check.name, detail: err.message, status: 'failed', passedTests: 0, totalTests: 1, failedTests: 1, errors: [err.message] });
      phase.rawOutput += `[${check.name}] ERROR: ${err.message}\n`;
      phase.completedSuites = phase.suites.length;
      i++;
      next();
    });
  };
  next();
}

async function checkEnvVars() {
  const required = ['JWT_SECRET', 'PORT', 'DB_PORT'];
  const optional = ['PAN_ENCRYPTION_KEY', 'REDIS_URL', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'];
  const missing = required.filter(v => !process.env[v]);
  const optMissing = optional.filter(v => !process.env[v]);
  const parts = [];
  if (missing.length === 0) parts.push('✅ Requises: OK');
  else parts.push('❌ Manquantes: ' + missing.join(', '));
  if (optMissing.length > 0) parts.push('⚠️ Optionnelles non définies: ' + optMissing.join(', '));
  else parts.push('✅ Optionnelles: OK');
  return { passed: missing.length === 0, message: parts.join(' | ') };
}

async function checkDatabase() {
  const db = require('../config/database');
  await db.query('SELECT 1 AS ok');
  return { passed: true, message: '✅ PostgreSQL connecté (SELECT 1 OK)' };
}

async function checkRedis() {
  const Redis = require('ioredis');
  const client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { connectTimeout: 3000, maxRetries: 1, retryStrategy: () => null, lazyConnect: true });
  await Promise.race([
    client.connect(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout 3s')), 3000)),
  ]);
  await client.quit();
  return { passed: true, message: '✅ Redis connecté' };
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
    } catch { err.push(d.label); }
  }
  const parts = [];
  if (ok.length) parts.push('✅ ' + ok.join(', '));
  if (err.length) parts.push('❌ ' + err.join(', '));
  return { passed: err.length === 0, message: parts.join(' | ') };
}

async function checkDependencies() {
  const be = fs.existsSync(path.join(BACKEND_DIR, 'node_modules'));
  const fe = fs.existsSync(path.join(FRONTEND_DIR, 'node_modules'));
  if (be && fe) return { passed: true, message: '✅ Backend + Frontend installés' };
  const missing = [];
  if (!be) missing.push('Backend');
  if (!fe) missing.push('Frontend');
  return { passed: false, message: '❌ Node_modules manquants: ' + missing.join(', ') };
}

router.get('/progress', (req, res) => {
  if (!currentRun) return res.json({ success: true, data: null });
  const safe = JSON.parse(JSON.stringify(currentRun));
  for (const p of safe.phases) {
    if (p.rawOutput) p.rawOutput = p.rawOutput.substring(p.rawOutput.length - 50000);
  }
  res.json({ success: true, data: safe });
});

router.get('/status', (req, res) => {
  res.json({ success: true, data: { isRunning } });
});

router.get('/script/:phaseIdx/:suiteIdx', (req, res) => {
  if (!currentRun) return res.status(404).json({ success: false, message: 'Aucun run' });
  const phase = currentRun.phases[parseInt(req.params.phaseIdx)];
  const suite = phase?.suites?.[parseInt(req.params.suiteIdx)];
  if (!suite) return res.status(404).json({ success: false, message: 'Suite introuvable' });

  const dir = phase.name === 'frontend' ? FRONTEND_DIR : BACKEND_DIR;
  const absPath = path.resolve(dir, suite.name);
  if (!absPath.startsWith(dir)) return res.status(403).json({ success: false, message: 'Chemin invalide' });
  if (!fs.existsSync(absPath)) return res.status(404).json({ success: false, message: 'Fichier introuvable: ' + suite.name });

  const content = fs.readFileSync(absPath, 'utf-8');
  res.json({ success: true, data: { name: suite.name, content } });
});

router.get('/suite-logs/:phaseIdx/:suiteIdx', (req, res) => {
  if (!currentRun) return res.status(404).json({ success: false, message: 'Aucun run' });
  const phase = currentRun.phases[parseInt(req.params.phaseIdx)];
  const suite = phase?.suites?.[parseInt(req.params.suiteIdx)];
  if (!suite) return res.status(404).json({ success: false, message: 'Suite introuvable' });

  const raw = phase.rawOutput || '';
  const lines = raw.split('\n');
  const suiteLine = lines.findIndex(l => l.includes(suite.name));
  const relevant = suiteLine >= 0 ? lines.slice(Math.max(0, suiteLine - 1), suiteLine + 200).join('\n') : raw.substring(0, 5000);

  res.json({ success: true, data: { name: suite.name, logs: relevant } });
});

router.post('/retry/:phaseIdx', (req, res) => {
  if (!currentRun) return res.status(404).json({ success: false, message: 'Aucun run' });
  const idx = parseInt(req.params.phaseIdx);
  const phase = currentRun.phases[idx];
  if (!phase) return res.status(404).json({ success: false, message: 'Phase introuvable' });

  phase.suites = [];
  phase.completedSuites = 0;
  phase.totalSuites = 0;
  phase.totalTests = 0;
  phase.passedTests = 0;
  phase.failedTests = 0;
  phase.done = false;
  phase.status = 'running';
  phase.rawOutput = '';
  phase.isRetry = true;

  currentRun.currentPhase = idx;
  currentRun.finished = false;
  isRunning = true;

  res.json({ success: true, data: { phaseIdx: idx } });
  runPhase(idx);
});

module.exports = router;
