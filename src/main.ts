// CryptoGlance - a glanceable crypto companion for Even Realities G2.
//
// Track: Crypto & DeFi (Heads Up: Even Realities Hackathon).
// Read: live BTC/ETH/BNB/SOL/XRP prices on the glasses' 576x288 mono display.
// Write: one-tap paper trades with an explicit confirm step, and price
// alerts you can set in seconds - all simulated locally (paper money only,
// no real funds, no exchange accounts, not financial advice).
//
// The same view-model drives two renderers:
//  - the real G2 display, via the Even Hub SDK bridge (containers), and
//  - an in-page 576x288 preview used in browsers and for development.

import {
  OsEventTypeList,
  StartUpPageCreateResult,
  waitForEvenAppBridge,
  type EvenAppBridge,
} from '@evenrealities/even_hub_sdk';
import { fetchPrices, type CoinQuote, type PriceSource } from './prices';
import { fmtClock, fmtPct, fmtQty, fmtUsd, fmtUsdExact } from './format';
import { PaperStore, TRADE_USD, type KeyValueStore } from './store';

// ---------------------------------------------------------------------------
// View state machine
// ---------------------------------------------------------------------------

type View =
  | { kind: 'watchlist' }
  | { kind: 'detail'; symbol: string }
  | { kind: 'confirm'; symbol: string; side: 'buy' | 'sell' }
  | { kind: 'portfolio' }
  | { kind: 'alerts' }
  | { kind: 'alertFired'; symbol: string; price: number; target: number; direction: 'above' | 'below' }
  | { kind: 'message'; title: string; body: string; back: View };

const MENU = { REFRESH: 1, PORTFOLIO: 2, ALERTS: 3, BACK: 9 } as const;

interface Projection {
  header: string;
  body: string;
  items: string[];
  footer: string;
  layout: 'list' | 'standard';
  menu: { itemID: number; itemName: string }[];
}

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------

let bridge: EvenAppBridge | null = null;
let pageStarted = false;
let glassesFailed = false;
let view: View = { kind: 'watchlist' };
let quotes: CoinQuote[] = [];
let priceSource: PriceSource = 'sample';
let lastSignature = '';
let previewIndex = 0;

const kv: KeyValueStore = {
  async get(key) {
    if (bridge) {
      const v = await bridge.getLocalStorage(key);
      return v ? v : null;
    }
    return localStorage.getItem(key);
  },
  async set(key, value) {
    if (bridge) await bridge.setLocalStorage(key, value);
    else localStorage.setItem(key, value);
  },
};
const store = new PaperStore(kv);

const quoteOf = (symbol: string): CoinQuote | undefined => quotes.find((q) => q.symbol === symbol);
const priceMap = (): Map<string, number> => new Map(quotes.map((q) => [q.symbol, q.price]));

// ---------------------------------------------------------------------------
// Projection: view -> text lines + list items (shared by both renderers)
// ---------------------------------------------------------------------------

function project(v: View): Projection {
  const tag = priceSource === 'sample' ? 'DEMO' : 'LIVE';
  const clock = fmtClock(new Date());
  const refreshItem = { itemID: MENU.REFRESH, itemName: 'Refresh prices' };
  const backItem = { itemID: MENU.BACK, itemName: 'Back' };

  switch (v.kind) {
    case 'watchlist': {
      return {
        header: `CryptoGlance ${clock} ${tag}`,
        body: '',
        items: quotes.map((q) => `${q.symbol} ${fmtUsd(q.price)} ${fmtPct(q.change24h)}`),
        footer: 'Tap a coin for detail · Menu for more',
        layout: 'list',
        menu: [
          refreshItem,
          { itemID: MENU.PORTFOLIO, itemName: 'Paper portfolio' },
          { itemID: MENU.ALERTS, itemName: 'Price alerts' },
        ],
      };
    }
    case 'detail': {
      const q = quoteOf(v.symbol);
      const h = store.state.holdings[v.symbol];
      const lines = q
        ? [
            `${fmtUsd(q.price)}   ${fmtPct(q.change24h)} (24h)`,
            `High ${fmtUsd(q.high24h)} · Low ${fmtUsd(q.low24h)}`,
            h
              ? `Paper: ${fmtQty(h.qty)} ${v.symbol} ~ ${fmtUsd(h.qty * q.price)}`
              : 'Paper: no position yet',
            h ? `Avg cost ${fmtUsd(h.avgCost)}` : `Paper cash ${fmtUsdExact(store.state.cash)}`,
          ]
        : ['Price unavailable'];
      return {
        header: `${v.symbol} · ${q?.name ?? ''}`,
        body: lines.join('\n'),
        items: [
          `Paper buy ${fmtUsd(TRADE_USD)}`,
          `Paper sell ${fmtUsd(TRADE_USD)}`,
          'Alert at +5%',
          'Alert at -5%',
          'Back to list',
        ],
        footer: 'Tap an action · Menu: back',
        layout: 'standard',
        menu: [backItem, refreshItem, { itemID: MENU.PORTFOLIO, itemName: 'Paper portfolio' }],
      };
    }
    case 'confirm': {
      const q = quoteOf(v.symbol);
      const price = q?.price ?? 0;
      const qty = price > 0 ? TRADE_USD / price : 0;
      const body =
        v.side === 'buy'
          ? [
              `PAPER BUY - ${v.symbol}`,
              `Spend ${fmtUsdExact(TRADE_USD)} paper cash`,
              `Get ~ ${fmtQty(qty)} ${v.symbol} @ ${fmtUsd(price)}`,
              'Simulated. No real money is used.',
            ].join('\n')
          : [
              `PAPER SELL - ${v.symbol}`,
              `Sell ${fmtUsdExact(TRADE_USD)} worth @ ${fmtUsd(price)}`,
              `~ ${fmtQty(qty)} ${v.symbol}`,
              'Simulated. No real money is used.',
            ].join('\n');
      return {
        header: v.side === 'buy' ? 'Confirm buy' : 'Confirm sell',
        body,
        items: [v.side === 'buy' ? 'Confirm buy' : 'Confirm sell', 'Cancel'],
        footer: 'Tap Confirm to execute (paper)',
        layout: 'standard',
        menu: [backItem],
      };
    }
    case 'portfolio': {
      const total = store.totalValue(priceMap());
      const pnl = total - 1000;
      const lines = [
        `Cash ${fmtUsdExact(store.state.cash)} · Total ${fmtUsdExact(total)}`,
        `PnL ${pnl >= 0 ? '+' : '-'}${fmtUsdExact(Math.abs(pnl))} (paper)`,
      ];
      const held = Object.values(store.state.holdings);
      if (held.length === 0) lines.push('No positions yet.');
      for (const h of held) {
        const p = priceMap().get(h.symbol) ?? h.avgCost;
        lines.push(`${h.symbol} ${fmtQty(h.qty)} ~ ${fmtUsd(h.qty * p)}`);
      }
      return {
        header: 'Paper portfolio',
        body: lines.join('\n'),
        items: ['Back to list'],
        footer: 'Paper money only · not financial advice',
        layout: 'standard',
        menu: [backItem, refreshItem],
      };
    }
    case 'alerts': {
      const alerts = store.state.alerts;
      const body =
        alerts.length === 0
          ? 'No alerts yet.\nOpen a coin, then choose\n"Alert at +5%" or "Alert at -5%".'
          : alerts
              .map((a) => `${a.symbol} ${a.direction === 'above' ? '>=' : '<='} ${fmtUsd(a.target)}`)
              .join('\n');
      return {
        header: `Price alerts (${alerts.length})`,
        body,
        items: [
          ...alerts.map(
            (a) => `Delete: ${a.symbol} ${a.direction === 'above' ? '>=' : '<='} ${fmtUsd(a.target)}`,
          ),
          'Back to list',
        ],
        footer: 'Tap an alert to delete it',
        layout: 'standard',
        menu: [backItem, refreshItem],
      };
    }
    case 'alertFired': {
      return {
        header: 'PRICE ALERT',
        body: [
          `${v.symbol} is now ${fmtUsd(v.price)}`,
          `Your target ${v.direction === 'above' ? '>=' : '<='} ${fmtUsd(v.target)} was reached.`,
        ].join('\n'),
        items: [`View ${v.symbol}`, 'Dismiss'],
        footer: 'Alert delivered on-glasses',
        layout: 'standard',
        menu: [backItem],
      };
    }
    case 'message': {
      return {
        header: v.title,
        body: v.body,
        items: ['OK'],
        footer: '',
        layout: 'standard',
        menu: [backItem],
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Glasses rendering via the Even Hub SDK
// ---------------------------------------------------------------------------

function buildPage(p: Projection) {
  const header = {
    containerID: 1,
    containerName: 'header',
    xPosition: 0,
    yPosition: 0,
    width: 576,
    height: 36,
    content: p.header,
    isEventCapture: 0,
    zOrderIndex: 1,
  };
  const footer = {
    containerID: 4,
    containerName: 'footer',
    xPosition: 0,
    yPosition: 250,
    width: 576,
    height: 34,
    content: p.footer,
    isEventCapture: 0,
    zOrderIndex: 4,
  };
  const menuObject = { menuItems: p.menu };

  if (p.layout === 'list') {
    return {
      containerTotalNum: 3,
      textObject: [header, footer],
      listObject: [
        {
          containerID: 3,
          containerName: 'main-list',
          xPosition: 0,
          yPosition: 42,
          width: 576,
          height: 202,
          isEventCapture: 1,
          zOrderIndex: 3,
          itemContainer: { itemCount: p.items.length, itemName: p.items },
        },
      ],
      menuObject,
    };
  }
  return {
    containerTotalNum: 4,
    textObject: [
      header,
      {
        containerID: 2,
        containerName: 'body',
        xPosition: 8,
        yPosition: 42,
        width: 560,
        height: 138,
        content: p.body,
        isEventCapture: 0,
        zOrderIndex: 2,
      },
      footer,
    ],
    listObject: [
      {
        containerID: 3,
        containerName: 'main-list',
        xPosition: 0,
        yPosition: 186,
        width: 576,
        height: 60,
        isEventCapture: 1,
        zOrderIndex: 3,
        itemContainer: { itemCount: p.items.length, itemName: p.items },
      },
    ],
    menuObject,
  };
}

async function renderGlasses(force = false): Promise<void> {
  if (!bridge || glassesFailed) return;
  const p = project(view);
  const signature = JSON.stringify(p);
  if (!force && pageStarted && signature === lastSignature) return;
  lastSignature = signature;
  const page = buildPage(p);
  try {
    if (!pageStarted) {
      const result = await bridge.createStartUpPageContainer(page as never);
      pageStarted = result === StartUpPageCreateResult.success;
      if (!pageStarted) {
        // Payload validity is covered by scripts/validate-page.mjs; a failure
        // here means the host rejected the page. Stop retrying so the
        // browser preview keeps running cleanly.
        glassesFailed = true;
        console.error('[cryptoglance] startup page rejected by host:', result);
      }
    } else {
      await bridge.rebuildPageContainer(page as never);
    }
  } catch (err) {
    glassesFailed = true;
    console.error('[cryptoglance] render failed', err);
  }
}

// ---------------------------------------------------------------------------
// Browser preview rendering (same projection, 576x288 DOM mirror)
// ---------------------------------------------------------------------------

const $ = (id: string) => document.getElementById(id)!;

function renderPreview(): void {
  const p = project(view);
  $('pv-header').textContent = p.header;
  $('pv-body').textContent = p.body;
  $('pv-footer').textContent = p.footer;
  const list = $('pv-list');
  list.innerHTML = '';
  p.items.forEach((item, i) => {
    const div = document.createElement('div');
    div.className = 'pv-item' + (i === previewIndex ? ' sel' : '');
    div.textContent = (i === previewIndex ? '› ' : '  ') + item;
    list.appendChild(div);
  });
  const menuBox = $('menu-buttons');
  menuBox.innerHTML = '';
  for (const m of p.menu) {
    const b = document.createElement('button');
    b.textContent = m.itemName;
    b.addEventListener('click', () => void onMenu(m.itemID));
    menuBox.appendChild(b);
  }
  const s = store.state;
  $('status').textContent =
    `Mode: ${bridge ? 'Even Hub bridge connected' : 'browser preview'} · ` +
    `Prices: ${priceSource} · Paper cash ${fmtUsdExact(s.cash)} · ` +
    `Positions: ${Object.keys(s.holdings).length} · Alerts: ${s.alerts.length}`;
}

async function render(force = false): Promise<void> {
  renderPreview();
  await renderGlasses(force);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function go(v: View): Promise<void> {
  view = v;
  previewIndex = 0;
  return render(true);
}

async function activate(index: number): Promise<void> {
  const p = project(view);
  if (index < 0 || index >= p.items.length) return;

  switch (view.kind) {
    case 'watchlist': {
      const q = quotes[index];
      if (q) await go({ kind: 'detail', symbol: q.symbol });
      break;
    }
    case 'detail': {
      const symbol = view.symbol;
      if (index === 0) await go({ kind: 'confirm', symbol, side: 'buy' });
      else if (index === 1) await go({ kind: 'confirm', symbol, side: 'sell' });
      else if (index === 2 || index === 3) {
        const q = quoteOf(symbol);
        if (!q) break;
        const direction = index === 2 ? 'above' : 'below';
        const target = q.price * (index === 2 ? 1.05 : 0.95);
        store.addAlert(symbol, direction, target);
        await store.save();
        await go({
          kind: 'message',
          title: 'Alert set',
          body: `${symbol} alert: notify at ${direction === 'above' ? '>=' : '<='} ${fmtUsd(target)}\n(current ${fmtUsd(q.price)})`,
          back: { kind: 'detail', symbol },
        });
      } else if (index === 4) await go({ kind: 'watchlist' });
      break;
    }
    case 'confirm': {
      const { symbol, side } = view;
      if (index === 1) {
        await go({ kind: 'detail', symbol });
        break;
      }
      const q = quoteOf(symbol);
      if (!q) break;
      if (side === 'buy') {
        const qty = store.buy(symbol, TRADE_USD, q.price);
        await store.save();
        await go({
          kind: 'message',
          title: qty ? 'Paper buy done' : 'Buy failed',
          body: qty
            ? `Bought ${fmtQty(qty)} ${symbol} @ ${fmtUsd(q.price)}\nPaper cash left: ${fmtUsdExact(store.state.cash)}`
            : `Not enough paper cash (need ${fmtUsdExact(TRADE_USD)}).`,
          back: { kind: 'detail', symbol },
        });
      } else {
        const received = store.sell(symbol, TRADE_USD, q.price);
        await store.save();
        await go({
          kind: 'message',
          title: received ? 'Paper sell done' : 'Sell failed',
          body: received
            ? `Sold ${fmtUsdExact(received)} of ${symbol} @ ${fmtUsd(q.price)}\nPaper cash: ${fmtUsdExact(store.state.cash)}`
            : `No ${symbol} position to sell.`,
          back: { kind: 'detail', symbol },
        });
      }
      break;
    }
    case 'portfolio': {
      await go({ kind: 'watchlist' });
      break;
    }
    case 'alerts': {
      const alerts = store.state.alerts;
      if (index < alerts.length) {
        store.removeAlert(alerts[index].id);
        await store.save();
        await render(true);
      } else {
        await go({ kind: 'watchlist' });
      }
      break;
    }
    case 'alertFired': {
      if (index === 0) await go({ kind: 'detail', symbol: view.symbol });
      else await go({ kind: 'watchlist' });
      break;
    }
    case 'message': {
      await go(view.back);
      break;
    }
  }
}

async function onMenu(itemID: number): Promise<void> {
  switch (itemID) {
    case MENU.REFRESH:
      await refreshPrices();
      await render(true);
      break;
    case MENU.PORTFOLIO:
      await go({ kind: 'portfolio' });
      break;
    case MENU.ALERTS:
      await go({ kind: 'alerts' });
      break;
    case MENU.BACK: {
      if (view.kind === 'detail' || view.kind === 'portfolio' || view.kind === 'alerts' || view.kind === 'alertFired')
        await go({ kind: 'watchlist' });
      else if (view.kind === 'confirm') await go({ kind: 'detail', symbol: view.symbol });
      else if (view.kind === 'message') await go(view.back);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Price refresh + alert engine
// ---------------------------------------------------------------------------

async function refreshPrices(): Promise<void> {
  const result = await fetchPrices();
  quotes = result.quotes;
  priceSource = result.source;

  // Fire any alerts whose target was reached.
  for (const alert of [...store.state.alerts]) {
    const q = quoteOf(alert.symbol);
    if (!q) continue;
    const hit = alert.direction === 'above' ? q.price >= alert.target : q.price <= alert.target;
    if (hit) {
      store.removeAlert(alert.id);
      await store.save();
      await go({
        kind: 'alertFired',
        symbol: alert.symbol,
        price: q.price,
        target: alert.target,
        direction: alert.direction,
      });
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

function hostPresent(): boolean {
  const w = window as unknown as { flutter_inappwebview?: { callHandler?: unknown } };
  return typeof w.flutter_inappwebview?.callHandler === 'function';
}

async function tryBridge(): Promise<EvenAppBridge | null> {
  // waitForEvenAppBridge() resolves even in a plain browser (its calls then
  // fail against the missing host), so verify a real host before trusting it:
  // either the injected flutter_inappwebview handler exists, or a probe
  // getUserInfo() round-trip returns the host's (hardcoded) user profile.
  let candidate: EvenAppBridge | null = null;
  try {
    candidate = await Promise.race([
      waitForEvenAppBridge(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
    ]);
  } catch {
    return null;
  }
  if (!candidate) return null;
  if (hostPresent()) return candidate;
  try {
    const user = await Promise.race([
      candidate.getUserInfo(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
    ]);
    // Without a host the SDK returns its default profile (uid 0, empty
    // name); a real host (Even App or simulator) returns an actual profile.
    if (user && (user.name.trim() !== '' || user.uid !== 0)) return candidate;
  } catch {
    /* no host answered */
  }
  return null;
}

async function main(): Promise<void> {
  bridge = await tryBridge();
  await store.load();
  await refreshPrices();
  await render(true);

  if (bridge) {
    bridge.onLaunchSource((source) => console.log('[cryptoglance] launch source:', source));
    bridge.onEvenHubEvent((event) => {
      if (event.menuItemClickEvent) {
        void onMenu(Number(event.menuItemClickEvent.itemID));
        return;
      }
      const list = event.listEvent;
      if (
        list &&
        (list.eventType === OsEventTypeList.CLICK_EVENT ||
          list.eventType === OsEventTypeList.DOUBLE_CLICK_EVENT)
      ) {
        const idx =
          typeof list.currentSelectItemIndex === 'number' ? list.currentSelectItemIndex : previewIndex;
        void activate(idx);
      }
    });
    console.log('[cryptoglance] Even Hub bridge ready');
  }

  setInterval(() => {
    void (async () => {
      await refreshPrices();
      await render();
    })();
  }, 30_000);
}

// Preview controls (browser / desktop development)
document.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const act = btn.dataset.act;
    const count = project(view).items.length;
    if (act === 'up') previewIndex = Math.max(0, previewIndex - 1);
    if (act === 'down') previewIndex = Math.min(count - 1, previewIndex + 1);
    if (act === 'click') void activate(previewIndex);
    renderPreview();
  });
});
window.addEventListener('keydown', (e) => {
  const count = project(view).items.length;
  if (e.key === 'ArrowUp') previewIndex = Math.max(0, previewIndex - 1);
  else if (e.key === 'ArrowDown') previewIndex = Math.min(count - 1, previewIndex + 1);
  else if (e.key === 'Enter') void activate(previewIndex);
  else if (e.key === 'Escape') void onMenu(MENU.BACK);
  else return;
  renderPreview();
});

void main();
