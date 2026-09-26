import { describe, expect, it } from "vitest";

import { siteConfig } from "../../../src/config/site";

describe("siteConfig", () => {
  it("provides complete default metadata for the site", () => {
    expect(siteConfig.name.trim()).not.toBe("");
    expect(siteConfig.role.trim()).not.toBe("");
    expect(siteConfig.defaultTitle).toBe(
      siteConfig.name + " | " + siteConfig.role
    );
    expect(siteConfig.defaultDescription).toContain(siteConfig.name);
    expect(siteConfig.defaultDescription).toContain(siteConfig.role);
  });

  it("lists the five primary pages once, in navigation order", () => {
    expect(siteConfig.primaryNavigation.map(({ href }) => href)).toEqual([
      "/",
      "/resume",
      "/work",
      "/about",
      "/contact"
    ]);

    const labels = siteConfig.primaryNavigation.map(({ label }) => label);
    expect(labels.every((label) => label.trim().length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
