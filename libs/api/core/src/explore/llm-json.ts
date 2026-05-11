/**
 * Locates the first balanced `{ … }` object in `text` and returns its
 * exact substring (including the outer braces), or `null` if none.
 *
 * Skips leading prose, markdown code fences, and any text outside the
 * object; tracks string state and escape sequences so braces inside
 * string values do not affect nesting depth. Pure — same input always
 * produces the same output, no I/O, no globals.
 *
 * Used by the LLM-response parsers (`parseColdStartResponse`,
 * `parseRerankResponse`) so they remain robust against wrapper drift —
 * particularly Haiku's tendency to wrap JSON output in ```json … ```
 * fences regardless of explicit "no code fences" instructions.
 */
export function firstJsonObjectIn(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}
