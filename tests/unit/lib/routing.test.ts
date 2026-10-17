import { describe, expect, it } from "vitest";

import { normalizeRoutePath, withBasePath } from "../../../src/lib/routing";

describe("normalizeRoutePath", () => {
  it.each([
    ["/", "/"],
    ["/about", "/about"],
    ["/about/", "/about"],
    ["/about///", "/about"],
    ["", "/"]
  ])("normalizes %s to %s", (pathname, expectedPathname) => {
    expect(normalizeRoutePath(pathname)).toBe(expectedPathname);
  });
});

describe("withBasePath", () => {
  it.each([
    ["/", "/", "/"],
    ["/resume", "/", "/resume"],
    ["/", "/astro-portfolio/", "/astro-portfolio/"],
    ["/resume", "/astro-portfolio/", "/astro-portfolio/resume"],
    [
      "/resume/Zeus-Zaragoza-Resume.pdf",
      "/astro-portfolio/",
      "/astro-portfolio/resume/Zeus-Zaragoza-Resume.pdf"
    ],
    ["/work/", "astro-portfolio", "/astro-portfolio/work/"]
  ])("joins route %s with base %s", (pathname, baseUrl, expected) => {
    expect(withBasePath(pathname, baseUrl)).toBe(expected);
  });

  it.each(["resume", "https://example.com", "//example.com"])(
    "rejects a non-site path: %s",
    (pathname) => {
      expect(() => withBasePath(pathname, "/astro-portfolio/")).toThrow(
        "Site paths must start with a single slash."
      );
    }
  );
});
