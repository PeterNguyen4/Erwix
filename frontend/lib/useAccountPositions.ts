import { useCallback, useEffect, useState } from "react";
import { api, Account, Position } from "@/lib/api";

const POLL_MS = 25000;

export function useAccountPositions() {
  const [account, setAccount] = useState<Account | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [positionsLoading, setPositionsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api.account().then(setAccount).catch((e) => setError((e as Error).message));
    api
      .positions()
      .then(setPositions)
      .catch(() => {})
      .finally(() => setPositionsLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return { account, positions, positionsLoading, error, refresh };
}
