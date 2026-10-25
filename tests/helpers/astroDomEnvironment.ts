import { builtinEnvironments, type Environment } from "vitest/runtime";

/** Render actual Astro server components while interacting with a jsdom DOM. */
export default {
  ...builtinEnvironments.jsdom,
  name: "astro-jsdom",
  viteEnvironment: "ssr"
} satisfies Environment;
