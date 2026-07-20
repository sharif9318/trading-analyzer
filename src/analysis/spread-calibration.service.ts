import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SpreadObservationEntity } from '../market-data/entities/spread-observation.entity';
import { summarizeSpreadObservations } from './spreads';

@Injectable()
export class SpreadCalibrationService {
  constructor(
    @InjectRepository(SpreadObservationEntity)
    private readonly spreads: Repository<SpreadObservationEntity>,
  ) {}

  async report(timeframe: string, minimumSamples: number) {
    const rows = await this.spreads.find({
      where: {
        timeframe,
      },
      select: {
        symbol: true,
        bid: true,
        ask: true,
        observedAtMsc: true,
        ingestionKind: true,
      },
      order: { observedAtMsc: 'ASC' },
    });
    const grouped = new Map<string, typeof rows>();
    for (const row of rows) {
      const group = grouped.get(row.symbol) ?? [];
      group.push(row);
      grouped.set(row.symbol, group);
    }

    return {
      generatedAt: new Date().toISOString(),
      timeframe,
      costModel: 'observed-bid-ask-spread-bps',
      symbols: [...grouped.entries()].map(([symbol, observations]) => ({
        symbol,
        samplesByIngestionKind: {
          live: observations.filter(
            (observation) => observation.ingestionKind === 'live',
          ).length,
          historicalTick: observations.filter(
            (observation) =>
              observation.ingestionKind === 'historical-tick',
          ).length,
        },
        ...summarizeSpreadObservations(
          observations.map((observation) => ({
            symbol,
            bid: observation.bid,
            ask: observation.ask,
            observedAt: Math.floor(Number(observation.observedAtMsc) / 1000),
          })),
          minimumSamples,
        ),
      })),
    };
  }
}
