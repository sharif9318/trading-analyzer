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
import { HistoricalBackfillDto } from './dto/historical-backfill.dto';
import { MarketSnapshotBatchDto } from './dto/market-snapshot.dto';
import { QualityQueryDto } from './dto/quality-query.dto';
import { SpreadBackfillDto } from './dto/spread-backfill.dto';
import { MarketDataService } from './market-data.service';
import { DataQualityService } from './quality/data-quality.service';

@Controller('market-data')
export class MarketDataController {
  constructor(
    private readonly marketDataService: MarketDataService,
    private readonly dataQualityService: DataQualityService,
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
