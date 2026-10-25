import { vi } from "vitest";

/** Mount rendered Astro HTML without executing scripts or fetching resources. */
export function mountHtml(html: string): void {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  for (const attribute of [...document.documentElement.attributes]) {
    document.documentElement.removeAttribute(attribute.name);
  }
  for (const attribute of [...parsed.documentElement.attributes]) {
    document.documentElement.setAttribute(attribute.name, attribute.value);
  }
  // Preserve head/body identities for Testing Library's document-bound queries.
  for (const [target, source] of [
    [document.head, parsed.head],
    [document.body, parsed.body]
  ] as const) {
    for (const attribute of [...target.attributes]) {
      target.removeAttribute(attribute.name);
    }
    for (const attribute of [...source.attributes]) {
      target.setAttribute(attribute.name, attribute.value);
    }
    target.innerHTML = source.innerHTML;
  }
}

export async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 8; index++) await Promise.resolve();
}

export function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

/** Only geometry is simulated: jsdom does not perform browser layout. */
export function setRect(element: Element, rectangle: Partial<DOMRect>): void {
  const left = rectangle.left ?? rectangle.x ?? 0;
  const top = rectangle.top ?? rectangle.y ?? 0;
  const width = rectangle.width ?? 0;
  const height = rectangle.height ?? 0;
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
    ...rectangle
  });
}
