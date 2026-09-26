import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { siteConfig } from "../../../src/config/site";

const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
const require = createRequire(import.meta.url);
const astroCli = join(
  dirname(require.resolve("astro/package.json")),
  "bin/astro.mjs"
);
const outputDirectory = mkdtempSync(join(tmpdir(), "portfolio-shell-test-"));

function readPage(pathname: string): string {
  const pagePath =
    pathname === "/" ? "index.html" : join(pathname.slice(1), "index.html");

  return readFileSync(join(outputDirectory, pagePath), "utf8");
}

function classNames(tag: string): string[] {
  return (tag.match(/\bclass="([^"]*)"/)?.[1] ?? "").split(/\s+/);
}

describe("published site shell", () => {
  beforeAll(() => {
    execFileSync(
      process.execPath,
      [astroCli, "build", "--outDir", outputDirectory],
      {
        cwd: projectRoot,
        stdio: "pipe",
        timeout: 120_000
      }
    );
  }, 120_000);

  afterAll(() => {
    rmSync(outputDirectory, { recursive: true, force: true });
  });

  it.each(siteConfig.primaryNavigation)(
    "renders the shared shell and current-page navigation at $href",
    ({ href }) => {
      const html = readPage(href);
      const skipLink = html.match(/<a\b[^>]*data-skip-link[^>]*>/)?.[0] ?? "";
      const main = html.match(/<main\b[^>]*>/)?.[0] ?? "";
      const mainContent =
        html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? "";
      const pageWrapper = mainContent.match(/^\s*<[a-z]+\b[^>]*>/)?.[0] ?? "";

      expect(skipLink).toContain('href="#main-content"');
      expect(main).toContain('id="main-content"');
      expect(main).toContain('tabindex="-1"');
      expect(classNames(main)).toEqual(
        expect.arrayContaining(["shell-container", "shell-main"])
      );
      expect(classNames(pageWrapper)).toContain("page");

      const navigation = [...html.matchAll(/<nav\b([^>]*)>([\s\S]*?)<\/nav>/g)];

      for (const placement of ["header", "mobile", "footer"]) {
        const content =
          navigation.find(([, attributes]) =>
            attributes.includes('data-placement="' + placement + '"')
          )?.[2] ?? "";
        const currentLinks = [...content.matchAll(/<a\b([^>]*)>/g)].filter(
          ([, attributes]) => attributes.includes('aria-current="page"')
        );

        expect(currentLinks).toHaveLength(1);
        expect(currentLinks[0]?.[1]).toContain('href="' + href + '"');
      }
    }
  );

  it("publishes the shell styles used by the rendered classes", () => {
    const html = readPage("/");
    const stylesheet =
      html.match(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/)?.[1] ?? "";

    expect(stylesheet).toMatch(/^\/_astro\//);

    const css = readFileSync(
      join(outputDirectory, stylesheet.slice(1)),
      "utf8"
    );
    expect(css).toContain(".shell-container");
    expect(css).toContain(".shell-main");
    expect(css).toContain(".page");
  });
});
