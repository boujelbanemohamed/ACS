const express = require('express');
const router = express.Router();
const { exec } = require('child_process');
const path = require('path');
const util = require('util');

const execPromise = util.promisify(exec);
const BACKEND_DIR = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.resolve(BACKEND_DIR, '..', 'frontend');

let lastResults = null;
let isRunning = false;

router.post('/run', async (req, res) => {
  if (isRunning) {
    return res.status(409).json({ success: false, message: 'Des tests sont déjà en cours d\'exécution.' });
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    const [backendResult, frontendResult] = await Promise.all([
      runJest(BACKEND_DIR, 'backend', 120000, 'npx jest --json --silent 2>&1'),
      runJest(FRONTEND_DIR, 'frontend', 180000, 'CI=true npx react-scripts test --watchAll=false --json --silent 2>&1'),
    ]);

    const totalDuration = Date.now() - startTime;
    const totalTests = (backendResult.numTotalTests || 0) + (frontendResult.numTotalTests || 0);
    const passedTests = (backendResult.numPassedTests || 0) + (frontendResult.numPassedTests || 0);
    const failedTests = (backendResult.numFailedTests || 0) + (frontendResult.numFailedTests || 0);

    lastResults = {
      summary: {
        total: totalTests,
        passed: passedTests,
        failed: failedTests,
        totalDuration,
        timestamp: new Date().toISOString(),
      },
      backend: backendResult,
      frontend: frontendResult,
    };

    res.json({ success: true, data: lastResults });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    isRunning = false;
  }
});

async function runJest(dir, label, timeout, cmd) {
  try {
    const { stdout } = await execPromise(cmd, {
      cwd: dir,
      timeout,
      maxBuffer: 10 * 1024 * 1024,
    });
    return parseJestOutput(stdout, label);
  } catch (err) {
    if (err.stdout) {
      return parseJestOutput(err.stdout, label);
    }
    return { label, error: err.message, numTotalTests: 0, numPassedTests: 0, numFailedTests: 0, suites: [] };
  }
}

function parseJestOutput(stdout, label) {
  const jsonStart = stdout.indexOf('{');
  const jsonEnd = stdout.lastIndexOf('}');
  if (jsonStart !== -1 && jsonEnd !== -1) {
    try {
      const parsed = JSON.parse(stdout.substring(jsonStart, jsonEnd + 1));
      return {
        label,
        numTotalTestSuites: parsed.numTotalTestSuites || 0,
        numPassedTestSuites: parsed.numPassedTestSuites || 0,
        numFailedTestSuites: parsed.numFailedTestSuites || 0,
        numTotalTests: parsed.numTotalTests || 0,
        numPassedTests: parsed.numPassedTests || 0,
        numFailedTests: parsed.numFailedTests || 0,
        suites: (parsed.testResults || []).map(s => ({
          name: path.basename(s.name),
          status: s.status === 'passed' ? 'passed' : 'failed',
          numFailingTests: s.numFailingTests || 0,
          numPassingTests: s.numPassingTests || 0,
          duration: s.endTime && s.startTime ? (s.endTime - s.startTime) : null,
          message: s.message || '',
        })),
      };
    } catch (e) {
      return { label, error: 'Erreur de parsing: ' + e.message, raw: stdout.substring(0, 500), numTotalTests: 0, numPassedTests: 0, numFailedTests: 0, suites: [] };
    }
  }
  return { label, error: 'Aucun résultat JSON trouvé', raw: stdout.substring(0, 500), numTotalTests: 0, numPassedTests: 0, numFailedTests: 0, suites: [] };
}

router.get('/results', (req, res) => {
  res.json({ success: true, data: lastResults });
});

router.get('/status', (req, res) => {
  res.json({ success: true, data: { isRunning } });
});

module.exports = router;
