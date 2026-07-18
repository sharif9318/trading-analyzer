const WEEK_SECONDS = 7 * 24 * 60 * 60;

const TIMEFRAME_SECONDS: Record<string, number> = {
  PERIOD_M15: 15 * 60,
  PERIOD_H1: 60 * 60,
  PERIOD_H4: 4 * 60 * 60,
};

export interface QualityCandle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  tickVolume: number;
}

export function selectAnalysisWindow(
  candles: QualityCandle[],
  targetCandles: number,
  endOpenTime: number,
): QualityCandle[] {
  return [...candles]
    .filter((candle) => candle.openTime <= endOpenTime)
    .sort((a, b) => a.openTime - b.openTime)
    .slice(-targetCandles);
}

export interface DetectedGap {
  fromOpenTime: number;
  toOpenTime: number;
  missingCandles: number;
  classification:
    | 'unclassified'
    | 'shared-calendar-gap'
    | 'weekend-session-gap'
    | 'series-specific';
}

export interface SeriesQuality {
  timeframeSeconds: number | null;
  candleCount: number;
  targetCandles: number;
  oldestOpenTime: number | null;
  newestOpenTime: number | null;
  missingCandles: number;
  actionableMissingCandles: number;
  sharedCalendarGapCandles: number;
  invalidCandles: number;
  duplicateCandles: number;
  coveragePercent: number;
  continuityPercent: number;
  validityPercent: number;
  score: number;
  status: 'excellent' | 'acceptable' | 'investigate' | 'unsupported';
  sessionModel: {
    type: 'empirical-weekly-slots';
    activeSlots: number;
    minimumSlotOccurrences: number;
  };
  gaps: DetectedGap[];
  omittedGaps: number;
}

export function analyzeSeries(
  candles: QualityCandle[],
  timeframe: string,
  targetCandles: number,
): SeriesQuality {
  const step = TIMEFRAME_SECONDS[timeframe];
  const sorted = [...candles].sort((a, b) => a.openTime - b.openTime);
  const invalidCandles = sorted.filter(isInvalidCandle).length;

  if (!step) {
    return emptyOrUnsupportedResult(
      sorted,
      targetCandles,
      invalidCandles,
    );
  }

  const slotCounts = new Map<number, number>();
  for (const candle of sorted) {
    const slot = positiveModulo(candle.openTime, WEEK_SECONDS);
    slotCounts.set(slot, (slotCounts.get(slot) ?? 0) + 1);
  }

  const oldest = sorted.at(0)?.openTime ?? null;
  const newest = sorted.at(-1)?.openTime ?? null;
  const spannedWeeks =
    oldest === null || newest === null
      ? 1
      : Math.max(1, Math.ceil((newest - oldest + step) / WEEK_SECONDS));
  const minimumSlotOccurrences = Math.max(
    2,
    Math.min(8, Math.floor(spannedWeeks * 0.35)),
  );
  const activeSlots = new Set(
    [...slotCounts.entries()]
      .filter(([, count]) => count >= minimumSlotOccurrences)
      .map(([slot]) => slot),
  );

  const gaps: DetectedGap[] = [];
  let missingCandles = 0;

  for (let i = 1; i < sorted.length; i++) {
    const previous = sorted[i - 1].openTime;
    const current = sorted[i].openTime;
    let missingInGap = 0;

    for (let expected = previous + step; expected < current; expected += step) {
      if (activeSlots.has(positiveModulo(expected, WEEK_SECONDS))) {
        missingInGap++;
      }
    }

    if (missingInGap > 0) {
      missingCandles += missingInGap;
      gaps.push({
        fromOpenTime: previous,
        toOpenTime: current,
        missingCandles: missingInGap,
        classification: 'unclassified',
      });
    }
  }

  const coveragePercent = percentage(
    Math.min(sorted.length / targetCandles, 1),
  );
  const continuityPercent = percentage(
    sorted.length + missingCandles === 0
      ? 0
      : sorted.length / (sorted.length + missingCandles),
  );
  const validityPercent = percentage(
    sorted.length === 0 ? 0 : 1 - invalidCandles / sorted.length,
  );
  const score = round(
    coveragePercent * 0.4 +
      continuityPercent * 0.4 +
      validityPercent * 0.2,
  );

  return {
    timeframeSeconds: step,
    candleCount: sorted.length,
    targetCandles,
    oldestOpenTime: oldest,
    newestOpenTime: newest,
    missingCandles,
    actionableMissingCandles: missingCandles,
    sharedCalendarGapCandles: 0,
    invalidCandles,
    duplicateCandles: 0,
    coveragePercent,
    continuityPercent,
    validityPercent,
    score,
    status: score >= 98 ? 'excellent' : score >= 95 ? 'acceptable' : 'investigate',
    sessionModel: {
      type: 'empirical-weekly-slots',
      activeSlots: activeSlots.size,
      minimumSlotOccurrences,
    },
    gaps,
    omittedGaps: 0,
  };
}

function emptyOrUnsupportedResult(
  sorted: QualityCandle[],
  targetCandles: number,
  invalidCandles: number,
): SeriesQuality {
  return {
    timeframeSeconds: null,
    candleCount: sorted.length,
    targetCandles,
    oldestOpenTime: sorted.at(0)?.openTime ?? null,
    newestOpenTime: sorted.at(-1)?.openTime ?? null,
    missingCandles: 0,
    actionableMissingCandles: 0,
    sharedCalendarGapCandles: 0,
    invalidCandles,
    duplicateCandles: 0,
    coveragePercent: percentage(Math.min(sorted.length / targetCandles, 1)),
    continuityPercent: 0,
    validityPercent: percentage(
      sorted.length === 0 ? 0 : 1 - invalidCandles / sorted.length,
    ),
    score: 0,
    status: 'unsupported',
    sessionModel: {
      type: 'empirical-weekly-slots',
      activeSlots: 0,
      minimumSlotOccurrences: 0,
    },
    gaps: [],
    omittedGaps: 0,
  };
}

export interface NamedSeriesQuality extends SeriesQuality {
  symbol: string;
  timeframe: string;
}

export function classifyCrossSymbolGaps(
  input: NamedSeriesQuality[],
): NamedSeriesQuality[] {
  const symbolsByTimeframe = new Map<string, Set<string>>();
  const symbolsByGap = new Map<string, Set<string>>();

  for (const series of input) {
    const timeframeSymbols = symbolsByTimeframe.get(series.timeframe) ?? new Set();
    timeframeSymbols.add(series.symbol);
    symbolsByTimeframe.set(series.timeframe, timeframeSymbols);

    for (const gap of series.gaps) {
      const key = gapKey(series.timeframe, gap);
      const gapSymbols = symbolsByGap.get(key) ?? new Set();
      gapSymbols.add(series.symbol);
      symbolsByGap.set(key, gapSymbols);
    }
  }

  return input.map((series) => {
    const requiredSymbols = symbolsByTimeframe.get(series.timeframe)?.size ?? 0;
    const classifiedGaps = series.gaps.map((gap) => {
      const observedSymbols = symbolsByGap.get(gapKey(series.timeframe, gap))?.size ?? 0;
      return {
        ...gap,
        classification: isWeekendBoundary(
          gap.fromOpenTime,
          gap.toOpenTime,
        )
          ? ('weekend-session-gap' as const)
          : requiredSymbols >= 2 && observedSymbols === requiredSymbols
            ? ('shared-calendar-gap' as const)
            : ('series-specific' as const),
      };
    });
    const actionableMissingCandles = classifiedGaps
      .filter((gap) => gap.classification === 'series-specific')
      .reduce((sum, gap) => sum + gap.missingCandles, 0);
    const sharedCalendarGapCandles = classifiedGaps
      .filter(
        (gap) =>
          gap.classification === 'shared-calendar-gap' ||
          gap.classification === 'weekend-session-gap',
      )
      .reduce((sum, gap) => sum + gap.missingCandles, 0);
    const continuityPercent = percentage(
      series.candleCount + actionableMissingCandles === 0
        ? 0
        : series.candleCount /
            (series.candleCount + actionableMissingCandles),
    );
    const score = round(
      series.coveragePercent * 0.4 +
        continuityPercent * 0.4 +
        series.validityPercent * 0.2,
    );

    return {
      ...series,
      actionableMissingCandles,
      sharedCalendarGapCandles,
      continuityPercent,
      score,
      status:
        series.status === 'unsupported'
          ? 'unsupported'
          : actionableMissingCandles > 0 || series.invalidCandles > 0
            ? 'investigate'
            : score >= 98
            ? 'excellent'
            : score >= 95
              ? 'acceptable'
              : 'investigate',
      gaps: classifiedGaps.slice(0, 20),
      omittedGaps: Math.max(0, classifiedGaps.length - 20),
    };
  });
}

export function isWeekendBoundary(
  fromOpenTime: number,
  toOpenTime: number,
): boolean {
  const from = new Date(fromOpenTime * 1000);
  const to = new Date(toOpenTime * 1000);
  const duration = toOpenTime - fromOpenTime;

  return (
    from.getUTCDay() === 5 &&
    (to.getUTCDay() === 0 || to.getUTCDay() === 1) &&
    duration > 24 * 60 * 60 &&
    duration <= 4 * 24 * 60 * 60
  );
}

function gapKey(timeframe: string, gap: DetectedGap): string {
  return `${timeframe}\u0000${gap.fromOpenTime}\u0000${gap.toOpenTime}\u0000${gap.missingCandles}`;
}

function isInvalidCandle(candle: QualityCandle): boolean {
  return (
    !Number.isFinite(candle.open) ||
    !Number.isFinite(candle.high) ||
    !Number.isFinite(candle.low) ||
    !Number.isFinite(candle.close) ||
    candle.open <= 0 ||
    candle.high <= 0 ||
    candle.low <= 0 ||
    candle.close <= 0 ||
    candle.high < Math.max(candle.open, candle.close) ||
    candle.low > Math.min(candle.open, candle.close) ||
    candle.high < candle.low ||
    candle.tickVolume < 0
  );
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function percentage(ratio: number): number {
  return round(ratio * 100);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
