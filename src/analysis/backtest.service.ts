import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { MarketCandleEntity } from '../market-data/entities/market-candle.entity';
import { runTrendPullbackBacktest, summarizeTrades } from './backtest';
import { BacktestRequestDto } from './dto/backtest-request.dto';
import { Candle, Trade } from './types';

const REQUIRED_TIMEFRAMES = ['PERIOD_M15', 'PERIOD_H1', 'PERIOD_H4'];

@Injectable()
export class BacktestService {
  constructor(
    @InjectRepository(MarketCandleEntity)
    private readonly candles: Repository<MarketCandleEntity>,
  ) {}

  async run(request: BacktestRequestDto) {
    const config = {
      costBps: request.costBps,
      stopAtr: request.stopAtr,
      rewardRisk: request.rewardRisk,
      maxHoldingBars: request.maxHoldingBars,
      trainFraction: request.trainFraction,
      riskPerTradePercent: request.riskPerTradePercent,
    };

    const internalResults = await Promise.all(
      request.symbols.map(async (symbol) => {
        const rows = await this.candles.find({
          where: {
            symbol,
            timeframe: In(REQUIRED_TIMEFRAMES),
          },
          order: { openTime: 'ASC' },
        });
        const grouped = new Map<string, Candle[]>();
        for (const row of rows) {
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

        return runTrendPullbackBacktest({
          symbol,
          m15: grouped.get('PERIOD_M15')!.slice(-request.maxM15Bars),
          h1: grouped.get('PERIOD_H1')!,
          h4: grouped.get('PERIOD_H4')!,
          config,
        });
      }),
    );

    const pooledTrades = internalResults
      .flatMap((result) => result.trades)
      .sort((a, b) => a.entryTime - b.entryTime);

    return {
      generatedAt: new Date().toISOString(),
      strategy: 'multi-timeframe-trend-pullback-v1',
      purpose: 'baseline-falsification-not-trading-advice',
      config: {
        ...config,
        maxM15Bars: request.maxM15Bars,
        symbols: request.symbols,
      },
      executionModel: {
        signalData: 'closed-candles-only',
        entry: 'next-M15-bar-open',
        sameBarStopAndTarget: 'stop-first-conservative',
        positionPolicy: 'one-position-per-symbol',
        transactionCost: 'round-trip-basis-points',
      },
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
}
