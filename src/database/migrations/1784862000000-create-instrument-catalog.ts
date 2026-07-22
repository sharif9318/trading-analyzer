import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInstrumentCatalog1784862000000
  implements MigrationInterface
{
  name = 'CreateInstrumentCatalog1784862000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "instrument_catalog" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "source" varchar(64) NOT NULL,
        "server" varchar(128) NOT NULL,
        "symbol" varchar(64) NOT NULL,
        "path" varchar(256) NOT NULL,
        "description" varchar(256) NOT NULL,
        "currency_base" varchar(16) NOT NULL,
        "currency_profit" varchar(16) NOT NULL,
        "currency_margin" varchar(16) NOT NULL,
        "trade_mode" integer NOT NULL,
        "digits" integer NOT NULL,
        "point" double precision NOT NULL,
        "contract_size" double precision NOT NULL,
        "tick_size" double precision NOT NULL,
        "tick_value" double precision NOT NULL,
        "swap_mode" integer NOT NULL,
        "swap_long" double precision NOT NULL,
        "swap_short" double precision NOT NULL,
        "swap_rollover_3_days" integer NOT NULL,
        "bid" double precision,
        "ask" double precision,
        "observed_at" bigint NOT NULL,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_instrument_catalog" PRIMARY KEY ("id"),
        CONSTRAINT "uq_instrument_catalog_identity"
          UNIQUE ("source", "server", "symbol"),
        CONSTRAINT "ck_instrument_catalog_quote"
          CHECK (("bid" IS NULL AND "ask" IS NULL) OR
                 ("bid" > 0 AND "ask" >= "bid"))
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_instrument_catalog_symbol"
      ON "instrument_catalog" ("symbol")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "instrument_catalog"');
  }
}
