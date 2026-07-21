import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEconomicEventCoverageGaps1784772000000
  implements MigrationInterface
{
  name = 'AddEconomicEventCoverageGaps1784772000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "economic_event_coverage_gaps" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "source" varchar(64) NOT NULL,
        "server" varchar(128) NOT NULL,
        "currency" varchar(8) NOT NULL,
        "range_from" bigint NOT NULL,
        "range_to" bigint NOT NULL,
        "error_code" integer,
        "aggregate_attempted" boolean NOT NULL DEFAULT false,
        "per_event_attempted" boolean NOT NULL DEFAULT false,
        "status" varchar(16) NOT NULL,
        "resolved_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_economic_event_coverage_gaps" PRIMARY KEY ("id"),
        CONSTRAINT "uq_economic_event_coverage_gap"
          UNIQUE ("source", "server", "currency", "range_from", "range_to"),
        CONSTRAINT "ck_economic_event_coverage_gap_currency"
          CHECK ("currency" ~ '^[A-Z]{3}$'),
        CONSTRAINT "ck_economic_event_coverage_gap_range"
          CHECK ("range_from" <= "range_to"),
        CONSTRAINT "ck_economic_event_coverage_gap_status"
          CHECK ("status" IN ('open', 'resolved'))
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_economic_event_coverage_gaps_status"
      ON "economic_event_coverage_gaps" ("status", "currency", "range_from")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "economic_event_coverage_gaps"');
  }
}
