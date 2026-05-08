import { parseHTML } from "linkedom";

export interface SoundCloudTranscoding {
  url: string;
  format: { protocol: string; mime_type: string };
}

export interface SoundCloudSource {
  sourceTrackId: string;
  clientId: string;
  transcodings: SoundCloudTranscoding[];
}

export function extractSourceFromHtml(html: string): SoundCloudSource | null {
  if (!html) return null;

  try {
    const { document } = parseHTML(html);
    const scripts = document.querySelectorAll("script:not([src])");

    for (const script of scripts) {
      const text = script.textContent ?? "";

      // Look for the hydration data blob: window.__sc_hydration = [{hydratable:…},…]
      const hydrationMatch = /window\.__sc_hydration\s*=\s*(\[.+?\]);/s.exec(text);
      if (!hydrationMatch?.[1]) continue;

      let hydration: unknown;
      try {
        hydration = JSON.parse(hydrationMatch[1]);
      } catch {
        continue;
      }

      if (!Array.isArray(hydration)) continue;

      for (const entry of hydration) {
        const data = (entry as Record<string, unknown>)["data"];
        if (!data || typeof data !== "object") continue;
        const d = data as Record<string, unknown>;

        // Track data has a "media" key with transcodings
        const media = d["media"] as Record<string, unknown> | undefined;
        if (!media) continue;

        const transcodings = media["transcodings"];
        if (!Array.isArray(transcodings) || transcodings.length === 0) continue;

        const trackId = d["id"];
        if (typeof trackId !== "number" && typeof trackId !== "string") continue;

        const clientId = extractClientId(text);
        if (!clientId) continue;

        return {
          sourceTrackId: String(trackId),
          clientId,
          transcodings: transcodings as SoundCloudTranscoding[],
        };
      }
    }
  } catch {
    return null;
  }

  return null;
}

function extractClientId(scriptText: string): string | null {
  // client_id appears as a string literal, e.g. client_id:"abc123" or "client_id":"abc123"
  const match = /[,{]"?client_id"?\s*:\s*"([a-zA-Z0-9]+)"/.exec(scriptText);
  return match?.[1] ?? null;
}
