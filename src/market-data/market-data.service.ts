import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { spreadBps } from '../analysis/spreads';
import { CandleQueryDto } from './dto/candle-query.dto';
import { HistoricalBackfillDto } from './dto/historical-backfill.dto';
import { MarketSnapshotBatchDto } from './dto/market-snapshot.dto';
import { SpreadBackfillDto } from './dto/spread-backfill.dto';
import { MarketCandleEntity } from './entities/market-candle.entity';
import { SpreadObservationEntity } from './entities/spread-observation.entity';

export interface StoredSnapshot {
  symbol: string;
  bid: number | null;
  ask: number | null;
  spreadPoints: number | null;
  tickTime: number | null;
  closedBar: {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    tickVolume: number;
  };
  source: string;
  server: string;
  timeframe: string;
  receivedAt: string;
}

@Injectable()
export class MarketDataService {
  constructor(
    @InjectRepository(MarketCandleEntity)
    private readonly candles: Repository<MarketCandleEntity>,
    @InjectRepository(SpreadObservationEntity)
    private readonly spreads: Repository<SpreadObservationEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async assertDatabaseConnection(): Promise<void> {
    await this.dataSource.query('SELECT 1');
  }

  async ingest(batch: MarketSnapshotBatchDto) {
    const rows = batch.snapshots.map((snapshot) =>
      this.candles.create({
        source: batch.source,
        server: batch.server,
        symbol: snapshot.symbol,
        timeframe: batch.timeframe,
        openTime: String(snapshot.closedBar.time),
        open: snapshot.closedBar.open,
        high: snapshot.closedBar.high,
        low: snapshot.closedBar.low,
        close: snapshot.closedBar.close,
        tickVolume: String(snapshot.closedBar.tickVolume),
        observedBid: snapshot.bid,
        observedAsk: snapshot.ask,
        observedSpreadPoints: snapshot.spreadPoints,
        tickTime: String(snapshot.tickTime),
        batchGeneratedAt: String(batch.generatedAt),
        ingestionKind: 'live',
      }),
    );

    const result = await this.candles
      .createQueryBuilder()
      .insert()
      .into(MarketCandleEntity)
      .values(rows)
      .orIgnore()
      .returning(['id'])
      .execute();

    const inserted = Array.isArray(result.raw) ? result.raw.length : 0;

    const spreadRows = batch.snapshots
      .filter(
        (snapshot) =>
          snapshot.bid > 0 &&
          snapshot.ask >= snapshot.bid &&
          snapshot.tickTime > 0,
      )
      .map((snapshot) =>
        this.spreads.create({
          source: batch.source,
          server: batch.server,
          symbol: snapshot.symbol,
          timeframe: batch.timeframe,
          bucketOpenTime: String(
            Math.floor(
              snapshot.tickTime / this.timeframeSeconds(batch.timeframe),
            ) * this.timeframeSeconds(batch.timeframe),
          ),
          observedAtMsc: String(snapshot.tickTime * 1000),
          bid: snapshot.bid,
          ask: snapshot.ask,
          spreadBps: spreadBps(snapshot.bid, snapshot.ask),
          batchGeneratedAt: String(batch.generatedAt),
          ingestionKind: 'live',
        }),
      );

    const spreadResult = spreadRows.length
      ? await this.spreads
          .createQueryBuilder()
          .insert()
          .into(SpreadObservationEntity)
          .values(spreadRows)
          .orIgnore()
          .returning(['id'])
          .execute()
      : null;
    const spreadObservationsInserted = Array.isArray(spreadResult?.raw)
      ? spreadResult.raw.length
      : 0;

    return {
      received: batch.snapshots.length,
      inserted,
      duplicates: batch.snapshots.length - inserted,
      symbols: batch.snapshots.map((snapshot) => snapshot.symbol),
      generatedAt: batch.generatedAt,
      spreadObservationsInserted,
      receivedAt: new Date().toISOString(),
    };
  }

  async backfill(batch: HistoricalBackfillDto) {
    const rows = batch.candles.map((candle) =>
      this.candles.create({
        source: batch.source,
        server: batch.server,
        symbol: batch.symbol,
        timeframe: batch.timeframe,
        openTime: String(candle.time),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        tickVolume: String(candle.tickVolume),
        observedBid: null,
        observedAsk: null,
        observedSpreadPoints: null,
        tickTime: null,
        batchGeneratedAt: String(batch.generatedAt),
        ingestionKind: 'historical',
      }),
    );

    const result = await this.candles
      .createQueryBuilder()
      .insert()
      .into(MarketCandleEntity)
      .values(rows)
      .orIgnore()
      .returning(['id'])
      .execute();

    const inserted = Array.isArray(result.raw) ? result.raw.length : 0;

    return {
      symbol: batch.symbol,
      timeframe: batch.timeframe,
      received: batch.candles.length,
      inserted,
      duplicates: batch.candles.length - inserted,
    };
  }

  async backfillSpreads(batch: SpreadBackfillDto) {
    const invalid = batch.observations.find(
      (observation) =>
        observation.ask < observation.bid ||
        observation.tickTimeMsc < observation.bucketOpenTime * 1000,
    );
    if (invalid) {
      throw new BadRequestException(
        'Spread observations require ask >= bid and tick time at/after bucket open',
      );
    }

    const rows = batch.observations.map((observation) =>
      this.spreads.create({
        source: batch.source,
        server: batch.server,
        symbol: batch.symbol,
        timeframe: batch.timeframe,
        bucketOpenTime: String(observation.bucketOpenTime),
        observedAtMsc: String(observation.tickTimeMsc),
        bid: observation.bid,
        ask: observation.ask,
        spreadBps: spreadBps(observation.bid, observation.ask),
        batchGeneratedAt: String(batch.generatedAt),
        ingestionKind: 'historical-tick',
      }),
    );

    const result = await this.spreads
      .createQueryBuilder()
      .insert()
      .into(SpreadObservationEntity)
      .values(rows)
      .orIgnore()
      .returning(['id'])
      .execute();
    const inserted = Array.isArray(result.raw) ? result.raw.length : 0;

    return {
      symbol: batch.symbol,
      timeframe: batch.timeframe,
      received: batch.observations.length,
      inserted,
      duplicates: batch.observations.length - inserted,
      ingestionKind: 'historical-tick',
    };
  }

  async coverage() {
    const rows: Array<{
      symbol: string;
      timeframe: string;
      candleCount: string;
      oldestOpenTime: string;
      newestOpenTime: string;
    }> = await this.candles
      .createQueryBuilder('candle')
      .select('candle.symbol', 'symbol')
      .addSelect('candle.timeframe', 'timeframe')
      .addSelect('COUNT(*)', 'candleCount')
      .addSelect('MIN(candle.openTime)', 'oldestOpenTime')
      .addSelect('MAX(candle.openTime)', 'newestOpenTime')
      .groupBy('candle.symbol')
      .addGroupBy('candle.timeframe')
      .orderBy('candle.symbol', 'ASC')
      .addOrderBy('candle.timeframe', 'ASC')
      .getRawMany();

    return rows.map((row) => ({
      symbol: row.symbol,
      timeframe: row.timeframe,
      candleCount: Number(row.candleCount),
      oldestOpenTime: Number(row.oldestOpenTime),
      newestOpenTime: Number(row.newestOpenTime),
    }));
  }

  async latest(): Promise<StoredSnapshot[]> {
    const rows = await this.candles
      .createQueryBuilder('candle')
      .distinctOn(['candle.symbol', 'candle.timeframe'])
      .orderBy('candle.symbol', 'ASC')
      .addOrderBy('candle.timeframe', 'ASC')
      .addOrderBy('candle.openTime', 'DESC')
      .getMany();

    return rows.map((row) => this.toSnapshot(row));
  }

  async history(query: CandleQueryDto): Promise<StoredSnapshot[]> {
    let builder = this.candles
      .createQueryBuilder('candle')
      .orderBy('candle.openTime', 'DESC')
      .take(query.limit);

    builder = this.applyOptionalFilter(builder, 'symbol', query.symbol);
    builder = this.applyOptionalFilter(
      builder,
      'timeframe',
      query.timeframe,
    );

    const rows = await builder.getMany();
    return rows.map((row) => this.toSnapshot(row));
  }

  private applyOptionalFilter(
    builder: SelectQueryBuilder<MarketCandleEntity>,
    column: 'symbol' | 'timeframe',
    value: string | undefined,
  ): SelectQueryBuilder<MarketCandleEntity> {
    if (!value) {
      return builder;
    }

    return builder.andWhere(`candle.${column} = :${column}`, {
      [column]: value,
    });
  }

  private toSnapshot(row: MarketCandleEntity): StoredSnapshot {
    return {
      symbol: row.symbol,
      bid: row.observedBid,
      ask: row.observedAsk,
      spreadPoints: row.observedSpreadPoints,
      tickTime: row.tickTime === null ? null : Number(row.tickTime),
      closedBar: {
        time: Number(row.openTime),
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        tickVolume: Number(row.tickVolume),
      },
      source: row.source,
      server: row.server,
      timeframe: row.timeframe,
      receivedAt: row.receivedAt.toISOString(),
    };
  }

  private timeframeSeconds(timeframe: string): number {
    if (timeframe === 'PERIOD_H4') return 4 * 60 * 60;
    if (timeframe === 'PERIOD_H1') return 60 * 60;
    return 15 * 60;
  }
}
