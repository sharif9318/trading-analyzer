export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  tickVolume: number;
}

export interface FeatureRow extends Candle {
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  rsi14: number | null;
  atr14: number | null;
}

export type Direction = 'long' | 'short';

export interface BacktestConfig {
  costBps: number;
  stopAtr: number;
  rewardRisk: number;
  maxHoldingBars: number;
  trainFraction: number;
  riskPerTradePercent: number;
}

export interface Trade {
  symbol: string;
  direction: Direction;
  signalTime: number;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  stopPrice: number;
  targetPrice: number;
  holdingBars: number;
  exitReason: 'stop' | 'target' | 'timeout' | 'end-of-data';
  grossR: number;
  netR: number;
}
