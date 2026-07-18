const test = require('node:test');
const assert = require('node:assert/strict');
const { latestClosedFeature } = require('../dist/analysis/alignment');
const { resolveBarExit } = require('../dist/analysis/backtest');
const { atr, ema, rsi } = require('../dist/analysis/indicators');

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
