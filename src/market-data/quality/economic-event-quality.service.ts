import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EconomicEventDefinitionEntity } from '../entities/economic-event-definition.entity';
import { EconomicEventReleaseEntity } from '../entities/economic-event-release.entity';
import { EconomicEventCoverageGapEntity } from '../entities/economic-event-coverage-gap.entity';
import {
  buildEconomicEventQualityReport,
  EconomicEventCurrencyRow,
  SUPPORTED_EVENT_CURRENCIES,
} from './economic-event-quality';

@Injectable()
export class EconomicEventQualityService {
  constructor(
    @InjectRepository(EconomicEventDefinitionEntity)
    private readonly definitions: Repository<EconomicEventDefinitionEntity>,
    @InjectRepository(EconomicEventReleaseEntity)
    private readonly releases: Repository<EconomicEventReleaseEntity>,
    @InjectRepository(EconomicEventCoverageGapEntity)
    private readonly coverageGaps: Repository<EconomicEventCoverageGapEntity>,
  ) {}

  async report(
    minimumReleases: number,
    maximumStalenessDays: number,
    source?: string,
  ) {
    const generatedAt = new Date();
    const [releaseRows, definitionRows, orphanReleases, incompleteDefinitions, unsupportedCurrencyReleases, openGapRows] =
      await Promise.all([
        this.releaseSummary(source),
        this.definitionSummary(source),
        this.orphanReleaseCount(source),
        this.definitions
          .createQueryBuilder('definition')
          .where("definition.name = '' OR definition.currency = ''")
          .andWhere(source ? 'definition.source = :source' : '1 = 1', { source })
          .getCount(),
        this.releases
          .createQueryBuilder('release')
          .where('release.currency NOT IN (:...currencies)', {
            currencies: [...SUPPORTED_EVENT_CURRENCIES],
          })
          .andWhere(source ? 'release.source = :source' : '1 = 1', { source })
          .getCount(),
        this.coverageGaps
          .createQueryBuilder('gap')
          .select('gap.currency', 'currency')
          .addSelect('gap.rangeFrom', 'rangeFrom')
          .addSelect('gap.rangeTo', 'rangeTo')
          .addSelect('gap.eventId', 'eventId')
          .addSelect('gap.errorCode', 'errorCode')
          .addSelect('gap.aggregateAttempted', 'aggregateAttempted')
          .addSelect('gap.perEventAttempted', 'perEventAttempted')
          .where('gap.status = :status', { status: 'open' })
          .andWhere(source ? 'gap.source = :source' : '1 = 1', { source })
          .orderBy('gap.currency', 'ASC')
          .addOrderBy('gap.rangeFrom', 'ASC')
          .getRawMany<{
            currency: string;
            rangeFrom: string;
            rangeTo: string;
            eventId: string;
            errorCode: number | null;
            aggregateAttempted: boolean;
            perEventAttempted: boolean;
          }>(),
      ]);
    const definitionsByCurrency = new Map(
      definitionRows.map((row) => [row.currency, Number(row.definitions)]),
    );
    const rows: EconomicEventCurrencyRow[] = releaseRows.map((row) => ({
      currency: row.currency,
      releases: Number(row.releases),
      definitions: definitionsByCurrency.get(row.currency) ?? 0,
      highImportance: Number(row.highImportance),
      moderateImportance: Number(row.moderateImportance),
      lowImportance: Number(row.lowImportance),
      oldestEventTime:
        row.oldestEventTime === null ? null : Number(row.oldestEventTime),
      newestEventTime:
        row.newestEventTime === null ? null : Number(row.newestEventTime),
    }));

    return {
      generatedAt: generatedAt.toISOString(),
      source: source ?? 'all',
      ...buildEconomicEventQualityReport(
        rows,
        minimumReleases,
        maximumStalenessDays,
        {
          orphanReleases,
          incompleteDefinitions,
          unsupportedCurrencyReleases,
        },
        Math.floor(generatedAt.getTime() / 1000),
        openGapRows.map((gap) => ({
          currency: gap.currency,
          rangeFrom: Number(gap.rangeFrom),
          rangeTo: Number(gap.rangeTo),
          eventId: gap.eventId === '' ? null : gap.eventId,
          errorCode: gap.errorCode === null ? null : Number(gap.errorCode),
          aggregateAttempted: gap.aggregateAttempted,
          perEventAttempted: gap.perEventAttempted,
        })),
      ),
    };
  }

  private async releaseSummary(source?: string) {
    const builder = this.releases
      .createQueryBuilder('release')
      .leftJoin(
        EconomicEventDefinitionEntity,
        'definition',
        'definition.source = release.source AND definition.eventId = release.eventId',
      )
      .select('release.currency', 'currency')
      .addSelect('COUNT(*)', 'releases')
      .addSelect(
        'COUNT(*) FILTER (WHERE definition.importance = 3)',
        'highImportance',
      )
      .addSelect(
        'COUNT(*) FILTER (WHERE definition.importance = 2)',
        'moderateImportance',
      )
      .addSelect(
        'COUNT(*) FILTER (WHERE definition.importance = 1)',
        'lowImportance',
      )
      .addSelect('MIN(release.eventTime)', 'oldestEventTime')
      .addSelect('MAX(release.eventTime)', 'newestEventTime')
      .groupBy('release.currency');
    if (source) builder.where('release.source = :source', { source });
    return builder
      .orderBy('release.currency', 'ASC')
      .getRawMany<{
        currency: string;
        releases: string;
        highImportance: string;
        moderateImportance: string;
        lowImportance: string;
        oldestEventTime: string | null;
        newestEventTime: string | null;
      }>();
  }

  private async definitionSummary(source?: string) {
    const builder = this.definitions
      .createQueryBuilder('definition')
      .select('definition.currency', 'currency')
      .addSelect('COUNT(*)', 'definitions');
    if (source) builder.where('definition.source = :source', { source });
    return builder
      .groupBy('definition.currency')
      .getRawMany<{ currency: string; definitions: string }>();
  }

  private async orphanReleaseCount(source?: string) {
    const builder = this.releases
      .createQueryBuilder('release')
      .leftJoin(
        EconomicEventDefinitionEntity,
        'definition',
        'definition.source = release.source AND definition.eventId = release.eventId',
      )
      .where('definition.id IS NULL');
    if (source) builder.andWhere('release.source = :source', { source });
    return builder
      .getCount();
  }
}
