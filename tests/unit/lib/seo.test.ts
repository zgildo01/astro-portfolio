import { describe, expect, it } from "vitest";
import {
  canonicalPageUrl,
  createSitemap,
  serializeStructuredData
} from "../../../src/lib/seo";

const origin = "https://portfolio.example";

describe("canonical HTML page URLs", () => {
  it.each([
    ["/", `${origin}/`],
    ["/resume", `${origin}/resume/`],
    ["/resume///", `${origin}/resume/`],
    [
      "/portfolio/work/shared-tooling",
      `${origin}/portfolio/work/shared-tooling/`
    ],
    [
      "/work/shared-tooling/?preview=true#approach",
      `${origin}/work/shared-tooling/`
    ]
  ])("chooses one public URL for %s", (pathname, expected) => {
    expect(canonicalPageUrl(pathname, origin)).toBe(expected);
  });

  it.each([
    "work",
    "https://elsewhere.example/",
    "//elsewhere.example/",
    "/\\elsewhere.example/"
  ])(
    "rejects a path that could replace the configured authority: %s",
    (pathname) => {
      expect(() => canonicalPageUrl(pathname, origin)).toThrow(/site-relative/);
    }
  );
});

describe("structured data serialization", () => {
  it("preserves JSON data while preventing script and HTML boundaries", () => {
    const data = {
      name: '</script><script>unsafe()</script> & "name"',
      description: "<img onerror=unsafe()>\u2028line\u2029end"
    };
    const serialized = serializeStructuredData(data);
    expect(JSON.parse(serialized)).toEqual(data);
    expect(serialized).not.toMatch(/[<>&\u2028\u2029]/);
    expect(serialized).toContain("\\u003c/script\\u003e");
  });
});

describe("sitemap publication boundary", () => {
  it.each(["/", "/portfolio/"])(
    "lists canonical professional routes and published collection URLs with base %s",
    (base) => {
      const xml = createSitemap(
        [{ slug: "shared-tooling" }, { slug: "shared-tooling" }],
        origin,
        base
      );
      const locations = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(
        (match) => match[1]
      );
      expect(locations).toHaveLength(6);
      expect(new Set(locations).size).toBe(locations.length);
      expect(locations).toContain(`${origin}${base}work/shared-tooling/`);
      expect(locations).toContain(`${origin}${base}`);
      for (const location of locations) {
        const url = new URL(location);
        expect(url.origin).toBe(origin);
        expect(url.pathname.startsWith(base)).toBe(true);
        expect(url.pathname.endsWith("/")).toBe(true);
        expect(url.search).toBe("");
        expect(url.hash).toBe("");
      }
      expect(xml).not.toMatch(/experience|\/404|\/api|\.pdf/);
    }
  );

  it("keeps core routes discoverable when no case study is published", () => {
    const xml = createSitemap([], origin, "/");
    expect([...xml.matchAll(/<loc>/g)]).toHaveLength(5);
    expect(xml).toContain(`${origin}/contact/`);
  });
});
