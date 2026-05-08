import type { CustomProjectConfig } from "lost-pixel";

// Lost Pixel — Layer 1 of visual regression (per ARCHITECTURE.md).
//
// Snaps every Ladle story at three breakpoints and diffs against the
// committed baselines under `.lostpixel/baseline/`. PR review surfaces
// both the code diff and the visual diff so the human reviewer can
// reject either.
//
// Lost Pixel does NOT spin up Ladle itself — `npm run test:visual:ds`
// in this package starts Ladle on :61000 first via a wrapper script
// (../../scripts/visual-ds.sh) and then invokes the CLI.
export const config: CustomProjectConfig = {
  ladleShots: {
    ladleUrl: "http://localhost:61000",
    // Mobile / tablet / desktop. Keep it deliberately small — every
    // breakpoint multiplies snapshot count and CI runtime.
    breakpoints: [375, 768, 1280],
  },
  imagePathBaseline: ".lostpixel/baseline",
  imagePathCurrent: ".lostpixel/current",
  imagePathDifference: ".lostpixel/difference",
  // Threshold for pixel-level fuzz. 0.01 = 1%. Tightens once we have a
  // few features under our belt and know the natural noise floor.
  threshold: 0.01,
  failOnDifference: true,
};
