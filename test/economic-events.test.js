const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildEconomicEventQualityReport,
  SUPPORTED_EVENT_CURRENCIES,
} = require('../dist/market-data/quality/economic-event-quality');

function row(currency, releases = 100) {
  return {
    currency,
    releases,
    definitions: 20,
    highImportance: 10,
    moderateImportance: 30,
    lowImportance: 60,
    oldestEventTime: 1_000_000,
    newestEventTime: 2_000_000,
  };
}

const cleanIntegrity = {
  orphanReleases: 0,
  incompleteDefinitions: 0,
  unsupportedCurrencyReleases: 0,
};

test('economic calendar remains collecting until every currency has coverage', () => {
  const report = buildEconomicEventQualityReport(
    [row('USD'), row('EUR', 99)],
    100,
    14,
    cleanIntegrity,
    2_000_000,
  );

  assert.equal(report.status, 'collecting');
  assert.equal(report.currencies.length, 7);
  assert.equal(
    report.currencies.find((item) => item.currency === 'EUR').status,
    'collecting',
  );
  assert.equal(
    report.currencies.find((item) => item.currency === 'JPY').releases,
    0,
  );
});

test('economic calendar is ready only with clean integrity and full coverage', () => {
  const report = buildEconomicEventQualityReport(
    SUPPORTED_EVENT_CURRENCIES.map((currency) => row(currency, 150)),
    100,
    14,
    cleanIntegrity,
    2_000_000,
  );

  assert.equal(report.status, 'ready');
  assert.ok(report.currencies.every((item) => item.coveragePercent === 100));
});

test('economic calendar integrity failures override complete coverage', () => {
  const report = buildEconomicEventQualityReport(
    SUPPORTED_EVENT_CURRENCIES.map((currency) => row(currency)),
    100,
    14,
    { ...cleanIntegrity, orphanReleases: 1 },
    2_000_000,
  );

  assert.equal(report.status, 'investigate');
});

test('economic calendar freshness failures expose truncated imports', () => {
  const referenceTime = 2_000_000;
  const rows = SUPPORTED_EVENT_CURRENCIES.map((currency) => row(currency));
  rows.find((item) => item.currency === 'EUR').newestEventTime =
    referenceTime - 15 * 86400;

  const report = buildEconomicEventQualityReport(
    rows,
    100,
    14,
    cleanIntegrity,
    referenceTime,
  );

  assert.equal(report.status, 'investigate');
  assert.deepEqual(report.freshness.staleCurrencies, ['EUR']);
  assert.equal(
    report.currencies.find((item) => item.currency === 'EUR').status,
    'stale',
  );
});

test('economic calendar gaps remain explicit and block ready status', () => {
  const report = buildEconomicEventQualityReport(
    SUPPORTED_EVENT_CURRENCIES.map((currency) => row(currency, 150)),
    100,
    14,
    cleanIntegrity,
    2_000_000,
    [
      {
        currency: 'USD',
        rangeFrom: 1_500_000,
        rangeTo: 1_586_399,
        errorCode: 5401,
        aggregateAttempted: true,
        perEventAttempted: true,
      },
    ],
  );

  assert.equal(report.status, 'investigate');
  assert.equal(report.model, 'mt5-economic-calendar-v3-explicit-gaps');
  assert.deepEqual(report.coverageGaps.gappedCurrencies, ['USD']);
  assert.equal(report.coverageGaps.openCount, 1);
  assert.equal(
    report.currencies.find((item) => item.currency === 'USD').status,
    'gap',
  );
});

test('a recorded gap is visible even before any releases are stored', () => {
  const report = buildEconomicEventQualityReport(
    [],
    100,
    14,
    cleanIntegrity,
    2_000_000,
    [
      {
        currency: 'JPY',
        rangeFrom: 1_500_000,
        rangeTo: 1_586_399,
        errorCode: 5401,
        aggregateAttempted: true,
        perEventAttempted: true,
      },
    ],
  );

  assert.equal(report.status, 'investigate');
  assert.equal(
    report.currencies.find((item) => item.currency === 'JPY').status,
    'gap',
  );
});
