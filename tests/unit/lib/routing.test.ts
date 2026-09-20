import { describe, expect, it } from "vitest";

import { normalizeRoutePath } from "../../../src/lib/routing";

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