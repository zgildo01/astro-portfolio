import { describe, expect, it } from "vitest";

import {
  apiSecurityHeaders,
  assetSecurityHeaders,
  pageContentSecurityPolicy
} from "../../../src/config/security";
import { withApiSecurityHeaders } from "../../../src/lib/security/headers";

describe("browser security policy", () => {
  it("permits only local application scripts and the explicit Turnstile origin", () => {
    expect(pageContentSecurityPolicy.scriptDirective?.resources).toEqual([
      "'self'",
      "https://challenges.cloudflare.com"
    ]);
    expect(pageContentSecurityPolicy.directives).toContain(
      "default-src 'none'"
    );
    expect(pageContentSecurityPolicy.directives).toContain(
      "connect-src 'self'"
    );
    expect(pageContentSecurityPolicy.directives).toContain(
      "frame-src https://challenges.cloudflare.com"
    );
    expect(JSON.stringify(pageContentSecurityPolicy)).not.toContain(
      "unsafe-eval"
    );
    expect(
      JSON.stringify(pageContentSecurityPolicy.scriptDirective)
    ).not.toContain("unsafe-inline");
  });

  it("allows scene style attributes without allowing inline style elements", () => {
    expect(pageContentSecurityPolicy.styleDirective?.resources).toEqual([
      { resource: "'self'", kind: "element" },
      { resource: "'unsafe-inline'", kind: "attribute" }
    ]);
  });

  it("keeps HTTP framing protection separate from Astro's page-specific hashes", () => {
    const policy = assetSecurityHeaders["Content-Security-Policy"];
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("base-uri 'none'");
    expect(policy).toContain("form-action 'self'");
    expect(policy).not.toMatch(/(?:default|script|style)-src/);
    expect(assetSecurityHeaders["X-Frame-Options"]).toBe("DENY");
    expect(assetSecurityHeaders).not.toHaveProperty(
      "Strict-Transport-Security"
    );
  });
});

describe("Worker-generated API security headers", () => {
  it("preserves JSON, status, cache and method semantics while replacing weaker policies", async () => {
    const original = Response.json(
      { ok: false, message: "Use POST." },
      {
        status: 405,
        statusText: "Method Not Allowed",
        headers: {
          Allow: "POST",
          "Cache-Control": "no-store",
          "Content-Security-Policy": "default-src *",
          "X-Frame-Options": "SAMEORIGIN"
        }
      }
    );
    const response = withApiSecurityHeaders(original);

    expect(response.status).toBe(405);
    expect(response.statusText).toBe("Method Not Allowed");
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(response.headers.get("Allow")).toBe("POST");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    for (const [name, value] of Object.entries(apiSecurityHeaders)) {
      expect(response.headers.get(name), name).toBe(value);
    }
    expect(await response.json()).toEqual({ ok: false, message: "Use POST." });
    expect(original.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
  });

  it("handles immutable headers and null bodies without introducing cookies or CORS", () => {
    const response = withApiSecurityHeaders(
      Response.redirect("https://portfolio.example/", 307)
    );

    expect(response.status).toBe(307);
    expect(response.body).toBeNull();
    expect(response.headers.get("Location")).toBe("https://portfolio.example/");
    expect(response.headers.get("Content-Security-Policy")).toContain(
      "default-src 'none'"
    );
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(response.headers.has("Set-Cookie")).toBe(false);
    expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });
});
