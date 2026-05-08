// Ladle picks up `.ladle/components.tsx` automatically and lets every story
// share the same React provider. We use it for one purpose: import the
// design-system CSS so Tailwind utilities and tokens actually load in
// stories (and therefore in Lost Pixel snapshots).
//
// The previous approach — `appendToHead: '<link rel="stylesheet" href="/src/styles/index.css" />'`
// in config.mjs — silently failed because Ladle's dev server doesn't expose
// `/src/styles/index.css` as a static asset; the request fell back to the
// index HTML and stories rendered with user-agent default styles. Importing
// the CSS via ESM here lets Vite bundle and serve it the normal way.

import "../src/styles/index.css";
import type { GlobalProvider } from "@ladle/react";

export const Provider: GlobalProvider = ({ children }) => <>{children}</>;
