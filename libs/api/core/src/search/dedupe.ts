import type { SearchResult, TrackResult, ProviderName } from "@moc/contracts";

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  // Use two rows to reduce memory
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min((prev[j] ?? 0) + 1, (curr[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n] ?? 0;
}

export const LEVENSHTEIN_THRESHOLD = 3;

function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .trim();
}

function isSameTrack(a: TrackResult, b: TrackResult): boolean {
  if (a.isrc && b.isrc) return a.isrc === b.isrc;
  const titleDist = levenshtein(normalizeForMatch(a.title), normalizeForMatch(b.title));
  const artistDist = levenshtein(normalizeForMatch(a.artist), normalizeForMatch(b.artist));
  return titleDist <= LEVENSHTEIN_THRESHOLD && artistDist <= LEVENSHTEIN_THRESHOLD;
}

function mergeSources(existing: ProviderName[], incoming: ProviderName[]): ProviderName[] {
  const set = new Set(existing);
  for (const s of incoming) set.add(s);
  return [...set];
}

export function dedupeAndMerge(results: SearchResult[]): SearchResult[] {
  const output: SearchResult[] = [];

  for (const result of results) {
    if (result.type === "station") {
      const alreadyPresent = output.some(
        (r) => r.type === "station" && r.providerId === result.providerId,
      );
      if (!alreadyPresent) output.push(result);
      continue;
    }

    let mergedInto = false;
    for (let i = 0; i < output.length; i++) {
      const existing = output[i];
      if (existing === undefined || existing.type !== "track") continue;
      if (isSameTrack(existing, result)) {
        output[i] = {
          ...existing,
          sources: mergeSources(existing.sources, result.sources),
          ...(existing.isrc === undefined && result.isrc !== undefined
            ? { isrc: result.isrc }
            : {}),
        };
        mergedInto = true;
        break;
      }
    }
    if (!mergedInto) output.push(result);
  }

  return output;
}
