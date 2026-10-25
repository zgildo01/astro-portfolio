import { getViteConfig } from "astro/config";
import type { ViteUserConfig } from "vitest/config";

const config: ViteUserConfig = {
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["tests/**/*.test.ts"],
          exclude: ["tests/integration/dom/**"]
        }
      },
      {
        extends: true,
        test: {
          name: "dom",
          environment: "./tests/helpers/astroDomEnvironment.ts",
          include: ["tests/integration/dom/**/*.test.ts"]
        }
      }
    ],
    environmentOptions: {
      jsdom: { url: "https://portfolio.test/", pretendToBeVisual: true }
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "./coverage",
      include: [
        "src/config/**/*.ts",
        "src/lib/**/*.ts",
        "src/components/**/*.ts",
        "worker/**/*.ts"
      ],
      exclude: ["src/lib/**/types.ts", "src/lib/**/index.ts"],
      thresholds: {
        statements: 94,
        branches: 90,
        functions: 100,
        lines: 95,
        "src/components/contact/contactForm.ts": {
          statements: 99,
          branches: 90,
          functions: 100,
          lines: 100
        },
        "src/lib/contact/server.ts": {
          statements: 98,
          branches: 94,
          functions: 100,
          lines: 100
        },
        "src/lib/atmosphere/sceneryMotion.ts": { 100: true },
        "src/components/site/SkipLink/skipLink.ts": { 100: true },
        "worker/index.ts": { 100: true }
      }
    }
  }
};

export default getViteConfig(config);
