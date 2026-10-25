import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  handleContactRequest,
  type ContactEnv
} from "../../../src/lib/contact/server";
import { CONTACT_LIMITS } from "../../../src/lib/contact/validation";

const ORIGIN = "https://portfolio.example";
const PRIVATE_MARKER = "private-provider-diagnostic-do-not-expose";
const SUBMISSION = {
  name: "Ada Lovelace",
  email: "ada@example.test",
  message: "I would like to discuss a platform engineering opportunity.",
  honeypot: "",
  turnstileToken: "test-verification-token"
};

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  const diagnostics = JSON.stringify(vi.mocked(console.warn).mock.calls);
  for (const privateValue of [
    PRIVATE_MARKER,
    SUBMISSION.name,
    SUBMISSION.email,
    SUBMISSION.message,
    SUBMISSION.turnstileToken,
    "test-turnstile-secret",
    "test-resend-secret",
    "portfolio@example.test",
    "owner@example.test",
    "192.0.2.10"
  ]) {
    expect(diagnostics).not.toContain(privateValue);
  }
  vi.restoreAllMocks();
});

function request(
  payload: unknown = SUBMISSION,
  options: { method?: string; headers?: HeadersInit; rawBody?: BodyInit } = {}
): Request {
  const headers = new Headers({
    Origin: ORIGIN,
    "Sec-Fetch-Site": "same-origin",
    "Content-Type": "application/json",
    "CF-Connecting-IP": "192.0.2.10"
  });
  new Headers(options.headers).forEach((value, name) =>
    headers.set(name, value)
  );
  const method = options.method ?? "POST";
  return new Request(`${ORIGIN}/api/contact`, {
    method,
    headers,
    ...(method === "GET" || method === "HEAD"
      ? {}
      : { body: options.rawBody ?? JSON.stringify(payload) })
  });
}

function fixture(overrides: Partial<ContactEnv> = {}) {
  const limiter = vi.fn(async () => ({ success: true }));
  const env: ContactEnv = {
    TURNSTILE_SECRET_KEY: "test-turnstile-secret",
    RESEND_API_KEY: "test-resend-secret",
    CONTACT_FROM_EMAIL: "portfolio@example.test",
    CONTACT_TO_EMAIL: "owner@example.test",
    CONTACT_RATE_LIMITER: { limit: limiter },
    ...overrides
  };
  const fetcher = vi.fn<typeof fetch>();
  fetcher
    .mockResolvedValueOnce(
      Response.json({
        success: true,
        hostname: "portfolio.example",
        action: "contact"
      })
    )
    .mockResolvedValueOnce(Response.json({ id: "test-email-id" }));
  return { env, limiter, fetcher };
}

describe("contact Worker endpoint", () => {
  it("verifies the token before sending one plain-text notification with a trusted sender and visitor reply-to", async () => {
    const { env, limiter, fetcher } = fixture();
    const response = await handleContactRequest(request(), env, fetcher);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
    expect(console.warn).not.toHaveBeenCalled();
    expect(limiter).toHaveBeenCalledExactlyOnceWith({
      key: "contact:192.0.2.10"
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const [verificationUrl, verification] = fetcher.mock.calls[0];
    expect(verificationUrl).toBe(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify"
    );
    expect(verification).toMatchObject({ method: "POST", redirect: "error" });
    expect(verification?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(verification?.body))).toEqual({
      secret: env.TURNSTILE_SECRET_KEY,
      response: SUBMISSION.turnstileToken,
      remoteip: "192.0.2.10"
    });
    const [emailUrl, email] = fetcher.mock.calls[1];
    expect(emailUrl).toBe("https://api.resend.com/emails");
    expect(email).toMatchObject({
      method: "POST",
      redirect: "error",
      headers: { Authorization: "Bearer test-resend-secret" }
    });
    expect(email?.signal).toBeInstanceOf(AbortSignal);
    const notification = JSON.parse(String(email?.body));
    expect(notification).toMatchObject({
      from: env.CONTACT_FROM_EMAIL,
      to: [env.CONTACT_TO_EMAIL],
      reply_to: SUBMISSION.email,
      subject: "New portfolio inquiry"
    });
    expect(notification.text).toContain(SUBMISSION.name);
    expect(notification.text).toContain(SUBMISSION.message);
    expect(notification.html).toBeUndefined();
  });

  it.each(["GET", "HEAD", "PUT", "DELETE", "OPTIONS"])(
    "rejects %s without calling providers or the limiter",
    async (method) => {
      const { env, limiter, fetcher } = fixture();
      const response = await handleContactRequest(
        request(undefined, { method }),
        env,
        fetcher
      );
      expect(response.status).toBe(405);
      expect(response.headers.get("Allow")).toBe("POST");
      expect(limiter).not.toHaveBeenCalled();
      expect(fetcher).not.toHaveBeenCalled();
    }
  );

  it.each<Record<string, string>>([
    { Origin: "https://untrusted.example" },
    { Origin: "null" },
    { "Sec-Fetch-Site": "cross-site" },
    { "Sec-Fetch-Site": "same-site" }
  ])("rejects cross-origin requests: %j", async (headers) => {
    const { env, limiter, fetcher } = fixture();
    const response = await handleContactRequest(
      request(SUBMISSION, { headers }),
      env,
      fetcher
    );
    expect(response.status).toBe(403);
    expect(limiter).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("requires an Origin but accepts an absent optional Fetch Metadata header", async () => {
    const { env, fetcher } = fixture();
    const missingOrigin = request();
    missingOrigin.headers.delete("Origin");
    expect(
      (await handleContactRequest(missingOrigin, env, fetcher)).status
    ).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();

    const sameOrigin = request();
    sameOrigin.headers.delete("Sec-Fetch-Site");
    expect((await handleContactRequest(sameOrigin, env, fetcher)).status).toBe(
      200
    );
  });

  it.each([
    "text/plain",
    "application/x-www-form-urlencoded",
    "multipart/form-data"
  ])("rejects unsupported content type %s", async (contentType) => {
    const { env, fetcher } = fixture();
    const response = await handleContactRequest(
      request(SUBMISSION, { headers: { "Content-Type": contentType } }),
      env,
      fetcher
    );
    expect(response.status).toBe(415);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("accepts JSON with a charset parameter", async () => {
    const { env, fetcher } = fixture();
    const response = await handleContactRequest(
      request(SUBMISSION, {
        headers: { "Content-Type": "application/json; charset=utf-8" }
      }),
      env,
      fetcher
    );
    expect(response.status).toBe(200);
  });

  it.each(["{invalid", "", "null", "[]"])(
    "rejects malformed or non-object JSON: %s",
    async (rawBody) => {
      const { env, limiter, fetcher } = fixture();
      const response = await handleContactRequest(
        request(undefined, { rawBody }),
        env,
        fetcher
      );
      expect([400, 422]).toContain(response.status);
      expect(limiter).not.toHaveBeenCalled();
      expect(fetcher).not.toHaveBeenCalled();
    }
  );

  it("returns useful field errors without reaching any external dependency", async () => {
    const { env, limiter, fetcher } = fixture();
    const response = await handleContactRequest(
      request({ ...SUBMISSION, email: "invalid", message: "short" }),
      env,
      fetcher
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      ok: false,
      errors: { email: expect.any(String), message: expect.any(String) }
    });
    expect(limiter).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects an oversized declared payload before reading it", async () => {
    const { env, fetcher } = fixture();
    const response = await handleContactRequest(
      request(SUBMISSION, {
        headers: { "Content-Length": String(CONTACT_LIMITS.bodyBytes + 1) }
      }),
      env,
      fetcher
    );
    expect(response.status).toBe(413);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("caps streamed bytes without trusting Content-Length", async () => {
    const { env, fetcher } = fixture();
    const canceled = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(CONTACT_LIMITS.bodyBytes));
        controller.enqueue(new Uint8Array(1));
      },
      cancel: canceled
    });
    const streamed = new Request(`${ORIGIN}/api/contact`, {
      method: "POST",
      headers: request().headers,
      body,
      duplex: "half"
    } as RequestInit & { duplex: string });
    const response = await handleContactRequest(streamed, env, fetcher);
    expect(response.status).toBe(413);
    expect(canceled).toHaveBeenCalledOnce();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects invalid UTF-8 rather than accepting replacement characters", async () => {
    const { env, fetcher } = fixture();
    const response = await handleContactRequest(
      request(undefined, { rawBody: new Uint8Array([0xff, 0xfe]) }),
      env,
      fetcher
    );
    expect(response.status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("silently accepts honeypot submissions without sending email or consuming provider quota", async () => {
    const { limiter, fetcher } = fixture();
    const response = await handleContactRequest(
      request({ ...SUBMISSION, honeypot: "spam" }),
      {},
      fetcher
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
    expect(limiter).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects a supplied non-string honeypot rather than silently discarding it", async () => {
    const { env, limiter, fetcher } = fixture();
    const response = await handleContactRequest(
      request({ ...SUBMISSION, honeypot: { unexpected: "value" } }),
      env,
      fetcher
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ ok: false });
    expect(limiter).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    "TURNSTILE_SECRET_KEY",
    "RESEND_API_KEY",
    "CONTACT_FROM_EMAIL",
    "CONTACT_TO_EMAIL",
    "CONTACT_RATE_LIMITER"
  ] as const)("fails closed if %s is absent", async (key) => {
    const { env, fetcher } = fixture({ [key]: undefined });
    const response = await handleContactRequest(request(), env, fetcher);
    expect(response.status).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledExactlyOnceWith("contact_failure", {
      reason: "configuration_unavailable",
      missingConfiguration: [key],
      invalidMailboxFields: []
    });
  });

  it("rejects invalid configured mailboxes without forwarding them to Resend", async () => {
    const { env, fetcher } = fixture({
      CONTACT_FROM_EMAIL: "sender@example.test\r\nBcc: another@example.test"
    });
    const response = await handleContactRequest(request(), env, fetcher);
    expect(response.status).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledExactlyOnceWith("contact_failure", {
      reason: "configuration_unavailable",
      missingConfiguration: [],
      invalidMailboxFields: ["CONTACT_FROM_EMAIL"]
    });
  });

  it("does not trust X-Forwarded-For when Cloudflare's connecting IP is absent", async () => {
    const { env, limiter, fetcher } = fixture();
    const untrusted = request(undefined, {
      headers: { "X-Forwarded-For": "192.0.2.99" }
    });
    untrusted.headers.delete("CF-Connecting-IP");
    const response = await handleContactRequest(untrusted, env, fetcher);
    expect(response.status).toBe(503);
    expect(limiter).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledExactlyOnceWith("contact_failure", {
      reason: "client_ip_missing"
    });
  });

  it("enforces the rate limit before verification or delivery", async () => {
    const { env, limiter, fetcher } = fixture();
    limiter.mockResolvedValueOnce({ success: false });
    const response = await handleContactRequest(request(), env, fetcher);
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fails closed on a rate-limit binding error", async () => {
    const { env, limiter, fetcher } = fixture();
    limiter.mockRejectedValueOnce(new Error(PRIVATE_MARKER));
    const response = await handleContactRequest(request(), env, fetcher);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(PRIVATE_MARKER);
    expect(fetcher).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledExactlyOnceWith("contact_failure", {
      reason: "rate_limiter_unavailable"
    });
  });

  it.each([
    { success: false, "error-codes": ["timeout-or-duplicate"] },
    { success: true, hostname: "untrusted.example", action: "contact" },
    { success: true, hostname: "portfolio.example", action: "login" },
    { success: true }
  ])(
    "rejects unverified or mismatched Turnstile evidence: %j",
    async (result) => {
      const { env, fetcher } = fixture();
      fetcher.mockReset().mockResolvedValueOnce(Response.json(result));
      const response = await handleContactRequest(request(), env, fetcher);
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({
        ok: false,
        errors: { turnstileToken: expect.any(String) }
      });
      expect(fetcher).toHaveBeenCalledOnce();
    }
  );

  it.each([
    [
      new Response(PRIVATE_MARKER, { status: 502 }),
      "turnstile_http_error",
      502
    ],
    [
      new Response("malformed provider JSON", { status: 200 }),
      "turnstile_response_invalid",
      undefined
    ],
    [
      Response.json({ success: "true" }),
      "turnstile_response_invalid",
      undefined
    ]
  ] as const)(
    "handles Turnstile failure without exposing diagnostics",
    async (providerResponse, reason, status) => {
      const { env, fetcher } = fixture();
      fetcher.mockReset().mockResolvedValueOnce(providerResponse);
      const response = await handleContactRequest(request(), env, fetcher);
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain(PRIVATE_MARKER);
      expect(fetcher).toHaveBeenCalledOnce();
      expect(console.warn).toHaveBeenCalledExactlyOnceWith("contact_failure", {
        reason,
        ...(status === undefined ? {} : { status })
      });
    }
  );

  it("handles a verification timeout without sending email", async () => {
    const { env, fetcher } = fixture();
    fetcher
      .mockReset()
      .mockRejectedValueOnce(new DOMException(PRIVATE_MARKER, "TimeoutError"));
    const response = await handleContactRequest(request(), env, fetcher);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(PRIVATE_MARKER);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(console.warn).toHaveBeenCalledExactlyOnceWith("contact_failure", {
      reason: "turnstile_timeout"
    });
  });

  it.each([
    [new Response(PRIVATE_MARKER, { status: 429 }), "email_http_error", 429],
    [
      new Response("invalid response", { status: 200 }),
      "email_response_invalid",
      undefined
    ],
    [
      Response.json({ error: PRIVATE_MARKER }),
      "email_response_invalid",
      undefined
    ],
    [Response.json({ id: "" }), "email_response_invalid", undefined]
  ] as const)(
    "reports delivery failure without claiming success or retrying",
    async (providerResponse, reason, status) => {
      const { env, fetcher } = fixture();
      fetcher
        .mockReset()
        .mockResolvedValueOnce(
          Response.json({
            success: true,
            hostname: "portfolio.example",
            action: "contact"
          })
        )
        .mockResolvedValueOnce(providerResponse);
      const response = await handleContactRequest(request(), env, fetcher);
      expect(response.status).toBe(503);
      const result = await response.json();
      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).not.toContain(PRIVATE_MARKER);
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(console.warn).toHaveBeenCalledExactlyOnceWith("contact_failure", {
        reason,
        ...(status === undefined ? {} : { status })
      });
    }
  );

  it("does not retry an email timeout because the provider might already have accepted the notification", async () => {
    const { env, fetcher } = fixture();
    fetcher
      .mockReset()
      .mockResolvedValueOnce(
        Response.json({
          success: true,
          hostname: "portfolio.example",
          action: "contact"
        })
      )
      .mockRejectedValueOnce(new DOMException(PRIVATE_MARKER, "TimeoutError"));
    const response = await handleContactRequest(request(), env, fetcher);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(PRIVATE_MARKER);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledExactlyOnceWith("contact_failure", {
      reason: "email_timeout"
    });
  });

  it("logs only recognized Turnstile failure codes and keeps provider-controlled text private", async () => {
    const { env, fetcher } = fixture();
    fetcher.mockReset().mockResolvedValueOnce(
      Response.json({
        success: false,
        "error-codes": [
          "invalid-input-secret",
          "invalid-input-secret",
          PRIVATE_MARKER,
          SUBMISSION.email,
          { unexpected: SUBMISSION.turnstileToken }
        ],
        diagnostic: PRIVATE_MARKER
      })
    );
    const response = await handleContactRequest(request(), env, fetcher);

    expect(response.status).toBe(422);
    expect(console.warn).toHaveBeenCalledExactlyOnceWith("contact_failure", {
      reason: "turnstile_rejected",
      errorCodes: ["invalid-input-secret"]
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("reports verification context mismatch without logging hostname or action values", async () => {
    const { env, fetcher } = fixture();
    fetcher.mockReset().mockResolvedValueOnce(
      Response.json({
        success: true,
        hostname: PRIVATE_MARKER,
        action: SUBMISSION.email
      })
    );
    const response = await handleContactRequest(request(), env, fetcher);

    expect(response.status).toBe(422);
    expect(console.warn).toHaveBeenCalledExactlyOnceWith("contact_failure", {
      reason: "turnstile_context_mismatch",
      hostnameMatches: false,
      actionMatches: false
    });
  });

  it.each(["turnstile", "email"] as const)(
    "classifies a %s network failure without logging exception details or retrying",
    async (provider) => {
      const { env, fetcher } = fixture();
      fetcher.mockReset();
      if (provider === "email") {
        fetcher.mockResolvedValueOnce(
          Response.json({
            success: true,
            hostname: "portfolio.example",
            action: "contact"
          })
        );
      }
      fetcher.mockRejectedValueOnce(new Error(PRIVATE_MARKER));
      const response = await handleContactRequest(request(), env, fetcher);

      expect(response.status).toBe(503);
      expect(console.warn).toHaveBeenCalledExactlyOnceWith("contact_failure", {
        reason:
          provider === "email"
            ? "email_request_failed"
            : "turnstile_request_failed"
      });
      expect(fetcher).toHaveBeenCalledTimes(provider === "email" ? 2 : 1);
    }
  );

  it.each(["turnstile", "email"] as const)(
    "identifies a timeout while reading the %s response without logging body details",
    async (provider) => {
      const { env, fetcher } = fixture();
      const timedOut = Response.json({ diagnostic: PRIVATE_MARKER });
      vi.spyOn(timedOut, "json").mockRejectedValueOnce(
        new DOMException(PRIVATE_MARKER, "AbortError")
      );
      fetcher.mockReset();
      if (provider === "email") {
        fetcher.mockResolvedValueOnce(
          Response.json({
            success: true,
            hostname: "portfolio.example",
            action: "contact"
          })
        );
      }
      fetcher.mockResolvedValueOnce(timedOut);
      const response = await handleContactRequest(request(), env, fetcher);

      expect(response.status).toBe(503);
      expect(console.warn).toHaveBeenCalledExactlyOnceWith("contact_failure", {
        reason: provider === "email" ? "email_timeout" : "turnstile_timeout"
      });
    }
  );

  it("keeps HTML-like visitor content in a plain-text body", async () => {
    const { env, fetcher } = fixture();
    const message =
      '<script>alert("example")</script> A legitimate question follows.';
    const response = await handleContactRequest(
      request({ ...SUBMISSION, message }),
      env,
      fetcher
    );
    expect(response.status).toBe(200);
    const notification = JSON.parse(String(fetcher.mock.calls[1][1]?.body));
    expect(notification.text).toContain(message);
    expect(notification.html).toBeUndefined();
  });

  it("sets private response policy on successes and errors without CORS", async () => {
    const { env, fetcher } = fixture();
    for (const response of [
      await handleContactRequest(request(), env, fetcher),
      await handleContactRequest(request({}), env, fetcher),
      await handleContactRequest(
        request(undefined, { method: "GET" }),
        env,
        fetcher
      )
    ]) {
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(response.headers.get("Content-Type")).toContain(
        "application/json"
      );
      expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    }
  });
});
