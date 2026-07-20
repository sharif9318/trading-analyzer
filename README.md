# Trading Analyzer — Phase 5.3

This is a read-only XM MetaTrader 5 to NestJS market-data pipeline. The live EA
publishes newly closed candles, a separate MT5 script imports history, and
PostgreSQL stores both durably with database-level duplicate protection.
The quality engine learns each series' recurring weekly session slots and
detects in-session gaps without treating normal weekend closures as missing.

There is no order placement, position sizing, OpenAI call, or real-money
trading code in this phase.

Phase 5 adds a deterministic research backtest. It is a fixed baseline for
falsification, not a recommendation engine. Phase 5.2 adds idempotent
historical XM tick-spread backfill so execution-cost research does not depend
on waiting weeks for live samples. Phase 5.3 applies the exact spread from each
trade's M15 entry bucket, exposes fallback usage, and refuses to accept a
strategy conclusion when exact spread coverage is below the configured gate.

## Architecture

```text
XM MT5 demo -> live EA ---------> NestJS API -> PostgreSQL
            -> backfill script -^
```

PostgreSQL is the source of truth. A unique constraint on source, server,
symbol, timeframe, and candle open time makes live ingestion and historical
backfill idempotent across reruns and restarts.

## 1. Configure the application

Install dependencies:

```bash
cd ~/Desktop/trading-analyzer
pnpm install
```

For a fresh installation:

```bash
cp .env.example .env
```

If `.env` already exists, keep the existing `BRIDGE_API_KEY`. It also needs:

```dotenv
DATABASE_URL=postgresql://trading_analyzer:local_dev_password@127.0.0.1:5433/trading_analyzer
POSTGRES_DB=trading_analyzer
POSTGRES_USER=trading_analyzer
POSTGRES_PASSWORD=local_dev_password
POSTGRES_PORT=5433
```

The password is only for this local development container. Use managed secrets
and a strong password before any deployment.

## 2. Start PostgreSQL and NestJS

Make sure Docker Desktop is running, then:

```bash
pnpm db:up
pnpm start:dev
```

NestJS loads `.env` and runs pending database migrations automatically.

Verify both the API and database:

```bash
curl -s http://127.0.0.1:3001/market-data/health | python3 -m json.tool
```

Expected fields include:

```json
{
  "status": "ok",
  "database": "connected"
}
```

## 3. Keep the live MT5 bridge running

The existing `MultiSymbolBridge` EA settings remain:

- `BackendUrl`: `http://127.0.0.1:3001/market-data/snapshots`
- `BridgeApiKey`: the exact value in `.env`
- `SymbolsCsv`: exact XM symbols, currently `EURUSD,USDJPY,AUDUSD`
- `AnalysisTimeframe`: `PERIOD_H1`
- `TimerSeconds`: `10`

The EA checks every 10 seconds but sends only when it sees a newly closed H1
candle. The database safely ignores a repeated candle.

## 4. Install and run historical backfill

The history importer is a script, not another continuously running EA.

1. In MT5 choose **File -> Open Data Folder**.
2. Open `MQL5/Scripts`.
3. Copy `mt5/HistoricalBackfill.mq5` into that folder.
4. Open the copied file in MetaEditor and press **Compile**.
5. Return to MT5 and refresh **Navigator -> Scripts**.
6. Drag `HistoricalBackfill` onto any chart.

Use these initial Inputs:

- `BackendUrl`: `http://127.0.0.1:3001/market-data/backfill`
- `BridgeApiKey`: the exact value in `.env`
- `SymbolsCsv`: `EURUSD,USDJPY,AUDUSD`
- `BarsPerTimeframe`: `2000`
- `BatchSize`: `100`
- `RequestDelayMs`: `100`
- `IncludeM15`, `IncludeH1`, `IncludeH4`: `true`

The base URL `http://127.0.0.1:3001` must remain in the MT5 WebRequest allow
list. The script excludes the currently forming candle, sends oldest-to-newest
chunks, and finishes automatically. Running it again is safe.

## 5. Verify coverage

Coverage per symbol and timeframe:

```bash
curl -s http://127.0.0.1:3001/market-data/coverage | python3 -m json.tool
```

Expected baseline: approximately 2,000 candles for each of the nine
symbol/timeframe combinations. A broker may return fewer bars when local or
server history is limited.

Stored EURUSD H1 history, newest first:

```bash
curl -s 'http://127.0.0.1:3001/market-data/candles?symbol=EURUSD&timeframe=PERIOD_H1&limit=20' | python3 -m json.tool
```

Direct database counts:

```bash
docker compose exec postgres psql -U trading_analyzer -d trading_analyzer -c 'SELECT symbol, timeframe, count(*) FROM market_candles GROUP BY symbol, timeframe ORDER BY symbol, timeframe;'
```

Historical rows have `null` bid, ask, spread, and tick-time observation fields
because those values were not recorded at the historical candle close. Their
OHLC and tick-volume fields are populated normally.

## 6. Run the dataset-quality gate

```bash
curl -s 'http://127.0.0.1:3001/market-data/quality?targetCandles=2000' | python3 -m json.tool
```

The report includes, for every symbol and timeframe:

- coverage against the 2,000-candle target;
- session-aware missing-candle counts and up to 20 gap locations;
- invalid OHLC and negative-volume counts;
- continuity, validity, and coverage percentages;
- a weighted score and `excellent`, `acceptable`, or `investigate` status.

The session model is empirical: a timestamp slot must recur across enough
weeks before the engine considers it part of the broker's expected session.
This accommodates broker-specific weekend boundaries and H4 bar alignment.
It then compares identical gaps across symbols on the same timeframe. Shared
gaps are reported as calendar/broker-wide and separated from actionable,
series-specific data loss. Shared gaps are never filled with synthetic candles.

When symbols contain different amounts of history, quality comparison uses the
latest aligned target-sized window for every symbol on a timeframe. Older data
is retained and reported as `availableCandles`, but it does not distort the
cross-symbol quality gate.

Pair-specific Friday-to-Sunday/Monday reopen delays are classified as
`weekend-session-gap`, not missing data. The top-level quality gate is strict:
any series-specific missing candle or invalid OHLC forces `investigate` even
when the rounded weighted score would otherwise display as 100.

Run the deterministic quality tests with:

```bash
pnpm test:quality
```

## 7. Run the fixed baseline backtest

The unoptimized baseline uses:

- H4 EMA50/EMA200 trend regime;
- H1 EMA20/EMA50 direction confirmation;
- M15 EMA20 pullback, candle direction, and RSI filter;
- signal calculation after an M15 candle closes;
- entry at the next M15 open;
- 1.5 ATR stop, 2R target, and 48-bar maximum hold;
- conservative stop-first handling when both stop and target occur in one bar;
- 2 basis points of configurable round-trip execution cost;
- 70/30 chronological in-sample/out-of-sample reporting.

Run it without changing parameters first:

```bash
curl -s -X POST http://127.0.0.1:3001/backtests/trend-pullback \
  -H 'Content-Type: application/json' \
  -d '{}' > /tmp/trend-pullback-backtest.json
```

Print the decision-relevant summary:

```bash
python3 - <<'PY'
import json

with open('/tmp/trend-pullback-backtest.json') as file:
    report = json.load(file)

print('strategy:', report['strategy'])
print('pooled:', report['pooledTradeStatistics'])
for item in report['symbols']:
    print(item['symbol'], item['conclusion'], 'IS=', item['inSample'], 'OOS=', item['outOfSample'])
PY
```

Interpretation rules:

- `insufficient-out-of-sample-trades`: no conclusion is permitted;
- `baseline-failed`: the fixed hypothesis failed after costs;
- `promising-not-validated`: eligible for further walk-forward and cost
  sensitivity testing, never immediate live trading.
- `unstable-regime-dependent`: earlier and later periods disagree, so the
  apparent recent edge is rejected until proven across additional regimes.

Each symbol also returns five chronological fold summaries. A strategy needs
positive results across at least three of five folds before it can receive the
`promising-not-validated` label.

## 8. Collect and calibrate actual spreads

Attach a second `MultiSymbolBridge` EA instance to another chart with:

- `SymbolsCsv`: `EURUSD,GBPUSD,USDJPY,AUDUSD,USDCHF,USDCAD`
- `AnalysisTimeframe`: `PERIOD_M15`
- the same backend URL and bridge key;
- `TimerSeconds`: `10`.

Keep the existing H1 instance running. After at least 100 new M15 observations
per symbol, inspect midpoint-relative spread costs:

```bash
curl -s 'http://127.0.0.1:3001/analysis/spreads?timeframe=PERIOD_M15&minimumSamples=100' | python3 -m json.tool
```

Median, 75th-percentile, and 95th-percentile spread basis points are reported
separately. `collecting` means there is not enough evidence yet.

The spread report reads from a dedicated `spread_observations` table. On the
first Phase 5.2 application start, the database migration copies existing live
bid/ask observations into that table. New live snapshot batches continue to
populate it automatically.

## 9. Backfill historical XM tick spreads

The historical spread importer is a separate MT5 script. It requests broker
tick history in small time chunks, keeps the first valid bid/ask tick in each
M15 bucket, and uploads only those compact observations. It does not upload
every raw tick and does not place orders.

1. In MT5 choose **File -> Open Data Folder**.
2. Open `MQL5/Scripts`.
3. Copy `mt5/HistoricalSpreadBackfill.mq5` into that folder.
4. Open the copied file in MetaEditor and press **Compile**.
5. Return to MT5 and refresh **Navigator -> Scripts**.
6. Drag `HistoricalSpreadBackfill` onto any chart.

Recommended first run:

- `BackendUrl`: `http://127.0.0.1:3001/market-data/spread-backfill`
- `BridgeApiKey`: the exact value in `.env`
- `SymbolsCsv`: `EURUSD,GBPUSD,USDJPY,AUDUSD,USDCHF,USDCAD`
- `DaysBack`: `30`
- `ChunkHours`: `6`
- `BatchSize`: `200`
- `RequestDelayMs`: `100`

The first `CopyTicksRange` request may pause while MT5 synchronizes its local
tick database with the XM server. Available history is controlled by the
broker. The script logs completed and failed symbols and then exits. Rerunning
it is safe because the database has one unique observation per source, server,
symbol, timeframe, and M15 bucket.

Verify historical and live provenance separately:

```bash
docker compose exec postgres psql \
  -U trading_analyzer \
  -d trading_analyzer \
  -c "SELECT symbol, ingestion_kind, count(*) FROM spread_observations GROUP BY symbol, ingestion_kind ORDER BY symbol, ingestion_kind;"
```

Then inspect the combined calibration:

```bash
curl -s 'http://127.0.0.1:3001/analysis/spreads?timeframe=PERIOD_M15&minimumSamples=1000' | python3 -m json.tool
```

Each symbol includes `samplesByIngestionKind` so a report cannot hide whether
its evidence came from live collection or historical ticks.

Run all deterministic tests with:

```bash
pnpm test
```

## 10. Run the Phase 5.3 dynamic-cost diagnostic

This run keeps every Strategy V1 entry and exit rule frozen. Only the execution
cost model changes from one constant to the observed XM spread in the exact M15
entry bucket:

```bash
curl -sS -X POST http://127.0.0.1:3001/backtests/trend-pullback \
  -H 'Content-Type: application/json' \
  -d '{"costModel":"historical-spread","minimumSpreadMatchPercent":95}' \
  > /tmp/trend-pullback-dynamic-cost.json
```

Print the coverage gate and gross-versus-net diagnostics:

```bash
python3 - <<'PY'
import json

with open('/tmp/trend-pullback-dynamic-cost.json') as file:
    report = json.load(file)

print('strategy:', report['strategy'])
print('pooled coverage:', report['pooledCostCoverage'])
for item in report['symbols']:
    all_trades = item['all']
    print(
        item['symbol'],
        'conclusion=', item['conclusion'],
        'match=', item['costCoverage']['matchPercent'],
        'fallback=', item['costCoverage']['fallback'],
        'grossR=', all_trades['averageGrossR'],
        'costR=', all_trades['averageCostR'],
        'netR=', all_trades['averageNetR'],
    )
PY
```

For each trade, Phase 5.3 records:

- the exact spread basis points and whether it came from historical ticks,
  live collection, or fallback;
- spread cost converted into the trade's stop-risk unit (`costR`);
- gross R before costs and net R after costs;
- long/short direction, raw broker-timestamp hour, ATR percentage, RSI, and H1
  and H4 EMA separation.

The response aggregates those fields by direction, hour, winners versus
losers, and market context. If an exact entry bucket is absent, the resolver
uses the 75th-percentile spread from that symbol's selected backtest window and
counts it as `fallback-p75`. When fewer than 95% of trades have exact matches,
the public conclusion becomes `insufficient-spread-coverage`; the statistical
result remains visible separately as `statisticalConclusion` for diagnosis.

Do not tune Strategy V1 from these slices. Their purpose is to explain where
the rejected baseline loses money and to define a distinct Strategy V2
hypothesis before any new backtest is run.

## Database lifecycle

Stop the database without deleting its data:

```bash
pnpm db:down
```

Start it again:

```bash
pnpm db:up
```

The named Docker volume preserves the records. Do not add `-v` unless you
deliberately intend to delete all stored candles.

## Current limitations

- The empirical session model requires multiple weeks of data; it is not meant
  for a newly listed instrument with only a few days of history.
- Quality analysis currently loads the selected dataset into application
  memory. This is acceptable at the current 200,000-row scale but will move to
  background jobs and precomputed summaries as the universe grows.
- MT5 timestamps remain raw integer seconds from the broker feed. Calendar
  labels remain provisional until broker timezone metadata is stored.
- OHLC bars do not reveal intrabar price order. Ambiguous stop/target bars are
  deliberately resolved against the strategy.
- Pooled trade statistics are not a portfolio simulation and do not model
  simultaneous exposure or cross-pair correlation.
- Dynamic execution costs are reconstructed from the first valid bid/ask tick
  in each M15 bucket, not from every possible fill inside that bucket.
- Broker tick-history depth is not guaranteed. A successful API response does
  not prove that every requested historical interval was available.
- No approved live signals, notifications, position sizing, or orders exist.
