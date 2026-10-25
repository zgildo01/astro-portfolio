import {
  CONTACT_LIMITS,
  isContactEmail,
  validateContactSubmission,
  type ContactResponse,
  type ContactSubmission
} from "./validation";

export interface ContactEnv {
  TURNSTILE_SECRET_KEY?: string;
  RESEND_API_KEY?: string;
  CONTACT_FROM_EMAIL?: string;
  CONTACT_TO_EMAIL?: string;
  CONTACT_RATE_LIMITER?: {
    limit(options: { key: string }): Promise<{ success: boolean }>;
  };
}

const SUCCESS_MESSAGE =
  "Your message has been sent. Thank you for getting in touch.";
const UNAVAILABLE_MESSAGE =
  "Your message could not be sent. Please try again later or use the contact links on this page.";
const VERIFICATION_MESSAGE =
  "Please complete the security check again before sending your message.";
const PROVIDER_TIMEOUT_MS = 8_000;
const TURNSTILE_ERROR_CODES = new Set([
  "missing-input-secret",
  "invalid-input-secret",
  "missing-input-response",
  "invalid-input-response",
  "bad-request",
  "timeout-or-duplicate",
  "internal-error"
]);

type FailureReason =
  | "configuration_unavailable"
  | "client_ip_missing"
  | "rate_limiter_unavailable"
  | "turnstile_http_error"
  | "turnstile_response_invalid"
  | "turnstile_rejected"
  | "turnstile_context_mismatch"
  | "turnstile_timeout"
  | "turnstile_request_failed"
  | "email_http_error"
  | "email_response_invalid"
  | "email_timeout"
  | "email_request_failed";

function logFailure(
  reason: FailureReason,
  details: {
    status?: number;
    missingConfiguration?: readonly (keyof ContactEnv)[];
    invalidMailboxFields?: readonly (
      "CONTACT_FROM_EMAIL" | "CONTACT_TO_EMAIL"
    )[];
    errorCodes?: readonly string[];
    hostnameMatches?: boolean;
    actionMatches?: boolean;
  } = {}
): void {
  if (
    reason === "turnstile_rejected" ||
    reason === "turnstile_context_mismatch"
  ) {
    console.warn("contact_failure", { reason, ...details });
  } else {
    console.error("contact_failure", { reason, ...details });
  }
}

function isTimeout(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

function json(
  body: ContactResponse,
  status: number,
  extraHeaders?: HeadersInit
): Response {
  const headers = new Headers(extraHeaders);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return Response.json(body, { status, headers });
}

function unavailable(): Response {
  return json({ ok: false, message: UNAVAILABLE_MESSAGE }, 503);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function configuredMailbox(value: string | undefined): value is string {
  return typeof value === "string" && isContactEmail(value);
}

class PayloadError extends Error {
  constructor(readonly status: 400 | 413) {
    super("Invalid contact payload.");
  }
}

async function readPayload(request: Request): Promise<unknown> {
  const declaredLength = request.headers.get("Content-Length");
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength)) throw new PayloadError(400);
    if (Number(declaredLength) > CONTACT_LIMITS.bodyBytes) {
      throw new PayloadError(413);
    }
  }
  if (!request.body) throw new PayloadError(400);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > CONTACT_LIMITS.bodyBytes) {
        await reader.cancel();
        throw new PayloadError(413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new PayloadError(400);
  }
}

async function verifyTurnstile(
  submission: ContactSubmission,
  secret: string,
  ip: string,
  hostname: string,
  fetcher: typeof fetch
): Promise<"verified" | "rejected" | "unavailable"> {
  try {
    const response = await fetcher(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret,
          response: submission.turnstileToken,
          remoteip: ip
        })
      }
    );
    if (!response.ok) {
      logFailure("turnstile_http_error", { status: response.status });
      return "unavailable";
    }
    let result: unknown;
    try {
      result = await response.json();
    } catch (error) {
      logFailure(
        isTimeout(error) ? "turnstile_timeout" : "turnstile_response_invalid"
      );
      return "unavailable";
    }
    if (!isRecord(result) || typeof result.success !== "boolean") {
      logFailure("turnstile_response_invalid");
      return "unavailable";
    }
    if (!result.success) {
      logFailure("turnstile_rejected", {
        errorCodes: Array.isArray(result["error-codes"])
          ? [
              ...new Set(
                result["error-codes"].filter(
                  (code): code is string =>
                    typeof code === "string" && TURNSTILE_ERROR_CODES.has(code)
                )
              )
            ]
          : []
      });
      return "rejected";
    }
    const hostnameMatches = result.hostname === hostname;
    const actionMatches = result.action === "contact";
    if (!hostnameMatches || !actionMatches) {
      logFailure("turnstile_context_mismatch", {
        hostnameMatches,
        actionMatches
      });
      return "rejected";
    }
    return "verified";
  } catch (error) {
    logFailure(
      isTimeout(error) ? "turnstile_timeout" : "turnstile_request_failed"
    );
    return "unavailable";
  }
}

async function sendNotification(
  submission: ContactSubmission,
  configuration: { apiKey: string; from: string; to: string },
  fetcher: typeof fetch
): Promise<boolean> {
  try {
    const response = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${configuration.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: configuration.from,
        to: [configuration.to],
        reply_to: submission.email,
        subject: "New portfolio inquiry",
        text: [
          "A new professional inquiry was submitted through the portfolio.",
          "",
          `Name: ${submission.name}`,
          `Reply to: ${submission.email}`,
          "",
          submission.message
        ].join("\n")
      })
    });
    if (!response.ok) {
      logFailure("email_http_error", { status: response.status });
      return false;
    }
    let result: unknown;
    try {
      result = await response.json();
    } catch (error) {
      logFailure(isTimeout(error) ? "email_timeout" : "email_response_invalid");
      return false;
    }
    const accepted =
      isRecord(result) && typeof result.id === "string" && result.id.length > 0;
    if (!accepted) logFailure("email_response_invalid");
    return accepted;
  } catch (error) {
    logFailure(isTimeout(error) ? "email_timeout" : "email_request_failed");
    return false;
  }
}

export async function handleContactRequest(
  request: Request,
  env: ContactEnv,
  fetcher: typeof fetch = fetch
): Promise<Response> {
  if (request.method !== "POST") {
    return json(
      { ok: false, message: "This endpoint accepts POST requests only." },
      405,
      {
        Allow: "POST"
      }
    );
  }

  const url = new URL(request.url);
  const site = request.headers.get("Sec-Fetch-Site");
  if (
    request.headers.get("Origin") !== url.origin ||
    (site !== null && site !== "same-origin")
  ) {
    return json(
      { ok: false, message: "This request could not be accepted." },
      403
    );
  }

  if (
    request.headers
      .get("Content-Type")
      ?.split(";", 1)[0]
      .trim()
      .toLowerCase() !== "application/json"
  ) {
    return json({ ok: false, message: "Send the form as JSON." }, 415);
  }

  let payload: unknown;
  try {
    payload = await readPayload(request);
  } catch (error) {
    const status = error instanceof PayloadError ? error.status : 400;
    return json(
      {
        ok: false,
        message:
          status === 413
            ? "This message is too large. Please shorten it and try again."
            : "This request could not be read. Please try again."
      },
      status
    );
  }

  const validation = validateContactSubmission(payload);
  if (!validation.ok) {
    return json(
      {
        ok: false,
        message: "Please check the highlighted fields and try again.",
        errors: validation.errors
      },
      422
    );
  }

  const submission = validation.value;
  if (submission.honeypot) {
    return json({ ok: true, message: SUCCESS_MESSAGE }, 200);
  }

  if (
    !env.TURNSTILE_SECRET_KEY?.trim() ||
    !env.RESEND_API_KEY?.trim() ||
    !configuredMailbox(env.CONTACT_FROM_EMAIL) ||
    !configuredMailbox(env.CONTACT_TO_EMAIL) ||
    !env.CONTACT_RATE_LIMITER
  ) {
    const missingConfiguration = (
      [
        ["TURNSTILE_SECRET_KEY", !env.TURNSTILE_SECRET_KEY?.trim()],
        ["RESEND_API_KEY", !env.RESEND_API_KEY?.trim()],
        ["CONTACT_FROM_EMAIL", !env.CONTACT_FROM_EMAIL?.trim()],
        ["CONTACT_TO_EMAIL", !env.CONTACT_TO_EMAIL?.trim()],
        ["CONTACT_RATE_LIMITER", !env.CONTACT_RATE_LIMITER]
      ] as const
    )
      .filter(([, missing]) => missing)
      .map(([name]) => name);
    const invalidMailboxFields = (
      ["CONTACT_FROM_EMAIL", "CONTACT_TO_EMAIL"] as const
    ).filter((name) => env[name]?.trim() && !configuredMailbox(env[name]));
    logFailure("configuration_unavailable", {
      missingConfiguration,
      invalidMailboxFields
    });
    return unavailable();
  }

  const ip = request.headers.get("CF-Connecting-IP");
  if (!ip?.trim()) {
    logFailure("client_ip_missing");
    return unavailable();
  }

  try {
    const rate = await env.CONTACT_RATE_LIMITER.limit({ key: `contact:${ip}` });
    if (rate.success !== true) {
      return json(
        {
          ok: false,
          message:
            "Too many messages have been attempted. Please wait a minute and try again."
        },
        429,
        { "Retry-After": "60" }
      );
    }
  } catch {
    logFailure("rate_limiter_unavailable");
    return unavailable();
  }

  const verification = await verifyTurnstile(
    submission,
    env.TURNSTILE_SECRET_KEY,
    ip,
    url.hostname,
    fetcher
  );
  if (verification === "unavailable") return unavailable();
  if (verification === "rejected") {
    return json(
      {
        ok: false,
        message: VERIFICATION_MESSAGE,
        errors: { turnstileToken: VERIFICATION_MESSAGE }
      },
      422
    );
  }

  const sent = await sendNotification(
    submission,
    {
      apiKey: env.RESEND_API_KEY,
      from: env.CONTACT_FROM_EMAIL,
      to: env.CONTACT_TO_EMAIL
    },
    fetcher
  );
  return sent
    ? json({ ok: true, message: SUCCESS_MESSAGE }, 200)
    : unavailable();
}
