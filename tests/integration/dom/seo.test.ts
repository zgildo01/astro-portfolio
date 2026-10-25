import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import BaseLayout from "../../../src/layouts/BaseLayout.astro";
import NotFound from "../../../src/pages/404.astro";
import { DEFAULT_SITE_ORIGIN } from "../../../src/config/siteOrigin";
import { mountHtml } from "../../helpers/dom";

let container: Awaited<ReturnType<typeof AstroContainer.create>>;

beforeAll(async () => {
  container = await AstroContainer.create();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

async function render(path: string, props: Record<string, unknown> = {}) {
  mountHtml(
    await container.renderToString(BaseLayout, {
      request: new Request(`https://preview.example${path}`),
      props: {
        title: "Example page | Zeus Zaragoza",
        description: "Useful professional content.",
        ...props
      },
      slots: { default: "<h1>Example page</h1>" },
      partial: false
    })
  );
}

function meta(selector: string) {
  return document.head.querySelector(selector)?.getAttribute("content");
}

describe("rendered discovery and sharing metadata", () => {
  it("keeps preview hosts, queries and fragments out of the canonical and share URL", async () => {
    await render("/work/shared-tooling?preview=true#approach");
    const canonical = `${DEFAULT_SITE_ORIGIN}/work/shared-tooling/`;
    expect(
      document.querySelector('link[rel="canonical"]')?.getAttribute("href")
    ).toBe(canonical);
    expect(meta('meta[property="og:url"]')).toBe(canonical);
    expect(meta('meta[property="og:title"]')).toBe(document.title);
    expect(meta('meta[name="twitter:title"]')).toBe(document.title);
    expect(meta('meta[name="twitter:card"]')).toBe("summary_large_image");
    expect(new URL(meta('meta[property="og:image"]')!).origin).toBe(
      DEFAULT_SITE_ORIGIN
    );
    expect(meta('meta[property="og:image:type"]')).toBe("image/jpeg");
    expect(meta('meta[name="twitter:image"]')).toBe(
      meta('meta[property="og:image"]')
    );
    expect(meta('meta[property="og:image:alt"]')?.length).toBeGreaterThan(20);
    expect(meta('meta[property="og:image:width"]')).toBe("1200");
    expect(meta('meta[property="og:image:height"]')).toBe("630");
  });

  it("keeps schema data connected to the public page and identity without private contact data", async () => {
    await render("/resume/");
    const scripts = document.head.querySelectorAll(
      'script[type="application/ld+json"]'
    );
    expect(scripts).toHaveLength(1);
    const data = JSON.parse(scripts[0].textContent!);
    expect(data["@context"]).toBe("https://schema.org");
    const [person, website, page] = data["@graph"];
    expect(person["@type"]).toBe("Person");
    expect(person.jobTitle).toBe("Platform Engineer");
    expect(person.sameAs).toHaveLength(2);
    expect(person).not.toHaveProperty("email");
    expect(website.publisher["@id"]).toBe(person["@id"]);
    expect(page.isPartOf["@id"]).toBe(website["@id"]);
    expect(page.about["@id"]).toBe(person["@id"]);
    expect(page.url).toBe(`${DEFAULT_SITE_ORIGIN}/resume/`);
  });

  it("escapes malicious authored metadata while retaining valid JSON-LD and share text", async () => {
    const title = '</script><script>alert("unsafe")</script> & Name';
    const description = '<img src=x onerror="unsafe()">\u2028one\u2029two';
    await render("/work/shared-tooling/", { title, description });
    const scripts = document.head.querySelectorAll("script");
    expect(scripts).toHaveLength(1);
    expect(scripts[0].type).toBe("application/ld+json");
    expect(document.head.querySelector("img,[onerror]")).toBeNull();
    const data = JSON.parse(scripts[0].textContent!);
    expect(data["@graph"][2].name).toBe(title);
    expect(data["@graph"][2].description).toBe(description);
    expect(meta('meta[property="og:title"]')).toBe(title);
    expect(meta('meta[name="twitter:description"]')).toBe(description);
  });

  it("keeps the empty experience out of indexing when it adopts the shared shell", async () => {
    await render("/experience/");
    expect(meta('meta[name="robots"]')).toBe("noindex, follow");
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
    expect(
      document.querySelector('script[type="application/ld+json"]')
    ).toBeNull();
  });

  it("renders a noindex missing-page recovery document with real destinations", async () => {
    mountHtml(
      await container.renderToString(NotFound, {
        request: new Request("https://preview.example/missing-page"),
        partial: false
      })
    );
    expect(meta('meta[name="robots"]')).toBe("noindex, follow");
    expect(document.querySelectorAll("main h1")).toHaveLength(1);
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
    expect(
      [...document.querySelectorAll<HTMLAnchorElement>("main a")].map((link) =>
        link.getAttribute("href")
      )
    ).toEqual(["/", "/work", "/contact"]);
  });

  it("preserves a subdirectory in canonical URLs", async () => {
    vi.stubEnv("BASE_URL", "/portfolio/");
    await render("/portfolio/about/");
    expect(
      document.querySelector('link[rel="canonical"]')?.getAttribute("href")
    ).toBe(`${DEFAULT_SITE_ORIGIN}/portfolio/about/`);
    const data = JSON.parse(
      document.querySelector('script[type="application/ld+json"]')!.textContent!
    );
    expect(data["@graph"][0].url).toBe(`${DEFAULT_SITE_ORIGIN}/portfolio/`);
  });
});
