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
export type CostModel = 'fixed' | 'historical-spread';
export type CostSource =
  | 'fixed'
  | 'historical-spread'
  | 'live-spread'
  | 'fallback-p75';

export interface CostResolution {
  costBps: number;
  source: CostSource;
}

export interface BacktestConfig {
  costModel: CostModel;
  costBps: number;
  minimumSpreadMatchPercent: number;
  stopAtr: number;
  rewardRisk: number;
  maxHoldingBars: number;
  trainFraction: number;
  riskPerTradePercent: number;
}

export interface ConfirmationBacktestConfig extends BacktestConfig {
  confirmationBars: number;
  maximumEntryCostR: number;
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
  costBps: number;
  costSource: CostSource;
  costR: number;
  brokerHour: number;
  marketContext: {
    atrPercent: number;
    m15Rsi14: number;
    h1EmaSeparationPercent: number;
    h4EmaSeparationPercent: number;
  };
  sessionContext?: {
    brokerDate: string;
    referenceHigh: number;
    referenceLow: number;
    referenceMidpoint: number;
    referenceRangePercent: number;
    breakoutDistanceAtr: number;
  };
  grossR: number;
  netR: number;
  confirmationBars?: number;
  confirmationTime?: number;
}
