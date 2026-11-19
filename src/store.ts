// Paper-trading state for CryptoGlance.
//
// Safety by design (hackathon rules): this is a paper portfolio only.
// It starts with $1,000 of fake money, trades are simulated locally at the
// live market price, and no real funds, wallets or exchange accounts are
// ever touched. State persists through the Even App bridge storage when
// available, or window.localStorage in a plain browser / simulator preview.

export interface Holding {
  symbol: string;
  qty: number;
  avgCost: number; // USD per coin
}

export interface PriceAlert {
  id: number;
  symbol: string;
  direction: 'above' | 'below';
  target: number; // USD price that triggers the alert
}

export interface PaperState {
  cash: number;
  holdings: Record<string, Holding>;
  alerts: PriceAlert[];
  realizedPnl: number;
  nextAlertId: number;
}

export const START_CASH = 1000;
export const TRADE_USD = 10;
const STORAGE_KEY = 'cryptoglance-state-v1';

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export function defaultState(): PaperState {
  return { cash: START_CASH, holdings: {}, alerts: [], realizedPnl: 0, nextAlertId: 1 };
}

export class PaperStore {
  state: PaperState = defaultState();

  constructor(private kv: KeyValueStore) {}

  async load(): Promise<void> {
    try {
      const raw = await this.kv.get(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PaperState;
        if (typeof parsed.cash === 'number' && parsed.holdings && parsed.alerts) {
          this.state = parsed;
        }
      }
    } catch (err) {
      console.warn('[cryptoglance] state load failed, using defaults', err);
    }
  }

  async save(): Promise<void> {
    try {
      await this.kv.set(STORAGE_KEY, JSON.stringify(this.state));
    } catch (err) {
      console.warn('[cryptoglance] state save failed', err);
    }
  }

  /** Simulate a buy of `usd` worth at `price`. Returns qty bought or null. */
  buy(symbol: string, usd: number, price: number): number | null {
    if (price <= 0 || this.state.cash < usd) return null;
    const qty = usd / price;
    const existing = this.state.holdings[symbol];
    if (existing) {
      const totalCost = existing.avgCost * existing.qty + usd;
      existing.qty += qty;
      existing.avgCost = totalCost / existing.qty;
    } else {
      this.state.holdings[symbol] = { symbol, qty, avgCost: price };
    }
    this.state.cash -= usd;
    return qty;
  }

  /** Simulate a sell of up to `usd` worth at `price`. Returns USD received or null. */
  sell(symbol: string, usd: number, price: number): number | null {
    const holding = this.state.holdings[symbol];
    if (!holding || price <= 0) return null;
    const heldValue = holding.qty * price;
    const sellValue = Math.min(usd, heldValue);
    const qtySold = sellValue / price;
    this.state.realizedPnl += (price - holding.avgCost) * qtySold;
    holding.qty -= qtySold;
    if (holding.qty * price < 0.01) delete this.state.holdings[symbol];
    this.state.cash += sellValue;
    return sellValue;
  }

  addAlert(symbol: string, direction: 'above' | 'below', target: number): PriceAlert {
    const alert: PriceAlert = { id: this.state.nextAlertId++, symbol, direction, target };
    this.state.alerts.push(alert);
    return alert;
  }

  removeAlert(id: number): void {
    this.state.alerts = this.state.alerts.filter((a) => a.id !== id);
  }

  /** Total portfolio value (cash + holdings at current prices). */
  totalValue(prices: Map<string, number>): number {
    let total = this.state.cash;
    for (const h of Object.values(this.state.holdings)) {
      total += h.qty * (prices.get(h.symbol) ?? h.avgCost);
    }
    return total;
  }
}
