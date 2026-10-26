import type { APIRoute } from "astro";
import { resolveSiteOrigin } from "../config/siteOrigin";
import { loadPortfolioForBuild } from "../lib/content/loadPortfolioForBuild";
import { createSitemap } from "../lib/seo";

export const prerender = true;

export const GET: APIRoute = async ({ site }) => {
  const origin = resolveSiteOrigin(
    site?.href ?? import.meta.env.PORTFOLIO_SITE_URL
  );
  const { caseStudies } = await loadPortfolioForBuild({
    vaultDir: import.meta.env.RESUME_VAULT_DIR,
    token: import.meta.env.RESUME_CONTENT_TOKEN
  });
  return new Response(
    createSitemap(caseStudies, origin, import.meta.env.BASE_URL),
    { headers: { "Content-Type": "application/xml; charset=utf-8" } }
  );
};
