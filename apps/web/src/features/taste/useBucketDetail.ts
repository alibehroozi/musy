import { useEffect, useState } from "react";
import type { BucketDetailResponse } from "@moc/contracts";
import { fetchBucketDetail, HttpError } from "@moc/web-core";

export type BucketDetailState =
  | { status: "loading" }
  | { status: "ready"; data: BucketDetailResponse }
  | { status: "not-found" }
  | { status: "error" };

/**
 * Fetches `/api/me/taste/buckets/:bucketId` once on mount (and again
 * whenever the param changes). 404 maps to `not-found` so the page can
 * render a distinct "Bucket not found" message; any other failure (5xx,
 * network) maps to `error` with a retry surface (see UI-37's failure
 * branches).
 *
 * Polling is deliberately out of scope per the feature spec —
 * "out of scope: live re-poll on this page; the user can just go back".
 */
export function useBucketDetail(bucketId: string | undefined): {
  state: BucketDetailState;
  refresh: () => void;
} {
  const [state, setState] = useState<BucketDetailState>({ status: "loading" });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (typeof bucketId !== "string" || bucketId.length === 0) {
      setState({ status: "not-found" });
      return;
    }
    let mounted = true;
    setState({ status: "loading" });
    fetchBucketDetail(bucketId)
      .then((data) => {
        if (!mounted) return;
        setState({ status: "ready", data });
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        if (err instanceof HttpError && err.status === 404) {
          setState({ status: "not-found" });
        } else {
          setState({ status: "error" });
        }
      });
    return () => {
      mounted = false;
    };
  }, [bucketId, tick]);

  return {
    state,
    refresh: () => setTick((t) => t + 1),
  };
}
