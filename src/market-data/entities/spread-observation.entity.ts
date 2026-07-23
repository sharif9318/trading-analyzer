import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity({ name: 'spread_observations' })
@Unique('uq_spread_observation_bucket', [
  'source',
  'server',
  'symbol',
  'timeframe',
  'bucketOpenTime',
])
@Index('idx_spread_observations_lookup', [
  'symbol',
  'timeframe',
  'bucketOpenTime',
])
export class SpreadObservationEntity {
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

  @Column({ name: 'bucket_open_time', type: 'bigint' })
  bucketOpenTime!: string;

  @Column({ name: 'observed_at_msc', type: 'bigint' })
  observedAtMsc!: string;

  @Column({ type: 'double precision' })
  bid!: number;

  @Column({ type: 'double precision' })
  ask!: number;

  @Column({ name: 'spread_bps', type: 'double precision' })
  spreadBps!: number;

  @Column({ name: 'batch_generated_at', type: 'bigint' })
  batchGeneratedAt!: string;

  @Column({ name: 'ingestion_kind', type: 'varchar', length: 24 })
  ingestionKind!: 'live' | 'historical-tick' | 'historical-bar';

  @CreateDateColumn({ name: 'received_at', type: 'timestamptz' })
  receivedAt!: Date;
}
