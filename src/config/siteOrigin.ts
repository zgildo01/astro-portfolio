export const DEFAULT_SITE_ORIGIN =
  "https://zeus-zaragoza-portfolio.zgildo01.workers.dev";

/** A deployment base path is configured separately from the public origin. */
export function resolveSiteOrigin(value?: string): string {
  const configured = value?.trim() || DEFAULT_SITE_ORIGIN;
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error("PORTFOLIO_SITE_URL must be an absolute HTTPS origin.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    configured.includes("?") ||
    configured.includes("#")
  ) {
    throw new Error(
      "PORTFOLIO_SITE_URL must be an HTTPS origin without credentials, a path, query, or fragment."
    );
  }
  return url.origin;
}
