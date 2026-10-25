import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { getByLabelText, getByRole, waitFor } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import ContactForm from "../../../src/components/contact/ContactForm.astro";
import worker, { type Env } from "../../../worker/index";
import { testContactProps } from "../../fixtures/portfolio";
import { deferred, flushMicrotasks, mountHtml } from "../../helpers/dom";

interface ChallengeCallbacks {
  callback(token: string): void;
  "expired-callback"(): void;
}

let container: Awaited<ReturnType<typeof AstroContainer.create>>;
let callbacks: ChallengeCallbacks;
let env: Env;
let user: ReturnType<typeof userEvent.setup>;
let reset: ReturnType<typeof vi.fn>;
let browserRequests: Array<{ url: string; body: Record<string, string> }>;
let verificationRequests: Array<Record<string, string>>;
let emailRequests: Array<Record<string, unknown>>;
let verification: Record<string, unknown>;
let verificationStatus: number;
let emailStatus: number;
let emailResponse: unknown;
let rateAllowed: boolean;
let providerFailure: "verification" | "email" | undefined;
let deliveryGate: ReturnType<typeof deferred<void>> | undefined;

async function fillMessage(
  message = "I would like to discuss a platform engineering role."
) {
  await user.type(
    getByLabelText(document.body, "Name (required)"),
    "  Žofie Example  "
  );
  await user.type(
    getByLabelText(document.body, "Email (required)"),
    "visitor@example.test"
  );
  await user.type(getByLabelText(document.body, "Message (required)"), message);
}

async function send() {
  await user.click(
    getByRole(document.body, "button", { name: "Send message" })
  );
  await waitFor(() => {
    expect(document.querySelector("form")?.hasAttribute("aria-busy")).toBe(
      false
    );
  });
}

function status() {
  return getByRole(document.body, "status");
}

function expectDraftRetained() {
  expect(
    (getByLabelText(document.body, "Message (required)") as HTMLTextAreaElement)
      .value
  ).toContain("platform engineering");
  expect(status().dataset.state).toBe("error");
  expect(document.activeElement?.id).toBe("contact-errors");
}

describe("contact form through Worker and provider boundaries", () => {
  beforeAll(async () => {
    container = await AstroContainer.create();
  });

  beforeEach(async () => {
    vi.resetModules();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    mountHtml(
      await container.renderToString(ContactForm, { props: testContactProps })
    );
    user = userEvent.setup({ document });
    browserRequests = [];
    verificationRequests = [];
    emailRequests = [];
    verification = {
      success: true,
      hostname: "portfolio.test",
      action: "contact"
    };
    verificationStatus = 200;
    emailStatus = 200;
    emailResponse = { id: "synthetic-notification-id" };
    rateAllowed = true;
    providerFailure = undefined;
    deliveryGate = undefined;
    env = {
      TURNSTILE_SECRET_KEY: "server-only-turnstile-secret",
      RESEND_API_KEY: "server-only-resend-secret",
      CONTACT_FROM_EMAIL: "sender@example.test",
      CONTACT_TO_EMAIL: "private-inbox@example.test",
      CONTACT_RATE_LIMITER: {
        limit: vi.fn(async () => ({ success: rateAllowed }))
      },
      ASSETS: {
        fetch: vi.fn(async () => new Response("Not found", { status: 404 }))
      }
    };
    reset = vi.fn();
    vi.stubGlobal("turnstile", {
      render: vi.fn((_element: HTMLElement, options: ChallengeCallbacks) => {
        callbacks = options;
        return "integration-widget";
      }),
      reset,
      ready: () => {
        throw new Error("The asynchronous API must use its load event.");
      }
    });
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (input, init) => {
        const url = String(input);
        const body = JSON.parse(String(init?.body)) as Record<string, string>;
        if (url === "https://portfolio.test/api/contact") {
          browserRequests.push({ url, body });
          const headers = new Headers(init?.headers);
          headers.set("Origin", "https://portfolio.test");
          headers.set("Sec-Fetch-Site", "same-origin");
          headers.set("CF-Connecting-IP", "192.0.2.20");
          return worker.fetch(
            new Request(url, {
              method: init?.method,
              headers,
              body: String(init?.body)
            }),
            env
          );
        }
        if (
          url === "https://challenges.cloudflare.com/turnstile/v0/siteverify"
        ) {
          verificationRequests.push(body);
          if (providerFailure === "verification")
            throw new Error("private provider failure details");
          return Response.json(verification, { status: verificationStatus });
        }
        if (url === "https://api.resend.com/emails") {
          emailRequests.push(body);
          if (deliveryGate) await deliveryGate.promise;
          if (providerFailure === "email")
            throw new Error("private provider failure details");
          return Response.json(emailResponse, { status: emailStatus });
        }
        throw new Error(
          "The integration attempted an unexpected external request."
        );
      })
    );
    const { initializeContactForms } =
      await import("../../../src/components/contact/contactForm");
    initializeContactForms();
    await flushMicrotasks();
    callbacks.callback("integration-token-1");
  });

  afterEach(() => {
    const logs = JSON.stringify([
      ...vi.mocked(console.warn).mock.calls,
      ...vi.mocked(console.error).mock.calls
    ]);
    for (const value of [
      "server-only-turnstile-secret",
      "server-only-resend-secret",
      "private-inbox@example.test",
      "visitor@example.test",
      "192.0.2.20",
      "private provider failure details"
    ]) {
      expect(logs).not.toContain(value);
    }
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  it("normalizes the form, verifies on the server, routes a plain-text notification, and confirms success", async () => {
    await fillMessage();
    await send();

    expect(browserRequests).toHaveLength(1);
    expect(browserRequests[0].body).toMatchObject({
      name: "Žofie Example",
      email: "visitor@example.test",
      honeypot: "",
      turnstileToken: "integration-token-1"
    });
    expect(verificationRequests).toEqual([
      {
        secret: env.TURNSTILE_SECRET_KEY,
        response: "integration-token-1",
        remoteip: "192.0.2.20"
      }
    ]);
    expect(emailRequests).toHaveLength(1);
    expect(emailRequests[0]).toMatchObject({
      from: env.CONTACT_FROM_EMAIL,
      to: [env.CONTACT_TO_EMAIL],
      reply_to: "visitor@example.test",
      subject: "New portfolio inquiry"
    });
    expect(emailRequests[0].text).toContain("Žofie Example");
    expect(emailRequests[0]).not.toHaveProperty("html");
    expect(status().dataset.state).toBe("success");
    expect(document.activeElement).toBe(status());
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
    expect(
      (document.querySelector("#contact-message") as HTMLTextAreaElement).value
    ).toBe("");
    expect(reset).toHaveBeenCalledTimes(1);
    expect(document.documentElement.outerHTML).not.toContain(
      env.RESEND_API_KEY
    );
    expect(document.documentElement.outerHTML).not.toContain(
      env.CONTACT_TO_EMAIL
    );
  });

  it("stops invalid local fields before the Worker or providers are contacted", async () => {
    await send();
    expect(browserRequests).toEqual([]);
    expect(verificationRequests).toEqual([]);
    expect(emailRequests).toEqual([]);
    expect(document.querySelectorAll('[aria-invalid="true"]')).toHaveLength(3);
    expect(document.activeElement?.id).toBe("contact-errors");
  });

  it("preserves plain-text markup in the notification without creating executable DOM", async () => {
    await fillMessage(
      '<img src=x onerror="alert(1)"> A platform engineering inquiry.'
    );
    await send();
    expect(emailRequests[0].text).toContain('<img src=x onerror="alert(1)">');
    expect(document.querySelector("#contact-errors img")).toBeNull();
    expect(document.querySelector("[onerror]")).toBeNull();
    expect(status().dataset.state).toBe("success");
  });

  it.each([
    { success: false, "error-codes": ["invalid-input-response"] },
    { success: false, "error-codes": ["timeout-or-duplicate"] },
    { success: true, hostname: "other.example", action: "contact" },
    { success: true, hostname: "portfolio.test", action: "other-action" }
  ])(
    "rejects unsuccessful or mismatched verification without sending email: %j",
    async (result) => {
      verification = result;
      await fillMessage();
      await send();
      expectDraftRetained();
      expect(verificationRequests).toHaveLength(1);
      expect(emailRequests).toEqual([]);
      expect(console.warn).toHaveBeenCalledOnce();
      expect(console.error).not.toHaveBeenCalled();
      expect(
        document.querySelector(
          '#contact-errors a[href="#contact-verification"]'
        )
      ).not.toBeNull();
    }
  );

  it("honors the Worker rate limit before calling either provider", async () => {
    rateAllowed = false;
    await fillMessage();
    await send();
    expectDraftRetained();
    expect(verificationRequests).toEqual([]);
    expect(emailRequests).toEqual([]);
    expect(document.querySelector("#contact-errors")?.textContent).toContain(
      "wait a minute"
    );
  });

  it.each([
    "TURNSTILE_SECRET_KEY",
    "RESEND_API_KEY",
    "CONTACT_FROM_EMAIL",
    "CONTACT_TO_EMAIL",
    "CONTACT_RATE_LIMITER"
  ] as const)(
    "fails safely with missing %s and keeps server configuration out of the page",
    async (name) => {
      delete env[name];
      await fillMessage();
      await send();
      expectDraftRetained();
      expect(verificationRequests).toEqual([]);
      expect(emailRequests).toEqual([]);
      expect(
        document.querySelector("#contact-errors")?.textContent
      ).not.toContain(name);
    }
  );

  it.each([401, 429, 500, 503])(
    "preserves the draft and hides provider details when email returns HTTP %s",
    async (code) => {
      emailStatus = code;
      emailResponse = { message: "private provider failure details" };
      await fillMessage();
      await send();
      expectDraftRetained();
      expect(emailRequests).toHaveLength(1);
      expect(document.body.textContent).not.toContain(
        "private provider failure details"
      );
      expect(document.body.textContent).not.toContain("RESEND_API_KEY");
      expect(console.error).toHaveBeenCalledExactlyOnceWith("contact_failure", {
        reason: "email_http_error",
        status: code
      });
      expect(console.warn).not.toHaveBeenCalled();
    }
  );

  it.each(["verification", "email"] as const)(
    "handles a thrown %s request without clearing text or exposing the exception",
    async (provider) => {
      providerFailure = provider;
      await fillMessage();
      await send();
      expectDraftRetained();
      expect(document.body.textContent).not.toContain(
        "private provider failure details"
      );
      expect(emailRequests).toHaveLength(provider === "verification" ? 0 : 1);
    }
  );

  it.each([{}, { id: "" }, { error: "private provider failure details" }])(
    "does not falsely confirm a malformed accepted-email response: %j",
    async (result) => {
      emailResponse = result;
      await fillMessage();
      await send();
      expectDraftRetained();
      expect(emailRequests).toHaveLength(1);
    }
  );

  it("silently discards honeypot submissions without calling providers", async () => {
    await fillMessage();
    (document.querySelector("#contact-honeypot") as HTMLInputElement).value =
      "bot-filled field";
    await send();
    expect(status().dataset.state).toBe("success");
    expect(verificationRequests).toEqual([]);
    expect(emailRequests).toEqual([]);
  });

  it("requires a fresh token for an intentional retry after an email failure", async () => {
    await fillMessage();
    emailStatus = 503;
    await send();
    expectDraftRetained();
    expect(
      (
        getByRole(document.body, "button", {
          name: "Send message"
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    callbacks.callback("integration-token-2");
    emailStatus = 200;
    await send();
    expect(status().dataset.state).toBe("success");
    expect(verificationRequests.map((request) => request.response)).toEqual([
      "integration-token-1",
      "integration-token-2"
    ]);
    expect(emailRequests).toHaveLength(2);
  });

  it("allows only one notification while provider delivery is pending", async () => {
    await fillMessage();
    deliveryGate = deferred<void>();
    const form = document.querySelector<HTMLFormElement>("form")!;
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true })
    );
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true })
    );
    await waitFor(() => expect(emailRequests).toHaveLength(1));
    expect(status().dataset.state).toBe("pending");
    expect(browserRequests).toHaveLength(1);
    deliveryGate.resolve();
    await waitFor(() => expect(status().dataset.state).toBe("success"));
    expect(emailRequests).toHaveLength(1);
  });
});
