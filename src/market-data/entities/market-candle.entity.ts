import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity({ name: 'market_candles' })
@Unique('uq_market_candle_identity', [
  'source',
  'server',
  'symbol',
  'timeframe',
  'openTime',
])
@Index('idx_market_candles_lookup', ['symbol', 'timeframe', 'openTime'])
export class MarketCandleEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64 })
  source!: string;

  @Column({ type: 'varchar', length: 128 })
  server!: string;

  @Column({ type: 'varchar', length: 64 })
  symbol!: string;

  @Column({ type: 'varchar', length: 32 })
  timeframe!: string;

  @Column({ name: 'open_time', type: 'bigint' })
  openTime!: string;

  @Column({ type: 'double precision' })
  open!: number;

  @Column({ type: 'double precision' })
  high!: number;

  @Column({ type: 'double precision' })
  low!: number;

  @Column({ type: 'double precision' })
  close!: number;

  @Column({ name: 'tick_volume', type: 'bigint' })
  tickVolume!: string;

  @Column({ name: 'observed_bid', type: 'double precision', nullable: true })
  observedBid!: number | null;

  @Column({ name: 'observed_ask', type: 'double precision', nullable: true })
  observedAsk!: number | null;

  @Column({
    name: 'observed_spread_points',
    type: 'double precision',
    nullable: true,
  })
  observedSpreadPoints!: number | null;

  @Column({ name: 'tick_time', type: 'bigint', nullable: true })
  tickTime!: string | null;

  @Column({ name: 'batch_generated_at', type: 'bigint' })
  batchGeneratedAt!: string;

  @Column({ name: 'ingestion_kind', type: 'varchar', length: 16 })
  ingestionKind!: 'live' | 'historical';

  @CreateDateColumn({ name: 'received_at', type: 'timestamptz' })
  receivedAt!: Date;
}
