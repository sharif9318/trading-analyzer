import { latestClosedFeature } from './alignment';
import { buildFeatures } from './indicators';
import {
  BacktestConfig,
  Candle,
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
      input.config,
    );
    if (!simulated) {
      index++;
      continue;
    }

    trades.push(simulated.trade);
    index = Math.max(index + 1, simulated.exitIndex);
  }

  return {
    symbol: input.symbol,
    splitTime,
    conclusion: conclusionFor(trades.filter((trade) => trade.entryTime >= splitTime)),
    all: summarizeTrades(trades, input.config.riskPerTradePercent),
    inSample: summarizeTrades(
      trades.filter((trade) => trade.entryTime < splitTime),
      input.config.riskPerTradePercent,
    ),
    outOfSample: summarizeTrades(
      trades.filter((trade) => trade.entryTime >= splitTime),
      input.config.riskPerTradePercent,
    ),
    trades,
  };
}

export function summarizeTrades(trades: Trade[], riskPerTradePercent: number) {
  const wins = trades.filter((trade) => trade.netR > 0);
  const losses = trades.filter((trade) => trade.netR <= 0);
  const grossProfit = wins.reduce((sum, trade) => sum + trade.netR, 0);
  const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.netR, 0));
  const averageNetR = trades.length
    ? trades.reduce((sum, trade) => sum + trade.netR, 0) / trades.length
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
): Direction | null {
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

  if (longRegime && longTrigger) return 'long';
  if (shortRegime && shortTrigger) return 'short';
  return null;
}

function simulateTrade(
  symbol: string,
  direction: Direction,
  m15: FeatureRow[],
  signalIndex: number,
  config: BacktestConfig,
): { trade: Trade; exitIndex: number } | null {
  const signal = m15[signalIndex];
  const entryIndex = signalIndex + 1;
  const entryBar = m15[entryIndex];
  if (!entryBar || signal.atr14 === null || signal.atr14 <= 0) return null;

  const entryPrice = entryBar.open;
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
  const roundTripCost = entryPrice * (config.costBps / 10000);
  const netR = grossR - roundTripCost / stopDistance;

  return {
    exitIndex,
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
      grossR: round(grossR),
      netR: round(netR),
    },
  };
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

function conclusionFor(outOfSampleTrades: Trade[]) {
  if (outOfSampleTrades.length < 30) return 'insufficient-out-of-sample-trades';
  const expectancy =
    outOfSampleTrades.reduce((sum, trade) => sum + trade.netR, 0) /
    outOfSampleTrades.length;
  return expectancy > 0 ? 'promising-not-validated' : 'baseline-failed';
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
