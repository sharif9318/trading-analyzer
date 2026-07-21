import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'economic_event_definitions' })
@Unique('uq_economic_event_definition', ['source', 'eventId'])
@Index('idx_economic_event_definitions_currency', ['currency', 'importance'])
export class EconomicEventDefinitionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64 })
  source!: string;

  @Column({ name: 'event_id', type: 'bigint' })
  eventId!: string;

  @Column({ name: 'country_id', type: 'bigint' })
  countryId!: string;

  @Column({ type: 'varchar', length: 8 })
  currency!: string;

  @Column({ name: 'country_code', type: 'varchar', length: 8 })
  countryCode!: string;

  @Column({ name: 'country_name', type: 'varchar', length: 128 })
  countryName!: string;

  @Column({ name: 'event_type', type: 'smallint' })
  eventType!: number;

  @Column({ type: 'smallint' })
  sector!: number;

  @Column({ type: 'smallint' })
  frequency!: number;

  @Column({ name: 'time_mode', type: 'smallint' })
  timeMode!: number;

  @Column({ type: 'smallint' })
  unit!: number;

  @Column({ type: 'smallint' })
  importance!: number;

  @Column({ type: 'smallint' })
  multiplier!: number;

  @Column({ type: 'smallint' })
  digits!: number;

  @Column({ name: 'source_url', type: 'text' })
  sourceUrl!: string;

  @Column({ name: 'event_code', type: 'varchar', length: 128 })
  eventCode!: string;

  @Column({ type: 'varchar', length: 256 })
  name!: string;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
