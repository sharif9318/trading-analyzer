export type CandidateAssetClass =
  | 'fx'
  | 'commodity'
  | 'equity-index'
  | 'crypto'
  | 'other';

export function inferCandidateAssetClass(
  path: string,
  description: string,
  currencyBase: string,
  currencyProfit: string,
): CandidateAssetClass {
  const searchable = `${path} ${description}`.toLowerCase();

  if (/crypto|bitcoin|ethereum|litecoin|ripple/.test(searchable)) {
    return 'crypto';
  }
  if (/index|indices|cash index|stock index/.test(searchable)) {
    return 'equity-index';
  }
  if (
    /metal|commodity|energy|oil|gas|gold|silver|copper|platinum|palladium/.test(
      searchable,
    )
  ) {
    return 'commodity';
  }
  if (
    /^[A-Z]{3}$/.test(currencyBase) &&
    /^[A-Z]{3}$/.test(currencyProfit) &&
    !/stock|share|equity/.test(searchable)
  ) {
    return 'fx';
  }
  return 'other';
}

export function midpointSpreadBps(
  bid: number | null,
  ask: number | null,
): number | null {
  if (bid === null || ask === null || bid <= 0 || ask < bid) return null;
  const midpoint = (bid + ask) / 2;
  return midpoint > 0 ? ((ask - bid) / midpoint) * 10_000 : null;
}
