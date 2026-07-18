const test = require('node:test');
const assert = require('node:assert/strict');
const {
  analyzeSeries,
  classifyCrossSymbolGaps,
  isWeekendBoundary,
  selectAnalysisWindow,
} = require('../dist/market-data/quality/session-quality');

const HOUR = 60 * 60;
const DAY = 24 * HOUR;
const MONDAY = 4 * DAY;

function candle(openTime, overrides = {}) {
  return {
    openTime,
    open: 1.1,
    high: 1.2,
    low: 1.0,
    close: 1.15,
    tickVolume: 100,
    ...overrides,
  };
}

function threeWeeksOfWeekdayH1() {
  const candles = [];
  for (let day = 0; day < 21; day++) {
    const weekday = day % 7;
    if (weekday >= 5) continue;
    for (let hour = 0; hour < 24; hour++) {
      candles.push(candle(MONDAY + day * DAY + hour * HOUR));
    }
  }
  return candles;
}

test('normal weekend closures are not gaps', () => {
  const candles = threeWeeksOfWeekdayH1();
  const report = analyzeSeries(candles, 'PERIOD_H1', candles.length);
  assert.equal(report.missingCandles, 0);
  assert.equal(report.score, 100);
});

test('a recurring-session hole is detected', () => {
  const candles = threeWeeksOfWeekdayH1();
  const removedTime = MONDAY + 9 * DAY + 12 * HOUR;
  const filtered = candles.filter((item) => item.openTime !== removedTime);
  const report = analyzeSeries(filtered, 'PERIOD_H1', filtered.length);
  assert.equal(report.missingCandles, 1);
  assert.equal(report.gaps.length, 1);
});

test('malformed OHLC is rejected by the quality model', () => {
  const candles = threeWeeksOfWeekdayH1();
  candles[20] = candle(candles[20].openTime, { high: 1.05 });
  const report = analyzeSeries(candles, 'PERIOD_H1', candles.length);
  assert.equal(report.invalidCandles, 1);
  assert.ok(report.score < 100);
});

test('a gap shared by every symbol is classified as calendar-wide', () => {
  const candles = threeWeeksOfWeekdayH1();
  const removedTime = MONDAY + 9 * DAY + 12 * HOUR;
  const filtered = candles.filter((item) => item.openTime !== removedTime);
  const reports = classifyCrossSymbolGaps(
    ['EURUSD', 'AUDUSD', 'USDJPY'].map((symbol) => ({
      symbol,
      timeframe: 'PERIOD_H1',
      ...analyzeSeries(filtered, 'PERIOD_H1', filtered.length),
    })),
  );

  for (const report of reports) {
    assert.equal(report.actionableMissingCandles, 0);
    assert.equal(report.sharedCalendarGapCandles, 1);
    assert.equal(report.gaps[0].classification, 'shared-calendar-gap');
  }
});

test('a gap in only one symbol remains actionable', () => {
  const candles = threeWeeksOfWeekdayH1();
  const removedTime = MONDAY + 9 * DAY + 12 * HOUR;
  const filtered = candles.filter((item) => item.openTime !== removedTime);
  const reports = classifyCrossSymbolGaps(
    ['EURUSD', 'AUDUSD', 'USDJPY'].map((symbol) => ({
      symbol,
      timeframe: 'PERIOD_H1',
      ...analyzeSeries(
        symbol === 'EURUSD' ? filtered : candles,
        'PERIOD_H1',
        candles.length,
      ),
    })),
  );
  const eurusd = reports.find((report) => report.symbol === 'EURUSD');

  assert.equal(eurusd.actionableMissingCandles, 1);
  assert.equal(eurusd.sharedCalendarGapCandles, 0);
  assert.equal(eurusd.gaps[0].classification, 'series-specific');
});

test('quality comparison uses the latest aligned target window', () => {
  const candles = Array.from({ length: 20 }, (_, index) => candle(index * HOUR));
  const selected = selectAnalysisWindow(candles, 10, 18 * HOUR);

  assert.equal(selected.length, 10);
  assert.equal(selected[0].openTime, 9 * HOUR);
  assert.equal(selected.at(-1).openTime, 18 * HOUR);
});

test('a symbol-specific delayed Monday reopen is a weekend session gap', () => {
  const candles = threeWeeksOfWeekdayH1();
  const secondMondayOpen = MONDAY + 7 * DAY;
  const delayed = candles.filter((item) => item.openTime !== secondMondayOpen);
  const reports = classifyCrossSymbolGaps(
    ['EURUSD', 'AUDUSD', 'USDJPY'].map((symbol) => ({
      symbol,
      timeframe: 'PERIOD_H1',
      ...analyzeSeries(
        symbol === 'EURUSD' ? delayed : candles,
        'PERIOD_H1',
        candles.length,
      ),
    })),
  );
  const eurusd = reports.find((report) => report.symbol === 'EURUSD');

  assert.equal(eurusd.actionableMissingCandles, 0);
  assert.equal(eurusd.sharedCalendarGapCandles, 1);
  assert.equal(eurusd.gaps[0].classification, 'weekend-session-gap');
});

test('weekend boundary detection does not hide a weekday gap', () => {
  assert.equal(isWeekendBoundary(1779493500, 1779668100), true);
  assert.equal(isWeekendBoundary(MONDAY, MONDAY + 2 * HOUR), false);
});
