import { latestClosedFeature } from './alignment';
import { buildFeatures } from './indicators';
import {
  BacktestConfig,
  Candle,
  ConfirmationBacktestConfig,
  CostResolution,
  Direction,
  FeatureRow,
  Trade,
} from './types';

const M15_SECONDS = 15 * 60;
const H1_SECONDS = 60 * 60;
const H4_SECONDS = 4 * 60 * 60;

export interface BacktestInput {
  symbol: string;
  m15: Candle[];
  h1: Candle[];
  h4: Candle[];
  config: BacktestConfig;
  costResolver?: (entryTime: number) => CostResolution;
}

export interface ConfirmationBacktestInput
  extends Omit<BacktestInput, 'config'> {
  config: ConfirmationBacktestConfig;
}

interface SignalDecision {
  direction: Direction;
  atrPercent: number;
  m15Rsi14: number;
  h1EmaSeparationPercent: number;
  h4EmaSeparationPercent: number;
}

export function runTrendPullbackBacktest(input: BacktestInput) {
  const m15 = buildFeatures(input.m15);
  const h1 = buildFeatures(input.h1);
  const h4 = buildFeatures(input.h4);
  const trades: Trade[] = [];
  const splitIndex = Math.floor(m15.length * input.config.trainFraction);
  const splitTime = m15[splitIndex]?.openTime ?? 0;

  let index = 200;
  while (index < m15.length - 1) {
    const signal = detectSignal(m15, h1, h4, index);
    if (!signal) {
      index++;
      continue;
    }

    const simulated = simulateTrade(
      input.symbol,
      signal,
      m15,
      index,
      index + 1,
      input.config,
      input.costResolver,
    );
    if (!simulated) {
      index++;
      continue;
    }

    trades.push(simulated.trade);
    index = Math.max(index + 1, simulated.exitIndex);
  }

  const inSampleTrades = trades.filter((trade) => trade.entryTime < splitTime);
  const outOfSampleTrades = trades.filter((trade) => trade.entryTime >= splitTime);
  const chronologicalFolds = buildChronologicalFolds(
    trades,
    m15,
    input.config.riskPerTradePercent,
  );
  const profitableFolds = chronologicalFolds.filter(
    (fold) => fold.metrics.averageNetR > 0 && (fold.metrics.profitFactor ?? 0) > 1,
  ).length;
  const costCoverage = summarizeCostCoverage(
    trades,
    input.config.costModel,
    input.config.minimumSpreadMatchPercent,
  );
  const statisticalConclusion = classifyConclusion(
    inSampleTrades,
    outOfSampleTrades,
    profitableFolds,
    chronologicalFolds.length,
  );

  return {
    symbol: input.symbol,
    splitTime,
    conclusion:
      costCoverage.status === 'insufficient'
        ? 'insufficient-spread-coverage'
        : statisticalConclusion,
    statisticalConclusion,
    costCoverage,
    profitableFolds,
    chronologicalFolds,
    all: summarizeTrades(trades, input.config.riskPerTradePercent),
    inSample: summarizeTrades(inSampleTrades, input.config.riskPerTradePercent),
    outOfSample: summarizeTrades(outOfSampleTrades, input.config.riskPerTradePercent),
    diagnostics: buildDiagnostics(trades, input.config.riskPerTradePercent),
    trades,
  };
}

export function runTrendPullbackConfirmationBacktest(
  input: ConfirmationBacktestInput,
) {
  const m15 = buildFeatures(input.m15);
  const h1 = buildFeatures(input.h1);
  const h4 = buildFeatures(input.h4);
  const trades: Trade[] = [];
  const confirmationDelays: number[] = [];
  const splitIndex = Math.floor(m15.length * input.config.trainFraction);
  const splitTime = m15[splitIndex]?.openTime ?? 0;
  let setups = 0;
  let confirmedSetups = 0;
  let expiredSetups = 0;
  let costRejectedSetups = 0;

  let index = 200;
  while (index < m15.length - 1) {
    const signal = detectSignal(m15, h1, h4, index);
    if (!signal) {
      index++;
      continue;
    }

    setups++;
    const confirmationIndex = findConfirmationIndex(
      signal.direction,
      m15,
      index,
      input.config.confirmationBars,
    );
    if (confirmationIndex === null) {
      expiredSetups++;
      index += input.config.confirmationBars + 1;
      continue;
    }

    confirmedSetups++;
    const confirmationBars = confirmationIndex - index;
    confirmationDelays.push(confirmationBars);
    const entryIndex = confirmationIndex + 1;
    const simulated = simulateTrade(
      input.symbol,
      signal,
      m15,
      index,
      entryIndex,
      input.config,
      input.costResolver,
    );
    if (!simulated) {
      index = entryIndex;
      continue;
    }
    if (!passesEntryCostGate(simulated.rawCostR, input.config.maximumEntryCostR)) {
      costRejectedSetups++;
      index = entryIndex;
      continue;
    }

    trades.push({
      ...simulated.trade,
      confirmationBars,
      confirmationTime: m15[confirmationIndex].openTime,
    });
    index = Math.max(entryIndex, simulated.exitIndex);
  }

  const inSampleTrades = trades.filter((trade) => trade.entryTime < splitTime);
  const outOfSampleTrades = trades.filter((trade) => trade.entryTime >= splitTime);
  const chronologicalFolds = buildChronologicalFolds(
    trades,
    m15,
    input.config.riskPerTradePercent,
  );
  const profitableFolds = chronologicalFolds.filter(
    (fold) => fold.metrics.averageNetR > 0 && (fold.metrics.profitFactor ?? 0) > 1,
  ).length;
  const costCoverage = summarizeCostCoverage(
    trades,
    input.config.costModel,
    input.config.minimumSpreadMatchPercent,
  );
  const statisticalConclusion = classifyConclusion(
    inSampleTrades,
    outOfSampleTrades,
    profitableFolds,
    chronologicalFolds.length,
  );

  return {
    symbol: input.symbol,
    splitTime,
    conclusion:
      costCoverage.status === 'insufficient'
        ? 'insufficient-spread-coverage'
        : statisticalConclusion,
    statisticalConclusion,
    costCoverage,
    setupDiagnostics: {
      setups,
      confirmedSetups,
      expiredSetups,
      costRejectedSetups,
      enteredTrades: trades.length,
      confirmationRatePercent: round(
        setups ? (confirmedSetups / setups) * 100 : 0,
      ),
      averageConfirmationBars: round(
        confirmationDelays.length
          ? confirmationDelays.reduce((sum, delay) => sum + delay, 0) /
              confirmationDelays.length
          : 0,
      ),
    },
    profitableFolds,
    chronologicalFolds,
    all: summarizeTrades(trades, input.config.riskPerTradePercent),
    inSample: summarizeTrades(inSampleTrades, input.config.riskPerTradePercent),
    outOfSample: summarizeTrades(outOfSampleTrades, input.config.riskPerTradePercent),
    diagnostics: buildDiagnostics(trades, input.config.riskPerTradePercent),
    trades,
  };
}

export function findConfirmationIndex(
  direction: Direction,
  candles: Candle[],
  setupIndex: number,
  maximumBars: number,
): number | null {
  const setup = candles[setupIndex];
  if (!setup || maximumBars < 1) return null;
  const finalIndex = Math.min(
    candles.length - 2,
    setupIndex + maximumBars,
  );

  for (let index = setupIndex + 1; index <= finalIndex; index++) {
    if (direction === 'long' && candles[index].high > setup.high) return index;
    if (direction === 'short' && candles[index].low < setup.low) return index;
  }

  return null;
}

export function passesEntryCostGate(
  costR: number,
  maximumEntryCostR: number,
): boolean {
  return (
    Number.isFinite(costR) &&
    costR >= 0 &&
    maximumEntryCostR >= 0 &&
    costR <= maximumEntryCostR
  );
}

export function summarizeTrades(trades: Trade[], riskPerTradePercent: number) {
  const wins = trades.filter((trade) => trade.netR > 0);
  const losses = trades.filter((trade) => trade.netR <= 0);
  const grossProfit = wins.reduce((sum, trade) => sum + trade.netR, 0);
  const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.netR, 0));
  const averageNetR = trades.length
    ? trades.reduce((sum, trade) => sum + trade.netR, 0) / trades.length
    : 0;
  const averageGrossR = trades.length
    ? trades.reduce((sum, trade) => sum + trade.grossR, 0) / trades.length
    : 0;
  const averageCostR = trades.length
    ? trades.reduce((sum, trade) => sum + trade.costR, 0) / trades.length
    : 0;

  let equity = 1;
  let peak = 1;
  let maxDrawdown = 0;
  const riskFraction = riskPerTradePercent / 100;
  for (const trade of trades) {
    equity *= Math.max(0.000001, 1 + trade.netR * riskFraction);
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, (peak - equity) / peak);
  }

  return {
    trades: trades.length,
    longTrades: trades.filter((trade) => trade.direction === 'long').length,
    shortTrades: trades.filter((trade) => trade.direction === 'short').length,
    wins: wins.length,
    losses: losses.length,
    winRatePercent: round(trades.length ? (wins.length / trades.length) * 100 : 0),
    averageGrossR: round(averageGrossR),
    averageCostR: round(averageCostR),
    averageNetR: round(averageNetR),
    profitFactor: grossLoss === 0 ? null : round(grossProfit / grossLoss),
    totalReturnPercent: round((equity - 1) * 100),
    maxDrawdownPercent: round(maxDrawdown * 100),
    averageHoldingBars: round(
      trades.length
        ? trades.reduce((sum, trade) => sum + trade.holdingBars, 0) / trades.length
        : 0,
    ),
  };
}

export function resolveBarExit(
  direction: Direction,
  bar: Candle,
  stopPrice: number,
  targetPrice: number,
): { price: number; reason: 'stop' | 'target' } | null {
  if (direction === 'long') {
    if (bar.open <= stopPrice) return { price: bar.open, reason: 'stop' };
    if (bar.open >= targetPrice) return { price: bar.open, reason: 'target' };
    if (bar.low <= stopPrice) return { price: stopPrice, reason: 'stop' };
    if (bar.high >= targetPrice) return { price: targetPrice, reason: 'target' };
  } else {
    if (bar.open >= stopPrice) return { price: bar.open, reason: 'stop' };
    if (bar.open <= targetPrice) return { price: bar.open, reason: 'target' };
    if (bar.high >= stopPrice) return { price: stopPrice, reason: 'stop' };
    if (bar.low <= targetPrice) return { price: targetPrice, reason: 'target' };
  }

  return null;
}

function detectSignal(
  m15: FeatureRow[],
  h1: FeatureRow[],
  h4: FeatureRow[],
  index: number,
): SignalDecision | null {
  const current = m15[index];
  const decisionTime = current.openTime + M15_SECONDS;
  const h1Row = latestClosedFeature(h1, decisionTime, H1_SECONDS);
  const h4Row = latestClosedFeature(h4, decisionTime, H4_SECONDS);

  if (!hasEntryFeatures(current) || !hasTrendFeatures(h1Row) || !hasTrendFeatures(h4Row)) {
    return null;
  }

  const longRegime =
    h4Row.close > h4Row.ema50 &&
    h4Row.ema50 > h4Row.ema200 &&
    h1Row.close > h1Row.ema50 &&
    h1Row.ema20 > h1Row.ema50;
  const shortRegime =
    h4Row.close < h4Row.ema50 &&
    h4Row.ema50 < h4Row.ema200 &&
    h1Row.close < h1Row.ema50 &&
    h1Row.ema20 < h1Row.ema50;
  const longTrigger =
    current.low <= current.ema20 &&
    current.close > current.ema20 &&
    current.close > current.open &&
    current.rsi14 >= 45 &&
    current.rsi14 <= 70;
  const shortTrigger =
    current.high >= current.ema20 &&
    current.close < current.ema20 &&
    current.close < current.open &&
    current.rsi14 >= 30 &&
    current.rsi14 <= 55;

  const direction = longRegime && longTrigger
    ? 'long'
    : shortRegime && shortTrigger
      ? 'short'
      : null;
  if (!direction) return null;

  return {
    direction,
    atrPercent: (current.atr14 / current.close) * 100,
    m15Rsi14: current.rsi14,
    h1EmaSeparationPercent:
      (Math.abs(h1Row.ema20 - h1Row.ema50) / h1Row.close) * 100,
    h4EmaSeparationPercent:
      (Math.abs(h4Row.ema50 - h4Row.ema200) / h4Row.close) * 100,
  };
}

function simulateTrade(
  symbol: string,
  decision: SignalDecision,
  m15: FeatureRow[],
  signalIndex: number,
  entryIndex: number,
  config: BacktestConfig,
  costResolver?: (entryTime: number) => CostResolution,
): { trade: Trade; exitIndex: number; rawCostR: number } | null {
  const signal = m15[signalIndex];
  const entryBar = m15[entryIndex];
  if (!entryBar || signal.atr14 === null || signal.atr14 <= 0) return null;

  const entryPrice = entryBar.open;
  const direction = decision.direction;
  const stopDistance = signal.atr14 * config.stopAtr;
  const stopPrice =
    direction === 'long' ? entryPrice - stopDistance : entryPrice + stopDistance;
  const targetPrice =
    direction === 'long'
      ? entryPrice + stopDistance * config.rewardRisk
      : entryPrice - stopDistance * config.rewardRisk;
  const finalIndex = Math.min(
    m15.length - 1,
    entryIndex + config.maxHoldingBars - 1,
  );

  let exitIndex = finalIndex;
  let exitPrice = m15[finalIndex].close;
  let exitReason: Trade['exitReason'] =
    finalIndex === m15.length - 1 ? 'end-of-data' : 'timeout';

  for (let index = entryIndex; index <= finalIndex; index++) {
    const resolved = resolveBarExit(direction, m15[index], stopPrice, targetPrice);
    if (resolved) {
      exitIndex = index;
      exitPrice = resolved.price;
      exitReason = resolved.reason;
      break;
    }
  }

  const directionMultiplier = direction === 'long' ? 1 : -1;
  const grossR = (directionMultiplier * (exitPrice - entryPrice)) / stopDistance;
  const cost = costResolver?.(entryBar.openTime) ?? {
    costBps: config.costBps,
    source: 'fixed' as const,
  };
  const costR = transactionCostR(entryPrice, cost.costBps, stopDistance);
  const netR = grossR - costR;

  return {
    exitIndex,
    rawCostR: costR,
    trade: {
      symbol,
      direction,
      signalTime: signal.openTime,
      entryTime: entryBar.openTime,
      exitTime: m15[exitIndex].openTime,
      entryPrice,
      exitPrice,
      stopPrice,
      targetPrice,
      holdingBars: exitIndex - entryIndex + 1,
      exitReason,
      costBps: round(cost.costBps),
      costSource: cost.source,
      costR: round(costR),
      brokerHour: brokerHour(entryBar.openTime),
      marketContext: {
        atrPercent: round(decision.atrPercent),
        m15Rsi14: round(decision.m15Rsi14),
        h1EmaSeparationPercent: round(decision.h1EmaSeparationPercent),
        h4EmaSeparationPercent: round(decision.h4EmaSeparationPercent),
      },
      grossR: round(grossR),
      netR: round(netR),
    },
  };
}

export function transactionCostR(
  entryPrice: number,
  costBps: number,
  stopDistance: number,
): number {
  if (entryPrice <= 0 || costBps < 0 || stopDistance <= 0) return Number.NaN;
  return (entryPrice * (costBps / 10000)) / stopDistance;
}

export function brokerHour(timestamp: number): number {
  return new Date(timestamp * 1000).getUTCHours();
}

export function summarizeCostCoverage(
  trades: Trade[],
  costModel: BacktestConfig['costModel'],
  minimumMatchPercent: number,
) {
  const matched = trades.filter(
    (trade) =>
      trade.costSource === 'historical-spread' ||
      trade.costSource === 'live-spread',
  ).length;
  const fallback = trades.filter(
    (trade) => trade.costSource === 'fallback-p75',
  ).length;
  const fixed = trades.filter((trade) => trade.costSource === 'fixed').length;
  const matchPercent = trades.length ? (matched / trades.length) * 100 : 0;

  return {
    costModel,
    trades: trades.length,
    matched,
    fallback,
    fixed,
    matchPercent: round(matchPercent),
    minimumMatchPercent,
    status:
      costModel === 'fixed'
        ? 'not-applicable'
        : trades.length === 0
          ? 'no-trades'
        : matchPercent >= minimumMatchPercent
          ? 'sufficient'
          : 'insufficient',
  };
}

function buildDiagnostics(trades: Trade[], riskPerTradePercent: number) {
  const winningTrades = trades.filter((trade) => trade.netR > 0);
  const losingTrades = trades.filter((trade) => trade.netR <= 0);
  const hours = [...new Set(trades.map((trade) => trade.brokerHour))].sort(
    (left, right) => left - right,
  );

  return {
    byDirection: {
      long: summarizeTrades(
        trades.filter((trade) => trade.direction === 'long'),
        riskPerTradePercent,
      ),
      short: summarizeTrades(
        trades.filter((trade) => trade.direction === 'short'),
        riskPerTradePercent,
      ),
    },
    byBrokerHour: hours.map((hour) => ({
      brokerHour: hour,
      metrics: summarizeTrades(
        trades.filter((trade) => trade.brokerHour === hour),
        riskPerTradePercent,
      ),
    })),
    spreadCostBps: {
      all: summarizeNumbers(trades.map((trade) => trade.costBps)),
      winners: summarizeNumbers(winningTrades.map((trade) => trade.costBps)),
      losses: summarizeNumbers(losingTrades.map((trade) => trade.costBps)),
    },
    marketContext: {
      all: summarizeMarketContext(trades),
      winners: summarizeMarketContext(winningTrades),
      losses: summarizeMarketContext(losingTrades),
    },
  };
}

function summarizeNumbers(values: number[]) {
  if (!values.length) {
    return {
      samples: 0,
      average: null,
      minimum: null,
      median: null,
      p75: null,
      p95: null,
      maximum: null,
    };
  }

  const sorted = [...values].sort((left, right) => left - right);
  const average = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;

  return {
    samples: sorted.length,
    average: round(average),
    minimum: round(sorted[0]),
    median: round(percentile(sorted, 0.5)),
    p75: round(percentile(sorted, 0.75)),
    p95: round(percentile(sorted, 0.95)),
    maximum: round(sorted[sorted.length - 1]),
  };
}

function summarizeMarketContext(trades: Trade[]) {
  if (!trades.length) {
    return {
      trades: 0,
      averageAtrPercent: null,
      averageM15Rsi14: null,
      averageH1EmaSeparationPercent: null,
      averageH4EmaSeparationPercent: null,
    };
  }

  const average = (selector: (trade: Trade) => number) =>
    trades.reduce((sum, trade) => sum + selector(trade), 0) / trades.length;

  return {
    trades: trades.length,
    averageAtrPercent: round(average((trade) => trade.marketContext.atrPercent)),
    averageM15Rsi14: round(average((trade) => trade.marketContext.m15Rsi14)),
    averageH1EmaSeparationPercent: round(
      average((trade) => trade.marketContext.h1EmaSeparationPercent),
    ),
    averageH4EmaSeparationPercent: round(
      average((trade) => trade.marketContext.h4EmaSeparationPercent),
    ),
  };
}

function percentile(sortedValues: number[], percentileRank: number): number {
  const index = Math.max(
    0,
    Math.min(
      sortedValues.length - 1,
      Math.ceil(percentileRank * sortedValues.length) - 1,
    ),
  );
  return sortedValues[index];
}

function hasEntryFeatures(row: FeatureRow): row is FeatureRow & {
  ema20: number;
  rsi14: number;
  atr14: number;
} {
  return row.ema20 !== null && row.rsi14 !== null && row.atr14 !== null;
}

function hasTrendFeatures(row: FeatureRow | null): row is FeatureRow & {
  ema20: number;
  ema50: number;
  ema200: number;
} {
  return row !== null && row.ema20 !== null && row.ema50 !== null && row.ema200 !== null;
}

export function classifyConclusion(
  inSampleTrades: Trade[],
  outOfSampleTrades: Trade[],
  profitableFolds: number,
  totalFolds: number,
) {
  if (outOfSampleTrades.length < 30) return 'insufficient-out-of-sample-trades';
  const inSampleExpectancy = inSampleTrades.length
    ? inSampleTrades.reduce((sum, trade) => sum + trade.netR, 0) /
      inSampleTrades.length
    : 0;
  const outOfSampleExpectancy =
    outOfSampleTrades.reduce((sum, trade) => sum + trade.netR, 0) /
    outOfSampleTrades.length;

  if (outOfSampleExpectancy <= 0) return 'baseline-failed';
  if (
    inSampleExpectancy <= 0 ||
    profitableFolds < Math.ceil(totalFolds * 0.6)
  ) {
    return 'unstable-regime-dependent';
  }
  return 'promising-not-validated';
}

export function buildChronologicalFolds(
  trades: Trade[],
  m15: FeatureRow[],
  riskPerTradePercent: number,
) {
  const foldCount = 5;
  return Array.from({ length: foldCount }, (_, index) => {
    const startIndex = Math.floor((m15.length * index) / foldCount);
    const endIndex = Math.floor((m15.length * (index + 1)) / foldCount);
    const startTime = m15[startIndex]?.openTime ?? 0;
    const endTime =
      index === foldCount - 1
        ? Number.POSITIVE_INFINITY
        : (m15[endIndex]?.openTime ?? Number.POSITIVE_INFINITY);
    const foldTrades = trades.filter(
      (trade) => trade.entryTime >= startTime && trade.entryTime < endTime,
    );

    return {
      fold: index + 1,
      startTime,
      endTime: Number.isFinite(endTime) ? endTime : null,
      metrics: summarizeTrades(foldTrades, riskPerTradePercent),
    };
  });
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
