export interface SpreadObservation {
  symbol: string;
  bid: number;
  ask: number;
  observedAt: number;
}

export function spreadBps(bid: number, ask: number): number {
  const midpoint = (bid + ask) / 2;
  return midpoint > 0 && ask >= bid ? ((ask - bid) / midpoint) * 10000 : Number.NaN;
}

export function summarizeSpreadObservations(
  observations: SpreadObservation[],
  minimumSamples: number,
) {
  const valid = observations
    .map((observation) => ({
      observedAt: observation.observedAt,
      value: spreadBps(observation.bid, observation.ask),
    }))
    .filter((observation) => Number.isFinite(observation.value));
  const values = valid
    .map((observation) => observation.value)
    .sort((a, b) => a - b);

  return {
    samples: values.length,
    status: values.length >= minimumSamples ? 'ready' : 'collecting',
    minimumSamples,
    medianBps: percentile(values, 0.5),
    p75Bps: percentile(values, 0.75),
    p95Bps: percentile(values, 0.95),
    oldestObservedAt: valid.length
      ? Math.min(...valid.map((observation) => observation.observedAt))
      : null,
    newestObservedAt: valid.length
      ? Math.max(...valid.map((observation) => observation.observedAt))
      : null,
  };
}

function percentile(sorted: number[], probability: number): number | null {
  if (sorted.length === 0) return null;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * probability) - 1),
  );
  return Math.round(sorted[index] * 10000) / 10000;
}
