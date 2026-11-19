// Price data for CryptoGlance.
// Primary source: Binance public API (no key, CORS-enabled, read-only).
// Fallback 1: CoinGecko public API (no key).
// Fallback 2: bundled sample data so the app always renders (flagged DEMO).

export interface CoinQuote {
  symbol: string;
  name: string;
  price: number;
  change24h: number; // percent
  high24h: number;
  low24h: number;
}

export type PriceSource = 'binance' | 'coingecko' | 'sample';

export interface PriceResult {
  quotes: CoinQuote[];
  source: PriceSource;
  fetchedAt: number;
}

export const COINS = [
  { symbol: 'BTC', name: 'Bitcoin', pair: 'BTCUSDT', gecko: 'bitcoin' },
  { symbol: 'ETH', name: 'Ethereum', pair: 'ETHUSDT', gecko: 'ethereum' },
  { symbol: 'BNB', name: 'BNB', pair: 'BNBUSDT', gecko: 'binancecoin' },
  { symbol: 'SOL', name: 'Solana', pair: 'SOLUSDT', gecko: 'solana' },
  { symbol: 'XRP', name: 'XRP', pair: 'XRPUSDT', gecko: 'ripple' },
] as const;

const SAMPLE_QUOTES: CoinQuote[] = [
  { symbol: 'BTC', name: 'Bitcoin', price: 97240, change24h: 2.4, high24h: 98100, low24h: 94860 },
  { symbol: 'ETH', name: 'Ethereum', price: 3412, change24h: 1.8, high24h: 3490, low24h: 3305 },
  { symbol: 'BNB', name: 'BNB', price: 692.4, change24h: -0.6, high24h: 701.2, low24h: 684.9 },
  { symbol: 'SOL', name: 'Solana', price: 214.8, change24h: 4.1, high24h: 219.5, low24h: 203.1 },
  { symbol: 'XRP', name: 'XRP', price: 2.412, change24h: -1.2, high24h: 2.489, low24h: 2.377 },
];

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBinance(): Promise<CoinQuote[]> {
  const symbols = encodeURIComponent(JSON.stringify(COINS.map((c) => c.pair)));
  const res = await fetchWithTimeout(
    `https://api.binance.com/api/v3/ticker/24hr?symbols=${symbols}`,
    6000,
  );
  if (!res.ok) throw new Error(`binance http ${res.status}`);
  const rows = (await res.json()) as Array<Record<string, string>>;
  const byPair = new Map(rows.map((r) => [r.symbol, r]));
  return COINS.map((c) => {
    const r = byPair.get(c.pair);
    if (!r) throw new Error(`binance missing ${c.pair}`);
    return {
      symbol: c.symbol,
      name: c.name,
      price: parseFloat(r.lastPrice),
      change24h: parseFloat(r.priceChangePercent),
      high24h: parseFloat(r.highPrice),
      low24h: parseFloat(r.lowPrice),
    };
  });
}

async function fetchCoinGecko(): Promise<CoinQuote[]> {
  const ids = COINS.map((c) => c.gecko).join(',');
  const res = await fetchWithTimeout(
    `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}`,
    8000,
  );
  if (!res.ok) throw new Error(`coingecko http ${res.status}`);
  const rows = (await res.json()) as Array<Record<string, number | string>>;
  const byId = new Map(rows.map((r) => [String(r.id), r]));
  return COINS.map((c) => {
    const r = byId.get(c.gecko);
    if (!r) throw new Error(`coingecko missing ${c.gecko}`);
    return {
      symbol: c.symbol,
      name: c.name,
      price: Number(r.current_price),
      change24h: Number(r.price_change_percentage_24h ?? 0),
      high24h: Number(r.high_24h ?? r.current_price),
      low24h: Number(r.low_24h ?? r.current_price),
    };
  });
}

/** Fetch prices with graceful degradation: Binance -> CoinGecko -> sample. */
export async function fetchPrices(): Promise<PriceResult> {
  try {
    return { quotes: await fetchBinance(), source: 'binance', fetchedAt: Date.now() };
  } catch (err) {
    console.warn('[cryptoglance] binance failed, trying coingecko', err);
  }
  try {
    return { quotes: await fetchCoinGecko(), source: 'coingecko', fetchedAt: Date.now() };
  } catch (err) {
    console.warn('[cryptoglance] coingecko failed, using sample data', err);
  }
  return { quotes: SAMPLE_QUOTES, source: 'sample', fetchedAt: Date.now() };
}
