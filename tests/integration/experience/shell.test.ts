import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const projectRoot = new URL("../../../", import.meta.url);

const professionalShellFiles = [
  "src/pages/index.astro",
  "src/pages/resume.astro",
  "src/pages/work/index.astro",
  "src/pages/about.astro",
  "src/pages/contact.astro",
  "src/layouts/BaseLayout.astro",
  "src/components/site/SiteHeader.astro",
  "src/components/site/SiteNavigation.astro",
  "src/components/site/MobileNavigation.astro",
  "src/components/site/SiteFooter.astro",
  "src/components/site/SkipLink/SkipLink.astro"
] as const;

function importSpecifiers(source: string): string[] {
  return [
    ...source.matchAll(
      /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)["']([^"']+)["']/g
    )
  ].map((match) => match[1]);
}

describe("optional experience isolation", () => {
  it.each(professionalShellFiles)(
    "%s does not import the experience or require a hydrated island",
    async (path) => {
      const source = await readFile(new URL(path, projectRoot), "utf8");

      for (const specifier of importSpecifiers(source)) {
        expect(specifier).not.toMatch(/(?:experience|react)/i);
      }

      expect(source).not.toMatch(/\bclient:(?:load|idle|visible|media|only)\b/);
    }
  );

  it("does not install React for the professional shell", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("package.json", projectRoot), "utf8")
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const packages = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies
    };

    expect(packages).not.toHaveProperty("react");
    expect(packages).not.toHaveProperty("react-dom");
    expect(packages).not.toHaveProperty("@astrojs/react");
  });
});
