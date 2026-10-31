import { getViteConfig } from "astro/config";
import type { ViteUserConfig } from "vitest/config";

const uiLogicTests = [
  "tests/unit/atmosphere/**/*.test.ts",
  "tests/unit/components/**/*.test.ts"
];
const uiDomTests = ["tests/integration/dom/**/*.test.ts"];
const backendTests = [
  "tests/unit/contact/**/*.test.ts",
  "tests/unit/config/contact.test.ts",
  "tests/unit/security/**/*.test.ts",
  "tests/integration/contact/**/*.test.ts"
];
const contentTests = [
  "tests/unit/resume/**/*.test.ts",
  "tests/unit/work/**/*.test.ts",
  "tests/unit/content/**/*.test.ts",
  "tests/integration/work/**/*.test.ts"
];

const config: ViteUserConfig = {
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "ui-logic",
          environment: "node",
          include: uiLogicTests
        }
      },
      {
        extends: true,
        test: {
          name: "ui-dom",
          environment: "./tests/helpers/astroDomEnvironment.ts",
          include: uiDomTests
        }
      },
      {
        extends: true,
        test: {
          name: "backend",
          environment: "node",
          include: backendTests
        }
      },
      {
        extends: true,
        test: {
          name: "content",
          environment: "node",
          include: contentTests
        }
      },
      {
        extends: true,
        test: {
          name: "site",
          environment: "node",
          include: ["tests/**/*.test.ts"],
          exclude: [
            ...uiLogicTests,
            ...uiDomTests,
            ...backendTests,
            ...contentTests
          ]
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
        "src/lib/atmosphere/experienceMode.ts": { 100: true },
        "src/components/site/SkipLink/skipLink.ts": { 100: true },
        "worker/index.ts": { 100: true }
      }
    }
  }
};

export default getViteConfig(config);
