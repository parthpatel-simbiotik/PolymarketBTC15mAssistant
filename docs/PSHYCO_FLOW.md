# PSHYCO Trading Process Flow

```mermaid
flowchart TB
  Start[Poll: fetch market, prices, order book]
  Start --> HasPosition{In position?}

  HasPosition -->|No| NoPosition[No position]
  HasPosition -->|Yes| InPosition[In position]

  subgraph noPosition [No position - entry logic]
    NoPosition --> TimeWindow{inTimeWindow and not cooldown?}
    TimeWindow -->|No| SkipReason[Set skip reason: settlement soon, time window, or COOLDOWN]
    TimeWindow -->|Yes| PriceInRange{marketUp or marketDown in threshold range?}
    PriceInRange -->|No| Wait[WAITING]
    PriceInRange -->|Yes| TryUP{Try UP: spread and liquidity OK?}
    TryUP -->|Yes| BuyUP[BUY UP: set pshycoBought, buyAmount, qty]
    TryUP -->|No| TryDOWN{Try DOWN: spread and liquidity OK?}
    TryDOWN -->|Yes| BuyDOWN[BUY DOWN: set pshycoBought, buyAmount, qty]
    TryDOWN -->|No| SkipReason
  end

  subgraph inPosition [In position - exit logic order]
    InPosition --> UpdatePeak[Update profitPct and peakProfitPct]
    UpdatePeak --> CheckSettlement{settlementLeftSec under 5?}
    CheckSettlement -->|Yes| ExitSettlement[Log SETTLEMENT, clear position]
    CheckSettlement -->|No| CheckMaxPrice{maxProfitPrice set and currentPrice >= it?}
    CheckMaxPrice -->|Yes| ExitMaxPrice[Log MAX_PROFIT_PRICE, clear position]
    CheckMaxPrice -->|No| CheckMaxProfitPct{profitPct greater than maxProfitPct?}
    CheckMaxProfitPct -->|Yes| ExitMaxProfit[Log MAX_PROFIT, clear position]
    CheckMaxProfitPct -->|No| CheckMaxLoss{loss and abs profitPct >= maxLossPct?}
    CheckMaxLoss -->|Yes| ExitMaxLoss[Log MAX_LOSS. If cooldownAfterLoss set lastLostMarketSlug, clear position]
    CheckMaxLoss -->|No| Hold[Hold position, show PROFIT line]
  end

  SkipReason --> Wait
  BuyUP --> NextTick[Next poll]
  BuyDOWN --> NextTick
  ExitSettlement --> NextTick
  ExitMaxPrice --> NextTick
  ExitMaxProfit --> NextTick
  ExitMaxLoss --> NextTick
  Hold --> NextTick
  Wait --> NextTick
  NextTick --> Start
```

## Exit check order (when in position)

1. **Settlement** — Time to settlement &lt; 5s → exit, log `SETTLEMENT`.
2. **Max profit price** — `maxProfitPrice` set and current price ≥ it → exit, log `MAX_PROFIT_PRICE`.
3. **Max profit %** — `profitPct > maxProfitPct` → exit, log `MAX_PROFIT`.
4. **Max loss %** — `profitPct` negative and `|profitPct| >= maxLossPct` → exit, set market cooldown, log `MAX_LOSS`.
5. Otherwise **hold** and continue polling.

## Entry conditions (when no position)

- **Time window**: `settlementLeftSec > 5` and `minTimeLeftMin <= timeLeftMin <= maxTimeLeftMin`.
- **Not on cooldown** (if `cooldownAfterLoss` is true: current `marketSlug` must not equal the slug we last lost on; resets when a new market slug is selected).
- **Price in range**: `marketUp` or `marketDown` in `(entryThreshold, entryMaxThreshold)`.
- **Spread**: For the side (UP/DOWN), `spreadPct <= maxSpreadPct`.
- **Liquidity**: For the side, `askLiquidity >= minLiquidity`.

If UP and DOWN both qualify, UP is tried first; if UP is bought, DOWN is not tried.
