import { Candle, FeatureRow } from './types';

export function ema(values: number[], period: number): Array<number | null> {
  const result: Array<number | null> = Array(values.length).fill(null);
  if (values.length < period || period < 1) return result;

  const seed = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  result[period - 1] = seed;
  const multiplier = 2 / (period + 1);

  for (let i = period; i < values.length; i++) {
    result[i] = values[i] * multiplier + (result[i - 1] as number) * (1 - multiplier);
  }

  return result;
}

export function rsi(values: number[], period: number): Array<number | null> {
  const result: Array<number | null> = Array(values.length).fill(null);
  if (values.length <= period || period < 1) return result;

  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1];
    gains += Math.max(change, 0);
    losses += Math.max(-change, 0);
  }

  let averageGain = gains / period;
  let averageLoss = losses / period;
  result[period] = rsiFromAverages(averageGain, averageLoss);

  for (let i = period + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
    result[i] = rsiFromAverages(averageGain, averageLoss);
  }

  return result;
}

export function atr(candles: Candle[], period: number): Array<number | null> {
  const result: Array<number | null> = Array(candles.length).fill(null);
  if (candles.length < period || period < 1) return result;

  const trueRanges = candles.map((candle, index) => {
    if (index === 0) return candle.high - candle.low;
    const previousClose = candles[index - 1].close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose),
    );
  });

  let average = trueRanges.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  result[period - 1] = average;

  for (let i = period; i < candles.length; i++) {
    average = (average * (period - 1) + trueRanges[i]) / period;
    result[i] = average;
  }

  return result;
}

export function buildFeatures(candles: Candle[]): FeatureRow[] {
  const closes = candles.map((candle) => candle.close);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const ema200 = ema(closes, 200);
  const rsi14 = rsi(closes, 14);
  const atr14 = atr(candles, 14);

  return candles.map((candle, index) => ({
    ...candle,
    ema20: ema20[index],
    ema50: ema50[index],
    ema200: ema200[index],
    rsi14: rsi14[index],
    atr14: atr14[index],
  }));
}

function rsiFromAverages(averageGain: number, averageLoss: number): number {
  if (averageLoss === 0) return averageGain === 0 ? 50 : 100;
  if (averageGain === 0) return 0;
  const relativeStrength = averageGain / averageLoss;
  return 100 - 100 / (1 + relativeStrength);
}
