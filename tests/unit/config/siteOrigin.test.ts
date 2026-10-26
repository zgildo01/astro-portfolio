import { describe, expect, it } from "vitest";
import {
  DEFAULT_SITE_ORIGIN,
  resolveSiteOrigin
} from "../../../src/config/siteOrigin";

describe("public site origin", () => {
  it.each([undefined, "", "  "])(
    "uses the production origin when the override is %j",
    (value) => {
      expect(resolveSiteOrigin(value)).toBe(DEFAULT_SITE_ORIGIN);
    }
  );

  it.each([
    ["https://portfolio.example", "https://portfolio.example"],
    [" https://PORTFOLIO.example:443/ ", "https://portfolio.example"],
    ["https://portfolio.example:8443", "https://portfolio.example:8443"]
  ])("normalizes an HTTPS deployment origin %s", (value, expected) => {
    expect(resolveSiteOrigin(value)).toBe(expected);
  });

  it.each([
    "not an origin",
    "/relative",
    "http://portfolio.example",
    "javascript:alert(1)",
    "https://user:password@portfolio.example",
    "https://:password@portfolio.example",
    "https://portfolio.example/path",
    "https://portfolio.example/?preview=true",
    "https://portfolio.example/?",
    "https://portfolio.example/#fragment",
    "https://portfolio.example/#"
  ])("rejects ambiguous or unsafe site configuration %s", (value) => {
    expect(() => resolveSiteOrigin(value)).toThrow(/PORTFOLIO_SITE_URL/);
  });
});
