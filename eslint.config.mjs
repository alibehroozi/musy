import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import prettier from "eslint-config-prettier";
import tailwindcss from "eslint-plugin-tailwindcss";

export default [
  {
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/node_modules/**",
      "**/coverage/**",
      ".lostpixel/**",
      "tests/_scratch/**",
    ],
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  // Layer 0 visual-regression — the design-system gate.
  // Apply only to React surfaces (apps/web + libs/web/design-system) — the
  // other workspaces don't render UI so their .ts files don't carry
  // Tailwind classes.
  //
  // settings.tailwindcss.config: {} short-circuits the plugin's attempt to
  // auto-load a `tailwind.config.js`. Tailwind v4 is CSS-first (`@theme` in
  // theme.css), so there's no JS config file to find. The empty object is
  // enough for the rules we use here (no-arbitrary-value etc.) — they're
  // syntactic, not config-aware.
  {
    files: ["apps/web/**/*.{ts,tsx}", "libs/web/design-system/**/*.{ts,tsx}"],
    plugins: {
      tailwindcss,
    },
    settings: {
      tailwindcss: {
        config: {},
      },
    },
    rules: {
      // Block `bg-[#abcdef]`, `mt-[7px]`, `text-[14px]`, etc. — the
      // primary "left the design system" failure mode. If a value isn't
      // tokenized, the design system gets the token first; never inline.
      "tailwindcss/no-arbitrary-value": "error",
      // Catch contradictions like `flex flex-col flex-row` — usually a
      // refactor leftover.
      "tailwindcss/no-contradicting-classname": "error",
      // Warn on unnecessary arbitrary values that have a standard
      // utility (e.g. `w-[100%]` instead of `w-full`).
      "tailwindcss/no-unnecessary-arbitrary-value": "warn",
    },
  },
  // Forbidden raw HTML form elements in apps/web/ — per AGENTS.md hard
  // rule #14. The DS owns the accessible markup (correct roles, focus
  // styles, ARIA, contrast); apps consume the wrapped components. Lint
  // catches the regression at commit time so it never reaches CI.
  //
  // Scope is apps/web/** ONLY — libs/web/design-system/** is where the
  // raw tags legitimately live (Button wraps <button>, Input wraps
  // <input>, etc.). As DS components grow (Textarea, Select, …), add
  // selectors here AND update the table in AGENTS.md hard rule #14 in
  // the same PR.
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXOpeningElement[name.name='button']",
          message:
            "Use Button from @moc/design-system instead of raw <button>. AGENTS.md hard rule #14.",
        },
        {
          selector: "JSXOpeningElement[name.name='input']",
          message:
            "Use Input from @moc/design-system instead of raw <input>. AGENTS.md hard rule #14.",
        },
        {
          selector: "JSXOpeningElement[name.name='textarea']",
          message:
            "Raw <textarea> is forbidden in apps/web/. Add a Textarea component to @moc/design-system first via /design-system. AGENTS.md hard rule #14.",
        },
        {
          selector: "JSXOpeningElement[name.name='select']",
          message:
            "Raw <select> is forbidden in apps/web/. Add a Select component to @moc/design-system first via /design-system. AGENTS.md hard rule #14.",
        },
      ],
    },
  },
  prettier,
];
