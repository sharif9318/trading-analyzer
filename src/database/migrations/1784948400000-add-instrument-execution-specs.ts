import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInstrumentExecutionSpecs1784948400000
  implements MigrationInterface
{
  name = 'AddInstrumentExecutionSpecs1784948400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "instrument_catalog"
        ADD COLUMN "account_currency" varchar(16) NOT NULL DEFAULT '',
        ADD COLUMN "account_leverage" integer NOT NULL DEFAULT 0,
        ADD COLUMN "calculation_mode" integer NOT NULL DEFAULT 0,
        ADD COLUMN "volume_min" double precision NOT NULL DEFAULT 0,
        ADD COLUMN "volume_max" double precision NOT NULL DEFAULT 0,
        ADD COLUMN "volume_step" double precision NOT NULL DEFAULT 0,
        ADD COLUMN "volume_limit" double precision NOT NULL DEFAULT 0,
        ADD COLUMN "margin_initial" double precision NOT NULL DEFAULT 0,
        ADD COLUMN "margin_maintenance" double precision NOT NULL DEFAULT 0,
        ADD COLUMN "minimum_margin_buy" double precision,
        ADD COLUMN "minimum_margin_sell" double precision,
        ADD COLUMN "minimum_one_percent_loss_buy" double precision,
        ADD COLUMN "minimum_one_percent_loss_sell" double precision,
        ADD COLUMN "trade_stops_level" integer NOT NULL DEFAULT 0,
        ADD COLUMN "trade_freeze_level" integer NOT NULL DEFAULT 0
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "instrument_catalog"
        DROP COLUMN "trade_freeze_level",
        DROP COLUMN "trade_stops_level",
        DROP COLUMN "minimum_one_percent_loss_sell",
        DROP COLUMN "minimum_one_percent_loss_buy",
        DROP COLUMN "minimum_margin_sell",
        DROP COLUMN "minimum_margin_buy",
        DROP COLUMN "margin_maintenance",
        DROP COLUMN "margin_initial",
        DROP COLUMN "volume_limit",
        DROP COLUMN "volume_step",
        DROP COLUMN "volume_max",
        DROP COLUMN "volume_min",
        DROP COLUMN "calculation_mode",
        DROP COLUMN "account_leverage",
        DROP COLUMN "account_currency"
    `);
  }
}
