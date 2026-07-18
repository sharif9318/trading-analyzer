import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MarketCandleEntity } from '../entities/market-candle.entity';
import {
  QualityCandle,
  analyzeSeries,
  classifyCrossSymbolGaps,
  selectAnalysisWindow,
} from './session-quality';

@Injectable()
export class DataQualityService {
  constructor(
    @InjectRepository(MarketCandleEntity)
    private readonly candles: Repository<MarketCandleEntity>,
  ) {}

  async report(targetCandles: number) {
    const rows = await this.candles.find({
      select: {
        symbol: true,
        timeframe: true,
        openTime: true,
        open: true,
        high: true,
        low: true,
        close: true,
        tickVolume: true,
      },
      order: {
        symbol: 'ASC',
        timeframe: 'ASC',
        openTime: 'ASC',
      },
    });

    const grouped = new Map<
      string,
      { symbol: string; timeframe: string; candles: QualityCandle[] }
    >();

    for (const row of rows) {
      const key = `${row.symbol}\u0000${row.timeframe}`;
      const group = grouped.get(key) ?? {
        symbol: row.symbol,
        timeframe: row.timeframe,
        candles: [],
      };

      group.candles.push({
        openTime: Number(row.openTime),
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        tickVolume: Number(row.tickVolume),
      });
      grouped.set(key, group);
    }

    const groups = [...grouped.values()];
    const commonEndByTimeframe = new Map<string, number>();

    for (const group of groups) {
      const newest = group.candles.at(-1)?.openTime;
      if (newest === undefined) continue;
      const current = commonEndByTimeframe.get(group.timeframe);
      commonEndByTimeframe.set(
        group.timeframe,
        current === undefined ? newest : Math.min(current, newest),
      );
    }

    const series = classifyCrossSymbolGaps(
      groups.map((group) => {
        const analysisWindowEndTime =
          commonEndByTimeframe.get(group.timeframe) ??
          group.candles.at(-1)?.openTime ??
          0;
        const analysisCandles = selectAnalysisWindow(
          group.candles,
          targetCandles,
          analysisWindowEndTime,
        );

        return {
          symbol: group.symbol,
          timeframe: group.timeframe,
          availableCandles: group.candles.length,
          analysisWindowEndTime,
          ...analyzeSeries(
            analysisCandles,
            group.timeframe,
            targetCandles,
          ),
        };
      }),
    );

    const score =
      series.length === 0
        ? 0
        : Math.round(
            (series.reduce((sum, item) => sum + item.score, 0) /
              series.length) *
              100,
          ) / 100;
    const actionableMissingCandles = series.reduce(
      (sum, item) => sum + item.actionableMissingCandles,
      0,
    );
    const invalidCandles = series.reduce(
      (sum, item) => sum + item.invalidCandles,
      0,
    );

    return {
      generatedAt: new Date().toISOString(),
      model: 'empirical-weekly-session-v4-weekend-gate',
      score,
      blockingIssues: {
        actionableMissingCandles,
        invalidCandles,
      },
      status:
        actionableMissingCandles > 0 || invalidCandles > 0
          ? 'investigate'
          : score >= 98
          ? 'excellent'
          : score >= 95
            ? 'acceptable'
            : 'investigate',
      series,
    };
  }
}
