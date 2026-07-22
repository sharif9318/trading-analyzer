import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { CandleQueryDto } from './dto/candle-query.dto';
import { EconomicEventBackfillDto } from './dto/economic-event-backfill.dto';
import { EconomicEventCoverageDto } from './dto/economic-event-coverage.dto';
import { EconomicEventQualityQueryDto } from './dto/economic-event-quality-query.dto';
import { EconomicEventQueryDto } from './dto/economic-event-query.dto';
import { HistoricalBackfillDto } from './dto/historical-backfill.dto';
import { InstrumentCatalogBatchDto } from './dto/instrument-catalog.dto';
import { MarketSnapshotBatchDto } from './dto/market-snapshot.dto';
import { QualityQueryDto } from './dto/quality-query.dto';
import { SpreadBackfillDto } from './dto/spread-backfill.dto';
import { TradingEconomicsBackfillDto } from './dto/trading-economics-backfill.dto';
import { MarketDataService } from './market-data.service';
import { TradingEconomicsService } from './providers/trading-economics.service';
import { DataQualityService } from './quality/data-quality.service';
import { EconomicEventQualityService } from './quality/economic-event-quality.service';

@Controller('market-data')
export class MarketDataController {
  constructor(
    private readonly marketDataService: MarketDataService,
    private readonly dataQualityService: DataQualityService,
    private readonly economicEventQualityService: EconomicEventQualityService,
    private readonly tradingEconomicsService: TradingEconomicsService,
    private readonly config: ConfigService,
  ) {}

  @Get('health')
  async health() {
    await this.marketDataService.assertDatabaseConnection();
    return {
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('latest')
  async latest() {
    return {
      snapshots: await this.marketDataService.latest(),
    };
  }

  @Get('candles')
  async candles(@Query() query: CandleQueryDto) {
    return {
      candles: await this.marketDataService.history(query),
    };
  }

  @Post('snapshots')
  @HttpCode(202)
  async ingest(
    @Headers('x-bridge-key') bridgeKey: string | undefined,
    @Body() batch: MarketSnapshotBatchDto,
  ) {
    this.assertBridgeKey(bridgeKey);
    return this.marketDataService.ingest(batch);
  }

  @Post('backfill')
  @HttpCode(202)
  async backfill(
    @Headers('x-bridge-key') bridgeKey: string | undefined,
    @Body() batch: HistoricalBackfillDto,
  ) {
    this.assertBridgeKey(bridgeKey);
    return this.marketDataService.backfill(batch);
  }

  @Post('spread-backfill')
  @HttpCode(202)
  async spreadBackfill(
    @Headers('x-bridge-key') bridgeKey: string | undefined,
    @Body() batch: SpreadBackfillDto,
  ) {
    this.assertBridgeKey(bridgeKey);
    return this.marketDataService.backfillSpreads(batch);
  }

  @Post('instrument-catalog')
  @HttpCode(202)
  async instrumentCatalog(
    @Headers('x-bridge-key') bridgeKey: string | undefined,
    @Body() batch: InstrumentCatalogBatchDto,
  ) {
    this.assertBridgeKey(bridgeKey);
    return this.marketDataService.upsertInstrumentCatalog(batch);
  }

  @Get('instruments')
  async instruments() {
    return {
      instruments: await this.marketDataService.instrumentCatalog(),
    };
  }

  @Post('economic-events/backfill')
  @HttpCode(202)
  async economicEventBackfill(
    @Headers('x-bridge-key') bridgeKey: string | undefined,
    @Body() batch: EconomicEventBackfillDto,
  ) {
    this.assertBridgeKey(bridgeKey);
    return this.marketDataService.backfillEconomicEvents(batch);
  }

  @Post('economic-events/coverage')
  @HttpCode(202)
  async economicEventCoverage(
    @Headers('x-bridge-key') bridgeKey: string | undefined,
    @Body() coverage: EconomicEventCoverageDto,
  ) {
    this.assertBridgeKey(bridgeKey);
    return this.marketDataService.recordEconomicEventCoverage(coverage);
  }

  @Post('economic-events/providers/trading-economics/backfill')
  @HttpCode(202)
  async tradingEconomicsBackfill(
    @Headers('x-bridge-key') bridgeKey: string | undefined,
    @Body() request: TradingEconomicsBackfillDto,
  ) {
    this.assertBridgeKey(bridgeKey);
    return this.tradingEconomicsService.backfill(request);
  }

  @Get('economic-events/quality')
  async economicEventQuality(@Query() query: EconomicEventQualityQueryDto) {
    return this.economicEventQualityService.report(
      query.minimumReleases,
      query.maximumStalenessDays,
      query.source,
    );
  }

  @Get('economic-events')
  async economicEvents(@Query() query: EconomicEventQueryDto) {
    return {
      events: await this.marketDataService.economicEvents(query),
    };
  }

  @Get('coverage')
  async coverage() {
    return {
      coverage: await this.marketDataService.coverage(),
    };
  }

  @Get('quality')
  async quality(@Query() query: QualityQueryDto) {
    return this.dataQualityService.report(query.targetCandles);
  }

  private assertBridgeKey(provided: string | undefined) {
    const expected = this.config.get<string>('BRIDGE_API_KEY');

    if (!expected) {
      throw new UnauthorizedException(
        'Server BRIDGE_API_KEY is not configured',
      );
    }

    if (!provided) {
      throw new UnauthorizedException('Missing bridge key');
    }

    const expectedBuffer = Buffer.from(expected);
    const providedBuffer = Buffer.from(provided);
    const matches =
      expectedBuffer.length === providedBuffer.length &&
      timingSafeEqual(expectedBuffer, providedBuffer);

    if (!matches) {
      throw new UnauthorizedException('Invalid bridge key');
    }
  }
}
