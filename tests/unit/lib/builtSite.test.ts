import { Buffer } from "node:buffer";
import { describe, expect, it, vi } from "vitest";
import {
  checkBuiltSite,
  jpegDimensions
} from "../../../scripts/check-built-site.mjs";

describe("release-audit network boundary", () => {
  it.each([
    "https://portfolio.example",
    "https://example.test:8443",
    "http://user:password@localhost:3000"
  ])(
    "rejects an unsafe audit destination before issuing any request: %s",
    async (origin) => {
      const fetcher = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValue(new Error("Unexpected audit network access."));
      try {
        await expect(
          checkBuiltSite({ distDirectory: "/unused-build", origin })
        ).rejects.toThrow();
        expect(fetcher).not.toHaveBeenCalled();
      } finally {
        fetcher.mockRestore();
      }
    }
  );
});

describe("compiled social-image frame validation", () => {
  it.each([0xc0, 0xc2])(
    "reads the geometry from JPEG frame marker %s",
    (marker) => {
      const frame = Buffer.from([
        0xff,
        0xd8,
        0xff,
        marker,
        0x00,
        0x0b,
        0x08,
        0x02,
        0x76,
        0x04,
        0xb0,
        0x01,
        0x01,
        0x11,
        0x00
      ]);
      expect(jpegDimensions(frame)).toEqual({ width: 1200, height: 630 });
    }
  );

  it.each([
    Buffer.from("not an image"),
    Buffer.from([0xff, 0xd8]),
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xff, 0x00]),
    Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x02, 0x00]),
    Buffer.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, 0x00])
  ])("rejects invalid or truncated social-image bytes", (bytes) => {
    expect(() => jpegDimensions(bytes)).toThrow();
  });
});
