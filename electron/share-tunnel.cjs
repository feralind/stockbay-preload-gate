'use strict';

/**
 * Host a temporary public HTTPS link to the local StockWay server.
 * Prefers Cloudflare quick tunnels (cloudflared); falls back to localtunnel.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;
const LT_URL_RE = /https:\/\/[a-z0-9-]+\.loca\.lt/i;
const START_TIMEOUT_MS = 60000;

/** @type {{
 *   active: boolean,
 *   url: string|null,
 *   status: string,
 *   error: string|null,
 *   provider: string|null,
 *   detail: string|null,
 * }} */
let state = {
  active: false,
  url: null,
  status: 'idle',
  error: null,
  provider: null,
  detail: null,
};

/** @type {import('child_process').ChildProcess|null} */
let child = null;
/** @type {{ close: () => void }|null} */
let ltTunnel = null;
let startPromise = null;

function getStatus() {
  return { ...state };
}

function setState(patch) {
  state = { ...state, ...patch };
}

function binaryName() {
  if (process.platform === 'win32') return 'cloudflared.exe';
  return 'cloudflared';
}

function releaseAssetName() {
  const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
  if (process.platform === 'win32') return `cloudflared-windows-${arch}.exe`;
  if (process.platform === 'darwin') return `cloudflared-darwin-${arch}`;
  return `cloudflared-linux-${arch}`;
}

function binaryPath(userDataDir) {
  return path.join(userDataDir, 'bin', binaryName());
}

function downloadFile(url, dest, redirectsLeft = 8) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https:') ? https : http;
    const req = mod.get(url, {
      headers: { 'User-Agent': 'StockWay-ShareTunnel' },
    }, (res) => {
      const code = res.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(code) && res.headers.location) {
        res.resume();
        if (redirectsLeft <= 0) {
          reject(new Error('Too many redirects downloading tunnel helper'));
          return;
        }
        const next = new URL(res.headers.location, url).href;
        downloadFile(next, dest, redirectsLeft - 1).then(resolve, reject);
        return;
      }
      if (code !== 200) {
        res.resume();
        reject(new Error(`Download failed (${code})`));
        return;
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const tmp = `${dest}.partial`;
      const out = fs.createWriteStream(tmp);
      res.pipe(out);
      out.on('finish', () => {
        out.close(() => {
          try {
            fs.renameSync(tmp, dest);
            if (process.platform !== 'win32') {
              try { fs.chmodSync(dest, 0o755); } catch (_) {}
            }
            resolve(dest);
          } catch (err) {
            reject(err);
          }
        });
      });
      out.on('error', reject);
    });
    req.on('error', reject);
  });
}

async function ensureCloudflared(userDataDir, onProgress) {
  const dest = binaryPath(userDataDir);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1_000_000) {
    return dest;
  }
  onProgress?.('Downloading tunnel helper (one-time)…');
  const asset = releaseAssetName();
  const url = `https://github.com/cloudflare/cloudflared/releases/latest/download/${asset}`;
  await downloadFile(url, dest);
  return dest;
}

function killChild() {
  if (!child || child.killed) {
    child = null;
    return;
  }
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
    } else {
      child.kill('SIGTERM');
    }
  } catch (_) {}
  child = null;
}

function closeLocaltunnel() {
  if (!ltTunnel) return;
  try { ltTunnel.close(); } catch (_) {}
  ltTunnel = null;
}

async function stopTunnel() {
  killChild();
  closeLocaltunnel();
  setState({
    active: false,
    url: null,
    status: 'idle',
    error: null,
    provider: null,
    detail: null,
  });
  return getStatus();
}

function waitForCloudflareUrl(proc) {
  return new Promise((resolve, reject) => {
    let buf = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('Timed out waiting for public link'));
    }, START_TIMEOUT_MS);

    const onData = (chunk) => {
      buf += String(chunk);
      const m = buf.match(URL_RE);
      if (m && !settled) {
        settled = true;
        clearTimeout(timer);
        resolve(m[0]);
      }
    };

    proc.stdout?.on('data', onData);
    proc.stderr?.on('data', onData);
    proc.once('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    proc.once('exit', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`Tunnel helper exited early (${code == null ? '?' : code})`));
    });
  });
}

async function startCloudflare(port, userDataDir, onProgress) {
  const bin = await ensureCloudflared(userDataDir, onProgress);
  onProgress?.('Creating public link…');
  const proc = spawn(bin, [
    'tunnel',
    '--url', `http://127.0.0.1:${port}`,
    '--no-autoupdate',
  ], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child = proc;
  proc.on('exit', () => {
    if (child === proc) {
      child = null;
      if (state.active && state.provider === 'cloudflare') {
        setState({
          active: false,
          url: null,
          status: 'idle',
          error: 'Share link closed',
          provider: null,
          detail: null,
        });
      }
    }
  });
  const url = await waitForCloudflareUrl(proc);
  return { url, provider: 'cloudflare' };
}

async function startLocaltunnel(port, onProgress) {
  onProgress?.('Creating public link (fallback)…');
  let localtunnel;
  try {
    localtunnel = require('localtunnel');
  } catch (err) {
    throw new Error('Fallback tunnel package missing');
  }
  const tunnel = await localtunnel({ port: Number(port), local_host: '127.0.0.1' });
  ltTunnel = tunnel;
  tunnel.on('close', () => {
    if (ltTunnel === tunnel) {
      ltTunnel = null;
      if (state.active && state.provider === 'localtunnel') {
        setState({
          active: false,
          url: null,
          status: 'idle',
          error: 'Share link closed',
          provider: null,
          detail: null,
        });
      }
    }
  });
  const url = String(tunnel.url || '');
  if (!url || (!URL_RE.test(url) && !LT_URL_RE.test(url) && !/^https:\/\//i.test(url))) {
    try { tunnel.close(); } catch (_) {}
    ltTunnel = null;
    throw new Error('Fallback tunnel did not return a URL');
  }
  return { url, provider: 'localtunnel' };
}

/**
 * @param {number} port
 * @param {string} userDataDir
 */
async function startTunnel(port, userDataDir) {
  if (state.active && state.url) return getStatus();
  if (startPromise) return startPromise;

  startPromise = (async () => {
    killChild();
    closeLocaltunnel();
    setState({
      active: false,
      url: null,
      status: 'starting',
      error: null,
      provider: null,
      detail: 'Starting…',
    });

    const onProgress = (msg) => setState({ status: 'starting', error: null, detail: msg });

    try {
      let result;
      try {
        result = await startCloudflare(port, userDataDir, onProgress);
      } catch (cfErr) {
        killChild();
        try {
          result = await startLocaltunnel(port, onProgress);
        } catch (ltErr) {
          const msg = cfErr?.message || ltErr?.message || 'Could not create share link';
          setState({
            active: false,
            url: null,
            status: 'error',
            error: msg,
            provider: null,
            detail: null,
          });
          throw new Error(msg);
        }
      }

      setState({
        active: true,
        url: result.url,
        status: 'live',
        error: null,
        provider: result.provider,
        detail: null,
      });
      return getStatus();
    } finally {
      startPromise = null;
    }
  })();

  return startPromise;
}

module.exports = {
  startTunnel,
  stopTunnel,
  getStatus,
};
