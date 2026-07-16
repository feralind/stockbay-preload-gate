const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');
const shareTunnel = require('./share-tunnel.cjs');

const PREFERRED_PORTS = [3847, 8080, 3848];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0';
const CACHE_BUST = '1.0.0';

// Brand the process early so Windows taskbar / jump list prefer StockWay over "Electron".
app.setName('StockWay');
if (process.platform === 'win32') {
  app.setAppUserModelId('com.stockway.simulator');
}
process.title = 'StockWay';

let PORT = PREFERRED_PORTS[0];
let serverInstance = null;
let isQuitting = false;
let finnhubKey = process.env.FINNHUB_API_KEY || '';
const SHUTDOWN_TOKEN = crypto.randomBytes(16).toString('hex');
let splashWindow = null;
let mainWindow = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function loadFinnhubKey(root) {
  if (finnhubKey) return finnhubKey;
  const candidates = [
    path.join(root, 'finnhub.key'),
    path.join(path.dirname(process.execPath), 'finnhub.key'),
    path.join(app.getPath('userData'), 'finnhub.key'),
  ];
  // Local packaged runs from dist/win-unpacked — also check project root two levels up
  if (app.isPackaged) {
    candidates.push(path.join(path.dirname(process.execPath), '..', '..', 'finnhub.key'));
  } else {
    candidates.push(path.join(__dirname, '..', 'finnhub.key'));
  }
  for (const keyFile of candidates) {
    try {
      if (fs.existsSync(keyFile)) {
        const val = fs.readFileSync(keyFile, 'utf8').trim();
        if (val) {
          finnhubKey = val;
          return finnhubKey;
        }
      }
    } catch (_) {}
  }
  return finnhubKey;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function getGameRoot() {
  return app.isPackaged ? app.getAppPath() : path.join(__dirname, '..');
}

function getAppIconPath() {
  const root = getGameRoot();
  const ico = path.join(root, 'assets', 'icon.ico');
  if (fs.existsSync(ico)) return ico;
  const png = path.join(root, 'assets', 'icon.png');
  if (fs.existsSync(png)) return png;
  const svg = path.join(root, 'assets', 'icon.svg');
  if (fs.existsSync(svg)) return svg;
  return undefined;
}

function toYahoo(sym) { return String(sym || '').replace('.', '-'); }

const YAHOO_CANDLE_RANGES = {
  '1D': { interval: '5m', range: '1d' },
  '1W': { interval: '1d', range: '1mo' },
  '5D': { interval: '1d', range: '1mo' }, // legacy alias → 1W
  '1M': { interval: '60m', range: '1mo' },
  '6M': { interval: '1d', range: '6mo' },
  YTD: { interval: '1d', range: 'ytd' },
  '1Y': { interval: '1d', range: '1y' },
  '5Y': { interval: '1d', range: '5y' },
  MAX: { interval: '1mo', range: 'max' },
  '1': { interval: '1m', range: '1d' },
  '5': { interval: '5m', range: '5d' },
  '15': { interval: '15m', range: '5d' },
  '60': { interval: '1h', range: '1mo' },
  D: { interval: '1d', range: '6mo' },
};

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': UA } }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function yahooQuote(sym) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${toYahoo(sym)}?interval=1d&range=5d`;
  const data = await fetchJson(url);
  const m = data?.chart?.result?.[0]?.meta;
  if (!m?.regularMarketPrice) return null;
  const prev = m.chartPreviousClose ?? m.previousClose ?? m.regularMarketPrice;
  return {
    sym: sym.toUpperCase(), price: m.regularMarketPrice,
    open: m.regularMarketOpen ?? m.regularMarketPrice,
    high: m.regularMarketDayHigh ?? m.regularMarketPrice,
    low: m.regularMarketDayLow ?? m.regularMarketPrice,
    prevClose: prev,
    change: m.regularMarketPrice - prev,
    changePct: ((m.regularMarketPrice / prev) - 1) * 100,
    updated: Date.now(), simulated: false, source: 'yahoo',
  };
}

async function yahooCandles(sym, resolution, count) {
  const cfg = YAHOO_CANDLE_RANGES[String(resolution || '1D').toUpperCase()] || YAHOO_CANDLE_RANGES['1D'];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${toYahoo(sym)}?interval=${cfg.interval}&range=${cfg.range}`;
  const data = await fetchJson(url);
  const r = data?.chart?.result?.[0];
  if (!r?.timestamp) return null;
  const q = r.indicators?.quote?.[0];
  if (!q) return null;
  const adj = r.indicators?.adjclose?.[0]?.adjclose;
  const candles = r.timestamp.map((t, i) => {
    const open = q.open?.[i];
    const high = q.high?.[i];
    const low = q.low?.[i];
    const close = q.close?.[i];
    const volume = q.volume?.[i] || 0;
    if (![open, high, low, close].every(Number.isFinite)) return null;
    const adjClose = Array.isArray(adj) ? Number(adj[i]) : NaN;
    if (Number.isFinite(adjClose) && adjClose > 0 && close > 0) {
      const scale = adjClose / close;
      return {
        time: t,
        open: open * scale,
        high: high * scale,
        low: low * scale,
        close: adjClose,
        volume,
      };
    }
    return { time: t, open, high, low, close, volume };
  }).filter(Boolean);
  return count > 0 ? candles.slice(-count) : candles;
}

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

const BLOCKED_BASENAMES = new Set([
  'finnhub.key', 'package.json', 'package-lock.json', '.env', '.gitignore',
]);
const BLOCKED_EXTENSIONS = new Set(['.key', '.pem', '.env']);

function isBlockedStatic(relPath) {
  const normalized = String(relPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const base = path.basename(normalized).toLowerCase();
  if (BLOCKED_BASENAMES.has(base)) return true;
  const ext = path.extname(base).toLowerCase();
  if (BLOCKED_EXTENSIONS.has(ext)) return true;
  if (normalized.startsWith('scripts/')) return true;
  if (normalized.startsWith('electron/') && ext === '.cjs') return true;
  return false;
}

function isValidSymbol(sym) {
  return /^[A-Z0-9.\-]{1,16}$/.test(String(sym || '').toUpperCase());
}

function isLoopbackReq(req) {
  const ip = String(req.socket?.remoteAddress || '');
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

function createRequestHandler(root) {
  return async (req, res) => {
    try {
      const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
      const pathname = url.pathname;
      const local = isLoopbackReq(req);

      if (pathname === '/api/config') {
        const cfg = { yahoo: true, finnhub: !!finnhubKey, port: PORT, app: 'StockWay', shareAvailable: true };
        if (local) cfg.shutdownToken = SHUTDOWN_TOKEN;
        sendJson(res, 200, cfg);
        return;
      }

      if (pathname === '/api/share/status') {
        if (!local) { sendJson(res, 403, { error: 'Host only' }); return; }
        sendJson(res, 200, shareTunnel.getStatus());
        return;
      }

      if (pathname === '/api/share/start') {
        if (!local) { sendJson(res, 403, { error: 'Host only' }); return; }
        if (req.method !== 'POST') { sendJson(res, 405, { error: 'POST required' }); return; }
        try {
          const status = await shareTunnel.startTunnel(PORT, app.getPath('userData'));
          sendJson(res, 200, status);
        } catch (err) {
          sendJson(res, 502, {
            active: false,
            url: null,
            status: 'error',
            error: err?.message || 'Could not create share link',
            provider: null,
            detail: null,
          });
        }
        return;
      }

      if (pathname === '/api/share/stop') {
        if (!local) { sendJson(res, 403, { error: 'Host only' }); return; }
        if (req.method !== 'POST') { sendJson(res, 405, { error: 'POST required' }); return; }
        sendJson(res, 200, await shareTunnel.stopTunnel());
        return;
      }

      if (pathname === '/api/news') {
        if (!finnhubKey) { sendJson(res, 200, { news: [] }); return; }
        try {
          const news = await fetchJson(`https://finnhub.io/api/v1/news?category=general&token=${finnhubKey}`);
          const list = Array.isArray(news) ? news.slice(0, 25).map((n) => ({
            category: n.category || 'general',
            datetime: n.datetime,
            headline: n.headline || n.title || '',
            id: n.id,
            image: n.image || '',
            related: n.related || '',
            source: n.source || '',
            summary: n.summary || '',
            url: n.url || n.link || n.article_url || n.articleUrl || '',
          })) : [];
          sendJson(res, 200, { news: list });
        } catch {
          sendJson(res, 502, { error: 'News unavailable' });
        }
        return;
      }

      if (pathname === '/api/quote') {
        const sym = (url.searchParams.get('symbol') || 'AAPL').toUpperCase().slice(0, 16);
        if (!isValidSymbol(sym)) { sendJson(res, 400, { error: 'Invalid symbol' }); return; }
        try {
          const q = await yahooQuote(sym);
          sendJson(res, q ? 200 : 502, q || { error: 'unavailable' });
        } catch { sendJson(res, 502, { error: 'unavailable' }); }
        return;
      }

      if (pathname === '/api/candles') {
        const sym = (url.searchParams.get('symbol') || 'AAPL').toUpperCase().slice(0, 16);
        if (!isValidSymbol(sym)) { sendJson(res, 400, { error: 'Invalid symbol' }); return; }
        const resolution = url.searchParams.get('range') || url.searchParams.get('resolution') || '1D';
        const count = Math.min(3600, Math.max(1, parseInt(url.searchParams.get('count') || '120', 10) || 120));
        try {
          const candles = await yahooCandles(sym, resolution, count);
          sendJson(res, candles ? 200 : 502, { candles: candles || [] });
        } catch { sendJson(res, 502, { candles: [] }); }
        return;
      }

      if (pathname === '/api/shutdown') {
        if (!local) { sendJson(res, 403, { error: 'Forbidden' }); return; }
        if (req.method !== 'POST') { sendJson(res, 405, { error: 'POST required' }); return; }
        const token = String(req.headers['x-stockway-shutdown'] || '');
        if (token !== SHUTDOWN_TOKEN) { sendJson(res, 403, { error: 'Forbidden' }); return; }
        sendJson(res, 200, { ok: true, app: 'StockWay' });
        setTimeout(() => app.quit(), 80);
        return;
      }

      if (pathname === '/api/splash-choice' && req.method === 'POST') {
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
          try {
            const choice = String(JSON.parse(body || '{}').choice || '').trim().toLowerCase();
            const allowed = ['candles', 'neon', 'ticker', 'bars'];
            if (allowed.includes(choice)) {
              fs.writeFileSync(getSplashChoicePath(), choice, 'utf8');
              sendJson(res, 200, { ok: true, choice });
              return;
            }
          } catch (_) {}
          sendJson(res, 400, { error: 'Invalid choice' });
        });
        return;
      }

      let urlPath = decodeURIComponent(pathname);
      if (urlPath === '/') urlPath = '/index.html';
      const safeRel = urlPath.replace(/\.\./g, '').replace(/^\/+/, '');
      if (isBlockedStatic(safeRel)) {
        res.writeHead(403); res.end('Forbidden'); return;
      }
      const filePath = path.join(root, safeRel);
      if (!filePath.startsWith(root)) {
        res.writeHead(403); res.end('Forbidden'); return;
      }

      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not found'); return; }
        const ext = path.extname(filePath).toLowerCase();
        const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
        if (['.html', '.js', '.css'].includes(ext)) {
          headers['Cache-Control'] = 'no-cache, must-revalidate';
        }
        res.writeHead(200, headers);
        res.end(data);
      });
    } catch (_) {
      try { res.writeHead(500); res.end('Error'); } catch (__) {}
    }
  };
}

function listenOnPort(root, port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(createRequestHandler(root));
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      PORT = port;
      serverInstance = server;
      resolve(server);
    });
  });
}

async function startServer(root) {
  loadFinnhubKey(root);
  let lastErr = null;
  for (const port of PREFERRED_PORTS) {
    try {
      return await listenOnPort(root, port);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('No free port');
}

function closeServer() {
  if (!serverInstance) return;
  try { serverInstance.close(); } catch (_) {}
  serverInstance = null;
}

function setSplashStatus(msg) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.executeJavaScript(
      `document.getElementById('status')&&(document.getElementById('status').textContent=${JSON.stringify(msg)})`
    ).catch(() => {});
  }
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function getSplashChoicePath() {
  // Packaged asar is read-only — persist splash pick under userData.
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), 'splash-active.txt');
  }
  return path.join(__dirname, 'splash-active.txt');
}

function getSplashPath() {
  const map = {
    candles: 'splash-candles.html',
    neon: 'splash-neon.html',
    ticker: 'splash-ticker.html',
    bars: 'splash-bars.html',
  };
  try {
    const choice = fs.readFileSync(getSplashChoicePath(), 'utf8').trim().toLowerCase();
    if (map[choice]) return path.join(__dirname, map[choice]);
  } catch (_) {}
  // Dev fallback: packaged default file next to main
  try {
    const bundled = path.join(__dirname, 'splash-active.txt');
    if (bundled !== getSplashChoicePath()) {
      const choice = fs.readFileSync(bundled, 'utf8').trim().toLowerCase();
      if (map[choice]) return path.join(__dirname, map[choice]);
    }
  } catch (_) {}
  return path.join(__dirname, 'splash.html');
}

function createSplash() {
  const icon = getAppIconPath();
  splashWindow = new BrowserWindow({
    width: 520, height: 360, frame: false, resizable: false, center: true,
    alwaysOnTop: true, backgroundColor: '#09090b', show: false,
    ...(icon ? { icon } : {}),
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  splashWindow.loadFile(getSplashPath());
  splashWindow.once('ready-to-show', () => splashWindow.show());
}

async function createMainWindow() {
  const root = getGameRoot();
  createSplash();
  await delay(250);
  setSplashStatus('Starting StockWay…');
  try {
    await startServer(root);
  } catch (err) {
    setSplashStatus('Could not start local server');
    console.error(err);
    await delay(1200);
    app.quit();
    return;
  }
  setSplashStatus('Loading market data…');
  await delay(350);

  const icon = getAppIconPath();
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1024, minHeight: 700,
    title: 'StockWay — Paper Trade Simulator',
    backgroundColor: '#09090b',
    autoHideMenuBar: true,
    show: false,
    ...(icon ? { icon } : {}),
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#09090b',
      symbolColor: '#a1a1aa',
      height: 36,
    },
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  mainWindow.loadURL(`http://127.0.0.1:${PORT}/?v=${CACHE_BUST}`);

  const openExternalSafe = (url) => {
    try {
      const u = new URL(url);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return;
      shell.openExternal(u.href);
    } catch (_) { /* ignore bad URLs */ }
  };

  // target=_blank / window.open → system browser (never a second Electron window)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url);
    return { action: 'deny' };
  });

  // Same-tab navigations away from the local desk also open externally
  mainWindow.webContents.on('will-navigate', (e, url) => {
    const local = `http://127.0.0.1:${PORT}`;
    if (url === local || url.startsWith(`${local}/`)) return;
    e.preventDefault();
    openExternalSafe(url);
  });

  mainWindow.once('ready-to-show', () => {
    setSplashStatus('Ready');
    setTimeout(() => {
      if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
      splashWindow = null;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
      }
    }, 280);
  });

  let closingAfterSave = false;
  const CLOSE_SAVE_TIMEOUT_MS = 3000;

  function finishCloseAfterSave(ok) {
    if (closingAfterSave) return;
    closingAfterSave = true;
    if (!ok) {
      console.warn('[StockWay] Emergency save did not confirm; quitting anyway.');
    }
    try {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
    } catch (_) { /* ignore */ }
    mainWindow = null;
    app.quit();
  }

  mainWindow.on('close', (e) => {
    if (closingAfterSave || isQuitting) return;
    e.preventDefault();
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      finishCloseAfterSave(false);
    }, CLOSE_SAVE_TIMEOUT_MS);

    Promise.resolve(
      mainWindow.webContents.executeJavaScript(
        `(function(){try{var f=window.__stockwayFlushSave;return typeof f==="function"?Promise.resolve(f()):false;}catch(e){return false;}})()`,
        true,
      ),
    ).then((ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      finishCloseAfterSave(!!ok);
    }).catch(() => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      finishCloseAfterSave(false);
    });
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

if (gotLock) {
  app.whenReady().then(createMainWindow);
  app.on('before-quit', () => {
    isQuitting = true;
    try { shareTunnel.stopTunnel(); } catch (_) {}
    closeServer();
  });
  app.on('window-all-closed', () => {
    try { shareTunnel.stopTunnel(); } catch (_) {}
    closeServer();
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('activate', () => {
    if (!isQuitting && mainWindow === null && splashWindow === null) createMainWindow();
  });
}
