import { vi } from "vitest";

export interface TestTurnstileOptions {
  sitekey: string;
  action: string;
  theme: string;
  size: string;
  callback(token: string): void;
  "expired-callback"(): void;
  "error-callback"(): void;
  "timeout-callback"(): void;
}

export function createTurnstile() {
  let options: TestTurnstileOptions | undefined;
  const api = {
    render: vi.fn((_container: HTMLElement, value: TestTurnstileOptions) => {
      options = value;
      return "test-widget";
    }),
    reset: vi.fn(),
    ready: vi.fn((callback: () => void) => {
      const script = document.querySelector<HTMLScriptElement>(
        'script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]'
      );
      if (script?.async || script?.defer) {
        throw new Error("Turnstile ready() rejects async/defer scripts.");
      }
      callback();
    })
  };

  return {
    api,
    options: () => {
      if (!options) throw new Error("Verification has not been rendered.");
      return options;
    },
    solve: (token = "test-verification-token") => {
      if (!options) throw new Error("Verification has not been rendered.");
      options.callback(token);
    }
  };
}
