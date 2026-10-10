import { describe, expect, it } from "vitest";

import { siteConfig } from "../../../src/config/site";

describe("siteConfig", () => {
  it("keeps the site identity consistent across default metadata", () => {
    expect(siteConfig.name).toBe("Zeus Zaragoza");
    expect(siteConfig.role).toBe("Platform Engineer");
    expect(siteConfig.defaultTitle).toBe("Zeus Zaragoza | Platform Engineer");
    expect(siteConfig.defaultDescription).toContain(siteConfig.name);
    expect(siteConfig.defaultDescription).toContain(siteConfig.role);
  });

  it("provides the five primary routes in their intended order", () => {
    expect(siteConfig.primaryNavigation).toEqual([
      { label: "Home", href: "/" },
      { label: "Resume", href: "/resume" },
      { label: "Work", href: "/work" },
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" }
    ]);
  });

  it("uses unique navigation targets and keeps experience out of primary navigation", () => {
    const targets = siteConfig.primaryNavigation.map(({ href }) => href);

    expect(new Set(targets).size).toBe(targets.length);
    expect(targets).not.toContain("/experience");
  });
});
