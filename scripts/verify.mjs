// Headless verification for CryptoGlance.
//
// Launches the cached Chromium with CDP, loads the built app (dist/ served
// on :4173), drives the browser-preview UI through the core flows
// (watchlist -> detail -> confirm paper buy -> message -> portfolio),
// captures 576x288 screenshots of the glasses preview element, and prints a
// JSON summary. Exits non-zero if any step fails.
//
// Usage: node scripts/verify.mjs [baseUrl]

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:4173/';
const chromePath = path.join(
  homedir(),
  '.cache/ms-playwright/chromium-1255/chrome-linux64/chrome',
);
const outDir = path.resolve('screenshots');
mkdirSync(outDir, { recursive: true });

const PORT = 9223;
const chrome = spawn(
  chromePath,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=780,720',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDebugger() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return;
    } catch {}
    await sleep(200);
  }
  throw new Error('chrome debugger did not start');
}

let msgId = 0;
const pending = new Map();
let ws;

function send(method, params = {}) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const res = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res.result?.exceptionDetails) {
    throw new Error('evaluate failed: ' + JSON.stringify(res.result.exceptionDetails).slice(0, 400));
  }
  return res.result?.result?.value;
}

async function waitFor(expression, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await evaluate(expression)) return;
    await sleep(300);
  }
  throw new Error('timeout waiting for: ' + expression);
}

async function screenshotGlasses(name) {
  const rect = await evaluate(`(() => {
    const r = document.getElementById('glasses').getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  })()`);
  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    clip: { ...rect, scale: 1 },
  });
  writeFileSync(path.join(outDir, name), Buffer.from(shot.result.data, 'base64'));
  return rect;
}

const click = (expr) => evaluate(`document.querySelector(${JSON.stringify(expr)}).click()`);
const listText = () =>
  evaluate(`[...document.querySelectorAll('.pv-item')].map(e => e.textContent.trim()).join(' | ')`);
const bodyText = () => evaluate(`document.getElementById('pv-body').textContent`);
const headerText = () => evaluate(`document.getElementById('pv-header').textContent`);

const summary = { steps: [], errors: [] };

try {
  await waitForDebugger();
  const targetRes = await fetch(
    `http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(baseUrl)}`,
    { method: 'PUT' },
  );
  const target = await targetRes.json();

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    if (data.id && pending.has(data.id)) {
      pending.get(data.id).resolve(data);
      pending.delete(data.id);
    }
    if (data.method === 'Runtime.consoleAPICalled' && data.params?.type === 'error') {
      summary.errors.push(JSON.stringify(data.params.args).slice(0, 200));
    }
  };
  await send('Page.enable');
  await send('Runtime.enable');

  // 1. Watchlist renders with 5 coins.
  await waitFor(`document.querySelectorAll('.pv-item').length >= 5`);
  summary.steps.push({ step: 'watchlist', header: await headerText(), items: await listText() });
  const rect = await screenshotGlasses('glasses-watchlist.png');
  summary.glassesRect = rect;

  // 2. Select first coin -> detail.
  await click('[data-act="click"]');
  await waitFor(`document.getElementById('pv-header').textContent.includes('BTC')`);
  summary.steps.push({ step: 'detail', header: await headerText(), body: await bodyText() });
  await screenshotGlasses('glasses-detail.png');

  // 3. First action = Paper buy -> confirm screen.
  await click('[data-act="click"]');
  await waitFor(`document.getElementById('pv-header').textContent.includes('Confirm')`);
  summary.steps.push({ step: 'confirm', body: await bodyText() });
  await screenshotGlasses('glasses-confirm.png');

  // 4. Confirm -> "Paper buy done" message.
  await click('[data-act="click"]');
  await waitFor(`document.getElementById('pv-header').textContent.includes('done')`);
  summary.steps.push({ step: 'buy-done', body: await bodyText() });

  // 5. OK -> back to detail, then open Portfolio from the menu buttons.
  await click('[data-act="click"]');
  await waitFor(`document.getElementById('pv-header').textContent.includes('BTC')`);
  await evaluate(`[...document.querySelectorAll('#menu-buttons button')]
    .find(b => b.textContent.includes('portfolio')).click()`);
  await waitFor(`document.getElementById('pv-header').textContent.includes('portfolio')`);
  summary.steps.push({ step: 'portfolio', body: await bodyText() });
  await screenshotGlasses('glasses-portfolio.png');

  summary.status = await evaluate(`document.getElementById('status').textContent`);
  console.log(JSON.stringify(summary, null, 2));
} finally {
  try {
    ws?.close();
  } catch {}
  chrome.kill('SIGTERM');
}
