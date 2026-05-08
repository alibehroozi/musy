import { useState, useEffect, useCallback } from "react";
import type { HistoryEntry } from "@moc/contracts";
import { useAuth } from "../../hooks/useAuth.js";
import { getSearchHistory } from "./api.js";

interface HistoryState {
  entries: HistoryEntry[];
  nextCursor: string | null;
  loadingMore: boolean;
  historyLoading: boolean;
}

export interface UseHistoryResult {
  entries: HistoryEntry[];
  hasMore: boolean;
  /** True while auth state is resolving or the first history page is fetching. */
  isLoading: boolean;
  loadMore: () => void;
  /** Re-fetch the first page (e.g. after a new search is submitted). */
  refresh: () => void;
}

export function useHistory(): UseHistoryResult {
  const { state: authState } = useAuth();
  const isAuthenticated = authState.status === "authenticated";
  const isAuthLoading = authState.status === "loading";

  const [historyState, setHistoryState] = useState<HistoryState>({
    entries: [],
    nextCursor: null,
    loadingMore: false,
    historyLoading: false,
  });

  const fetchFirst = useCallback(() => {
    if (!isAuthenticated) return;
    setHistoryState((prev) => ({ ...prev, historyLoading: true }));
    getSearchHistory()
      .then((data) => {
        setHistoryState({
          entries: data.entries,
          nextCursor: data.nextCursor,
          loadingMore: false,
          historyLoading: false,
        });
      })
      .catch(() => {
        // Network error or 401 — show no history
        setHistoryState((prev) => ({ ...prev, historyLoading: false }));
      });
  }, [isAuthenticated]);

  useEffect(() => {
    fetchFirst();
  }, [fetchFirst]);

  // loadMore only flips loadingMore=true; the actual fetch fires from
  // the effect below. Side-effects must NEVER live inside a setState
  // updater — React StrictMode double-invokes updaters, which would
  // double-fetch and append the same page twice.
  const loadMore = useCallback(() => {
    setHistoryState((prev) => {
      if (!prev.nextCursor || prev.loadingMore) return prev;
      return { ...prev, loadingMore: true };
    });
  }, []);

  useEffect(() => {
    if (!historyState.loadingMore || !historyState.nextCursor) return;
    const cursor = historyState.nextCursor;
    let cancelled = false;
    getSearchHistory(cursor)
      .then((data) => {
        if (cancelled) return;
        setHistoryState((s) => ({
          ...s,
          entries: [...s.entries, ...data.entries],
          nextCursor: data.nextCursor,
          loadingMore: false,
        }));
      })
      .catch(() => {
        if (cancelled) return;
        setHistoryState((s) => ({ ...s, loadingMore: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [historyState.loadingMore, historyState.nextCursor]);

  return {
    entries: historyState.entries,
    hasMore: historyState.nextCursor !== null,
    isLoading: isAuthLoading || historyState.historyLoading,
    loadMore,
    refresh: fetchFirst,
  };
}
