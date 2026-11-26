const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { createHash } = require('crypto');
const fs = require('fs');
const path = require('path');

let mainWindow = null;

const ALLOWED_PATCH_EXTENSIONS = new Set([
  '.html',
  '.js',
  '.mjs',
  '.css',
  '.json',
  '.svg',
  '.png',
  '.ico',
  '.woff',
  '.woff2',
  '.webmanifest',
  '.txt',
]);

function isSafeExternalHttpUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || ''));
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function isSafeRelPatchPath(rawPath) {
  const normalized = String(rawPath || '').trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (!normalized || normalized.startsWith('/') || normalized.includes('..') || /[\0?#]/.test(normalized)) {
    return null;
  }
  const dotIdx = normalized.lastIndexOf('.');
  if (dotIdx <= 0) return null;
  const ext = normalized.slice(dotIdx).toLowerCase();
  if (!ALLOWED_PATCH_EXTENSIONS.has(ext)) return null;
  return normalized;
}

function sha256Buffer(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function getHotfixDir() {
  return path.join(app.getPath('userData'), 'hotfix-dist');
}

function getBundledDistDir() {
  return path.join(__dirname, '../dist');
}

function getActiveWebDir() {
  const hotfixDir = getHotfixDir();
  const hotfixIndex = path.join(hotfixDir, 'index.html');
  const hotfixMeta = path.join(hotfixDir, '.patch-meta.json');
  if (fs.existsSync(hotfixIndex) && fs.existsSync(hotfixMeta)) {
    return hotfixDir;
  }
  return getBundledDistDir();
}

function resolveIconPath() {
  const activeIcon = path.join(getActiveWebDir(), 'pwa-512x512.png');
  if (fs.existsSync(activeIcon)) return activeIcon;
  const distIcon = path.join(getBundledDistDir(), 'pwa-512x512.png');
  if (fs.existsSync(distIcon)) return distIcon;
  return path.join(__dirname, '../public/pwa-512x512.png');
}

function emitPatchProgress(progress) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('patch-progress', progress);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 760,
    minWidth: 960,
    minHeight: 600,
    fullscreen: true,
    title: 'EcoGrow Mission',
    icon: resolveIconPath(),
    autoHideMenuBar: true,
    backgroundColor: '#1b1612',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      event.preventDefault();
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalHttpUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devOrigin = process.env.ELECTRON_DEV_URL
      ? new URL(process.env.ELECTRON_DEV_URL).origin
      : null;
    if (isSafeExternalHttpUrl(url) && (!devOrigin || new URL(url).origin !== devOrigin)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  if (process.env.ELECTRON_DEV_URL) {
    mainWindow.loadURL(process.env.ELECTRON_DEV_URL);
  } else {
    mainWindow.loadFile(path.join(getActiveWebDir(), 'index.html'));
  }
}

ipcMain.on('app-quit', () => {
  app.quit();
});

ipcMain.on('toggle-fullscreen', () => {
  if (mainWindow) {
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
  }
});

ipcMain.on('open-external', (_event, url) => {
  if (isSafeExternalHttpUrl(url)) {
    void shell.openExternal(url);
  }
});

ipcMain.handle('apply-delta-patch', async (_event, payload) => {
  const stagingDir = path.join(app.getPath('userData'), 'hotfix-staging');
  const hotfixDir = getHotfixDir();
  const backupDir = path.join(app.getPath('userData'), 'hotfix-backup');

  try {
    const rawBase = String(payload?.baseUrl || '').trim().replace(/\/+$/, '');
    if (!isSafeExternalHttpUrl(rawBase)) {
      return { ok: false, changedFiles: 0, totalFiles: 0, error: 'INVALID_PATCH_BASE_URL' };
    }
    const rawFiles = Array.isArray(payload?.files) ? payload.files : [];
    const validFiles = [];
    for (const item of rawFiles) {
      const safeRel = isSafeRelPatchPath(item?.path);
      const sha256 = String(item?.sha256 || '').trim().toLowerCase();
      const size = Number.isFinite(item?.size) ? Math.max(0, Math.floor(item.size)) : 0;
      if (!safeRel || !/^[a-f0-9]{64}$/.test(sha256)) continue;
      validFiles.push({ path: safeRel, sha256, size });
    }
    if (validFiles.length === 0) {
      return { ok: false, changedFiles: 0, totalFiles: 0, error: 'EMPTY_PATCH_MANIFEST' };
    }

    const activeDir = getActiveWebDir();
    const changedList = [];
    const unchangedList = [];

    for (const file of validFiles) {
      const existingPath = path.resolve(activeDir, file.path);
      if (
        existingPath.startsWith(`${activeDir}${path.sep}`) &&
        fs.existsSync(existingPath) &&
        fs.statSync(existingPath).isFile()
      ) {
        const existingHash = sha256Buffer(fs.readFileSync(existingPath));
        if (existingHash === file.sha256) {
          unchangedList.push(file);
          continue;
        }
      }
      changedList.push(file);
    }

    fs.rmSync(stagingDir, { recursive: true, force: true });
    fs.mkdirSync(stagingDir, { recursive: true });

    // Copy unchanged files locally without re-downloading
    for (const file of unchangedList) {
      const src = path.resolve(activeDir, file.path);
      const dst = path.resolve(stagingDir, file.path);
      if (!dst.startsWith(`${stagingDir}${path.sep}`)) continue;
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
    }

    const totalBytes = changedList.reduce((acc, f) => acc + f.size, 0);
    let completedFiles = 0;
    let downloadedBytes = 0;

    emitPatchProgress({
      phase: 'downloading',
      changedFiles: changedList.length,
      totalFiles: validFiles.length,
      completedFiles: 0,
      skippedFiles: unchangedList.length,
      downloadedBytes: 0,
      totalBytes,
    });

    // Download only changed files in batches of 4
    const BATCH_SIZE = 4;
    for (let i = 0; i < changedList.length; i += BATCH_SIZE) {
      const batch = changedList.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (file) => {
          const controller = new AbortController();
          const tid = setTimeout(() => controller.abort(), 15_000);
          try {
            const url = `${rawBase}/patch-files/${file.path}`;
            const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
            if (!res.ok) {
              throw new Error(`HTTP_${res.status}`);
            }
            const buf = Buffer.from(await res.arrayBuffer());
            const digest = sha256Buffer(buf);
            if (digest !== file.sha256) {
              throw new Error(`SHA256_MISMATCH:${file.path}`);
            }
            const dst = path.resolve(stagingDir, file.path);
            if (!dst.startsWith(`${stagingDir}${path.sep}`)) {
              throw new Error(`UNSAFE_DST:${file.path}`);
            }
            fs.mkdirSync(path.dirname(dst), { recursive: true });
            fs.writeFileSync(dst, buf);
            completedFiles += 1;
            downloadedBytes += buf.length;
            emitPatchProgress({
              phase: 'downloading',
              changedFiles: changedList.length,
              totalFiles: validFiles.length,
              completedFiles,
              skippedFiles: unchangedList.length,
              downloadedBytes,
              totalBytes,
            });
          } finally {
            clearTimeout(tid);
          }
        })
      );
    }

    emitPatchProgress({
      phase: 'applying',
      changedFiles: changedList.length,
      totalFiles: validFiles.length,
      completedFiles: changedList.length,
      skippedFiles: unchangedList.length,
      downloadedBytes,
      totalBytes,
    });

    fs.writeFileSync(
      path.join(stagingDir, '.patch-meta.json'),
      JSON.stringify({
        version: String(payload?.version || ''),
        serverRevision: String(payload?.serverRevision || ''),
        appliedAt: Date.now(),
      }),
      'utf8'
    );

    fs.rmSync(backupDir, { recursive: true, force: true });
    if (fs.existsSync(hotfixDir)) {
      fs.renameSync(hotfixDir, backupDir);
    }
    fs.renameSync(stagingDir, hotfixDir);
    fs.rmSync(backupDir, { recursive: true, force: true });

    emitPatchProgress({
      phase: 'done',
      changedFiles: changedList.length,
      totalFiles: validFiles.length,
      completedFiles: changedList.length,
      skippedFiles: unchangedList.length,
      downloadedBytes,
      totalBytes,
    });

    if (mainWindow && !mainWindow.isDestroyed()) {
      if (process.env.ELECTRON_DEV_URL) {
        mainWindow.webContents.reload();
      } else {
        await mainWindow.loadFile(path.join(hotfixDir, 'index.html'));
      }
    }

    return {
      ok: true,
      changedFiles: changedList.length,
      totalFiles: validFiles.length,
    };
  } catch (err) {
    try {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
    return {
      ok: false,
      changedFiles: 0,
      totalFiles: 0,
      error: err instanceof Error ? err.message : 'PATCH_ERROR',
    };
  }
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
