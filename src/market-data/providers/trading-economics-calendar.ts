import { createHash } from 'node:crypto';
import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { HistoricalEconomicEventDto } from '../dto/economic-event-backfill.dto';
import { TradingEconomicsCurrency } from '../dto/trading-economics-backfill.dto';

export const TRADING_ECONOMICS_SOURCE = 'trading-economics-calendar';
export const TRADING_ECONOMICS_SERVER = 'utc';

export interface TradingEconomicsCalendarRow {
  CalendarId?: number | string | null;
  Date?: string | null;
  Country?: string | null;
  Category?: string | null;
  Event?: string | null;
  Reference?: string | null;
  ReferenceDate?: string | null;
  Source?: string | null;
  SourceURL?: string | null;
  Importance?: number | string | null;
  Currency?: string | null;
  Unit?: string | null;
  Ticker?: string | null;
}

export const TRADING_ECONOMICS_COUNTRIES: Record<
  TradingEconomicsCurrency,
  { country: string; countryCode: string }
> = {
  USD: { country: 'United States', countryCode: 'US' },
  EUR: { country: 'Euro Area', countryCode: 'EA' },
  GBP: { country: 'United Kingdom', countryCode: 'GB' },
  JPY: { country: 'Japan', countryCode: 'JP' },
  AUD: { country: 'Australia', countryCode: 'AU' },
  CHF: { country: 'Switzerland', countryCode: 'CH' },
  CAD: { country: 'Canada', countryCode: 'CA' },
};

export function mapTradingEconomicsRow(
  row: TradingEconomicsCalendarRow,
  currency: TradingEconomicsCurrency,
): HistoricalEconomicEventDto {
  const expected = TRADING_ECONOMICS_COUNTRIES[currency];
  const name = clean(row.Event) || clean(row.Category);
  const eventTime = parseUtcSeconds(row.Date);
  const importance = Number(row.Importance);

  if (!name) {
    throw new BadGatewayException(
      'Trading Economics returned an event without a name',
    );
  }
  if (eventTime === null) {
    throw new BadGatewayException(
      'Trading Economics returned an invalid event timestamp',
    );
  }
  if (!Number.isInteger(importance) || importance < 0 || importance > 3) {
    throw new BadGatewayException(
      'Trading Economics returned an invalid importance value',
    );
  }

  const eventIdentity = [
    expected.country,
    clean(row.Ticker),
    clean(row.Category),
    name,
  ].join('|');
  const releaseIdentity = [
    String(row.CalendarId ?? ''),
    eventIdentity,
    String(eventTime),
    clean(row.Reference),
  ].join('|');

  return {
    valueId: numericIdentity(
      isPositiveInteger(row.CalendarId)
        ? String(row.CalendarId)
        : releaseIdentity,
    ),
    eventId: numericIdentity(eventIdentity),
    countryId: numericIdentity(expected.country),
    eventTime,
    periodTime: parseUtcSeconds(row.ReferenceDate) ?? 0,
    revision: 0,
    // Calendar-only mode deliberately excludes mutable historical values.
    actualValue: null,
    previousValue: null,
    revisedPreviousValue: null,
    forecastValue: null,
    impactType: 0,
    countryCode: expected.countryCode,
    countryName: expected.country,
    eventType: 0,
    sector: 0,
    frequency: 0,
    timeMode: 0,
    unit: 0,
    importance,
    multiplier: 0,
    digits: 0,
    sourceUrl: clean(row.SourceURL),
    eventCode: (clean(row.Ticker) || slug(name)).slice(0, 128),
    name: name.slice(0, 256),
  };
}

export function parseDateRange(from: string, to: string) {
  assertIsoDate(from);
  assertIsoDate(to);
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  const toMs = Date.parse(`${to}T23:59:59Z`);

  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs > toMs) {
    throw new BadRequestException('Invalid Trading Economics date range');
  }
  const days = Math.floor((toMs - fromMs) / 86_400_000) + 1;
  if (days > 366) {
    throw new BadRequestException(
      'Trading Economics backfill range cannot exceed 366 days',
    );
  }

  return {
    rangeFrom: Math.floor(fromMs / 1000),
    rangeTo: Math.floor(toMs / 1000),
    days,
  };
}

function assertIsoDate(value: string) {
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString().slice(0, 10) !== value
  ) {
    throw new BadRequestException('Invalid Trading Economics date range');
  }
}

function parseUtcSeconds(value: string | null | undefined): number | null {
  const cleaned = clean(value);
  if (!cleaned) return null;
  const explicitZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(cleaned);
  const timestamp = Date.parse(explicitZone ? cleaned : `${cleaned}Z`);
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : null;
}

function numericIdentity(value: string): string {
  if (/^[1-9]\d{0,17}$/.test(value)) return value;
  const hex = createHash('sha256').update(value).digest('hex').slice(0, 15);
  return BigInt(`0x${hex}`).toString(10);
}

function isPositiveInteger(value: unknown): boolean {
  return /^[1-9]\d*$/.test(String(value ?? ''));
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
