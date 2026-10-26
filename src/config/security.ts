import type { AstroUserConfig } from "astro";

type ContentSecurityPolicy = Exclude<
  NonNullable<NonNullable<AstroUserConfig["security"]>["csp"]>,
  boolean
>;

/** Astro supplies page-specific hashes for its processed scripts and styles. */
export const pageContentSecurityPolicy: ContentSecurityPolicy = {
  directives: [
    "default-src 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    "form-action 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-src https://challenges.cloudflare.com"
  ],
  scriptDirective: {
    resources: ["'self'", "https://challenges.cloudflare.com"]
  },
  styleDirective: {
    resources: [
      { resource: "'self'", kind: "element" },
      { resource: "'unsafe-inline'", kind: "attribute" }
    ]
  }
};

/** HTTP-only framing protection complements the per-document Astro CSP. */
export const assetSecurityHeaders = {
  "Content-Security-Policy":
    "frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'self'",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
} as const;

export const apiSecurityHeaders = {
  ...assetSecurityHeaders,
  "Content-Security-Policy":
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  "X-Robots-Tag": "noindex, nofollow"
} as const;
