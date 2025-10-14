# Trading Bots Documentation

## Overview

Opportunity Radar includes automated trading bots that execute strategies in **paper mode** by default. All bots simulate trades against historical price data stored in the MongoDB `prices` collection, providing a safe environment to test strategies before considering live trading.

## Available Strategies

### 1. Grid Trading
Places buy and sell orders at predetermined price levels within a range.

**Parameters:**
- `lower`: Lower price bound
- `upper`: Upper price bound
- `grid_count`: Number of grid levels (default: 10)
- `base_qty`: Quantity per order (default: 1.0)

**Best for:** Range-bound markets, mean-reverting assets

### 2. Momentum
Enters positions when z-score exceeds threshold, exits on reversal.

**Parameters:**
- `lookback`: Lookback period for z-score calculation (default: 20)
- `z_entry`: Z-score threshold to enter (default: 2.0)
- `z_exit`: Z-score threshold to exit (default: 0.5)
- `base_qty`: Quantity per trade (default: 1.0)

**Best for:** Trending markets, breakout scenarios

### 3. Dollar Cost Average (DCA)
Buys a fixed quantity at regular intervals regardless of price.

**Parameters:**
- `interval_days`: Days between purchases (default: 7)
- `base_qty`: Quantity per purchase (default: 1.0)

**Best for:** Long-term accumulation, reducing timing risk

### 4. Mean Reversion
Buys when price is oversold (negative z-score), sells when price returns to mean.

**Parameters:**
- `lookback`: Lookback period (default: 20)
- `z_entry`: Z-score entry threshold, negative for oversold (default: -2.0)
- `z_exit`: Z-score exit threshold (default: 0.0)
- `base_qty`: Quantity per trade (default: 1.0)

**Best for:** Choppy markets, overextended moves

## Risk Management

Every bot includes a `RiskPolicy` with the following protections:

- **Max Drawdown**: Circuit breaker that pauses bot if drawdown exceeds threshold (default: 20%)
- **Max Position Value**: Limits total position size (default: $10,000)
- **Max Daily Trades**: Prevents overtrading (default: 50)
- **Slippage**: Simulates realistic execution by adjusting fill prices by basis points (default: 10 bps)

## Bot Lifecycle

1. **Create**: Configure strategy, parameters, tickers, and risk policy
2. **Simulate**: Run historical backtest to validate performance
3. **Start**: Begin paper trading with live price updates
4. **Monitor**: View logs, positions, P&L, and win rate
5. **Pause/Stop**: Temporarily halt or terminate bot execution

## Theme Integration

Bots can subscribe to theme triggers:

```json
{
  "theme_id": "ai_revolution",
  "score_threshold": 85,
  "positives": 3
}
```

When a subscribed theme crosses the threshold, the bot automatically opens positions in the theme's contributor tickers.

## Safety Features

### Circuit Breaker
Automatically pauses bot when rolling drawdown exceeds `max_drawdown_pct`. Logs warning and increments metrics counter.

### Paper Mode Enforcement
All orders are simulated against historical `prices` collection. No exchange API keys are used or stored in this phase.

### Audit Trail
Every bot action is logged to `bot_logs` collection with timestamp, level (info/warning/error), message, and metadata.

## API Endpoints

- `GET /api/bots/available` - List strategies and parameter schemas
- `POST /api/bots/create` - Create new bot
- `GET /api/bots/{id}` - Get bot details
- `POST /api/bots/{id}/simulate` - Run historical backtest
- `POST /api/bots/{id}/start` - Start paper trading
- `POST /api/bots/{id}/pause` - Pause bot
- `POST /api/bots/{id}/stop` - Stop bot
- `GET /api/bots/{id}/logs` - View bot logs
- `GET /api/bots/{id}/positions` - View current positions
- `POST /api/bots/{id}/subscribe_theme` - Subscribe to theme trigger
- `GET /api/bots/{id}/subscriptions` - List theme subscriptions

## Performance Metrics

Simulation and live paper trading track:

- **Total P&L**: Realized + unrealized profit/loss
- **Max Drawdown**: Peak-to-trough decline percentage
- **Win Rate**: Percentage of profitable closed trades
- **Trade Count**: Total executed orders
- **Position Value**: Current holdings at market price

## Testing

Run bot strategy tests:
```bash
pytest backend/tests/test_bots.py -v
```

Tests validate:
- Each strategy generates appropriate orders
- Circuit breaker triggers on drawdown
- Idempotency of logs and positions
- Slippage application

## Next Steps

- **Live Trading Adapters**: Exchange/broker integration (Phase B)
- **Advanced Analytics**: Sharpe ratio, sortino, max consecutive losses
- **Multi-Ticker Correlation**: Portfolio-level risk management
- **Backtesting UI**: Interactive historical simulation with chart overlays
