import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { fireEvent, screen, within } from "@testing-library/dom";
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
import { CONTACT_LIMITS } from "../../../src/lib/contact/validation";
import { deferred, flushMicrotasks, mountHtml } from "../../helpers/dom";
import { createTurnstile } from "../../helpers/turnstile";
import { expectResolvedReferences } from "../../helpers/pageAssertions";

let container: Awaited<ReturnType<typeof AstroContainer.create>>;
const props = {
  siteKey: "1x00000000000000000000AA",
  endpoint: "/api/contact",
  email: undefined as string | undefined,
  linkedin: "https://www.linkedin.com/in/example/",
  github: "https://github.com/example"
};
const valid = {
  name: "Žofie Example",
  email: "zoe@example.test",
  message: "I would like to discuss building a dependable developer platform."
};
let fetcher: ReturnType<typeof vi.fn>;

function form(): HTMLFormElement {
  return document.querySelector<HTMLFormElement>("[data-contact-form]")!;
}
function input(name: "name" | "email"): HTMLInputElement {
  return document.querySelector<HTMLInputElement>(`#contact-${name}`)!;
}
function message(): HTMLTextAreaElement {
  return document.querySelector<HTMLTextAreaElement>("#contact-message")!;
}
function send(): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>("[data-contact-submit]")!;
}
function retry(): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>("[data-contact-retry]")!;
}
function summary(): HTMLElement {
  return document.querySelector<HTMLElement>("#contact-errors")!;
}
function status(): HTMLElement {
  return document.querySelector<HTMLElement>("[data-contact-status]")!;
}
function fields(): HTMLFieldSetElement {
  return document.querySelector<HTMLFieldSetElement>("[data-contact-fields]")!;
}
function script(): HTMLScriptElement | null {
  return document.querySelector<HTMLScriptElement>(
    'script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]'
  );
}
function setFields(values = valid): void {
  input("name").value = values.name;
  input("email").value = values.email;
  message().value = values.message;
}
function submit(): void {
  fireEvent.submit(form());
}
function response(value: unknown, ok = true, code = ok ? 200 : 503) {
  return { ok, status: code, json: vi.fn().mockResolvedValue(value) };
}
function setApi(api: unknown): void {
  Object.defineProperty(window, "turnstile", {
    configurable: true,
    writable: true,
    value: api
  });
}
async function mount(overrides: Partial<typeof props> = {}): Promise<void> {
  mountHtml(
    await container.renderToString(ContactForm, {
      props: { ...props, ...overrides }
    })
  );
}
async function initialize() {
  const module = await import("../../../src/components/contact/contactForm");
  module.initializeContactForms();
  await flushMicrotasks();
  return module.initializeContactForms;
}
async function ready() {
  await mount();
  const widget = createTurnstile();
  setApi(widget.api);
  const initializeAgain = await initialize();
  widget.solve();
  return { widget, initializeAgain };
}

beforeAll(async () => {
  container = await AstroContainer.create();
});
beforeEach(() => {
  vi.resetModules();
  fetcher = vi
    .fn()
    .mockResolvedValue(response({ ok: true, message: "Accepted." }));
  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal("scrollTo", vi.fn());
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    writable: true,
    value: vi.fn()
  });
  setApi(undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
  document.head.replaceChildren();
  setApi(undefined);
  vi.unstubAllGlobals();
});

describe("contact progressive enhancement and verification bootstrap", () => {
  it("ships disabled native controls, accessible field contracts, and no-script contact alternatives", async () => {
    await mount({ email: "contact@example.com" });
    expect(fields().disabled).toBe(true);
    expect(send().disabled).toBe(true);
    expect(form().noValidate).toBe(false);
    expect(screen.getByRole("form", { name: "Start a conversation" })).toBe(
      form()
    );
    expectResolvedReferences();
    for (const name of ["name", "email", "message"] as const) {
      const field = name === "message" ? message() : input(name);
      expect(field.required, `${name} must retain native validation`).toBe(
        true
      );
      expect(field.labels?.[0]?.htmlFor).toBe(`contact-${name}`);
    }
    expect(input("name").autocomplete).toBe("name");
    expect(input("email").autocomplete).toBe("email");
    expect(input("email").type).toBe("email");
    expect(message().maxLength).toBe(CONTACT_LIMITS.message);
    expect(status().getAttribute("role")).toBe("status");
    expect(status().getAttribute("aria-live")).toBe("polite");
    expect(form().querySelector("noscript")?.textContent).toContain(
      "JavaScript is needed to send this form."
    );
    expect(
      screen.getByRole("link", { name: "Email me" }).getAttribute("href")
    ).toBe("mailto:contact@example.com");
    expect(
      screen
        .getByRole("link", { name: "Connect on LinkedIn" })
        .getAttribute("href")
    ).toBe(props.linkedin);
    expect(
      screen.getByRole("link", { name: "View GitHub" }).getAttribute("href")
    ).toBe(props.github);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("keeps an unconfigured form disabled without loading third-party scripts", async () => {
    await mount({ siteKey: "" });
    await initialize();
    expect(fields().disabled).toBe(true);
    expect(send().disabled).toBe(true);
    expect(script()).toBeNull();
    expect(status().textContent).toContain("currently unavailable");
    expect(document.body.textContent).not.toContain(
      "Contact experience in progress"
    );
    expect(document.querySelector("[data-contact-challenge]")).toBeNull();
    expect(document.querySelector('a[href^="mailto:"]')).toBeNull();
    expect(
      screen
        .getByRole("link", { name: "Connect on LinkedIn" })
        .getAttribute("href")
    ).toBe(props.linkedin);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("is safe on a page without any contact form", async () => {
    mountHtml("<main><h1>Another page</h1></main>");
    await expect(initialize()).resolves.toBeTypeOf("function");
    expect(script()).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("enables typing while verification is pending, but prevents sending", async () => {
    await mount();
    await initialize();
    expect(fields().disabled).toBe(false);
    expect(form().noValidate).toBe(true);
    expect(send().disabled).toBe(true);
    expect(script()?.async).toBe(true);
    expect(script()?.defer).toBe(true);
    expect(script()?.src).toBe(
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
    );
    fireEvent.error(script()!);
    await flushMicrotasks();
  });

  it("uses an existing explicit provider API without loading another script", async () => {
    const { widget } = await ready();
    expect(script()).toBeNull();
    expect(widget.api.render).toHaveBeenCalledOnce();
    expect(widget.options()).toMatchObject({
      sitekey: props.siteKey,
      action: "contact",
      theme: "dark",
      size: "compact"
    });
    expect(send().disabled).toBe(false);
  });

  it("waits for the external load event before rendering and never calls ready()", async () => {
    await mount();
    await initialize();
    const widget = createTurnstile();
    setApi(widget.api);
    expect(widget.api.render).not.toHaveBeenCalled();
    fireEvent.load(script()!);
    await flushMicrotasks();
    expect(widget.api.render).toHaveBeenCalledOnce();
    expect(widget.api.ready).not.toHaveBeenCalled();
    widget.solve();
    expect(send().disabled).toBe(false);
  });

  it("initializes a mounted form once even if enhancement is requested repeatedly", async () => {
    const { widget, initializeAgain } = await ready();
    initializeAgain();
    initializeAgain();
    expect(widget.api.render).toHaveBeenCalledOnce();
    setFields();
    submit();
    await flushMicrotasks();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("shares one pending script when initialization is requested again", async () => {
    await mount();
    const initializeAgain = await initialize();
    initializeAgain();
    initializeAgain();
    expect(
      document.querySelectorAll('script[src*="turnstile/v0/api.js"]')
    ).toHaveLength(1);
    const widget = createTurnstile();
    setApi(widget.api);
    fireEvent.load(script()!);
    await flushMicrotasks();
    expect(widget.api.render).toHaveBeenCalledOnce();
  });

  it("clears the script deadline after successful loading", async () => {
    await mount();
    vi.useFakeTimers();
    await initialize();
    const widget = createTurnstile();
    setApi(widget.api);
    fireEvent.load(script()!);
    await flushMicrotasks();
    widget.solve();
    await vi.advanceTimersByTimeAsync(16_000);
    expect(retry().hidden).toBe(true);
    expect(send().disabled).toBe(false);
    expect(status().textContent).toContain("Verification complete");
  });

  it.each(["error", "missing API", "render failure"])(
    "exposes retry and preserves typing after %s",
    async (mode) => {
      await mount();
      if (mode === "render failure") {
        const widget = createTurnstile();
        widget.api.render.mockImplementation(() => {
          throw new Error("Unavailable widget.");
        });
        setApi(widget.api);
        await initialize();
      } else {
        await initialize();
        if (mode === "error") fireEvent.error(script()!);
        else fireEvent.load(script()!);
        await flushMicrotasks();
      }
      expect(retry().hidden).toBe(false);
      expect(send().disabled).toBe(true);
      expect(fields().disabled).toBe(false);
      expect(status().textContent).toContain("Verification is unavailable");
      expect(fetcher).not.toHaveBeenCalled();
    }
  );

  it("times out a stalled script and removes it before a retry", async () => {
    await mount();
    vi.useFakeTimers();
    await initialize();
    const stalled = script();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(stalled?.isConnected).toBe(false);
    expect(retry().hidden).toBe(false);
    expect(send().disabled).toBe(true);
    fireEvent.click(retry());
    await flushMicrotasks();
    expect(script()).not.toBeNull();
    expect(script()).not.toBe(stalled);
    fireEvent.error(script()!);
    await flushMicrotasks();
  });

  it("recovers from script failure with one fresh loader and successful token", async () => {
    await mount();
    await initialize();
    fireEvent.error(script()!);
    await flushMicrotasks();
    setFields();
    fireEvent.click(retry());
    await flushMicrotasks();
    const widget = createTurnstile();
    setApi(widget.api);
    fireEvent.load(script()!);
    await flushMicrotasks();
    widget.solve();
    expect(send().disabled).toBe(false);
    expect(retry().hidden).toBe(true);
    expect(message().value).toBe(valid.message);
  });
});

describe("contact keyboard and validation flows", () => {
  it("provides a predictable tab order and skips the hidden trap", async () => {
    await ready();
    const user = userEvent.setup({ document });
    await user.tab();
    expect(document.activeElement).toBe(input("name"));
    await user.tab();
    expect(document.activeElement).toBe(input("email"));
    await user.tab();
    expect(document.activeElement).toBe(message());
    await user.tab();
    expect(document.activeElement).toBe(send());
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("link", { name: "Connect on LinkedIn" })
    );
  });

  it("collects required-field errors and moves keyboard focus into their summary", async () => {
    await ready();
    const user = userEvent.setup({ document });
    send().focus();
    await user.keyboard("{Enter}");
    expect(summary().hidden).toBe(false);
    expect(document.activeElement).toBe(summary());
    expect(within(summary()).getAllByRole("link")).toHaveLength(3);
    for (const node of [input("name"), input("email"), message()]) {
      expect(node.getAttribute("aria-invalid")).toBe("true");
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("moves focus to the field selected in the linked validation summary", async () => {
    await ready();
    submit();
    await userEvent.setup({ document }).click(
      within(summary()).getByRole("link", {
        name: "Enter a valid email address."
      })
    );
    expect(document.activeElement).toBe(input("email"));
  });

  it("removes only the edited field's invalid state while retaining other errors", async () => {
    await ready();
    submit();
    await userEvent
      .setup({ document })
      .type(input("email"), "correct@example.test");
    expect(input("email").hasAttribute("aria-invalid")).toBe(false);
    expect(
      document.querySelector<HTMLElement>("#contact-email-error")!.hidden
    ).toBe(true);
    expect(input("name").getAttribute("aria-invalid")).toBe("true");
    expect(summary().hidden).toBe(false);
  });

  it.each([
    ["name", " ".repeat(4)],
    ["name", "x".repeat(CONTACT_LIMITS.name + 1)],
    ["email", "invalid-address"],
    ["email", "one@example.test,two@example.test"],
    ["message", "short"],
    ["message", "x".repeat(CONTACT_LIMITS.message + 1)]
  ])("rejects invalid %s data before making a request", async (name, value) => {
    await ready();
    setFields();
    if (name === "message") message().value = value;
    else input(name as "name" | "email").value = value;
    submit();
    expect(summary().hidden).toBe(false);
    expect(
      document.querySelector(`#contact-${name}`)?.getAttribute("aria-invalid")
    ).toBe("true");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("normalizes surrounding whitespace and preserves international multiline prose", async () => {
    await ready();
    setFields({
      name: "  Žofie Nováková  ",
      email: " zoe@example.test ",
      message: "\nDobrý den.\n\nRáda bych probrala spolupráci.\n"
    });
    submit();
    await flushMicrotasks();
    const body = JSON.parse(fetcher.mock.calls[0][1].body as string);
    expect(body).toEqual({
      name: "Žofie Nováková",
      email: "zoe@example.test",
      message: "Dobrý den.\n\nRáda bych probrala spolupráci.",
      honeypot: "",
      turnstileToken: "test-verification-token"
    });
  });

  it("accepts exact configured character boundaries", async () => {
    await ready();
    setFields({
      ...valid,
      name: "N".repeat(CONTACT_LIMITS.name),
      message: "M".repeat(CONTACT_LIMITS.message)
    });
    submit();
    await flushMicrotasks();
    expect(fetcher).toHaveBeenCalledOnce();
    expect(status().dataset.state).toBe("success");
  });

  it("enforces the name field's typing limit through real DOM input behavior", async () => {
    await ready();
    await userEvent
      .setup({ document })
      .type(input("name"), "N".repeat(CONTACT_LIMITS.name + 5));
    expect(input("name").value).toHaveLength(CONTACT_LIMITS.name);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not send a valid draft until a verification token exists", async () => {
    await mount();
    const widget = createTurnstile();
    setApi(widget.api);
    await initialize();
    setFields();
    submit();
    expect(fetcher).not.toHaveBeenCalled();
    expect(summary().textContent).toContain("Complete verification");
    const link = within(summary()).getByRole("link", {
      name: "Complete verification."
    });
    fireEvent.click(link);
    expect(document.activeElement).toBe(retry());
    expect(retry().hidden).toBe(false);
  });

  it("keeps the trap outside keyboard navigation and forwards its value for server filtering", async () => {
    await ready();
    const trap = document.querySelector<HTMLInputElement>("#contact-honeypot")!;
    expect(trap.closest("[hidden]")).not.toBeNull();
    expect(trap.closest("[hidden]")?.getAttribute("aria-hidden")).toBe("true");
    expect(trap.tabIndex).toBe(-1);
    expect(document.querySelector('input[name="phone"]')).toBeNull();
    trap.value = "automated-entry";
    setFields();
    submit();
    await flushMicrotasks();
    expect(JSON.parse(fetcher.mock.calls[0][1].body as string).honeypot).toBe(
      "automated-entry"
    );
  });
});

describe("contact delivery and response handling", () => {
  it("posts JSON to the configured endpoint using same-origin credentials", async () => {
    await ready();
    setFields();
    submit();
    await flushMicrotasks();
    expect(fetcher).toHaveBeenCalledWith(
      "https://portfolio.test/api/contact",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        signal: expect.any(AbortSignal)
      })
    );
  });

  it("escapes public configuration and honors its deployment prefix when submitting", async () => {
    const untrustedKey = '" onfocus="alert(1)';
    await mount({ endpoint: "/portfolio/api/contact", siteKey: untrustedKey });
    expect(form().getAttribute("action")).toBe("/portfolio/api/contact");
    expect(form().dataset.siteKey).toBe(untrustedKey);
    expect(form().hasAttribute("onfocus")).toBe(false);
    const widget = createTurnstile();
    setApi(widget.api);
    await initialize();
    widget.solve();
    setFields();
    submit();
    await flushMicrotasks();
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://portfolio.test/portfolio/api/contact"
    );
  });

  it("disables the form, reports busy state, and blocks duplicate requests while pending", async () => {
    await ready();
    const pending = deferred<ReturnType<typeof response>>();
    fetcher.mockReturnValue(pending.promise);
    setFields();
    submit();
    submit();
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fields().disabled).toBe(true);
    expect(send().disabled).toBe(true);
    expect(retry().disabled).toBe(true);
    expect(form().getAttribute("aria-busy")).toBe("true");
    expect(status().dataset.state).toBe("pending");
    expect(send().textContent).toContain("Sending");
    pending.resolve(response({ ok: true, message: "Accepted." }));
    await flushMicrotasks();
    expect(fields().disabled).toBe(false);
    expect(form().hasAttribute("aria-busy")).toBe(false);
  });

  it("clears input and focuses a success announcement only after confirmed success", async () => {
    const { widget } = await ready();
    setFields();
    submit();
    await flushMicrotasks();
    expect(input("name").value).toBe("");
    expect(input("email").value).toBe("");
    expect(message().value).toBe("");
    expect(status().dataset.state).toBe("success");
    expect(document.activeElement).toBe(status());
    expect(widget.api.reset).toHaveBeenCalledWith("test-widget");
    expect(send().disabled).toBe(true);
  });

  it("does not describe a new draft as sent after the previous message succeeded", async () => {
    await ready();
    setFields();
    submit();
    await flushMicrotasks();
    expect(status().dataset.state).toBe("success");
    await userEvent
      .setup({ document })
      .type(message(), "A different inquiry that has not been sent.");
    expect(status().dataset.state).not.toBe("success");
    expect(status().textContent).not.toContain("Your message has been sent");
    expect(message().value).toBe("A different inquiry that has not been sent.");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("cancels the request deadline after a completed response", async () => {
    await ready();
    vi.useFakeTimers();
    setFields();
    submit();
    await flushMicrotasks();
    const signal = fetcher.mock.calls[0][1].signal as AbortSignal;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(signal.aborted).toBe(false);
    expect(status().dataset.state).toBe("success");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each([422, 429, 503])(
    "preserves input and announces an HTTP %s failure",
    async (code) => {
      const { widget } = await ready();
      fetcher.mockResolvedValue(
        response(
          { ok: false, message: `Synthetic ${code} error.` },
          false,
          code
        )
      );
      setFields();
      submit();
      await flushMicrotasks();
      expect(message().value).toBe(valid.message);
      expect(input("email").value).toBe(valid.email);
      expect(summary().hidden).toBe(false);
      expect(summary().textContent).toContain(`Synthetic ${code} error.`);
      expect(status().dataset.state).toBe("error");
      expect(document.activeElement).toBe(summary());
      expect(fields().disabled).toBe(false);
      expect(widget.api.reset).toHaveBeenCalledOnce();
      expect(send().disabled).toBe(true);
    }
  );

  it("renders field-specific server feedback and clears it on a deliberate successful retry", async () => {
    const { widget } = await ready();
    fetcher.mockResolvedValueOnce(
      response(
        {
          ok: false,
          message: "Please check your email.",
          errors: { email: "This mailbox could not be accepted." }
        },
        false
      )
    );
    setFields();
    submit();
    await flushMicrotasks();
    expect(input("email").getAttribute("aria-invalid")).toBe("true");
    widget.solve("replacement-token");
    submit();
    await flushMicrotasks();
    expect(summary().hidden).toBe(true);
    expect(input("email").hasAttribute("aria-invalid")).toBe(false);
    expect(status().dataset.state).toBe("success");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(
      JSON.parse(fetcher.mock.calls[1][1].body as string).turnstileToken
    ).toBe("replacement-token");
  });

  it("links server verification feedback to an accessible retry control", async () => {
    await ready();
    fetcher.mockResolvedValue(
      response(
        {
          ok: false,
          message: "Please verify again.",
          errors: { turnstileToken: "The verification has expired." }
        },
        false
      )
    );
    setFields();
    submit();
    await flushMicrotasks();
    expect(
      document.querySelector<HTMLElement>("#contact-turnstile-error")!.hidden
    ).toBe(false);
    await userEvent.setup({ document }).click(
      within(summary()).getByRole("link", {
        name: "The verification has expired."
      })
    );
    expect(document.activeElement).toBe(retry());
    expect(retry().hidden).toBe(false);
  });

  it("never treats an HTTP failure carrying ok:true as successful delivery", async () => {
    await ready();
    fetcher.mockResolvedValue(
      response({ ok: true, message: "Misleading success." }, false)
    );
    setFields();
    submit();
    await flushMicrotasks();
    expect(status().dataset.state).toBe("error");
    expect(message().value).toBe(valid.message);
  });

  it.each(
    [
      null,
      {},
      [],
      "unexpected",
      { ok: "true", message: "Wrong type" },
      { ok: true },
      { ok: false, message: 123 }
    ].map((body) => ({ body }))
  )(
    "handles malformed provider response %j without losing the draft",
    async ({ body }) => {
      await ready();
      fetcher.mockResolvedValue(response(body));
      setFields();
      submit();
      await flushMicrotasks();
      expect(message().value).toBe(valid.message);
      expect(status().dataset.state).toBe("error");
      expect(summary().textContent).toContain("couldn’t be confirmed");
      expect(fields().disabled).toBe(false);
    }
  );

  it.each(["network", "invalid JSON"])(
    "recovers from %s failure without auto retry",
    async (failure) => {
      await ready();
      if (failure === "network")
        fetcher.mockRejectedValue(new Error("Network unavailable"));
      else
        fetcher.mockResolvedValue({
          ok: true,
          json: vi.fn().mockRejectedValue(new SyntaxError("Invalid JSON"))
        });
      setFields();
      submit();
      await flushMicrotasks();
      expect(fetcher).toHaveBeenCalledOnce();
      expect(message().value).toBe(valid.message);
      expect(status().dataset.state).toBe("error");
      expect(summary().hidden).toBe(false);
      expect(send().disabled).toBe(true);
    }
  );

  it("aborts a stalled request after 25 seconds and retains editable text", async () => {
    await ready();
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    fetcher.mockImplementation(
      (_url, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          signal = init.signal ?? undefined;
          signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Timed out", "AbortError")),
            { once: true }
          );
        })
    );
    setFields();
    submit();
    await vi.advanceTimersByTimeAsync(24_999);
    expect(signal?.aborted).toBe(false);
    expect(fields().disabled).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    await flushMicrotasks();
    expect(signal?.aborted).toBe(true);
    expect(message().value).toBe(valid.message);
    expect(fields().disabled).toBe(false);
    expect(status().dataset.state).toBe("error");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("inserts server error strings as text rather than executable markup", async () => {
    await ready();
    const malicious =
      '<img src=x onerror="window.compromised=true"><script>alert(1)</script>';
    fetcher.mockResolvedValue(
      response(
        {
          ok: false,
          message: malicious,
          errors: { email: malicious, unknownField: malicious }
        },
        false
      )
    );
    setFields();
    submit();
    await flushMicrotasks();
    expect(summary().textContent).toContain(malicious);
    expect(document.querySelector("#contact-email-error")!.textContent).toBe(
      malicious
    );
    expect(summary().querySelectorAll("img,script")).toHaveLength(0);
    expect(within(summary()).getAllByRole("link")).toHaveLength(1);
  });
});

describe("contact verification lifecycle", () => {
  it.each(["expired-callback", "error-callback", "timeout-callback"] as const)(
    "invalidates the token on %s and offers retry",
    async (callback) => {
      const { widget } = await ready();
      setFields();
      widget.options()[callback]();
      expect(send().disabled).toBe(true);
      expect(retry().hidden).toBe(false);
      expect(message().value).toBe(valid.message);
      expect(
        document.querySelector<HTMLElement>("#contact-turnstile-error")!.hidden
      ).toBe(false);
      fireEvent.click(retry());
      await flushMicrotasks();
      expect(widget.api.reset).toHaveBeenCalledOnce();
      widget.solve("refreshed-token");
      expect(send().disabled).toBe(false);
      expect(retry().hidden).toBe(true);
    }
  );

  it("ignores retry clicks while a delivery request is pending", async () => {
    const { widget } = await ready();
    const pending = deferred<ReturnType<typeof response>>();
    fetcher.mockReturnValue(pending.promise);
    setFields();
    submit();
    fireEvent.click(retry());
    expect(widget.api.reset).not.toHaveBeenCalled();
    pending.resolve(response({ ok: true, message: "Accepted" }));
    await flushMicrotasks();
  });

  it("retains pending state if verification expires during an existing request", async () => {
    const { widget } = await ready();
    const pending = deferred<ReturnType<typeof response>>();
    fetcher.mockReturnValue(pending.promise);
    setFields();
    submit();
    widget.options()["expired-callback"]();
    expect(status().dataset.state).toBe("pending");
    expect(send().disabled).toBe(true);
    expect(fetcher).toHaveBeenCalledOnce();
    pending.resolve(response({ ok: true, message: "Accepted." }));
    await flushMicrotasks();
    expect(status().dataset.state).toBe("success");
  });

  it("retains delivery failure feedback after a later verification failure", async () => {
    const { widget } = await ready();
    fetcher.mockResolvedValue(
      response({ ok: false, message: "Not delivered." }, false)
    );
    setFields();
    submit();
    await flushMicrotasks();
    widget.options()["error-callback"]();
    expect(status().dataset.state).toBe("error");
    expect(status().textContent).toContain("Your message hasn’t been sent");
    expect(summary().hidden).toBe(false);
    expect(message().value).toBe(valid.message);
    expect(send().disabled).toBe(true);
  });

  it("retains successful delivery if refreshing verification throws after the response", async () => {
    const { widget } = await ready();
    widget.api.reset.mockImplementationOnce(() => {
      throw new Error("Widget refresh unavailable");
    });
    setFields();
    submit();
    await flushMicrotasks();
    expect(status().dataset.state).toBe("success");
    expect(status().textContent).toContain("Your message has been sent");
    expect(message().value).toBe("");
    expect(retry().hidden).toBe(false);
    expect(send().disabled).toBe(true);
  });

  it("keeps delivery failure feedback when reset supplies a new token immediately", async () => {
    const { widget } = await ready();
    widget.api.reset.mockImplementation(() =>
      widget.solve("immediate-refresh")
    );
    fetcher.mockResolvedValue(
      response({ ok: false, message: "Not delivered." }, false)
    );
    setFields();
    submit();
    await flushMicrotasks();
    expect(status().dataset.state).toBe("error");
    expect(summary().hidden).toBe(false);
    expect(send().disabled).toBe(false);
  });

  it("recovers from a reset exception while preserving a failed draft", async () => {
    const { widget } = await ready();
    widget.api.reset.mockImplementationOnce(() => {
      throw new Error("Reset unavailable");
    });
    fetcher.mockResolvedValue(
      response({ ok: false, message: "Not delivered." }, false)
    );
    setFields();
    submit();
    await flushMicrotasks();
    expect(message().value).toBe(valid.message);
    expect(retry().hidden).toBe(false);
    expect(send().disabled).toBe(true);
    fireEvent.click(retry());
    await flushMicrotasks();
    expect(widget.api.reset).toHaveBeenCalledTimes(2);
  });

  it("invalidates an old token before a deliberate verification reset begins", async () => {
    const { widget } = await ready();
    fetcher.mockResolvedValue(
      response(
        {
          ok: false,
          message: "Verify again.",
          errors: { turnstileToken: "Complete verification again." }
        },
        false
      )
    );
    setFields();
    submit();
    await flushMicrotasks();
    widget.solve("new-before-manual-reset");
    fireEvent.click(
      within(summary()).getByRole("link", {
        name: "Complete verification again."
      })
    );
    fireEvent.click(retry());
    await flushMicrotasks();
    expect(send().disabled).toBe(true);
    expect(widget.api.reset).toHaveBeenCalledTimes(2);
  });

  it.each(["expired-callback", "error-callback", "timeout-callback"] as const)(
    "retains a confirmed delivery announcement after later %s",
    async (callback) => {
      const { widget } = await ready();
      setFields();
      submit();
      await flushMicrotasks();
      widget.options()[callback]();
      expect(status().dataset.state).toBe("success");
      expect(status().textContent).toContain("Your message has been sent");
      expect(message().value).toBe("");
      expect(send().disabled).toBe(true);
      expect(retry().hidden).toBe(false);
    }
  );
});
