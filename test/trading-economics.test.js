const test = require('node:test');
const assert = require('node:assert/strict');
const {
  mapTradingEconomicsRow,
  parseDateRange,
} = require('../dist/market-data/providers/trading-economics-calendar');

test('Trading Economics rows map to calendar-only UTC events', () => {
  const event = mapTradingEconomicsRow(
    {
      CalendarId: 123456,
      Date: '2026-07-20T12:30:00',
      Country: 'United States',
      Category: 'Inflation Rate',
      Event: 'Inflation Rate YoY',
      Reference: 'Jun',
      ReferenceDate: '2026-06-30T00:00:00',
      Importance: 3,
      SourceURL: 'https://example.test/source',
      Ticker: 'USCPIYOY',
    },
    'USD',
  );

  assert.equal(event.valueId, '123456');
  assert.match(event.eventId, /^\d+$/);
  assert.equal(event.eventTime, Date.parse('2026-07-20T12:30:00Z') / 1000);
  assert.equal(event.importance, 3);
  assert.equal(event.currency, undefined);
  assert.equal(event.actualValue, null);
  assert.equal(event.forecastValue, null);
  assert.equal(event.countryCode, 'US');
  assert.equal(event.eventCode, 'USCPIYOY');
});

test('Trading Economics synthetic event identity is stable across releases', () => {
  const base = {
    Country: 'United States',
    Category: 'Employment',
    Event: 'Non Farm Payrolls',
    Importance: 3,
    Ticker: 'USNFP',
  };
  const first = mapTradingEconomicsRow(
    { ...base, CalendarId: 100, Date: '2026-06-01T12:30:00Z' },
    'USD',
  );
  const second = mapTradingEconomicsRow(
    { ...base, CalendarId: 101, Date: '2026-07-01T12:30:00Z' },
    'USD',
  );

  assert.equal(first.eventId, second.eventId);
  assert.notEqual(first.valueId, second.valueId);
});

test('Trading Economics range is inclusive and limited to one year', () => {
  const range = parseDateRange('2026-01-01', '2026-07-01');
  assert.equal(range.days, 182);
  assert.equal(range.rangeFrom, Date.parse('2026-01-01T00:00:00Z') / 1000);
  assert.equal(range.rangeTo, Date.parse('2026-07-01T23:59:59Z') / 1000);
  assert.throws(
    () => parseDateRange('2025-01-01', '2026-07-01'),
    /cannot exceed 366 days/,
  );
  assert.throws(
    () => parseDateRange('2026-02-30', '2026-03-01'),
    /Invalid Trading Economics date range/,
  );
});
