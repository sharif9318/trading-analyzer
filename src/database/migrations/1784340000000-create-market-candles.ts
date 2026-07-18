import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMarketCandles1784340000000 implements MigrationInterface {
  name = 'CreateMarketCandles1784340000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE EXTENSION IF NOT EXISTS "pgcrypto"
    `);

    await queryRunner.query(`
      CREATE TABLE "market_candles" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "source" varchar(64) NOT NULL,
        "server" varchar(128) NOT NULL,
        "symbol" varchar(64) NOT NULL,
        "timeframe" varchar(32) NOT NULL,
        "open_time" bigint NOT NULL,
        "open" double precision NOT NULL,
        "high" double precision NOT NULL,
        "low" double precision NOT NULL,
        "close" double precision NOT NULL,
        "tick_volume" bigint NOT NULL,
        "observed_bid" double precision NOT NULL,
        "observed_ask" double precision NOT NULL,
        "observed_spread_points" double precision NOT NULL,
        "tick_time" bigint NOT NULL,
        "batch_generated_at" bigint NOT NULL,
        "received_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_market_candles" PRIMARY KEY ("id"),
        CONSTRAINT "uq_market_candle_identity"
          UNIQUE ("source", "server", "symbol", "timeframe", "open_time")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_market_candles_lookup"
      ON "market_candles" ("symbol", "timeframe", "open_time" DESC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "market_candles"');
  }
}
