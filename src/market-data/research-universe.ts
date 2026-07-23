export type ResearchAssetClass = 'fx' | 'commodity' | 'equity-index';

export interface FrozenResearchInstrument {
  symbol: string;
  assetClass: ResearchAssetClass;
}

// Phase 5.8B preregistration: changing this list creates a new experiment.
export const FROZEN_RESEARCH_UNIVERSE: readonly FrozenResearchInstrument[] = [
  { symbol: 'EURUSD#', assetClass: 'fx' },
  { symbol: 'GBPUSD#', assetClass: 'fx' },
  { symbol: 'USDJPY#', assetClass: 'fx' },
  { symbol: 'USDCHF#', assetClass: 'fx' },
  { symbol: 'USDCAD#', assetClass: 'fx' },
  { symbol: 'AUDUSD#', assetClass: 'fx' },
  { symbol: 'NZDUSD#', assetClass: 'fx' },
  { symbol: 'EURJPY#', assetClass: 'fx' },
  { symbol: 'GBPJPY#', assetClass: 'fx' },
  { symbol: 'EURGBP#', assetClass: 'fx' },
  { symbol: 'AUDJPY#', assetClass: 'fx' },
  { symbol: 'EURAUD#', assetClass: 'fx' },
  { symbol: 'GOLD#', assetClass: 'commodity' },
  { symbol: 'SILVER#', assetClass: 'commodity' },
  { symbol: 'OILCash#', assetClass: 'commodity' },
  { symbol: 'NGASCash#', assetClass: 'commodity' },
  { symbol: 'BRENTCash#', assetClass: 'commodity' },
  { symbol: 'US500Cash#', assetClass: 'equity-index' },
  { symbol: 'US100Cash#', assetClass: 'equity-index' },
  { symbol: 'US30Cash#', assetClass: 'equity-index' },
  { symbol: 'UK100Cash#', assetClass: 'equity-index' },
  { symbol: 'GER40Cash#', assetClass: 'equity-index' },
  { symbol: 'EU50Cash#', assetClass: 'equity-index' },
  { symbol: 'JP225Cash#', assetClass: 'equity-index' },
  { symbol: 'AUS200Cash#', assetClass: 'equity-index' },
  { symbol: 'FRA40Cash#', assetClass: 'equity-index' },
  { symbol: 'HK50Cash#', assetClass: 'equity-index' },
] as const;

export const RESEARCH_HISTORY_START = 1_577_836_800; // 2020-01-01 UTC
export const RESEARCH_REQUIRED_TIMEFRAMES = [
  { timeframe: 'PERIOD_M15', minimumBars: 20_000 },
  { timeframe: 'PERIOD_H1', minimumBars: 6_000 },
  { timeframe: 'PERIOD_D1', minimumBars: 1_000 },
] as const;
export const MINIMUM_SPREAD_COVERAGE_PERCENT = 95;
export const MAXIMUM_MARGIN_SHARE_PERCENT = 50;
export const MAXIMUM_ONE_PERCENT_MOVE_RISK_PERCENT = 5;

export interface MinimumTradeFeasibilityInput {
  accountBalance: number;
  minimumMarginBuy: number | null;
  minimumMarginSell: number | null;
  minimumOnePercentLossBuy: number | null;
  minimumOnePercentLossSell: number | null;
}

export function assessMinimumTradeFeasibility(
  input: MinimumTradeFeasibilityInput,
) {
  const margins = [input.minimumMarginBuy, input.minimumMarginSell];
  const losses = [
    input.minimumOnePercentLossBuy,
    input.minimumOnePercentLossSell,
  ];
  const hasMarginEvidence = margins.every(
    (value): value is number => value !== null && value > 0,
  );
  const hasRiskEvidence = losses.every(
    (value): value is number => value !== null && value >= 0,
  );
  const maximumMinimumMargin = hasMarginEvidence ? Math.max(...margins) : null;
  const maximumOnePercentLoss = hasRiskEvidence ? Math.max(...losses) : null;
  const marginSharePercent =
    maximumMinimumMargin === null
      ? null
      : (maximumMinimumMargin / input.accountBalance) * 100;
  const onePercentMoveRiskPercent =
    maximumOnePercentLoss === null
      ? null
      : (maximumOnePercentLoss / input.accountBalance) * 100;

  return {
    hasMarginEvidence,
    hasRiskEvidence,
    maximumMinimumMargin: round4(maximumMinimumMargin),
    maximumOnePercentLoss: round4(maximumOnePercentLoss),
    marginSharePercent: round4(marginSharePercent),
    onePercentMoveRiskPercent: round4(onePercentMoveRiskPercent),
    marginAffordable:
      marginSharePercent !== null &&
      marginSharePercent <= MAXIMUM_MARGIN_SHARE_PERCENT,
    sizingGranularityAcceptable:
      onePercentMoveRiskPercent !== null &&
      onePercentMoveRiskPercent <= MAXIMUM_ONE_PERCENT_MOVE_RISK_PERCENT,
    executableAtMinimumVolume:
      marginSharePercent !== null &&
      onePercentMoveRiskPercent !== null &&
      marginSharePercent <= MAXIMUM_MARGIN_SHARE_PERCENT &&
      onePercentMoveRiskPercent <= MAXIMUM_ONE_PERCENT_MOVE_RISK_PERCENT,
  };
}

export function spreadCoveragePercent(
  candleCount: number,
  spreadCount: number,
): number {
  if (candleCount <= 0) return 0;
  return round4(Math.min(100, (spreadCount / candleCount) * 100)) ?? 0;
}

function round4(value: number | null): number | null {
  return value === null ? null : Math.round(value * 10_000) / 10_000;
}
