import type { APIRoute } from "astro";
import { resolveSiteOrigin } from "../config/siteOrigin";
import { withBasePath } from "../lib/routing";

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  const origin = resolveSiteOrigin(
    site?.href ?? import.meta.env.PORTFOLIO_SITE_URL
  );
  const base = import.meta.env.BASE_URL;
  const sitemap = new URL(withBasePath("/sitemap.xml", base), origin).href;
  return new Response(
    `User-agent: *\nAllow: ${withBasePath("/", base)}\nDisallow: ${withBasePath("/api/", base)}\nSitemap: ${sitemap}\n`,
    { headers: { "Content-Type": "text/plain; charset=utf-8" } }
  );
};
