const cache = new Map<string, import("@/lib/api").Candle[]>();

export function getCached(symbol: string, timeframe: string) {
  return cache.get(`${symbol}:${timeframe}`) ?? null;
}

export function setCached(symbol: string, timeframe: string, candles: import("@/lib/api").Candle[]) {
  cache.set(`${symbol}:${timeframe}`, candles);
}
