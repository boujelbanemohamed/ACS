const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const path = require('path');

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
      { name: 'backend', label: 'Backend', status: 'counting', suites: [], completedSuites: 0, totalSuites: 0, totalTests: 0, passedTests: 0, failedTests: 0, done: false },
      { name: 'frontend', label: 'Frontend', status: 'pending', suites: [], completedSuites: 0, totalSuites: 0, totalTests: 0, passedTests: 0, failedTests: 0, done: false },
    ],
    currentPhase: 0,
    summary: null,
    finished: false,
  };

  res.json({ success: true, data: { runId } });

  runNextPhase();
});

function runNextPhase() {
  if (!currentRun) return;

  const idx = currentRun.currentPhase;
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
  const isFrontend = phase.name === 'frontend';
  const dir = isFrontend ? FRONTEND_DIR : BACKEND_DIR;
  const rawArgs = isFrontend
    ? 'CI=true npx react-scripts test --watchAll=false 2>&1'
    : 'npx jest 2>&1';

  phase.status = 'running';
  const child = spawn(rawArgs, [], { cwd: dir, shell: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let lineBuf = '';

  const onData = (data) => {
    lineBuf += data.toString();
    const lines = lineBuf.split('\n');
    lineBuf = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const suiteMatch = trimmed.match(/^(PASS|FAIL)\s+(.+?)(?:\s+\([\d.]+ ?\w+\))?$/);
      if (suiteMatch) {
        phase.suites.push({
          name: path.basename(suiteMatch[2].trim()),
          status: suiteMatch[1] === 'PASS' ? 'passed' : 'failed',
        });
        phase.completedSuites = phase.suites.length;
        continue;
      }

      if (trimmed.startsWith('Test Suites:')) {
        const m = trimmed.match(/(\d+)\s+passed.*?(\d+)\s+total/);
        if (m) {
          phase.totalSuites = parseInt(m[2]);
        }
        continue;
      }

      if (trimmed.startsWith('Tests:')) {
        const m = trimmed.match(/(\d+)\s+passed.*?(\d+)\s+total/);
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

  child.on('close', (code) => {
    phase.status = code === 0 ? 'passed' : 'failed';
    phase.done = true;
    currentRun.currentPhase++;
    runNextPhase();
  });
}

router.get('/progress', (req, res) => {
  if (!currentRun) {
    return res.json({ success: true, data: null });
  }
  res.json({ success: true, data: currentRun });
});

router.get('/status', (req, res) => {
  res.json({ success: true, data: { isRunning } });
});

module.exports = router;
