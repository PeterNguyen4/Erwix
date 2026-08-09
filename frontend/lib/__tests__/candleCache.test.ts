import { beforeEach, describe, expect, it, vi } from "vitest";

// candleCache keeps its Map at module scope, so reset it between tests via a fresh import.
async function freshCache() {
  vi.resetModules();
  return import("@/lib/candleCache");
}

describe("candleCache", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns null for a symbol/timeframe never cached", async () => {
    const { getCached } = await freshCache();
    expect(getCached("AAPL", "1Day")).toBeNull();
  });

  it("returns what was cached for the same symbol+timeframe", async () => {
    const { getCached, setCached } = await freshCache();
    const candles = [{ time: 1, open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 }];
    setCached("AAPL", "1Day", candles);
    expect(getCached("AAPL", "1Day")).toEqual(candles);
  });

  it("keeps different timeframes for the same symbol independent", async () => {
    const { getCached, setCached } = await freshCache();
    const daily = [{ time: 1, open: 1, high: 1, low: 1, close: 1, volume: 1 }];
    const weekly = [{ time: 2, open: 2, high: 2, low: 2, close: 2, volume: 2 }];
    setCached("AAPL", "1Day", daily);
    setCached("AAPL", "1Week", weekly);
    expect(getCached("AAPL", "1Day")).toEqual(daily);
    expect(getCached("AAPL", "1Week")).toEqual(weekly);
  });

  it("keeps different symbols independent", async () => {
    const { getCached, setCached } = await freshCache();
    setCached("AAPL", "1Day", [{ time: 1, open: 1, high: 1, low: 1, close: 1, volume: 1 }]);
    expect(getCached("MSFT", "1Day")).toBeNull();
  });

  it("overwrites a previous cache entry for the same key", async () => {
    const { getCached, setCached } = await freshCache();
    setCached("AAPL", "1Day", [{ time: 1, open: 1, high: 1, low: 1, close: 1, volume: 1 }]);
    setCached("AAPL", "1Day", [{ time: 2, open: 2, high: 2, low: 2, close: 2, volume: 2 }]);
    expect(getCached("AAPL", "1Day")).toEqual([{ time: 2, open: 2, high: 2, low: 2, close: 2, volume: 2 }]);
  });
});
