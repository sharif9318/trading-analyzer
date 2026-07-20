import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { MarketCandleEntity } from '../market-data/entities/market-candle.entity';
import { SpreadObservationEntity } from '../market-data/entities/spread-observation.entity';
import {
  runTrendPullbackConfirmationBacktest,
  runTrendPullbackBacktest,
  summarizeCostCoverage,
  summarizeTrades,
} from './backtest';
import { BacktestRequestDto } from './dto/backtest-request.dto';
import { ConfirmationBacktestRequestDto } from './dto/confirmation-backtest-request.dto';
import { Candle, CostResolution, Trade } from './types';

const REQUIRED_TIMEFRAMES = ['PERIOD_M15', 'PERIOD_H1', 'PERIOD_H4'];

@Injectable()
export class BacktestService {
  constructor(
    @InjectRepository(MarketCandleEntity)
    private readonly candles: Repository<MarketCandleEntity>,
    @InjectRepository(SpreadObservationEntity)
    private readonly spreads: Repository<SpreadObservationEntity>,
  ) {}

  async run(request: BacktestRequestDto) {
    return this.runStrategy(request, 'immediate-entry');
  }

  async runConfirmation(request: ConfirmationBacktestRequestDto) {
    if (request.costModel !== 'historical-spread') {
      throw new BadRequestException(
        'Strategy V2A requires costModel=historical-spread',
      );
    }
    return this.runStrategy(request, 'confirmation-entry');
  }

  private async runStrategy(
    request: BacktestRequestDto,
    variant: 'immediate-entry' | 'confirmation-entry',
  ) {
    const baseConfig = {
      costModel: request.costModel,
      costBps: request.costBps,
      minimumSpreadMatchPercent: request.minimumSpreadMatchPercent,
      stopAtr: request.stopAtr,
      rewardRisk: request.rewardRisk,
      maxHoldingBars: request.maxHoldingBars,
      trainFraction: request.trainFraction,
      riskPerTradePercent: request.riskPerTradePercent,
    };
    const config =
      variant === 'confirmation-entry'
        ? {
            ...baseConfig,
            confirmationBars: 4,
            maximumEntryCostR: 0.25,
          }
        : baseConfig;

    const internalResults = await Promise.all(
      request.symbols.map(async (symbol) => {
        const rows = await this.candles.find({
          where: {
            symbol,
            timeframe: In(REQUIRED_TIMEFRAMES),
          },
          order: { openTime: 'ASC' },
        });
        const newestM15 = rows
          .filter((row) => row.timeframe === 'PERIOD_M15')
          .at(-1);
        if (!newestM15) {
          throw new BadRequestException(`${symbol} is missing PERIOD_M15 history`);
        }
        const brokerRows = rows.filter(
          (row) =>
            row.source === newestM15.source && row.server === newestM15.server,
        );
        const grouped = new Map<string, Candle[]>();
        for (const row of brokerRows) {
          const candles = grouped.get(row.timeframe) ?? [];
          candles.push({
            openTime: Number(row.openTime),
            open: row.open,
            high: row.high,
            low: row.low,
            close: row.close,
            tickVolume: Number(row.tickVolume),
          });
          grouped.set(row.timeframe, candles);
        }

        for (const timeframe of REQUIRED_TIMEFRAMES) {
          if (!grouped.get(timeframe)?.length) {
            throw new BadRequestException(`${symbol} is missing ${timeframe} history`);
          }
        }

        const selectedM15 = grouped
          .get('PERIOD_M15')!
          .slice(-request.maxM15Bars);
        const dynamicCost =
          request.costModel === 'historical-spread'
            ? await this.buildHistoricalCostResolver(
                symbol,
                newestM15.source,
                newestM15.server,
                selectedM15,
              )
            : null;

        const commonInput = {
          symbol,
          m15: selectedM15,
          h1: grouped.get('PERIOD_H1')!,
          h4: grouped.get('PERIOD_H4')!,
          costResolver: dynamicCost?.resolver,
        };
        const result =
          variant === 'confirmation-entry'
            ? runTrendPullbackConfirmationBacktest({
                ...commonInput,
                config: {
                  ...baseConfig,
                  confirmationBars: 4,
                  maximumEntryCostR: 0.25,
                },
              })
            : runTrendPullbackBacktest({
                ...commonInput,
                config: baseConfig,
              });

        return {
          ...result,
          marketDataIdentity: {
            source: newestM15.source,
            server: newestM15.server,
          },
          executionCostData: dynamicCost?.metadata ?? {
            model: 'fixed',
            fixedCostBps: request.costBps,
          },
        };
      }),
    );

    const pooledTrades = internalResults
      .flatMap((result) => result.trades)
      .sort((a, b) => a.entryTime - b.entryTime);

    return {
      generatedAt: new Date().toISOString(),
      strategy:
        variant === 'confirmation-entry'
          ? 'multi-timeframe-trend-pullback-v2a-confirmation'
          : 'multi-timeframe-trend-pullback-v1.2-cost-diagnostics',
      purpose:
        variant === 'confirmation-entry'
          ? 'confirmation-hypothesis-falsification-not-trading-advice'
          : 'baseline-falsification-not-trading-advice',
      config: {
        ...config,
        maxM15Bars: request.maxM15Bars,
        symbols: request.symbols,
      },
      executionModel: {
        signalData: 'closed-candles-only',
        entry:
          variant === 'confirmation-entry'
            ? 'open-after-breakout-confirmation-within-four-M15-bars'
            : 'next-M15-bar-open',
        setupCancellation:
          variant === 'confirmation-entry'
            ? 'cancel-after-four-M15-bars-without-confirmation'
            : 'not-applicable',
        entryCostGate:
          variant === 'confirmation-entry'
            ? 'reject-when-costR-exceeds-0.25'
            : 'none',
        sameBarStopAndTarget: 'stop-first-conservative',
        positionPolicy: 'one-position-per-symbol',
        transactionCost:
          request.costModel === 'historical-spread'
            ? 'exact-entry-M15-spread-with-window-p75-fallback'
            : 'fixed-round-trip-basis-points',
      },
      pooledCostCoverage: summarizeCostCoverage(
        pooledTrades,
        request.costModel,
        request.minimumSpreadMatchPercent,
      ),
      pooledTradeStatistics: summarizeTrades(
        pooledTrades,
        request.riskPerTradePercent,
      ),
      symbols: internalResults.map(({ trades, ...result }) => ({
        ...result,
        recentTradeSample: trades.slice(-5),
      })),
    };
  }

  private async buildHistoricalCostResolver(
    symbol: string,
    source: string,
    server: string,
    selectedM15: Candle[],
  ) {
    const firstOpenTime = selectedM15[0]?.openTime;
    const lastOpenTime = selectedM15.at(-1)?.openTime;
    if (firstOpenTime === undefined || lastOpenTime === undefined) {
      throw new BadRequestException(`${symbol} has no selected M15 history`);
    }

    const rows = await this.spreads.find({
      where: {
        source,
        server,
        symbol,
        timeframe: 'PERIOD_M15',
        bucketOpenTime: Between(String(firstOpenTime), String(lastOpenTime)),
      },
      order: { bucketOpenTime: 'ASC' },
    });
    const validRows = rows.filter(
      (row) => Number.isFinite(row.spreadBps) && row.spreadBps > 0,
    );
    if (!validRows.length) {
      throw new BadRequestException(
        `${symbol} has no valid PERIOD_M15 spread observations in the backtest window`,
      );
    }

    const spreadByOpenTime = new Map<number, CostResolution>();
    for (const row of validRows) {
      spreadByOpenTime.set(Number(row.bucketOpenTime), {
        costBps: row.spreadBps,
        source:
          row.ingestionKind === 'live'
            ? 'live-spread'
            : 'historical-spread',
      });
    }
    const fallbackP75Bps = percentile(
      validRows.map((row) => row.spreadBps),
      0.75,
    );

    return {
      resolver: (entryTime: number): CostResolution =>
        spreadByOpenTime.get(entryTime) ?? {
          costBps: fallbackP75Bps,
          source: 'fallback-p75',
        },
      metadata: {
        model: 'historical-spread',
        timeframe: 'PERIOD_M15',
        matching: 'exact-entry-bucket',
        observationsInWindow: validRows.length,
        oldestObservationTime: Number(validRows[0].bucketOpenTime),
        newestObservationTime: Number(validRows.at(-1)!.bucketOpenTime),
        fallback: 'window-p75',
        fallbackP75Bps: round(fallbackP75Bps),
      },
    };
  }
}

function percentile(values: number[], rank: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(
    0,
    Math.min(sorted.length - 1, Math.ceil(rank * sorted.length) - 1),
  );
  return sorted[index];
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
