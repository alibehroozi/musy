// Ladle picks up vite.config.ts at the package root automatically (Tailwind
// plugin lives there). This file holds only Ladle-specific options.
export default {
  appendToHead: '<link rel="stylesheet" href="/src/styles/index.css" />',
  defaultStory: "typography--variants",
};
