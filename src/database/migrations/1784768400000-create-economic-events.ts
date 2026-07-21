import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEconomicEvents1784768400000 implements MigrationInterface {
  name = 'CreateEconomicEvents1784768400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "economic_event_definitions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "source" varchar(64) NOT NULL,
        "event_id" bigint NOT NULL,
        "country_id" bigint NOT NULL,
        "currency" varchar(8) NOT NULL,
        "country_code" varchar(8) NOT NULL,
        "country_name" varchar(128) NOT NULL,
        "event_type" smallint NOT NULL,
        "sector" smallint NOT NULL,
        "frequency" smallint NOT NULL,
        "time_mode" smallint NOT NULL,
        "unit" smallint NOT NULL,
        "importance" smallint NOT NULL,
        "multiplier" smallint NOT NULL,
        "digits" smallint NOT NULL,
        "source_url" text NOT NULL,
        "event_code" varchar(128) NOT NULL,
        "name" varchar(256) NOT NULL,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_economic_event_definitions" PRIMARY KEY ("id"),
        CONSTRAINT "uq_economic_event_definition" UNIQUE ("source", "event_id"),
        CONSTRAINT "ck_economic_event_definition_currency"
          CHECK ("currency" ~ '^[A-Z]{3}$'),
        CONSTRAINT "ck_economic_event_definition_name"
          CHECK (length("name") > 0)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_economic_event_definitions_currency"
      ON "economic_event_definitions" ("currency", "importance")
    `);

    await queryRunner.query(`
      CREATE TABLE "economic_event_releases" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "source" varchar(64) NOT NULL,
        "server" varchar(128) NOT NULL,
        "value_id" bigint NOT NULL,
        "event_id" bigint NOT NULL,
        "currency" varchar(8) NOT NULL,
        "event_time" bigint NOT NULL,
        "period_time" bigint NOT NULL,
        "revision" integer NOT NULL,
        "actual_value" double precision,
        "previous_value" double precision,
        "revised_previous_value" double precision,
        "forecast_value" double precision,
        "impact_type" smallint NOT NULL,
        "batch_generated_at" bigint NOT NULL,
        "received_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_economic_event_releases" PRIMARY KEY ("id"),
        CONSTRAINT "uq_economic_event_release"
          UNIQUE ("source", "server", "value_id"),
        CONSTRAINT "ck_economic_event_release_currency"
          CHECK ("currency" ~ '^[A-Z]{3}$'),
        CONSTRAINT "ck_economic_event_release_time"
          CHECK ("event_time" > 0 AND "period_time" >= 0),
        CONSTRAINT "ck_economic_event_release_revision"
          CHECK ("revision" >= 0)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_economic_event_releases_currency_time"
      ON "economic_event_releases" ("currency", "event_time" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_economic_event_releases_event"
      ON "economic_event_releases" ("source", "event_id", "event_time" DESC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "economic_event_releases"');
    await queryRunner.query('DROP TABLE "economic_event_definitions"');
  }
}
