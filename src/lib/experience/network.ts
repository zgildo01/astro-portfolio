import type { NetworkReadout } from "../../features/experience/types";

type EdgeRequest = Request & {
  cf?: {
    country?: unknown;
    region?: unknown;
    city?: unknown;
    asOrganization?: unknown;
  };
};

function reading(value: unknown): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 200)
    : null;
}

/** Reflect current edge metadata only. No lookup service, persistence, or body. */
export function handleNetworkReadout(request: Request): Response {
  const headers = {
    "Cache-Control": "private, no-store",
    "CDN-Cache-Control": "no-store",
    "Cross-Origin-Resource-Policy": "same-origin",
    Vary: "Origin, Sec-Fetch-Site"
  };
  if (request.method !== "GET") {
    return Response.json(
      { ok: false, message: "Use GET for this reading." },
      {
        status: 405,
        headers: { ...headers, Allow: "GET" }
      }
    );
  }
  const origin = request.headers.get("Origin");
  if (
    request.headers.get("Sec-Fetch-Site") === "cross-site" ||
    (origin !== null && origin !== new URL(request.url).origin)
  ) {
    return Response.json(
      { ok: false, message: "This reading is available only on this site." },
      {
        status: 403,
        headers
      }
    );
  }
  const cf = (request as EdgeRequest).cf;
  const readout: NetworkReadout = {
    clientIp: reading(request.headers.get("CF-Connecting-IP")),
    country: reading(cf?.country),
    region: reading(cf?.region),
    city: reading(cf?.city),
    provider: reading(cf?.asOrganization),
    source: "Cloudflare request metadata",
    locationBasis: "IP-derived network location; not verified physical location"
  };
  return Response.json(readout, { headers });
}
