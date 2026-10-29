/**
 * Visual Verification Script for BOUNCE Infinite Level Colour Themes.
 *
 * Launches visible Chrome, tests consecutive levels (1–6) and representative
 * later levels (7, 8, 10, 11, 14, 15), renders active gameplay frames with the new
 * themes, logs the active palette properties, and captures screenshots into
 * screenshots/themes/.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const OUT_DIR = path.join(__dirname, '..', 'screenshots', 'themes');
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function findBrowserExecutable() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}

function getAvailablePort(startPort) {
  return new Promise((resolve) => {
    const s = http.createServer();
    s.listen(startPort, '127.0.0.1', () => {
      s.close(() => resolve(startPort));
    });
    s.on('error', () => {
      resolve(getAvailablePort(startPort + 1));
    });
  });
}

function startServer(port) {
  const rootDir = path.join(__dirname, '..');
  const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
  };

  const server = http.createServer((req, res) => {
    let reqUrl = req.url.split('?')[0];
    if (reqUrl === '/') reqUrl = '/index.html';
    const filePath = path.join(rootDir, reqUrl);

    if (!fs.existsSync(filePath)) {
      res.statusCode = 404;
      return res.end('Not found: ' + reqUrl);
    }

    const ext = path.extname(filePath).toLowerCase();
    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    fs.createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

class ChromeDebugger {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.idCounter = 1;
    this.callbacks = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.id && this.callbacks.has(msg.id)) {
            const { resolve: resCb, reject: rejCb } = this.callbacks.get(msg.id);
            this.callbacks.delete(msg.id);
            if (msg.error) rejCb(msg.error);
            else resCb(msg.result);
          }
        } catch (e) {}
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.idCounter++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    return res && res.result ? res.result.value : undefined;
  }

  async captureScreenshot(filename) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    if (res && res.data) {
      const buffer = Buffer.from(res.data, 'base64');
      const outPath = path.join(OUT_DIR, filename);
      fs.writeFileSync(outPath, buffer);
      console.log(`[Theme Visual] Saved screenshot: ${filename} (${buffer.length} bytes)`);
      return outPath;
    }
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function verifyThemes() {
  const serverPort = await getAvailablePort(8096);
  const debugPort = await getAvailablePort(9226);
  const server = await startServer(serverPort);
  const browserPath = findBrowserExecutable();
  const tempProfile = path.join(os.tmpdir(), 'bounce_theme_verify_' + Date.now());

  const chrome = spawn(browserPath, [
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${tempProfile}`,
    '--window-size=500,890',
    `http://127.0.0.1:${serverPort}/`,
  ]);

  let cdpUrl = null;
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 400));
    try {
      const res = await fetch(`http://127.0.0.1:${debugPort}/json`);
      const tabs = await res.json();
      let pageTab = tabs.find((t) => t.type === 'page');
      if (pageTab && pageTab.webSocketDebuggerUrl) {
        cdpUrl = pageTab.webSocketDebuggerUrl;
        break;
      }
    } catch (e) {}
  }

  if (!cdpUrl) {
    chrome.kill();
    server.close();
    throw new Error('CDP connect failed');
  }

  const cdp = new ChromeDebugger(cdpUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/` });
  await new Promise((r) => setTimeout(r, 1200));

  // Test consecutive levels (1–6) and representative later levels (7, 8, 10, 11, 14, 15)
  const sampleLevels = [
    { lvl: 1, label: '01_icy_cyan' },
    { lvl: 2, label: '02_magenta_coral' },
    { lvl: 3, label: '03_acid_lime' },
    { lvl: 4, label: '04_ultraviolet' },
    { lvl: 5, label: '05_electric_orange' },
    { lvl: 6, label: '06_turquoise' },
    { lvl: 7, label: '07_crimson_ember' },
    { lvl: 8, label: '08_emerald_gold' },
    { lvl: 10, label: '10_chrome_silver' },
    { lvl: 11, label: '11_cyberpunk_yellow' },
    { lvl: 14, label: '14_amethyst_orchid' },
    { lvl: 15, label: '15_solar_plasma' },
  ];

  console.log('----------------------------------------------------------------------');
  console.log('  Capturing live rendered gameplay frames for themes');
  console.log('----------------------------------------------------------------------');

  for (const sample of sampleLevels) {
    await cdp.evaluate(`
      (() => {
        const game = window.bounceGame;
        if (game) {
          game.saveHighestUnlockedLevel(Math.max(game.highestUnlockedLevel, ${sample.lvl}));
          game.startNewGame(${sample.lvl});
        }
      })();
    `);
    await new Promise((r) => setTimeout(r, 600));

    const themeDetails = await cdp.evaluate(`
      (() => {
        const game = window.bounceGame;
        if (!game) return null;
        const colors = game.themeManager.getColors();
        return {
          name: colors.name,
          primary: colors.primary,
          secondary: colors.secondary,
          rail: colors.rail,
          bodyTop: colors.bodyTop,
          bgTop: colors.bgTop,
          bgMid: colors.bgMid,
        };
      })();
    `);

    console.log(`[Level ${sample.lvl}] Theme: "${themeDetails.name}"`);
    console.log(`  Dominant Hue (Primary): ${themeDetails.primary} | Rail: ${themeDetails.rail}`);
    console.log(`  Atmospheric Space (bgMid): ${themeDetails.bgMid} | BodyTop: ${themeDetails.bodyTop}`);

    await cdp.captureScreenshot(`theme_lvl_${sample.label}.png`);
  }

  cdp.close();
  chrome.kill();
  server.close();
  console.log('----------------------------------------------------------------------');
  console.log(`[Theme Visual] Successfully captured ${sampleLevels.length} theme gameplay screenshots!`);
  console.log(`[Theme Visual] Stored in: ${OUT_DIR}`);
  console.log('----------------------------------------------------------------------');
}

verifyThemes().catch((e) => {
  console.error('[Theme Visual Error]:', e);
  process.exit(1);
});
