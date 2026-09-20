/**
 * Normalizes an application route pathname for comparison.
 *
 * Removes trailing slashes while preserving the root route.
 */
export function normalizeRoutePath(pathname: string): string {
  const normalizedPathname = pathname.replace(/\/+$/, "");

  return normalizedPathname || "/";
}
