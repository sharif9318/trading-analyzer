export const SUPPORTED_EVENT_CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'AUD',
  'CHF',
  'CAD',
] as const;

export interface EconomicEventCurrencyRow {
  currency: string;
  releases: number;
  definitions: number;
  highImportance: number;
  moderateImportance: number;
  lowImportance: number;
  oldestEventTime: number | null;
  newestEventTime: number | null;
}

export interface EconomicEventIntegrity {
  orphanReleases: number;
  incompleteDefinitions: number;
  unsupportedCurrencyReleases: number;
}

export interface EconomicEventCoverageGapRow {
  currency: string;
  rangeFrom: number;
  rangeTo: number;
  eventId: string | null;
  errorCode: number | null;
  aggregateAttempted: boolean;
  perEventAttempted: boolean;
}

export function buildEconomicEventQualityReport(
  rows: EconomicEventCurrencyRow[],
  minimumReleases: number,
  maximumStalenessDays: number,
  integrity: EconomicEventIntegrity,
  referenceTime = Math.floor(Date.now() / 1000),
  openGaps: EconomicEventCoverageGapRow[] = [],
) {
  const byCurrency = new Map(rows.map((row) => [row.currency, row]));
  const gappedCurrencySet = new Set(openGaps.map((gap) => gap.currency));
  const currencies = SUPPORTED_EVENT_CURRENCIES.map((currency) => {
    const row = byCurrency.get(currency) ?? {
      currency,
      releases: 0,
      definitions: 0,
      highImportance: 0,
      moderateImportance: 0,
      lowImportance: 0,
      oldestEventTime: null,
      newestEventTime: null,
    };
    const coveragePercent = Math.min(
      100,
      (row.releases / minimumReleases) * 100,
    );
    const stalenessDays =
      row.newestEventTime === null
        ? null
        : Math.max(0, (referenceTime - row.newestEventTime) / 86400);
    const isStale =
      stalenessDays !== null && stalenessDays > maximumStalenessDays;

    return {
      ...row,
      minimumReleases,
      coveragePercent: round(coveragePercent),
      stalenessDays: stalenessDays === null ? null : round(stalenessDays),
      status:
        gappedCurrencySet.has(currency)
          ? 'gap'
          : row.releases === 0
            ? 'collecting'
            : isStale
              ? 'stale'
              : row.releases >= minimumReleases
                ? 'ready'
                : 'collecting',
    };
  });
  const hasIntegrityFailure = Object.values(integrity).some(
    (value) => value > 0,
  );

  return {
    model: 'economic-calendar-v5-source-aware',
    status: hasIntegrityFailure ||
      openGaps.length > 0 ||
      currencies.some((item) => item.status === 'stale')
      ? 'investigate'
      : currencies.every((item) => item.status === 'ready')
        ? 'ready'
        : 'collecting',
    freshness: {
      referenceTime,
      maximumStalenessDays,
      staleCurrencies: currencies
        .filter((item) => item.status === 'stale')
        .map((item) => item.currency),
    },
    coverageGaps: {
      openCount: openGaps.length,
      fullIntervalCount: openGaps.filter((gap) => gap.eventId === null).length,
      eventSpecificCount: openGaps.filter((gap) => gap.eventId !== null).length,
      gappedCurrencies: [...gappedCurrencySet].sort(),
      intervals: openGaps,
    },
    integrity,
    currencies,
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
