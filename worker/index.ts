import {
  handleContactRequest,
  type ContactEnv
} from "../src/lib/contact/server";
import { withApiSecurityHeaders } from "../src/lib/security/headers";
import { handleNetworkReadout } from "../src/lib/experience/network";

export interface Env extends ContactEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === "/api/contact" || pathname === "/api/contact/") {
      return withApiSecurityHeaders(await handleContactRequest(request, env));
    }

    if (
      pathname === "/api/experience/network" ||
      pathname === "/api/experience/network/"
    ) {
      return withApiSecurityHeaders(handleNetworkReadout(request));
    }

    if (pathname === "/api" || pathname.startsWith("/api/")) {
      return withApiSecurityHeaders(
        Response.json(
          { ok: false, message: "This page could not be found." },
          {
            status: 404,
            headers: {
              "Cache-Control": "no-store",
              "X-Content-Type-Options": "nosniff"
            }
          }
        )
      );
    }

    return env.ASSETS.fetch(request);
  }
};
