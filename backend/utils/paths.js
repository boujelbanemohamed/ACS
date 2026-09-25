const os = require('os');
const path = require('path');
const fs = require('fs');

// Dossier des fichiers importés : doit être partagé entre l'API et le worker (volume commun)
const getUploadDir = () => process.env.UPLOAD_DIR || path.join(os.tmpdir(), 'acs-uploads');

// Crée un dossier temporaire propre à un traitement (évite les collisions entre jobs concurrents)
const makeTempDir = (prefix = 'acs-') => fs.promises.mkdtemp(path.join(os.tmpdir(), prefix));

const removeDir = (dir) => (dir ? fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {}) : Promise.resolve());

module.exports = { getUploadDir, makeTempDir, removeDir };
