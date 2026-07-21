import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity({ name: 'economic_event_releases' })
@Unique('uq_economic_event_release', ['source', 'server', 'valueId'])
@Index('idx_economic_event_releases_currency_time', ['currency', 'eventTime'])
@Index('idx_economic_event_releases_event', ['source', 'eventId', 'eventTime'])
export class EconomicEventReleaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64 })
  source!: string;

  @Column({ type: 'varchar', length: 128 })
  server!: string;

  @Column({ name: 'value_id', type: 'bigint' })
  valueId!: string;

  @Column({ name: 'event_id', type: 'bigint' })
  eventId!: string;

  @Column({ type: 'varchar', length: 8 })
  currency!: string;

  @Column({ name: 'event_time', type: 'bigint' })
  eventTime!: string;

  @Column({ name: 'period_time', type: 'bigint' })
  periodTime!: string;

  @Column({ type: 'integer' })
  revision!: number;

  @Column({ name: 'actual_value', type: 'double precision', nullable: true })
  actualValue!: number | null;

  @Column({ name: 'previous_value', type: 'double precision', nullable: true })
  previousValue!: number | null;

  @Column({
    name: 'revised_previous_value',
    type: 'double precision',
    nullable: true,
  })
  revisedPreviousValue!: number | null;

  @Column({ name: 'forecast_value', type: 'double precision', nullable: true })
  forecastValue!: number | null;

  @Column({ name: 'impact_type', type: 'smallint' })
  impactType!: number;

  @Column({ name: 'batch_generated_at', type: 'bigint' })
  batchGeneratedAt!: string;

  @CreateDateColumn({ name: 'received_at', type: 'timestamptz' })
  receivedAt!: Date;
}
