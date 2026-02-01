# Reports (dummy trades)

This folder holds realtime reports from the **dummy order** flow:

- **`trades.csv`** — One row per closed trade: entry_time, exit_time, side, market_slug, entry_price, outcome, P&L, P&L %.
- **`report.md`** — Summary (total trades, wins, losses, total P&L) and a table of recent trades.
- **`trades.json`** — Full list of trades plus `updatedAt`; updated on every entry/exit.

Reports are written/updated whenever a dummy order is placed or a position is closed. No real orders are sent.
