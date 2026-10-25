import { resolveSiteOrigin } from "../config/siteOrigin";
import { siteConfig } from "../config/site";
import { withBasePath } from "./routing";
import type { CaseStudy } from "./work/types";

/** Directory-built HTML pages have one query-free, trailing-slash URL. */
export function canonicalPageUrl(pathname: string, origin: string): string {
  if (
    !pathname.startsWith("/") ||
    pathname.startsWith("//") ||
    pathname.includes("\\")
  ) {
    throw new Error("Canonical page paths must be site-relative.");
  }
  const url = new URL(pathname, resolveSiteOrigin(origin));
  url.search = "";
  url.hash = "";
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  return url.href;
}

/** JSON remains readable by crawlers without allowing an HTML script escape. */
export function serializeStructuredData(
  value: Record<string, unknown>
): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** The validated content collection contains published studies only. */
export function createSitemap(
  caseStudies: readonly Pick<CaseStudy, "slug">[],
  origin: string,
  baseUrl: string
): string {
  const paths = [
    ...siteConfig.primaryNavigation.map(({ href }) => href),
    ...caseStudies.map(({ slug }) => `/work/${slug}`)
  ];
  const urls = new Set(
    paths.map((pathname) =>
      canonicalPageUrl(withBasePath(pathname, baseUrl), origin)
    )
  );
  const locations = [...urls].map(
    (url) => `<url><loc>${url.replace(/&/g, "&amp;")}</loc></url>`
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locations.join("")}</urlset>\n`;
}
