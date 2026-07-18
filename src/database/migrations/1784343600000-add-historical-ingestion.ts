import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHistoricalIngestion1784343600000
  implements MigrationInterface
{
  name = 'AddHistoricalIngestion1784343600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "market_candles"
      ADD COLUMN "ingestion_kind" varchar(16) NOT NULL DEFAULT 'live'
    `);

    await queryRunner.query(`
      ALTER TABLE "market_candles"
      ALTER COLUMN "observed_bid" DROP NOT NULL,
      ALTER COLUMN "observed_ask" DROP NOT NULL,
      ALTER COLUMN "observed_spread_points" DROP NOT NULL,
      ALTER COLUMN "tick_time" DROP NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "market_candles"
      SET "observed_bid" = COALESCE("observed_bid", 0),
          "observed_ask" = COALESCE("observed_ask", 0),
          "observed_spread_points" = COALESCE("observed_spread_points", 0),
          "tick_time" = COALESCE("tick_time", 0)
    `);

    await queryRunner.query(`
      ALTER TABLE "market_candles"
      ALTER COLUMN "observed_bid" SET NOT NULL,
      ALTER COLUMN "observed_ask" SET NOT NULL,
      ALTER COLUMN "observed_spread_points" SET NOT NULL,
      ALTER COLUMN "tick_time" SET NOT NULL,
      DROP COLUMN "ingestion_kind"
    `);
  }
}
