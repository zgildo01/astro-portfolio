import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { beforeAll, describe, expect, it } from "vitest";

import { siteConfig } from "../../../src/config/site";
import BaseLayout from "../../../src/layouts/BaseLayout.astro";

let container: Awaited<ReturnType<typeof AstroContainer.create>>;

function getAttribute(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1];
}

async function renderLayout(
  path: string,
  description?: string
): Promise<string> {
  return container.renderToString(BaseLayout, {
    request: new Request(`http://localhost${path}`),
    props: { title: "Shell integration test", description },
    slots: {
      default: '<section id="slot-probe"><h1>Slot content</h1></section>'
    },
    partial: false
  });
}

describe("site shell", () => {
  beforeAll(async () => {
    container = await AstroContainer.create();
  });

  it("renders document metadata, landmarks, the content slot, and a working skip target", async () => {
    const html = await renderLayout("/", "A custom page description.");
    const main = html.match(/<main\b([^>]*)>([\s\S]*?)<\/main>/);
    const skipLink = html.match(
      /<a\b([^>]*\bdata-skip-link[^>]*)>([^<]*)<\/a>/
    );

    expect(html).toMatch(/<!doctype html>/i);
    expect(html).toMatch(/<html lang="en">/);
    expect(html).toContain("<title>Shell integration test</title>");
    expect(html).toContain(
      '<meta name="description" content="A custom page description.">'
    );
    expect(main).not.toBeNull();
    expect(getAttribute(main![1], "id")).toBe("main-content");
    expect(getAttribute(main![1], "tabindex")).toBeUndefined();
    const marker = main![2].match(
      /<([a-z]+)\b([^>]*\bdata-main-start-marker\b[^>]*)>/
    );
    expect(marker).not.toBeNull();
    expect(getAttribute(marker![2], "aria-hidden")).toBe("true");
    expect(main![2].indexOf("data-main-start-marker")).toBeLessThan(
      main![2].indexOf('id="slot-probe"')
    );
    expect(main![2]).toContain(
      '<section id="slot-probe"><h1>Slot content</h1></section>'
    );
    expect(skipLink).not.toBeNull();
    expect(getAttribute(skipLink![1], "href")).toBe("#main-content");
    expect(skipLink![2].trim()).toBe("Jump to main content");

    const siteHeader = html.indexOf("<header");
    const mainStart = html.indexOf("<main");
    const siteFooter = html.indexOf("<footer");

    expect(siteHeader).toBeGreaterThan(html.indexOf("<body>"));
    expect(mainStart).toBeGreaterThan(siteHeader);
    expect(siteFooter).toBeGreaterThan(mainStart);
    expect(html.match(/<main\b/g)).toHaveLength(1);
    expect(html.match(/<footer\b/g)).toHaveLength(1);
    expect(html).not.toMatch(/<astro-island\b/);
  });

  it("uses the default description when one is not supplied", async () => {
    const html = await renderLayout("/");

    expect(html).toContain(
      `<meta name="description" content="${siteConfig.defaultDescription}">`
    );
  });

  it.each([
    { path: "/", currentHref: "/" },
    { path: "/work/", currentHref: "/work" }
  ])(
    "renders five links and marks $currentHref current in each navigation",
    async ({ path, currentHref }) => {
      const html = await renderLayout(path);
      const navigation = [...html.matchAll(/<nav\b([^>]*)>([\s\S]*?)<\/nav>/g)];

      expect(navigation).toHaveLength(3);
      expect(
        navigation.map(([, attributes]) =>
          getAttribute(attributes, "data-placement")
        )
      ).toEqual(["header", "mobile", "footer"]);
      expect(
        navigation.map(([, attributes]) =>
          getAttribute(attributes, "aria-label")
        )
      ).toEqual(["Primary", "Primary", "Footer"]);

      for (const [, , content] of navigation) {
        const links = [...content.matchAll(/<a\b([^>]*)>([^<]*)<\/a>/g)].map(
          ([, linkAttributes, label]) => ({
            label: label.trim(),
            href: getAttribute(linkAttributes, "href"),
            current: getAttribute(linkAttributes, "aria-current")
          })
        );

        expect(links).toEqual(
          siteConfig.primaryNavigation.map(({ label, href }) => ({
            label,
            href,
            current: href === currentHref ? "page" : undefined
          }))
        );
      }
    }
  );
});
