import { describe, expect, it, vi } from "vitest";

import worker, { type Env } from "../../../worker/index";

describe("contact Worker routing", () => {
  it("delegates site pages and downloads to the static asset binding", async () => {
    const assetResponse = new Response("Static site content");
    const fetchAssets = vi.fn().mockResolvedValue(assetResponse);
    const env: Env = { ASSETS: { fetch: fetchAssets } };

    for (const path of ["/", "/work/", "/resume/Zeus-Zaragoza-Resume.pdf"]) {
      const request = new Request(`https://portfolio.example${path}`);
      expect(await worker.fetch(request, env)).toBe(assetResponse);
      expect(fetchAssets).toHaveBeenLastCalledWith(request);
    }
  });

  it.each(["/api/contact", "/api/contact/"])(
    "routes %s to the contact handler instead of returning an asset page",
    async (path) => {
      const fetchAssets = vi.fn();
      const response = await worker.fetch(
        new Request(`https://portfolio.example${path}`),
        { ASSETS: { fetch: fetchAssets } }
      );

      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("POST");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(fetchAssets).not.toHaveBeenCalled();
    }
  );

  it("returns a JSON 404 for unknown API routes", async () => {
    const fetchAssets = vi.fn();
    const response = await worker.fetch(
      new Request("https://portfolio.example/api/unknown"),
      { ASSETS: { fetch: fetchAssets } }
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ ok: false });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fetchAssets).not.toHaveBeenCalled();
  });
});
