import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEventSpecificEconomicEventGaps1784775600000
  implements MigrationInterface
{
  name = 'AddEventSpecificEconomicEventGaps1784775600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "economic_event_coverage_gaps"
      DROP CONSTRAINT "uq_economic_event_coverage_gap"
    `);
    await queryRunner.query(`
      ALTER TABLE "economic_event_coverage_gaps"
      ADD COLUMN "event_id" varchar(32) NOT NULL DEFAULT ''
    `);
    await queryRunner.query(`
      ALTER TABLE "economic_event_coverage_gaps"
      ADD CONSTRAINT "uq_economic_event_coverage_gap"
      UNIQUE ("source", "server", "currency", "range_from", "range_to", "event_id")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "economic_event_coverage_gaps"
      DROP CONSTRAINT "uq_economic_event_coverage_gap"
    `);
    await queryRunner.query(`
      ALTER TABLE "economic_event_coverage_gaps"
      DROP COLUMN "event_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "economic_event_coverage_gaps"
      ADD CONSTRAINT "uq_economic_event_coverage_gap"
      UNIQUE ("source", "server", "currency", "range_from", "range_to")
    `);
  }
}
