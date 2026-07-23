import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'instrument_catalog' })
@Unique('uq_instrument_catalog_identity', ['source', 'server', 'symbol'])
@Index('idx_instrument_catalog_symbol', ['symbol'])
export class InstrumentCatalogEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64 })
  source!: string;

  @Column({ type: 'varchar', length: 128 })
  server!: string;

  @Column({ type: 'varchar', length: 64 })
  symbol!: string;

  @Column({ type: 'varchar', length: 256 })
  path!: string;

  @Column({ type: 'varchar', length: 256 })
  description!: string;

  @Column({ name: 'currency_base', type: 'varchar', length: 16 })
  currencyBase!: string;

  @Column({ name: 'currency_profit', type: 'varchar', length: 16 })
  currencyProfit!: string;

  @Column({ name: 'currency_margin', type: 'varchar', length: 16 })
  currencyMargin!: string;

  @Column({ name: 'account_currency', type: 'varchar', length: 16, default: '' })
  accountCurrency!: string;

  @Column({ name: 'account_leverage', type: 'integer', default: 0 })
  accountLeverage!: number;

  @Column({ name: 'trade_mode', type: 'integer' })
  tradeMode!: number;

  @Column({ type: 'integer' })
  digits!: number;

  @Column({ type: 'double precision' })
  point!: number;

  @Column({ name: 'contract_size', type: 'double precision' })
  contractSize!: number;

  @Column({ name: 'tick_size', type: 'double precision' })
  tickSize!: number;

  @Column({ name: 'tick_value', type: 'double precision' })
  tickValue!: number;

  @Column({ name: 'calculation_mode', type: 'integer', default: 0 })
  calculationMode!: number;

  @Column({ name: 'volume_min', type: 'double precision', default: 0 })
  volumeMin!: number;

  @Column({ name: 'volume_max', type: 'double precision', default: 0 })
  volumeMax!: number;

  @Column({ name: 'volume_step', type: 'double precision', default: 0 })
  volumeStep!: number;

  @Column({ name: 'volume_limit', type: 'double precision', default: 0 })
  volumeLimit!: number;

  @Column({ name: 'margin_initial', type: 'double precision', default: 0 })
  marginInitial!: number;

  @Column({ name: 'margin_maintenance', type: 'double precision', default: 0 })
  marginMaintenance!: number;

  @Column({ name: 'minimum_margin_buy', type: 'double precision', nullable: true })
  minimumMarginBuy!: number | null;

  @Column({ name: 'minimum_margin_sell', type: 'double precision', nullable: true })
  minimumMarginSell!: number | null;

  @Column({
    name: 'minimum_one_percent_loss_buy',
    type: 'double precision',
    nullable: true,
  })
  minimumOnePercentLossBuy!: number | null;

  @Column({
    name: 'minimum_one_percent_loss_sell',
    type: 'double precision',
    nullable: true,
  })
  minimumOnePercentLossSell!: number | null;

  @Column({ name: 'trade_stops_level', type: 'integer', default: 0 })
  tradeStopsLevel!: number;

  @Column({ name: 'trade_freeze_level', type: 'integer', default: 0 })
  tradeFreezeLevel!: number;

  @Column({ name: 'swap_mode', type: 'integer' })
  swapMode!: number;

  @Column({ name: 'swap_long', type: 'double precision' })
  swapLong!: number;

  @Column({ name: 'swap_short', type: 'double precision' })
  swapShort!: number;

  @Column({ name: 'swap_rollover_3_days', type: 'integer' })
  swapRollover3Days!: number;

  @Column({ type: 'double precision', nullable: true })
  bid!: number | null;

  @Column({ type: 'double precision', nullable: true })
  ask!: number | null;

  @Column({ name: 'observed_at', type: 'bigint' })
  observedAt!: string;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
