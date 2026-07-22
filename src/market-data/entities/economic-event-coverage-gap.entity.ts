import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'economic_event_coverage_gaps' })
@Unique('uq_economic_event_coverage_gap', [
  'source',
  'server',
  'currency',
  'rangeFrom',
  'rangeTo',
  'eventId',
])
@Index('idx_economic_event_coverage_gaps_status', [
  'status',
  'currency',
  'rangeFrom',
])
export class EconomicEventCoverageGapEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64 })
  source!: string;

  @Column({ type: 'varchar', length: 128 })
  server!: string;

  @Column({ type: 'varchar', length: 8 })
  currency!: string;

  @Column({ name: 'range_from', type: 'bigint' })
  rangeFrom!: string;

  @Column({ name: 'range_to', type: 'bigint' })
  rangeTo!: string;

  @Column({ name: 'event_id', type: 'varchar', length: 32, default: '' })
  eventId!: string;

  @Column({ name: 'error_code', type: 'integer', nullable: true })
  errorCode!: number | null;

  @Column({ name: 'aggregate_attempted', type: 'boolean', default: false })
  aggregateAttempted!: boolean;

  @Column({ name: 'per_event_attempted', type: 'boolean', default: false })
  perEventAttempted!: boolean;

  @Column({ type: 'varchar', length: 16 })
  status!: 'open' | 'resolved';

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
