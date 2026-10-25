import {
  validateContactFields,
  type ContactFieldErrors,
  type ContactResponse
} from "../../lib/contact/validation";

interface TurnstileOptions {
  sitekey: string;
  action: string;
  theme: string;
  size: string;
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
  "timeout-callback": () => void;
}

interface Turnstile {
  render(container: HTMLElement, options: TurnstileOptions): string;
  reset(widgetId: string): void;
}

type ContactWindow = Window & { turnstile?: Turnstile };
const fieldNames = ["name", "email", "message"] as const;
let widgetLoader: Promise<Turnstile> | undefined;

function loadTurnstile(): Promise<Turnstile> {
  const contactWindow = window as ContactWindow;
  if (contactWindow.turnstile) return Promise.resolve(contactWindow.turnstile);
  if (widgetLoader) return widgetLoader;

  widgetLoader = new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement("script");
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    const timer = window.setTimeout(fail, 15_000);

    function fail(): void {
      window.clearTimeout(timer);
      script.remove();
      widgetLoader = undefined;
      reject(new Error("Verification is unavailable."));
    }

    script.addEventListener("error", fail, { once: true });
    script.addEventListener(
      "load",
      () => {
        const api = contactWindow.turnstile;
        if (!api) {
          fail();
          return;
        }
        // The load event makes the explicit API available. Turnstile rejects
        // ready() when its script was loaded with async or defer.
        window.clearTimeout(timer);
        resolve(api);
      },
      { once: true }
    );
    document.head.append(script);
  });
  return widgetLoader;
}

function isContactResponse(value: unknown): value is ContactResponse {
  if (!value || typeof value !== "object") return false;
  return (
    "ok" in value &&
    typeof value.ok === "boolean" &&
    "message" in value &&
    typeof value.message === "string"
  );
}

function initializeContactForm(form: HTMLFormElement): void {
  if (form.dataset.initialized) return;
  form.dataset.initialized = "true";

  const siteKey = form.dataset.siteKey;
  if (!siteKey) return;

  const fields = form.querySelector<HTMLFieldSetElement>(
    "[data-contact-fields]"
  )!;
  const button = form.querySelector<HTMLButtonElement>(
    "[data-contact-submit]"
  )!;
  const buttonLabel = button.querySelector<HTMLElement>(
    "[data-contact-submit-label]"
  )!;
  const status = form.querySelector<HTMLElement>("[data-contact-status]")!;
  const summary = form.querySelector<HTMLElement>("#contact-errors")!;
  const errorMessage = form.querySelector<HTMLElement>(
    "[data-contact-error-message]"
  )!;
  const errorList = form.querySelector<HTMLUListElement>(
    "[data-contact-error-list]"
  )!;
  const challenge = form.querySelector<HTMLElement>(
    "[data-contact-challenge]"
  )!;
  const challengeError = form.querySelector<HTMLElement>(
    "#contact-turnstile-error"
  )!;
  const retry = form.querySelector<HTMLButtonElement>("[data-contact-retry]")!;
  const inputs = {
    name: form.querySelector<HTMLInputElement>("#contact-name")!,
    email: form.querySelector<HTMLInputElement>("#contact-email")!,
    message: form.querySelector<HTMLTextAreaElement>("#contact-message")!
  };

  let token = "";
  let sending = false;
  let widgetId: string | undefined;
  let api: Turnstile | undefined;

  form.noValidate = true;
  fields.disabled = false;

  function announce(message: string, state = "idle"): void {
    status.textContent = message;
    status.dataset.state = state;
  }

  function updateButton(): void {
    button.disabled = sending || !token;
    buttonLabel.textContent = sending ? "Sending…" : "Send message";
  }

  function clearErrors(): void {
    summary.hidden = true;
    errorMessage.textContent = "";
    errorList.replaceChildren();
    for (const name of fieldNames) {
      inputs[name].removeAttribute("aria-invalid");
      const error = form.querySelector<HTMLElement>(`#contact-${name}-error`)!;
      error.hidden = true;
      error.textContent = "";
    }
  }

  function showErrors(message: string, errors?: ContactFieldErrors): void {
    errorMessage.textContent = message;
    for (const name of [...fieldNames, "turnstileToken"] as const) {
      const text = errors?.[name];
      if (typeof text !== "string") continue;
      const link = document.createElement("a");
      const item = document.createElement("li");
      link.textContent = text;
      const target =
        name === "turnstileToken" ? "contact-verification" : `contact-${name}`;
      link.href = `#${target}`;
      link.addEventListener("click", (event) => {
        event.preventDefault();
        if (name === "turnstileToken") {
          challenge.scrollIntoView({ block: "center" });
          retry.hidden = false;
          retry.focus();
        } else inputs[name].focus();
      });
      item.append(link);
      errorList.append(item);
      if (name !== "turnstileToken") {
        inputs[name].setAttribute("aria-invalid", "true");
        const error = form.querySelector<HTMLElement>(
          `#contact-${name}-error`
        )!;
        error.textContent = text;
        error.hidden = false;
      }
    }
    errorList.hidden = errorList.children.length === 0;
    summary.hidden = false;
    summary.focus();
  }

  function verificationFailed(message: string): void {
    token = "";
    challengeError.textContent = message;
    challengeError.hidden = false;
    retry.hidden = false;
    updateButton();
    if (
      !sending &&
      !["success", "error"].includes(status.dataset.state ?? "")
    ) {
      announce(
        `${message} Your message is still here. You can also use the contact links below.`
      );
    }
  }

  async function prepareVerification(): Promise<void> {
    token = "";
    updateButton();
    retry.hidden = true;
    challengeError.hidden = true;
    announce("Complete the verification before sending your message.");
    try {
      api = await loadTurnstile();
      if (widgetId !== undefined) {
        api.reset(widgetId);
        return;
      }
      widgetId = api.render(challenge, {
        sitekey: siteKey!,
        action: "contact",
        theme: "dark",
        size: "compact",
        callback: (value) => {
          token = value;
          challengeError.hidden = true;
          retry.hidden = true;
          updateButton();
          if (
            !sending &&
            !["success", "error"].includes(status.dataset.state ?? "")
          ) {
            announce("Verification complete. Your message is ready to send.");
          }
        },
        "expired-callback": () =>
          verificationFailed("Verification expired. Please verify again."),
        "error-callback": () =>
          verificationFailed("Verification is unavailable. Please try again."),
        "timeout-callback": () =>
          verificationFailed("Verification timed out. Please try again.")
      });
    } catch {
      verificationFailed("Verification is unavailable. Please try again.");
    }
  }

  retry.addEventListener("click", () => {
    if (!sending) void prepareVerification();
  });

  for (const name of fieldNames) {
    inputs[name].addEventListener("input", () => {
      if (status.dataset.state === "success") {
        announce(
          token
            ? "Verification complete. Your message is ready to send."
            : "Complete the verification before sending your message."
        );
      }
      if (inputs[name].getAttribute("aria-invalid") !== "true") return;
      inputs[name].removeAttribute("aria-invalid");
      form.querySelector<HTMLElement>(`#contact-${name}-error`)!.hidden = true;
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (sending) return;
    clearErrors();
    const result = validateContactFields({
      name: inputs.name.value,
      email: inputs.email.value,
      message: inputs.message.value
    });
    if (!result.ok) {
      showErrors("Please check the highlighted fields.", result.errors);
      return;
    }
    if (!token) {
      verificationFailed("Please complete verification before sending.");
      showErrors("Please complete verification before sending.", {
        turnstileToken: "Complete verification."
      });
      return;
    }

    const submission = {
      ...result.value,
      honeypot:
        form.querySelector<HTMLInputElement>("#contact-honeypot")!.value,
      turnstileToken: token
    };
    sending = true;
    fields.disabled = true;
    retry.disabled = true;
    form.setAttribute("aria-busy", "true");
    updateButton();
    announce("Sending your message…", "pending");
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 25_000);

    try {
      const response = await fetch(form.action, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(submission),
        signal: controller.signal
      });
      const value: unknown = await response.json();
      if (!isContactResponse(value)) throw new Error("Unexpected response.");
      if (!response.ok || !value.ok) {
        const errors = !value.ok ? value.errors : undefined;
        showErrors(value.message, errors);
        announce(
          "Your message hasn’t been sent. Your text is still here.",
          "error"
        );
        if (errors?.turnstileToken) {
          challengeError.textContent = errors.turnstileToken;
          challengeError.hidden = false;
        }
      } else {
        form.reset();
        announce(
          "Your message has been sent. Thank you for getting in touch.",
          "success"
        );
        status.setAttribute("tabindex", "-1");
        status.focus();
      }
    } catch {
      showErrors(
        "Your message couldn’t be confirmed. Your text is still here. Please try again, or use the contact links below."
      );
      announce(
        "Delivery couldn’t be confirmed. Your text is still here.",
        "error"
      );
    } finally {
      window.clearTimeout(timer);
      token = "";
      sending = false;
      fields.disabled = false;
      retry.disabled = false;
      form.removeAttribute("aria-busy");
      updateButton();
      try {
        if (widgetId !== undefined) api?.reset(widgetId);
      } catch {
        verificationFailed("Verification is unavailable. Please try again.");
      }
    }
  });

  void prepareVerification();
}

export function initializeContactForms(): void {
  for (const form of document.querySelectorAll<HTMLFormElement>(
    "form[data-contact-form]"
  )) {
    initializeContactForm(form);
  }
}
