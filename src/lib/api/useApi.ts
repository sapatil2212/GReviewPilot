"use client";

/**
 * Minimal fetcher hook — loads a promise on mount + on dep changes,
 * exposes { data, error, loading, refresh }.
 *
 * Deliberately kept lightweight so we don't pull in SWR / react-query
 * for what most pages need.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiClientError } from "@/lib/fetcher";

export interface UseApiResult<T> {
  data: T | null;
  error: ApiClientError | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setData: (updater: (prev: T | null) => T | null) => void;
}

export function useApi<T>(
  loader: () => Promise<T>,
  deps: unknown[] = [],
): UseApiResult<T> {
  const [data, setDataState] = useState<T | null>(null);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [loading, setLoading] = useState(true);
  const active = useRef(true);

  // Latest loader ref so refresh() always calls the freshest closure.
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loaderRef.current();
      if (active.current) setDataState(result);
    } catch (err) {
      if (active.current) {
        setError(
          err instanceof ApiClientError
            ? err
            : new ApiClientError(
                err instanceof Error ? err.message : String(err),
                "UNKNOWN_ERROR",
                0,
              ),
        );
      }
    } finally {
      if (active.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    active.current = true;
    void run();
    return () => {
      active.current = false;
    };
    // Consumer controls the dependency array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return {
    data,
    error,
    loading,
    refresh: run,
    setData: (updater) => setDataState((prev) => updater(prev)),
  };
}
