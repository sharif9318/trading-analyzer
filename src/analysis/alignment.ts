import { FeatureRow } from './types';

export function latestClosedFeature(
  rows: FeatureRow[],
  decisionTime: number,
  timeframeSeconds: number,
): FeatureRow | null {
  let low = 0;
  let high = rows.length - 1;
  let match = -1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (rows[middle].openTime + timeframeSeconds <= decisionTime) {
      match = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return match === -1 ? null : rows[match];
}
