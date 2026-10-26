import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as robots } from "../../../src/pages/robots.txt";
import { GET as sitemap } from "../../../src/pages/sitemap.xml";
import { DEFAULT_SITE_ORIGIN } from "../../../src/config/siteOrigin";
import { createPortfolioContent } from "../../fixtures/portfolio";
import { loadPortfolioForBuild } from "../../../src/lib/content/loadPortfolioForBuild";

vi.mock("../../../src/lib/content/loadPortfolioForBuild", () => ({
  loadPortfolioForBuild: vi.fn()
}));

const context = (site?: URL) => ({ site }) as Parameters<typeof sitemap>[0];

beforeEach(() => {
  vi.mocked(loadPortfolioForBuild).mockResolvedValue(createPortfolioContent());
  vi.stubEnv("BASE_URL", "/");
  vi.stubEnv("PORTFOLIO_SITE_URL", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe("static crawler discovery endpoints", () => {
  it("announces the production sitemap without blocking pages carrying noindex", async () => {
    const response = await robots(context());
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/plain");
    const body = await response.text();
    expect(body).toContain(`Sitemap: ${DEFAULT_SITE_ORIGIN}/sitemap.xml`);
    expect(body).toContain("Allow: /\n");
    expect(body).toContain("Disallow: /api/\n");
    expect(body).not.toContain("Disallow: /experience");
  });

  it("uses the configured canonical site and deployment base in both documents", async () => {
    vi.stubEnv("BASE_URL", "/portfolio/");
    const site = new URL("https://custom.example/");
    const robotsBody = await (await robots(context(site))).text();
    expect(robotsBody).toContain("Allow: /portfolio/\n");
    expect(robotsBody).toContain("Disallow: /portfolio/api/\n");
    expect(robotsBody).toContain(
      "Sitemap: https://custom.example/portfolio/sitemap.xml"
    );
    const response = await sitemap(context(site));
    expect(response.headers.get("Content-Type")).toContain("application/xml");
    const body = await response.text();
    expect(body).toContain(
      "https://custom.example/portfolio/work/shared-tooling/"
    );
    expect(body).not.toContain(DEFAULT_SITE_ORIGIN);
  });

  it("publishes only route data from the validated shared content snapshot", async () => {
    const content = createPortfolioContent();
    content.resume.contact.email = "private-mailbox@example.test";
    vi.mocked(loadPortfolioForBuild).mockResolvedValueOnce(content);
    const response = await sitemap(context());
    const body = await response.text();
    expect(loadPortfolioForBuild).toHaveBeenCalledOnce();
    expect(body).toContain("/work/shared-tooling/");
    expect(body).not.toMatch(
      /private-mailbox|sourceCommitSha|Zeus-Vault|schemaVersion|\.pdf|experience|404/
    );
    expect([...body.matchAll(/<loc>/g)]).toHaveLength(6);
  });

  it("does not replace a failed content load with a misleading partial sitemap", async () => {
    vi.mocked(loadPortfolioForBuild).mockRejectedValueOnce(
      new Error("Content unavailable")
    );
    await expect(sitemap(context())).rejects.toThrow("Content unavailable");
  });
});
