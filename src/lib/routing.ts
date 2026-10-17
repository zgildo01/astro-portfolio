/**
 * Normalizes an application route pathname for comparison.
 *
 * Removes trailing slashes while preserving the root route.
 */
export function normalizeRoutePath(pathname: string): string {
  const normalizedPathname = pathname.replace(/\/+$/, "");

  return normalizedPathname || "/";
}

/** Prefixes a root-relative site path with Astro's configured base URL. */
export function withBasePath(pathname: string, baseUrl: string): string {
  if (!pathname.startsWith("/") || pathname.startsWith("//")) {
    throw new Error("Site paths must start with a single slash.");
  }

  const basePath = normalizeRoutePath(`/${baseUrl.replace(/^\/+|\/+$/g, "")}`);

  return basePath === "/" ? pathname : `${basePath}${pathname}`;
}
