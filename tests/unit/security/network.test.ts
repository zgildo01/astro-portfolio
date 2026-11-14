import { describe, expect, it, vi } from "vitest";
import { handleNetworkReadout } from "../../../src/lib/experience/network";
import worker from "../../../worker/index";
import { apiSecurityHeaders } from "../../../src/config/security";

const endpoint = "https://portfolio.example/api/experience/network";
describe("current-request network readout", () => {
  it("reports only the supplied edge metadata without making lookups", async () => {
    const request = new Request(endpoint, {
      headers: {
        "CF-Connecting-IP": "192.0.2.14",
        Origin: "https://portfolio.example",
        "Sec-Fetch-Site": "same-origin"
      }
    });
    Object.defineProperty(request, "cf", {
      value: {
        country: "US",
        region: "Michigan",
        city: "Detroit",
        asOrganization: "Example network",
        latitude: "ignored"
      }
    });
    const response = handleNetworkReadout(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      clientIp: "192.0.2.14",
      country: "US",
      region: "Michigan",
      city: "Detroit",
      provider: "Example network",
      source: "Cloudflare request metadata",
      locationBasis:
        "IP-derived network location; not verified physical location"
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("cdn-cache-control")).toBe("no-store");
    expect(response.headers.get("cross-origin-resource-policy")).toBe(
      "same-origin"
    );
    expect(response.headers.has("access-control-allow-origin")).toBe(false);
  });
  it("uses null for unavailable or non-string readings and bounds text", async () => {
    const request = new Request(endpoint);
    Object.defineProperty(request, "cf", {
      value: {
        country: " ",
        region: 42,
        city: "x".repeat(300),
        asOrganization: null
      }
    });
    expect(await handleNetworkReadout(request).json()).toMatchObject({
      clientIp: null,
      country: null,
      region: null,
      city: "x".repeat(200),
      provider: null
    });
    expect(
      await handleNetworkReadout(new Request(endpoint)).json()
    ).toMatchObject({
      country: null,
      region: null,
      city: null,
      provider: null
    });
  });
  it.each(["POST", "PUT", "DELETE", "OPTIONS", "HEAD"])(
    "rejects %s without reading a body",
    async (method) => {
      const response = handleNetworkReadout(new Request(endpoint, { method }));
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("GET");
    }
  );
  it.each<Record<string, string>>([
    { Origin: "https://elsewhere.example" },
    { "Sec-Fetch-Site": "cross-site" },
    { Origin: "null" }
  ])("rejects cross-site requests %j", async (headers) => {
    const response = handleNetworkReadout(new Request(endpoint, { headers }));
    expect(response.status).toBe(403);
    expect(await response.json()).not.toHaveProperty("clientIp");
  });
  it.each(["/api/experience/network", "/api/experience/network/"])(
    "routes %s through the Worker security policy",
    async (path) => {
      const fetchAssets = vi.fn();
      const response = await worker.fetch(
        new Request(`https://portfolio.example${path}`),
        { ASSETS: { fetch: fetchAssets } }
      );
      expect(response.status).toBe(200);
      for (const [name, value] of Object.entries(apiSecurityHeaders))
        expect(response.headers.get(name)).toBe(value);
      expect(fetchAssets).not.toHaveBeenCalled();
    }
  );
});
