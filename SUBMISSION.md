# DoraHacks Submission — CryptoGlance (draft)

**Project name:** CryptoGlance
**Track:** Crypto & DeFi
**Team:** solo

## One-liner

Live crypto prices, price alerts and paper trading for Even Realities G2 — readable in one glance, actionable in two taps, phone stays in your pocket.

## Problem

Crypto never sleeps, but checking it is disruptive: phone out, unlock, open an exchange app, find the coin — dozens of times a day, in meetings, on a bike, mid-conversation. The information people actually want 95% of the time is tiny ("BTC up or down? Did it cross my level? What's my position worth?"), yet it is locked behind a full phone session. And when people do act on impulse from a phone, there is no low-stakes way to practice the confirm-before-you-trade habit.

## Who it's for

Everyday crypto holders and watchers who check prices many times a day and want the check to cost one glance instead of one phone session — plus newcomers who want to learn trading mechanics (positions, average cost, PnL, alerts) with zero financial risk.

## How it works

CryptoGlance is a web app for the Even Realities G2 built with the official Even Hub SDK (TypeScript). It renders its UI directly on the glasses' 576×288 monochrome display using SDK containers:

- **Watchlist:** BTC, ETH, BNB, SOL, XRP with live prices and 24h change, refreshed every 30 s (Binance public API, CoinGecko fallback, clearly-flagged sample data if offline).
- **Detail:** 24h high/low, current paper position and average cost.
- **Act in seconds:** paper buy/sell ($10) always passes through an explicit on-glasses confirm screen; price alerts are set at ±5% in two taps and, when triggered, take over the display.
- **Portfolio:** cash, positions, total value and PnL, persisted between sessions.

Everything is simulated locally with $1,000 of paper money — no real funds, no wallets, no exchange accounts, no API keys, no financial advice. The same view-model drives an in-browser 576×288 preview, so the app is fully demoable without hardware.

## Why it fits the G2

The app is designed for the display, not ported to it: one idea per screen, large type, short ASCII strings within SDK limits, navigation that maps 1:1 to the glasses' up/down/click and contextual menu. It targets the judging criteria directly — usefulness on G2 (glanceable, hands-free price checks), read **and** write (confirm trades, set alerts), technical execution (end-to-end in the simulator, automated headless verification of every flow), UX for display and voice (voice commands are the documented next step; the menu structure already mirrors them), and business potential with safety (a paper-trading on-ramp that can later connect to read-only portfolio APIs).

## Links

- Public repo: https://github.com/maungzy86/cryptoglance-even-realities
- Demo video (2:28, narrated, captioned): https://github.com/maungzy86/cryptoglance-even-realities/blob/main/demo.mp4
- Packaged build: `cryptoglance.ehpk` (via `npm run pack`)
