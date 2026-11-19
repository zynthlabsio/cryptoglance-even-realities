# Demo Video Script — CryptoGlance (max 3:00)

**Format:** screen recording of the official Even Hub simulator running the app
(`evenhub-simulator http://127.0.0.1:5173`), with voiceover or captions.
Fallback if the simulator misbehaves on recording day: record the in-browser
576×288 preview at http://127.0.0.1:5173 (identical screens) and say so.
**Before recording:** run `npm run dev`, open the app once so prices are LIVE
(not DEMO), and reset the paper portfolio (clear the app's stored state) so
the video starts from $1,000 cash and no positions.

Total runtime target: **2:30–2:50**.

| # | Time | Screen / action | Narration (voiceover or caption) |
| --- | --- | --- | --- |
| 1 | 0:00–0:15 | Title card over the watchlist screen. | "This is CryptoGlance — live crypto prices, alerts and paper trading for the Even Realities G2. Track: Crypto & DeFi." |
| 2 | 0:15–0:40 | Watchlist. Scroll up/down through BTC, ETH, BNB, SOL, XRP. Prices tick on refresh. | "Your whole watchlist in one glance — live prices and 24-hour change, refreshed every 30 seconds. No phone, no unlock, no app to open." |
| 3 | 0:40–1:00 | Click BTC → detail screen (price, 24h change, high/low, paper position line). | "Tap a coin for detail: 24-hour high and low, and your paper position. Everything is sized for the 576×288 monochrome display — one idea per screen." |
| 4 | 1:00–1:35 | Choose "Paper buy $10" → confirm screen → Confirm → "Paper buy done" message. | "CryptoGlance is not read-only. A paper buy takes two taps and always passes an explicit confirm screen — the habit real trading needs, with zero real-money risk." |
| 5 | 1:35–1:55 | Open menu → Paper portfolio (cash $990, BTC position, total, PnL). | "The portfolio view tracks cash, positions, average cost and PnL — and it persists between sessions. You start with $1,000 of paper money." |
| 6 | 1:55–2:25 | Back to BTC detail → "Alert at +5%" → "Alert set" message. Then show the alerts screen via the menu. (Optional: if a live alert fires during recording, show the PRICE ALERT takeover screen; otherwise describe it over the alerts screen.) | "Price alerts take two taps: notify me at plus or minus five percent. When the market gets there, the alert takes over the display — you can't miss it, and you never had to watch a chart." |
| 7 | 2:25–2:50 | Return to watchlist; end card with repo URL. | "CryptoGlance: glanceable, actionable, and safe by design — paper trading only, public price data, no keys, no real funds. Built solo with the Even Hub SDK. Thank you." |

## Shot notes

- Keep the simulator window at its native size so the 576×288 display stays crisp; don't upscale-blur.
- Move deliberately: one input, one beat, then the next — judges watch on small players.
- If prices show `DEMO` in the header, re-record or note "sample data shown; live on Binance/CoinGecko when online" in the description — never hide it.
- Captions on every segment (many judges watch muted).
- Export ≤ 3:00, 1080p, and link it in the DoraHacks submission together with the public repo.
