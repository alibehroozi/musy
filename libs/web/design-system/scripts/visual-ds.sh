#!/bin/bash
# Layer 1 visual regression — Lost Pixel against Ladle stories.
# Starts Ladle on :61000, waits for it to be ready, runs lost-pixel,
# kills Ladle on exit.
#
# Usage from libs/web/design-system/:
#   ./scripts/visual-ds.sh           → compare against baselines
#   ./scripts/visual-ds.sh update    → regenerate baselines
#
# Run via npm: `npm --workspace libs/web/design-system run test:visual`
# or `... run test:visual:update`.

set -euo pipefail

cd "$(dirname "$0")/.."

# Start Ladle in the background.
npx ladle serve --port 61000 >/dev/null 2>&1 &
LADLE_PID=$!

# Always clean up Ladle on exit (success, failure, or interrupt).
cleanup() {
  if kill -0 "$LADLE_PID" 2>/dev/null; then
    kill "$LADLE_PID" 2>/dev/null || true
    wait "$LADLE_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# Wait up to 60s for Ladle to come up.
echo "Waiting for Ladle on :61000..."
for _ in $(seq 1 60); do
  if curl -s -f http://localhost:61000 >/dev/null 2>&1; then
    echo "Ladle ready."
    break
  fi
  sleep 1
done

if ! curl -s -f http://localhost:61000 >/dev/null 2>&1; then
  echo "❌ Ladle never became ready on :61000" >&2
  exit 1
fi

# Run Lost Pixel. `update` regenerates baselines; bare CLI compares.
if [ "${1:-}" = "update" ]; then
  echo "Regenerating baselines (Lost Pixel update mode)..."
  npx lost-pixel update
else
  echo "Comparing against baselines..."
  npx lost-pixel
fi
