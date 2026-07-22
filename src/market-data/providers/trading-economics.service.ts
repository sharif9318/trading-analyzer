import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EconomicEventBackfillDto } from '../dto/economic-event-backfill.dto';
import {
  TradingEconomicsBackfillDto,
  TradingEconomicsCurrency,
} from '../dto/trading-economics-backfill.dto';
import { MarketDataService } from '../market-data.service';
import {
  mapTradingEconomicsRow,
  parseDateRange,
  TRADING_ECONOMICS_COUNTRIES,
  TRADING_ECONOMICS_SERVER,
  TRADING_ECONOMICS_SOURCE,
  TradingEconomicsCalendarRow,
} from './trading-economics-calendar';

@Injectable()
export class TradingEconomicsService {
  constructor(
    private readonly config: ConfigService,
    private readonly marketData: MarketDataService,
  ) {}

  async backfill(request: TradingEconomicsBackfillDto) {
    const apiKey = this.config.get<string>('TRADING_ECONOMICS_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'TRADING_ECONOMICS_API_KEY is not configured',
      );
    }
    const range = parseDateRange(request.from, request.to);
    const generatedAt = Math.floor(Date.now() / 1000);
    const results = [];

    for (const currency of request.currencies) {
      const rows = await this.fetchRows(
        apiKey,
        currency,
        request.from,
        request.to,
      );
      const mapped = rows
        .map((row) => mapTradingEconomicsRow(row, currency))
        .filter((event) => event.importance >= request.minimumImportance);

      if (mapped.length === 0) {
        throw new BadGatewayException(
          `Trading Economics returned no usable ${currency} events`,
        );
      }

      let upsertedReleases = 0;
      let upsertedDefinitions = 0;
      for (let index = 0; index < mapped.length; index += 100) {
        const batch: EconomicEventBackfillDto = {
          source: TRADING_ECONOMICS_SOURCE,
          server: TRADING_ECONOMICS_SERVER,
          currency,
          generatedAt,
          events: mapped.slice(index, index + 100),
        };
        const result = await this.marketData.backfillEconomicEvents(batch);
        upsertedReleases += result.uniqueReleasesUpserted;
        upsertedDefinitions += result.uniqueDefinitionsUpserted;
      }

      await this.marketData.recordEconomicEventCoverage({
        source: TRADING_ECONOMICS_SOURCE,
        server: TRADING_ECONOMICS_SERVER,
        currency,
        rangeFrom: range.rangeFrom,
        rangeTo: range.rangeTo,
        status: 'complete',
        aggregateAttempted: true,
        perEventAttempted: false,
      });
      results.push({
        currency,
        providerRows: rows.length,
        retainedRows: mapped.length,
        uniqueDefinitionsUpserted: upsertedDefinitions,
        uniqueReleasesUpserted: upsertedReleases,
      });
    }

    return {
      source: TRADING_ECONOMICS_SOURCE,
      timestampBasis: 'utc',
      valueMode: 'calendar-only',
      from: request.from,
      to: request.to,
      minimumImportance: request.minimumImportance,
      results,
      warning:
        'Do not join these UTC timestamps to raw XM server timestamps until offset calibration is verified.',
    };
  }

  private async fetchRows(
    apiKey: string,
    currency: TradingEconomicsCurrency,
    from: string,
    to: string,
  ): Promise<TradingEconomicsCalendarRow[]> {
    const country = TRADING_ECONOMICS_COUNTRIES[currency].country;
    const url = new URL(
      `https://api.tradingeconomics.com/calendar/country/${encodeURIComponent(country)}/${from}/${to}`,
    );
    url.searchParams.set('c', apiKey);
    url.searchParams.set('f', 'json');

    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    } catch (error) {
      throw new BadGatewayException(
        `Trading Economics request failed for ${currency}: ${error instanceof Error ? error.message : 'network error'}`,
      );
    }
    if (!response.ok) {
      throw new BadGatewayException(
        `Trading Economics returned HTTP ${response.status} for ${currency}`,
      );
    }

    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) {
      throw new BadGatewayException(
        `Trading Economics returned an unexpected payload for ${currency}`,
      );
    }
    return payload as TradingEconomicsCalendarRow[];
  }
}
