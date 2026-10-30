const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const rootDir = path.resolve(__dirname, '..');

function findBrowser() {
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

function startStaticServer() {
  const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.png': 'image/png',
    '.woff2': 'font/woff2',
    '.json': 'application/json',
  };
  const server = http.createServer((req, res) => {
    let u = req.url.split('?')[0];
    if (u === '/') u = '/index.html';
    const f = path.join(rootDir, u);
    if (!fs.existsSync(f)) {
      res.writeHead(404);
      return res.end('Not found');
    }
    const ext = path.extname(f);
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

async function main() {
  const { server, port: serverPort } = await startStaticServer();
  const debugPort = 9200 + Math.floor(Math.random() * 500);
  const browserPath = findBrowser();
  const tmpDir = path.join(os.tmpdir(), 'chrome_viewports_' + Date.now());

  const proc = spawn(browserPath, [
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${tmpDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    `http://127.0.0.1:${serverPort}/`,
  ]);

  let targets = null;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 200));
    try {
      const res = await fetch(`http://127.0.0.1:${debugPort}/json`);
      targets = await res.json();
      if (targets && targets.length) break;
    } catch (e) {}
  }

  const pageTarget = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

  await new Promise((resolve) => {
    ws.onopen = resolve;
  });

  let id = 1;
  const callbacks = new Map();
  ws.onmessage = (evt) => {
    const msg = JSON.parse(evt.data);
    if (callbacks.has(msg.id)) {
      const { resolve, reject } = callbacks.get(msg.id);
      callbacks.delete(msg.id);
      if (msg.error) reject(msg.error);
      else resolve(msg.result);
    }
  };

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const reqId = id++;
      callbacks.set(reqId, { resolve, reject });
      ws.send(JSON.stringify({ id: reqId, method, params }));
    });
  }

  const testViewports = [
    { name: 'pixel_412x915', width: 412, height: 915, dpr: 2.625 },
    { name: 'iphone_393x852', width: 393, height: 852, dpr: 3 },
    { name: 'galaxy_360x800', width: 360, height: 800, dpr: 2 },
    { name: 'iphone_se_375x667', width: 375, height: 667, dpr: 2 },
    { name: 'desktop_1000x800', width: 1000, height: 800, dpr: 1 },
  ];

  for (const vp of testViewports) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: vp.dpr,
      mobile: vp.width < 600,
    });

    await new Promise((r) => setTimeout(r, 300));

    // Start or check game state
    await send('Runtime.evaluate', {
      expression: `
        if (window.bounceGame.currentState !== 'PLAYING') {
          window.bounceGame.startNewGame(1);
        } else {
          window.dispatchEvent(new Event('resize'));
        }
      `,
    });

    await new Promise((r) => setTimeout(r, 400));

    const check = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const canvas = document.getElementById('gameCanvas');
          const container = document.getElementById('gameContainer');
          const hud = document.getElementById('gameHud');
          const controls = document.getElementById('touchControls');
          const canvasRect = canvas.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          return {
            canvasWidth: canvas.width,
            canvasHeight: canvas.height,
            cssCanvasRect: { width: canvasRect.width, height: canvasRect.height, top: canvasRect.top, bottom: canvasRect.bottom },
            cssContainerRect: { width: containerRect.width, height: containerRect.height, top: containerRect.top, bottom: containerRect.bottom },
            gapTop: canvasRect.top - containerRect.top,
            gapBottom: containerRect.bottom - canvasRect.bottom,
            gameCanvasHeight: window.bounceGame.canvasHeight,
            cameraY: window.bounceGame.cameraY
          };
        })()
      `,
      returnByValue: true,
    });

    const info = check.result.value;
    console.log(`[Viewport: ${vp.name}]`);
    console.log(`  Canvas Buffer: ${info.canvasWidth} x ${info.canvasHeight}`);
    console.log(`  Container CSS: ${info.cssContainerRect.width} x ${info.cssContainerRect.height}`);
    console.log(`  Canvas CSS:    ${info.cssCanvasRect.width} x ${info.cssCanvasRect.height}`);
    console.log(`  Gaps: Top=${info.gapTop}px, Bottom=${info.gapBottom}px`);
    console.log(`  Camera Y: ${info.cameraY}, Game canvasHeight: ${info.gameCanvasHeight}`);

    if (vp.name === 'iphone_393x852') {
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      const shotBuffer = Buffer.from(shot.data, 'base64');
      fs.writeFileSync(path.resolve(rootDir, 'screenshots', 'iphone_393x852_verified.png'), shotBuffer);
    }
  }

  ws.close();
  proc.kill();
  server.close();
}

main().catch(console.error);

