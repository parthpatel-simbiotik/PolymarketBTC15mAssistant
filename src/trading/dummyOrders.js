/**
 * Dummy order placement and trade logging for Polymarket BTC 15m.
 * No real orders are sent; all trades are simulated and logged to files/.
 * Tracks entry/exit times and profit/loss; updates reports in realtime.
 */

import fs from "node:fs";
import path from "node:path";
import { ensureDir, appendCsvRow } from "../utils.js";

const FILES_DIR = path.join(process.cwd(), "files");
const TRADES_CSV = path.join(FILES_DIR, "trades.csv");
const REPORT_MD = path.join(FILES_DIR, "report.md");
const TRADES_JSON = path.join(FILES_DIR, "trades.json");

/** Cost per trade in dollars; shares = TRADE_SIZE_USD / entryPrice so each trade is exactly $TRADE_SIZE_USD. */
const TRADE_SIZE_USD = 1;
const CSV_HEADER = [
  "entry_time",
  "exit_time",
  "side",
  "market_slug",
  "entry_price",
  "exit_outcome",
  "pnl",
  "pnl_pct",
  "status",
  "price_to_beat",
  "settlement_price"
];

let openPosition = null;
const allTrades = [];

function ensureFilesDir() {
  ensureDir(FILES_DIR);
}

/**
 * Simulated outcome for binary market: UP wins if settlement price > priceToBeat, DOWN wins if <.
 * Tie (price === priceToBeat) is treated as loss (outcome 0).
 */
function simulateOutcome(side, settlementPrice, priceToBeat) {
  if (
    settlementPrice == null ||
    priceToBeat == null ||
    !Number.isFinite(settlementPrice) ||
    !Number.isFinite(priceToBeat)
  ) {
    return null;
  }
  if (side === "UP") return settlementPrice > priceToBeat ? 1 : 0;
  if (side === "DOWN") return settlementPrice < priceToBeat ? 1 : 0;
  return null;
}

/**
 * PnL: outcome 0 or 1, entry price in [0,1]. Uses shares so cost = TRADE_SIZE_USD ($1).
 */
function computePnL(entryPrice, outcome, shares) {
  if (entryPrice == null || outcome == null || !Number.isFinite(entryPrice) || !Number.isFinite(shares) || shares <= 0)
    return { pnl: null, pnlPct: null };
  const pnlPerShare = outcome - entryPrice;
  const pnl = pnlPerShare * shares;
  const cost = entryPrice * shares;
  const pnlPct = cost > 0 ? (pnl / cost) * 100 : null;
  return { pnl, pnlPct };
}

function appendTradeToCsv(trade) {
  ensureFilesDir();
  appendCsvRow(TRADES_CSV, CSV_HEADER, [
    trade.entryTime,
    trade.exitTime ?? "",
    trade.side,
    trade.marketSlug ?? "",
    trade.entryPrice,
    trade.exitOutcome ?? "",
    trade.pnl ?? "",
    trade.pnlPct != null ? `${trade.pnlPct.toFixed(2)}%` : "",
    trade.status ?? "closed",
    trade.priceToBeat ?? "",
    trade.settlementPrice ?? ""
  ]);
}

function writeTradesJson() {
  ensureFilesDir();
  fs.writeFileSync(TRADES_JSON, JSON.stringify({ trades: allTrades, updatedAt: new Date().toISOString() }, null, 2), "utf8");
}

function writeReportMd() {
  ensureFilesDir();
  const wins = allTrades.filter((t) => t.pnl != null && t.pnl > 0).length;
  const losses = allTrades.filter((t) => t.pnl != null && t.pnl < 0).length;
  const totalPnl = allTrades.reduce((acc, t) => acc + (t.pnl ?? 0), 0);
  const totalPnlPct =
    allTrades.length === 0
      ? 0
      : allTrades.reduce((acc, t) => acc + (t.pnlPct ?? 0), 0) / allTrades.filter((t) => t.pnlPct != null).length;

  const rows = allTrades
    .slice()
    .reverse()
    .slice(0, 50)
    .map(
      (t) =>
        `| ${t.entryTime} | ${t.exitTime ?? "-"} | ${t.side} | ${t.marketSlug ?? "-"} | ${t.entryPrice} | ${t.exitOutcome ?? "-"} | ${t.pnl ?? "-"} | ${t.pnlPct != null ? `${t.pnlPct.toFixed(2)}%` : "-"} | ${t.status ?? "closed"} |`
    )
    .join("\n");

  const content = `# Dummy Trades Report (Polymarket BTC 15m)

**Updated:** ${new Date().toISOString()} · **Trade size:** $${TRADE_SIZE_USD} per trade

## Summary

| Metric | Value |
|--------|-------|
| Total Trades | ${allTrades.length} |
| Wins | ${wins} |
| Losses | ${losses} |
| Total P&L | $${totalPnl.toFixed(2)} |
| Avg P&L % | ${totalPnlPct.toFixed(2)}% |
| Open Position | ${openPosition ? `${openPosition.side} @ ${openPosition.entryPrice} ($${openPosition.costUsd ?? TRADE_SIZE_USD}) — ${openPosition.entryTime}` : "None"} |

## Recent Trades

| Entry Time | Exit Time | Side | Market | Entry Price | Outcome | P&L | P&L % | Status |
|------------|-----------|------|--------|-------------|---------|-----|-------|--------|
${rows || "*(no trades yet)*"}

---
*Dummy orders only — no real funds.*
`;

  fs.writeFileSync(REPORT_MD, content, "utf8");
}

function flushReports() {
  writeTradesJson();
  writeReportMd();
}

/**
 * Place a dummy order (simulated). Call when signal says ENTER.
 * @param {string} side - "UP" or "DOWN"
 * @param {object} context - { marketSlug, entryPrice, priceToBeat, currentPrice }
 */
export function placeDummyOrder(side, context = {}) {
  const marketSlug = context.marketSlug ?? "";
  const entryPrice = side === "UP" ? context.marketUp : context.marketDown;
  if (entryPrice == null || !Number.isFinite(Number(entryPrice))) return;

  const price = Number(entryPrice);
  if (price <= 0 || price > 1) return;
  const shares = TRADE_SIZE_USD / price;
  const entryTime = new Date().toISOString();

  if (openPosition) return;

  openPosition = {
    side,
    entryTime,
    entryPrice: price,
    marketSlug,
    priceToBeat: context.priceToBeat ?? null,
    shares,
    costUsd: TRADE_SIZE_USD
  };

  console.log(
    `[TRADE ENTRY] ${side} @ ${price.toFixed(2)} | $${TRADE_SIZE_USD} | ${marketSlug || "-"} | ${entryTime}`
  );
  flushReports();
}

/**
 * Close open position when market ends or slug changes. Uses current price vs price-to-beat for simulated outcome.
 * @param {object} context - { marketSlug, priceToBeat, currentPrice, timeLeftMin }
 * @returns {object|null} closed trade or null
 */
export function tryClosePosition(context = {}) {
  if (!openPosition) return null;

  const marketSlug = context.marketSlug ?? "";
  const slugChanged = marketSlug && openPosition.marketSlug && marketSlug !== openPosition.marketSlug;
  const timeLeftMin = context.timeLeftMin ?? 0;
  const marketEnded = timeLeftMin !== null && timeLeftMin <= 0;

  if (!slugChanged && !marketEnded) return null;

  const settlementPrice = context.currentPrice ?? openPosition.priceToBeat;
  const priceToBeat = openPosition.priceToBeat ?? context.priceToBeat ?? settlementPrice;
  const outcome = simulateOutcome(openPosition.side, settlementPrice, priceToBeat);
  const exitTime = new Date().toISOString();

  const shares = openPosition.shares ?? TRADE_SIZE_USD / openPosition.entryPrice;
  const { pnl, pnlPct } = computePnL(openPosition.entryPrice, outcome ?? 0, shares);

  const trade = {
    entryTime: openPosition.entryTime,
    exitTime,
    side: openPosition.side,
    marketSlug: openPosition.marketSlug,
    entryPrice: openPosition.entryPrice,
    exitOutcome: outcome,
    pnl,
    pnlPct,
    status: "closed",
    priceToBeat,
    settlementPrice
  };

  allTrades.push(trade);
  appendTradeToCsv(trade);
  const winLose = outcome === 1 ? "WIN" : "LOSS";
  const pnlStr = pnl != null ? `$${pnl.toFixed(2)}` : "-";
  const pctStr = pnlPct != null ? `${pnlPct.toFixed(2)}%` : "-";
  console.log(
    `[TRADE EXIT] ${openPosition.side} | ${winLose} | P&L ${pnlStr} (${pctStr}) | ${openPosition.entryTime} → ${exitTime}`
  );
  openPosition = null;
  flushReports();
  return trade;
}

/**
 * Call each tick: close position if market changed/ended, then optionally open new one.
 */
export function tick(context) {
  tryClosePosition(context);
}

export function getOpenPosition() {
  return openPosition;
}

export function getAllTrades() {
  return allTrades;
}

export function getReportsDir() {
  return FILES_DIR;
}
