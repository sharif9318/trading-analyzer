const test = require('node:test');
const assert = require('node:assert/strict');
const { latestClosedFeature } = require('../dist/analysis/alignment');
const {
  brokerHour,
  classifyConclusion,
  resolveBarExit,
  summarizeCostCoverage,
  transactionCostR,
} = require('../dist/analysis/backtest');
const { BacktestService } = require('../dist/analysis/backtest.service');
const { atr, ema, rsi } = require('../dist/analysis/indicators');
const { spreadBps, summarizeSpreadObservations } = require('../dist/analysis/spreads');

function candle(openTime, overrides = {}) {
  return {
    openTime,
    open: 100,
    high: 102,
    low: 98,
    close: 101,
    tickVolume: 100,
    ...overrides,
  };
}

test('EMA seeds with an SMA and then recurses', () => {
  const result = ema([1, 2, 3, 4, 5], 3);
  assert.deepEqual(result.slice(0, 3), [null, null, 2]);
  assert.equal(result[3], 3);
  assert.equal(result[4], 4);
});

test('RSI reaches 100 for an uninterrupted gain sequence', () => {
  const result = rsi(Array.from({ length: 20 }, (_, index) => index + 1), 14);
  assert.equal(result[14], 100);
});

test('ATR uses true range and Wilder smoothing', () => {
  const candles = Array.from({ length: 20 }, (_, index) =>
    candle(index * 900, { open: 100, high: 102, low: 98, close: 101 }),
  );
  const result = atr(candles, 14);
  assert.equal(result[13], 4);
  assert.equal(result[19], 4);
});

test('higher timeframe data is unavailable until its candle closes', () => {
  const rows = [
    { ...candle(0), ema20: 1, ema50: 1, ema200: 1, rsi14: 50, atr14: 1 },
    { ...candle(3600), ema20: 2, ema50: 2, ema200: 2, rsi14: 50, atr14: 1 },
  ];
  assert.equal(latestClosedFeature(rows, 3599, 3600), null);
  assert.equal(latestClosedFeature(rows, 3600, 3600).openTime, 0);
  assert.equal(latestClosedFeature(rows, 7199, 3600).openTime, 0);
  assert.equal(latestClosedFeature(rows, 7200, 3600).openTime, 3600);
});

test('same-bar stop and target collision resolves to stop', () => {
  const bar = candle(0, { open: 100, high: 110, low: 90, close: 105 });
  assert.deepEqual(resolveBarExit('long', bar, 95, 108), {
    price: 95,
    reason: 'stop',
  });
  assert.deepEqual(resolveBarExit('short', bar, 108, 95), {
    price: 108,
    reason: 'stop',
  });
});

function trade(netR, entryTime = 0, overrides = {}) {
  return {
    symbol: 'TEST',
    direction: 'long',
    signalTime: entryTime - 900,
    entryTime,
    exitTime: entryTime + 900,
    entryPrice: 1,
    exitPrice: 1,
    stopPrice: 0.9,
    targetPrice: 1.2,
    holdingBars: 1,
    exitReason: 'timeout',
    costBps: 2,
    costSource: 'fixed',
    costR: 0,
    brokerHour: brokerHour(entryTime),
    marketContext: {
      atrPercent: 0.1,
      m15Rsi14: 50,
      h1EmaSeparationPercent: 0.1,
      h4EmaSeparationPercent: 0.2,
    },
    grossR: netR,
    netR,
    ...overrides,
  };
}

test('positive holdout cannot hide a negative earlier regime', () => {
  const inSample = Array.from({ length: 100 }, () => trade(-0.1));
  const outOfSample = Array.from({ length: 40 }, () => trade(0.1));
  assert.equal(
    classifyConclusion(inSample, outOfSample, 2, 5),
    'unstable-regime-dependent',
  );
});

test('transaction cost is converted from basis points into stop-risk units', () => {
  assert.ok(Math.abs(transactionCostR(1, 2, 0.001) - 0.2) < 1e-12);
});

test('historical spread coverage rejects a backtest below the configured gate', () => {
  const trades = [
    trade(0.1, 0, { costSource: 'historical-spread' }),
    trade(0.1, 900, { costSource: 'historical-spread' }),
    trade(0.1, 1800, { costSource: 'fallback-p75' }),
  ];
  const coverage = summarizeCostCoverage(trades, 'historical-spread', 95);

  assert.equal(coverage.matched, 2);
  assert.equal(coverage.fallback, 1);
  assert.equal(coverage.matchPercent, 66.6667);
  assert.equal(coverage.status, 'insufficient');
});

test('broker-hour diagnostic uses the timestamp hour consistently', () => {
  const timestamp = Date.UTC(2026, 0, 1, 13, 30, 0) / 1000;
  assert.equal(brokerHour(timestamp), 13);
});

test('historical cost resolver matches exact buckets and labels P75 fallback', async () => {
  const spreadRepository = {
    find: async () => [
      {
        bucketOpenTime: '0',
        spreadBps: 1,
        ingestionKind: 'historical-tick',
      },
      {
        bucketOpenTime: '900',
        spreadBps: 2,
        ingestionKind: 'live',
      },
    ],
  };
  const service = new BacktestService({}, spreadRepository);
  const dynamicCost = await service.buildHistoricalCostResolver(
    'TEST',
    'XM-MT5',
    'TEST-SERVER',
    [candle(0), candle(900), candle(1800)],
  );

  assert.deepEqual(dynamicCost.resolver(0), {
    costBps: 1,
    source: 'historical-spread',
  });
  assert.deepEqual(dynamicCost.resolver(900), {
    costBps: 2,
    source: 'live-spread',
  });
  assert.deepEqual(dynamicCost.resolver(1800), {
    costBps: 2,
    source: 'fallback-p75',
  });
  assert.equal(dynamicCost.metadata.fallbackP75Bps, 2);
});

test('spread calibration reports midpoint-relative basis points', () => {
  assert.ok(Math.abs(spreadBps(0.9999, 1.0001) - 2) < 1e-9);
  const report = summarizeSpreadObservations(
    [1, 2, 3, 4].map((value) => ({
      symbol: 'TEST',
      bid: 1,
      ask: 1 + value / 10000,
      observedAt: value,
    })),
    4,
  );
  assert.equal(report.status, 'ready');
  assert.ok(report.medianBps > 1.9 && report.medianBps < 2.1);
  assert.ok(report.p95Bps > 3.9 && report.p95Bps < 4.1);
});

test('spread calibration excludes zero and crossed quotes', () => {
  const report = summarizeSpreadObservations(
    [
      { symbol: 'TEST', bid: 1, ask: 1.0002, observedAt: 1 },
      { symbol: 'TEST', bid: 0, ask: 0, observedAt: 2 },
      { symbol: 'TEST', bid: 1.0002, ask: 1, observedAt: 3 },
    ],
    2,
  );

  assert.equal(report.samples, 1);
  assert.equal(report.status, 'collecting');
  assert.equal(report.oldestObservedAt, 1);
  assert.equal(report.newestObservedAt, 1);
});
