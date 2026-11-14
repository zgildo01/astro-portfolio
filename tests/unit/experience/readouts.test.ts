import { describe, expect, it } from "vitest";
import {
  browserFamily,
  duration,
  localDate,
  localTime,
  parseNetworkReadout,
  platformFamily,
  reportedNumber,
  safely,
  sameOriginEndpoint,
  utcOffset
} from "../../../src/features/experience/console/readouts";

describe("honest browser readouts", () => {
  it("uses local clock/date components and handles fractional UTC offsets", () => {
    const local = new Date(2026, 0, 2, 3, 4, 5);
    expect(localTime(local)).toBe("03:04:05");
    expect(localDate(local)).toBe("2026-01-02");
    const offset = (minutes: number) =>
      ({ getTimezoneOffset: () => minutes }) as Date;
    expect(utcOffset(offset(-345))).toBe("UTC+05:45");
    expect(utcOffset(offset(210))).toBe("UTC−03:30");
    expect(utcOffset(offset(0))).toBe("UTC+00:00");
  });

  it("formats elapsed intervals rather than wrapping at an hour", () => {
    expect(duration(-100)).toBe("00:00");
    expect(duration(61000)).toBe("01:01");
    expect(duration(3661000)).toBe("01:01:01");
  });

  it("reports broad browser and platform families without inferring identity", () => {
    const clients = [
      ["Chrome/123 Edg/123", "Edge"],
      ["Chrome/123 OPR/100", "Opera"],
      ["FxiOS/120", "Firefox"],
      ["CriOS/123", "Chromium family"],
      ["Version/17 Safari/123", "Safari"],
      ["", "Unknown"]
    ];
    for (const [ua, expected] of clients)
      expect(browserFamily(ua!)).toBe(expected);
    const platforms = [
      "Android",
      "iPhone",
      "CrOS",
      "Windows",
      "Macintosh",
      "Linux",
      ""
    ];
    expect(platforms.map(platformFamily)).toEqual([
      "Android",
      "iOS",
      "ChromeOS",
      "Windows",
      "macOS",
      "Linux",
      "Unknown"
    ]);
  });

  it("treats missing and privacy-restricted reports as unavailable", () => {
    expect(
      safely(() => {
        throw new Error("Restricted");
      }, "Unknown")
    ).toBe("Unknown");
    expect(safely(() => "Readable", "Unknown")).toBe("Readable");
    for (const value of [undefined, null, "4", 0, -1, Infinity, NaN])
      expect(reportedNumber(value)).toBe("Unavailable");
    expect(reportedNumber(8, " threads", true)).toBe("8 threads");
    expect(reportedNumber(0.5, " GiB")).toBe("0.5 GiB");
    expect(reportedNumber(1.5, "", true)).toBe("Unavailable");
  });
});

describe("current-request network return", () => {
  it("only permits credential-free HTTP endpoints on the current origin", () => {
    expect(
      sameOriginEndpoint("/api/experience/network", "https://portfolio.test")
    ).toBe("https://portfolio.test/api/experience/network");
    for (const endpoint of [
      "",
      " ",
      "https://outside.test",
      "//outside.test/x",
      "data:application/json,{}",
      "https://name:pass@portfolio.test",
      "http://portfolio.test",
      "https://["
    ])
      expect(sameOriginEndpoint(endpoint, "https://portfolio.test")).toBeNull();
  });

  it("rejects malformed payloads and keeps text bounded, with genuine missing fields", () => {
    for (const value of [
      null,
      [],
      "text",
      {},
      { source: "Cloudflare", locationBasis: " " }
    ])
      expect(parseNetworkReadout(value)).toBeNull();
    expect(
      parseNetworkReadout({
        source: " Worker request ",
        locationBasis: " IP-derived ",
        country: " US ",
        clientIp: 123,
        provider: "x".repeat(300),
        unexpected: "ignored"
      })
    ).toEqual({
      source: "Worker request",
      locationBasis: "IP-derived",
      country: "US",
      clientIp: null,
      region: null,
      city: null,
      provider: "x".repeat(160)
    });
  });
});
