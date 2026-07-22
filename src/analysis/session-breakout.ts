import { buildFeatures } from './indicators';
import {
  brokerHour,
  buildChronologicalFolds,
  resolveBarExit,
  summarizeCostCoverage,
  summarizeTrades,
  transactionCostR,
} from './backtest';
import { Candle, CostResolution, FeatureRow, Trade } from './types';

const M15_SECONDS = 15 * 60;

export const GOLD_SESSION_BREAKOUT_RULES = Object.freeze({
  symbol: 'GOLD#',
  referenceStartBrokerHour: 1,
  referenceEndBrokerHourExclusive: 8,
  expectedReferenceBars: 28,
  breakoutStartBrokerHour: 8,
  breakoutEndBrokerHourExclusive: 17,
  entry: 'next-M15-open-after-first-strict-close-outside-reference-range',
  stopAtrFloor: 0.75,
  rewardRisk: 1.5,
  maxHoldingBars: 20,
  tradesPerBrokerDay: 1,
  sameBarStopAndTarget: 'stop-first-conservative',
  higherTimeframeFilter: 'none',
  entryCostGate: 'none',
});

export const GOLD_SESSION_BREAKOUT_ACCEPTANCE = Object.freeze({
  minimumOutOfSampleTrades: 20,
  minimumOutOfSampleAverageNetR: 0.05,
  minimumOutOfSampleProfitFactor: 1.1,
  minimumProfitableFolds: 3,
  totalFolds: 5,
  maximumOutOfSampleDrawdownPercent: 10,
  minimumOutOfSampleTradesPerDirection: 5,
  minimumInSampleAverageNetR: 0,
});

export interface GoldSessionBreakoutConfig {
  costModel: 'historical-spread';
  costBps: number;
  minimumSpreadMatchPercent: number;
  trainFraction: number;
  riskPerTradePercent: number;
}

export interface GoldSessionBreakoutInput {
  symbol: string;
  m15: Candle[];
  config: GoldSessionBreakoutConfig;
  costResolver: (entryTime: number) => CostResolution;
}

interface DayBucket {
  key: string;
  indices: number[];
}

export function runGoldSessionBreakoutBacktest(
  input: GoldSessionBreakoutInput,
) {
  if (input.symbol !== GOLD_SESSION_BREAKOUT_RULES.symbol) {
    throw new Error(
      `Gold session breakout is preregistered only for ${GOLD_SESSION_BREAKOUT_RULES.symbol}`,
    );
  }

  const m15 = buildFeatures(input.m15);
  const trades: Trade[] = [];
  const splitIndex = Math.floor(m15.length * input.config.trainFraction);
  const splitTime = m15[splitIndex]?.openTime ?? 0;
  const buckets = buildDayBuckets(m15);
  const diagnostics = {
    brokerDays: buckets.length,
    completeReferenceDays: 0,
    incompleteReferenceDays: 0,
    noBreakoutDays: 0,
    missingEntryBarDays: 0,
    enteredTrades: 0,
  };

  for (const bucket of buckets) {
    const referenceIndices = bucket.indices.filter((index) => {
      const hour = brokerHour(m15[index].openTime);
      return (
        hour >= GOLD_SESSION_BREAKOUT_RULES.referenceStartBrokerHour &&
        hour < GOLD_SESSION_BREAKOUT_RULES.referenceEndBrokerHourExclusive
      );
    });

    if (!isCompleteReferenceSession(m15, referenceIndices)) {
      diagnostics.incompleteReferenceDays++;
      continue;
    }
    diagnostics.completeReferenceDays++;

    const reference = referenceIndices.map((index) => m15[index]);
    const referenceHigh = Math.max(...reference.map((bar) => bar.high));
    const referenceLow = Math.min(...reference.map((bar) => bar.low));
    const referenceMidpoint = (referenceHigh + referenceLow) / 2;
    const breakoutIndices = bucket.indices.filter((index) => {
      const hour = brokerHour(m15[index].openTime);
      return (
        hour >= GOLD_SESSION_BREAKOUT_RULES.breakoutStartBrokerHour &&
        hour < GOLD_SESSION_BREAKOUT_RULES.breakoutEndBrokerHourExclusive
      );
    });

    const signalIndex = breakoutIndices.find((index) => {
      const bar = m15[index];
      return (
        bar.atr14 !== null &&
        bar.atr14 > 0 &&
        (bar.close > referenceHigh || bar.close < referenceLow)
      );
    });
    if (signalIndex === undefined) {
      diagnostics.noBreakoutDays++;
      continue;
    }

    const entryIndex = signalIndex + 1;
    if (
      !m15[entryIndex] ||
      brokerDateKey(m15[entryIndex].openTime) !== bucket.key ||
      m15[entryIndex].openTime - m15[signalIndex].openTime !== M15_SECONDS
    ) {
      diagnostics.missingEntryBarDays++;
      continue;
    }

    const direction =
      m15[signalIndex].close > referenceHigh ? 'long' : 'short';
    const simulated = simulateSessionBreakoutTrade({
      symbol: input.symbol,
      direction,
      m15,
      signalIndex,
      entryIndex,
      referenceHigh,
      referenceLow,
      referenceMidpoint,
      costResolver: input.costResolver,
    });
    if (simulated) trades.push(simulated);
  }

  diagnostics.enteredTrades = trades.length;
  const inSampleTrades = trades.filter((trade) => trade.entryTime < splitTime);
  const outOfSampleTrades = trades.filter((trade) => trade.entryTime >= splitTime);
  const chronologicalFolds = buildChronologicalFolds(
    trades,
    m15,
    input.config.riskPerTradePercent,
  );
  const profitableFolds = chronologicalFolds.filter(
    (fold) =>
      fold.metrics.averageNetR > 0 && (fold.metrics.profitFactor ?? 0) > 1,
  ).length;
  const all = summarizeTrades(trades, input.config.riskPerTradePercent);
  const inSample = summarizeTrades(
    inSampleTrades,
    input.config.riskPerTradePercent,
  );
  const outOfSample = summarizeTrades(
    outOfSampleTrades,
    input.config.riskPerTradePercent,
  );
  const acceptance = assessGoldSessionBreakout(
    inSample,
    outOfSample,
    profitableFolds,
  );
  const costCoverage = summarizeCostCoverage(
    trades,
    input.config.costModel,
    input.config.minimumSpreadMatchPercent,
  );

  return {
    symbol: input.symbol,
    splitTime,
    conclusion:
      costCoverage.status === 'insufficient'
        ? 'insufficient-spread-coverage'
        : acceptance.conclusion,
    statisticalConclusion: acceptance.conclusion,
    costCoverage,
    sessionDiagnostics: diagnostics,
    acceptance,
    profitableFolds,
    chronologicalFolds,
    all,
    inSample,
    outOfSample,
    diagnostics: {
      byDirection: {
        long: summarizeTrades(
          trades.filter((trade) => trade.direction === 'long'),
          input.config.riskPerTradePercent,
        ),
        short: summarizeTrades(
          trades.filter((trade) => trade.direction === 'short'),
          input.config.riskPerTradePercent,
        ),
      },
    },
    trades,
  };
}

function simulateSessionBreakoutTrade(input: {
  symbol: string;
  direction: 'long' | 'short';
  m15: FeatureRow[];
  signalIndex: number;
  entryIndex: number;
  referenceHigh: number;
  referenceLow: number;
  referenceMidpoint: number;
  costResolver: (entryTime: number) => CostResolution;
}): Trade | null {
  const signal = input.m15[input.signalIndex];
  const entryBar = input.m15[input.entryIndex];
  if (signal.atr14 === null || signal.atr14 <= 0) return null;

  const entryPrice = entryBar.open;
  const boundaryDistance =
    input.direction === 'long'
      ? entryPrice - input.referenceHigh
      : input.referenceLow - entryPrice;
  const stopDistance = Math.max(
    boundaryDistance,
    signal.atr14 * GOLD_SESSION_BREAKOUT_RULES.stopAtrFloor,
  );
  if (!Number.isFinite(stopDistance) || stopDistance <= 0) return null;

  const stopPrice =
    input.direction === 'long'
      ? entryPrice - stopDistance
      : entryPrice + stopDistance;
  const targetPrice =
    input.direction === 'long'
      ? entryPrice + stopDistance * GOLD_SESSION_BREAKOUT_RULES.rewardRisk
      : entryPrice - stopDistance * GOLD_SESSION_BREAKOUT_RULES.rewardRisk;
  const finalIndex = Math.min(
    input.m15.length - 1,
    input.entryIndex + GOLD_SESSION_BREAKOUT_RULES.maxHoldingBars - 1,
  );

  let exitIndex = finalIndex;
  let exitPrice = input.m15[finalIndex].close;
  let exitReason: Trade['exitReason'] =
    finalIndex === input.m15.length - 1 ? 'end-of-data' : 'timeout';
  for (let index = input.entryIndex; index <= finalIndex; index++) {
    const resolved = resolveBarExit(
      input.direction,
      input.m15[index],
      stopPrice,
      targetPrice,
    );
    if (resolved) {
      exitIndex = index;
      exitPrice = resolved.price;
      exitReason = resolved.reason;
      break;
    }
  }

  const directionMultiplier = input.direction === 'long' ? 1 : -1;
  const grossR =
    (directionMultiplier * (exitPrice - entryPrice)) / stopDistance;
  const cost = input.costResolver(entryBar.openTime);
  const costR = transactionCostR(entryPrice, cost.costBps, stopDistance);
  const rangeSize = input.referenceHigh - input.referenceLow;
  const breakoutDistance =
    input.direction === 'long'
      ? signal.close - input.referenceHigh
      : input.referenceLow - signal.close;

  return {
    symbol: input.symbol,
    direction: input.direction,
    signalTime: signal.openTime,
    entryTime: entryBar.openTime,
    exitTime: input.m15[exitIndex].openTime,
    entryPrice: round(entryPrice),
    exitPrice: round(exitPrice),
    stopPrice: round(stopPrice),
    targetPrice: round(targetPrice),
    holdingBars: exitIndex - input.entryIndex + 1,
    exitReason,
    costBps: round(cost.costBps),
    costSource: cost.source,
    costR: round(costR),
    brokerHour: brokerHour(entryBar.openTime),
    marketContext: {
      atrPercent: round((signal.atr14 / signal.close) * 100),
      m15Rsi14: round(signal.rsi14 ?? 0),
      h1EmaSeparationPercent: 0,
      h4EmaSeparationPercent: 0,
    },
    sessionContext: {
      brokerDate: brokerDateKey(signal.openTime),
      referenceHigh: round(input.referenceHigh),
      referenceLow: round(input.referenceLow),
      referenceMidpoint: round(input.referenceMidpoint),
      referenceRangePercent: round(
        input.referenceMidpoint > 0
          ? (rangeSize / input.referenceMidpoint) * 100
          : 0,
      ),
      breakoutDistanceAtr: round(breakoutDistance / signal.atr14),
    },
    grossR: round(grossR),
    netR: round(grossR - costR),
  };
}

function assessGoldSessionBreakout(
  inSample: ReturnType<typeof summarizeTrades>,
  outOfSample: ReturnType<typeof summarizeTrades>,
  profitableFolds: number,
) {
  const rules = GOLD_SESSION_BREAKOUT_ACCEPTANCE;
  const checks = {
    outOfSampleTrades:
      outOfSample.trades >= rules.minimumOutOfSampleTrades,
    outOfSampleAverageNetR:
      outOfSample.averageNetR >= rules.minimumOutOfSampleAverageNetR,
    outOfSampleProfitFactor:
      (outOfSample.profitFactor ?? 0) >=
      rules.minimumOutOfSampleProfitFactor,
    profitableFolds: profitableFolds >= rules.minimumProfitableFolds,
    outOfSampleDrawdown:
      outOfSample.maxDrawdownPercent <=
      rules.maximumOutOfSampleDrawdownPercent,
    outOfSampleDirectionCoverage:
      outOfSample.longTrades >=
        rules.minimumOutOfSampleTradesPerDirection &&
      outOfSample.shortTrades >=
        rules.minimumOutOfSampleTradesPerDirection,
    inSampleAverageNetR:
      inSample.averageNetR > rules.minimumInSampleAverageNetR,
  };

  let conclusion: string;
  if (!checks.outOfSampleTrades) {
    conclusion = 'insufficient-out-of-sample-trades';
  } else if (
    outOfSample.averageNetR <= 0 ||
    (outOfSample.profitFactor ?? 0) <= 1
  ) {
    conclusion = 'baseline-failed';
  } else if (!Object.values(checks).every(Boolean)) {
    conclusion = 'unstable-or-not-economically-robust';
  } else {
    conclusion = 'promising-not-validated';
  }

  return {
    preregistered: true,
    criteria: rules,
    checks,
    passed: Object.values(checks).every(Boolean),
    conclusion,
  };
}

function buildDayBuckets(m15: FeatureRow[]): DayBucket[] {
  const buckets = new Map<string, number[]>();
  for (let index = 0; index < m15.length; index++) {
    const key = brokerDateKey(m15[index].openTime);
    const indices = buckets.get(key) ?? [];
    indices.push(index);
    buckets.set(key, indices);
  }
  return [...buckets.entries()].map(([key, indices]) => ({ key, indices }));
}

export function isCompleteReferenceSession(
  candles: FeatureRow[],
  indices: number[],
): boolean {
  if (indices.length !== GOLD_SESSION_BREAKOUT_RULES.expectedReferenceBars) {
    return false;
  }
  const first = new Date(candles[indices[0]].openTime * 1000);
  const last = new Date(candles[indices.at(-1)!].openTime * 1000);
  if (
    first.getUTCHours() !==
      GOLD_SESSION_BREAKOUT_RULES.referenceStartBrokerHour ||
    first.getUTCMinutes() !== 0 ||
    last.getUTCHours() !==
      GOLD_SESSION_BREAKOUT_RULES.referenceEndBrokerHourExclusive - 1 ||
    last.getUTCMinutes() !== 45
  ) {
    return false;
  }

  return indices.every(
    (index, position) =>
      position === 0 ||
      candles[index].openTime - candles[indices[position - 1]].openTime ===
        M15_SECONDS,
  );
}

export function brokerDateKey(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
