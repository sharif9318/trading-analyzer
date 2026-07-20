import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSpreadObservations1784682000000
  implements MigrationInterface
{
  name = 'CreateSpreadObservations1784682000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "spread_observations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "source" varchar(64) NOT NULL,
        "server" varchar(128) NOT NULL,
        "symbol" varchar(64) NOT NULL,
        "timeframe" varchar(32) NOT NULL,
        "bucket_open_time" bigint NOT NULL,
        "observed_at_msc" bigint NOT NULL,
        "bid" double precision NOT NULL,
        "ask" double precision NOT NULL,
        "spread_bps" double precision NOT NULL,
        "batch_generated_at" bigint NOT NULL,
        "ingestion_kind" varchar(24) NOT NULL,
        "received_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_spread_observations" PRIMARY KEY ("id"),
        CONSTRAINT "uq_spread_observation_bucket"
          UNIQUE ("source", "server", "symbol", "timeframe", "bucket_open_time"),
        CONSTRAINT "ck_spread_observation_prices"
          CHECK ("bid" > 0 AND "ask" >= "bid")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_spread_observations_lookup"
      ON "spread_observations" ("symbol", "timeframe", "bucket_open_time" DESC)
    `);

    await queryRunner.query(`
      INSERT INTO "spread_observations" (
        "source",
        "server",
        "symbol",
        "timeframe",
        "bucket_open_time",
        "observed_at_msc",
        "bid",
        "ask",
        "spread_bps",
        "batch_generated_at",
        "ingestion_kind",
        "received_at"
      )
      SELECT
        "source",
        "server",
        "symbol",
        "timeframe",
        ("tick_time"::bigint /
          CASE
            WHEN "timeframe" = 'PERIOD_H4' THEN 14400
            WHEN "timeframe" = 'PERIOD_H1' THEN 3600
            ELSE 900
          END) *
          CASE
            WHEN "timeframe" = 'PERIOD_H4' THEN 14400
            WHEN "timeframe" = 'PERIOD_H1' THEN 3600
            ELSE 900
          END,
        "tick_time"::bigint * 1000,
        "observed_bid",
        "observed_ask",
        (("observed_ask" - "observed_bid") /
          (("observed_ask" + "observed_bid") / 2.0)) * 10000.0,
        "batch_generated_at",
        'live',
        "received_at"
      FROM "market_candles"
      WHERE "ingestion_kind" = 'live'
        AND "observed_bid" > 0
        AND "observed_ask" >= "observed_bid"
        AND "tick_time" IS NOT NULL
      ON CONFLICT ON CONSTRAINT "uq_spread_observation_bucket" DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "spread_observations"');
  }
}
