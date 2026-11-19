// Demo-frame capture for CryptoGlance (extends scripts/verify.mjs).
//
// Drives the in-browser 576x288 preview through the full DEMO-SCRIPT flow:
// watchlist -> scroll -> BTC detail -> paper buy confirm -> buy done ->
// portfolio -> set alert (+5%) -> alerts screen -> back to watchlist.
// Captures the glasses element at 2x scale into an output dir.
// Usage: node scripts/capture-demo.mjs [baseUrl] [outDir]

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:4173/';
const outDir = path.resolve(process.argv[3] ?? 'demo-frames');
mkdirSync(outDir, { recursive: true });

const chromePath = path.join(
  homedir(),
  '.cache/ms-playwright/chromium-1255/chrome-linux64/chrome',
);

const PORT = 9224;
const chromeArgs = [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  '--no-sandbox',
  '--disable-gpu',
  '--window-size=780,720',
  'about:blank',
];
// Route browser traffic through the sandbox egress proxy when configured,
// so the app can reach Binance/CoinGecko for LIVE prices (falls back to the
// app's built-in, clearly-labelled DEMO sample data if unreachable).
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
if (proxy) chromeArgs.push(`--proxy-server=${proxy}`);

const chrome = spawn(chromePath, chromeArgs, { stdio: 'ignore' });

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

async function waitFor(expression, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await evaluate(expression)) return;
    await sleep(300);
  }
  throw new Error('timeout waiting for: ' + expression);
}

async function shot(name) {
  // Small beat so the frame is settled before capture.
  await sleep(600);
  const rect = await evaluate(`(() => {
    const r = document.getElementById('glasses').getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  })()`);
  const res = await send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    clip: { ...rect, scale: 2 },
  });
  writeFileSync(path.join(outDir, name), Buffer.from(res.result.data, 'base64'));
  return rect;
}

const clickAct = (act) => evaluate(`document.querySelector('[data-act="${act}"]').click()`);
const menuClick = (needle) =>
  evaluate(`[...document.querySelectorAll('#menu-buttons button')]
    .find(b => b.textContent.toLowerCase().includes(${JSON.stringify(needle)})).click()`);
const headerText = () => evaluate(`document.getElementById('pv-header').textContent`);
const bodyText = () => evaluate(`document.getElementById('pv-body').textContent`);
const statusText = () => evaluate(`document.getElementById('status').textContent`);

const log = { frames: [], notes: {} };

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
  };
  await send('Page.enable');
  await send('Runtime.enable');

  // Fresh profile => localStorage empty => paper portfolio starts at $1,000.
  await waitFor(`document.querySelectorAll('.pv-item').length >= 5`);
  await sleep(1500); // let the first price fetch settle (LIVE vs DEMO tag)
  log.notes.watchlistHeader = await headerText();
  log.notes.status = await statusText();
  await shot('f01-watchlist-a.png');
  log.frames.push('f01-watchlist-a');

  // Scroll the selection down through the list (SOL highlighted).
  await clickAct('down');
  await clickAct('down');
  await clickAct('down');
  await shot('f02-watchlist-b.png');
  log.frames.push('f02-watchlist-b');
  await clickAct('up');
  await clickAct('up');
  await clickAct('up');

  // BTC detail.
  await clickAct('click');
  await waitFor(`document.getElementById('pv-header').textContent.includes('BTC')`);
  log.notes.detailBody = await bodyText();
  await shot('f03-detail.png');
  log.frames.push('f03-detail');

  // Paper buy -> confirm screen.
  await clickAct('click');
  await waitFor(`document.getElementById('pv-header').textContent.includes('Confirm')`);
  log.notes.confirmBody = await bodyText();
  await shot('f04-confirm.png');
  log.frames.push('f04-confirm');

  // Confirm -> "Paper buy done".
  await clickAct('click');
  await waitFor(`document.getElementById('pv-header').textContent.includes('done')`);
  log.notes.buyDoneBody = await bodyText();
  await shot('f05-buydone.png');
  log.frames.push('f05-buydone');

  // OK -> detail, then Portfolio from the menu.
  await clickAct('click');
  await waitFor(`document.getElementById('pv-header').textContent.includes('BTC')`);
  await menuClick('portfolio');
  await waitFor(`document.getElementById('pv-header').textContent.toLowerCase().includes('portfolio')`);
  log.notes.portfolioBody = await bodyText();
  await shot('f06-portfolio.png');
  log.frames.push('f06-portfolio');

  // Back to list -> BTC detail -> highlight "Alert at +5%".
  await clickAct('click');
  await waitFor(`document.querySelectorAll('.pv-item').length >= 5`);
  await clickAct('click');
  await waitFor(`document.getElementById('pv-header').textContent.includes('BTC')`);
  await clickAct('down');
  await clickAct('down');
  await shot('f07-detail-alert.png');
  log.frames.push('f07-detail-alert');

  // Activate -> "Alert set" message.
  await clickAct('click');
  await waitFor(`document.getElementById('pv-header').textContent.includes('Alert set')`);
  log.notes.alertSetBody = await bodyText();
  await shot('f08-alertset.png');
  log.frames.push('f08-alertset');

  // OK -> detail -> menu Back -> watchlist -> menu "Price alerts".
  await clickAct('click');
  await waitFor(`document.getElementById('pv-header').textContent.includes('BTC')`);
  await menuClick('back');
  await waitFor(`document.querySelectorAll('.pv-item').length >= 5`);
  await menuClick('alerts');
  await waitFor(`document.getElementById('pv-header').textContent.includes('Price alerts')`);
  log.notes.alertsBody = await bodyText();
  await shot('f09-alerts.png');
  log.frames.push('f09-alerts');

  // Back to watchlist for the closing shot.
  await menuClick('back');
  await waitFor(`document.querySelectorAll('.pv-item').length >= 5`);
  await shot('f10-watchlist-end.png');
  log.frames.push('f10-watchlist-end');

  console.log(JSON.stringify(log, null, 2));
} finally {
  try {
    ws?.close();
  } catch {}
  chrome.kill('SIGTERM');
}
