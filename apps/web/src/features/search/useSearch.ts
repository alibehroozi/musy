import { useState, useCallback } from "react";
import type { SearchResponse } from "@moc/contracts";
import { searchTracks } from "./api.js";

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: SearchResponse }
  | { status: "error"; error: Error };

export interface UseSearchResult {
  query: string;
  setQuery: (q: string) => void;
  state: SearchState;
  submit: () => void;
  submitWithQuery: (q: string) => void;
  retry: () => void;
  clear: () => void;
}

export function useSearch(): UseSearchResult {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>({ status: "idle" });

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setState({ status: "loading" });
    try {
      const data = await searchTracks(q);
      setState({ status: "success", data });
    } catch (err) {
      setState({ status: "error", error: err instanceof Error ? err : new Error(String(err)) });
    }
  }, []);

  const submit = useCallback(() => {
    runSearch(query);
  }, [query, runSearch]);

  const submitWithQuery = useCallback(
    (q: string) => {
      setQuery(q);
      runSearch(q);
    },
    [runSearch],
  );

  const retry = useCallback(() => {
    runSearch(query);
  }, [query, runSearch]);

  const clear = useCallback(() => {
    setQuery("");
    setState({ status: "idle" });
  }, []);

  const handleSetQuery = useCallback((q: string) => {
    setQuery(q);
    if (!q) setState({ status: "idle" });
  }, []);

  return { query, setQuery: handleSetQuery, state, submit, submitWithQuery, retry, clear };
}
