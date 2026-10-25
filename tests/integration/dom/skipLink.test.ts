import { experimental_AstroContainer as AstroContainer } from "astro/container";
import userEvent from "@testing-library/user-event";
import { fireEvent, getByRole } from "@testing-library/dom";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import BaseLayout from "../../../src/layouts/BaseLayout.astro";
import { initializeSkipLink } from "../../../src/components/site/SkipLink/skipLink";
import { mountHtml } from "../../helpers/dom";

let html: string;
let cleanup: (() => void) | null;
let marker: DOMRect;
let heading: DOMRect;
let button: DOMRect;
let menuVisible: boolean;
let fontResolve: () => void;
let skipLink: HTMLAnchorElement;
let main: HTMLElement;
let menu: HTMLDetailsElement;
let viewport: EventTarget & {
  offsetTop: number;
  offsetLeft: number;
  width: number;
  height: number;
};
const originalFonts = Object.getOwnPropertyDescriptor(document, "fonts");

function rectangle(
  x: number,
  y: number,
  width: number,
  height: number
): DOMRect {
  return new DOMRect(x, y, width, height);
}

function visible(): boolean {
  return skipLink.dataset.floatingVisible === "true";
}

function mount(): void {
  mountHtml(html);
  skipLink = document.querySelector<HTMLAnchorElement>("[data-skip-link]")!;
  main = document.getElementById("main-content")!;
  menu = document.querySelector<HTMLDetailsElement>("body > header details")!;
}

beforeAll(async () => {
  const container = await AstroContainer.create();
  html = await container.renderToString(BaseLayout, {
    request: new Request("https://portfolio.test/work/"),
    props: { title: "Skip-link integration fixture" },
    slots: {
      default:
        '<h1>Selected engineering work</h1><a href="/resume">Resume after the heading</a>'
    },
    partial: false
  });
});

beforeEach(() => {
  mount();
  cleanup = null;
  marker = rectangle(50, 150, 1, 1);
  heading = rectangle(50, 150, 300, 80);
  button = rectangle(10, 10, 160, 44);
  menuVisible = true;
  vi.stubGlobal("innerHeight", 800);
  vi.stubGlobal("innerWidth", 1024);
  vi.stubGlobal("scrollY", 0);
  viewport = Object.assign(new EventTarget(), {
    offsetTop: 0,
    offsetLeft: 0,
    width: 1024,
    height: 800
  });
  vi.stubGlobal("visualViewport", viewport);
  vi.spyOn(
    main.querySelector<HTMLElement>("[data-main-start-marker]")!,
    "getBoundingClientRect"
  ).mockImplementation(() => marker);
  vi.spyOn(
    main.querySelector<HTMLElement>("h1")!,
    "getBoundingClientRect"
  ).mockImplementation(() => heading);
  vi.spyOn(skipLink, "getBoundingClientRect").mockImplementation(() => button);
  vi.spyOn(menu, "getClientRects").mockImplementation(
    () =>
      Object.assign(menuVisible ? [rectangle(0, 0, 1024, 400)] : [], {
        item: () => null
      }) as unknown as DOMRectList
  );
  const ready = new Promise<void>((resolve) => {
    fontResolve = resolve;
  });
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { ready }
  });
});

afterEach(() => {
  cleanup?.();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalFonts) Object.defineProperty(document, "fonts", originalFonts);
  else Reflect.deleteProperty(document, "fonts");
  document.body.replaceChildren();
});

describe("rendered skip link and real browser events", () => {
  it("retains its accessible name and native same-page target", () => {
    cleanup = initializeSkipLink();
    expect(
      getByRole(document.body, "link", { name: "Jump to main content" })
    ).toBe(skipLink);
    expect(skipLink.hash).toBe("#main-content");
    expect(main.hasAttribute("tabindex")).toBe(false);
    expect(skipLink.hasAttribute("hidden")).toBe(false);
    expect(visible()).toBe(false);
  });

  it("does not cancel native anchor activation or add a tabindex to main", () => {
    cleanup = initializeSkipLink();
    skipLink.focus();
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    skipLink.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(main.hasAttribute("tabindex")).toBe(false);
    expect(document.activeElement).toBe(skipLink);
  });

  it.each([
    {
      label: "marker above the viewport",
      marker: [50, -2, 1, 1],
      expected: true
    },
    {
      label: "marker ending at the top edge",
      marker: [50, -1, 1, 1],
      expected: true
    },
    {
      label: "marker just inside the top edge",
      marker: [50, 0, 1, 1],
      expected: false
    },
    {
      label: "marker at the lower edge",
      marker: [50, 800, 1, 1],
      expected: true
    },
    {
      label: "marker below a short viewport",
      marker: [50, 950, 1, 1],
      expected: true
    },
    {
      label: "marker ending at the left edge",
      marker: [-1, 150, 1, 1],
      expected: true
    },
    {
      label: "marker at the right edge",
      marker: [1024, 150, 1, 1],
      expected: true
    },
    {
      label: "marker in the viewport",
      marker: [50, 150, 1, 1],
      expected: false
    }
  ])(
    "recalculates on scroll with $label",
    ({ marker: coordinates, expected }) => {
      cleanup = initializeSkipLink();
      marker = rectangle(
        coordinates[0],
        coordinates[1],
        coordinates[2],
        coordinates[3]
      );
      fireEvent.scroll(window);
      expect(visible()).toBe(expected);
    }
  );

  it.each([
    { distance: 47, expected: false },
    { distance: 48, expected: true },
    { distance: 100, expected: true }
  ])(
    "applies the floating-link scroll threshold at $distance pixels",
    ({ distance, expected }) => {
      cleanup = initializeSkipLink();
      vi.stubGlobal("scrollY", distance);
      fireEvent.scroll(window);
      expect(visible()).toBe(expected);
      vi.stubGlobal("scrollY", 0);
      fireEvent.scroll(window);
      expect(visible()).toBe(false);
    }
  );

  it.each([
    { height: 43, expected: true },
    { height: 44, expected: false },
    { height: 80, expected: false }
  ])(
    "uses the visible heading portion when only $height pixels remain",
    ({ height, expected }) => {
      heading = rectangle(50, 800 - height, 300, 80);
      cleanup = initializeSkipLink();
      expect(visible()).toBe(expected);
    }
  );

  it("responds when resize moves the main start below the fold", () => {
    cleanup = initializeSkipLink();
    viewport.height = 100;
    fireEvent.resize(window);
    expect(visible()).toBe(true);
    viewport.height = 800;
    fireEvent.resize(window);
    expect(visible()).toBe(false);
  });

  it("uses visual viewport offsets when zoom or a software keyboard shifts the visible area", () => {
    cleanup = initializeSkipLink();
    viewport.offsetTop = 200;
    viewport.height = 300;
    viewport.dispatchEvent(new Event("scroll"));
    expect(visible()).toBe(true);
    viewport.offsetTop = 0;
    viewport.dispatchEvent(new Event("resize"));
    expect(visible()).toBe(false);
  });

  it("uses the visual viewport's horizontal clipping", () => {
    cleanup = initializeSkipLink();
    viewport.offsetLeft = 100;
    viewport.width = 200;
    viewport.dispatchEvent(new Event("scroll"));
    expect(visible()).toBe(true);
  });

  it("falls back to the layout viewport when visualViewport is unavailable", () => {
    vi.stubGlobal("visualViewport", undefined);
    vi.stubGlobal("innerHeight", 100);
    cleanup = initializeSkipLink();
    expect(visible()).toBe(true);
    vi.stubGlobal("innerHeight", 800);
    fireEvent.resize(window);
    expect(visible()).toBe(false);
  });

  it("suppresses the floating link while a visible compact menu is open", () => {
    marker = rectangle(50, -10, 1, 1);
    cleanup = initializeSkipLink();
    expect(visible()).toBe(true);
    menu.open = true;
    fireEvent(menu, new Event("toggle"));
    expect(visible()).toBe(false);
    menu.open = false;
    fireEvent(menu, new Event("toggle"));
    expect(visible()).toBe(true);
  });

  it("reacts to native summary activation without replacing disclosure behavior", async () => {
    marker = rectangle(50, -10, 1, 1);
    cleanup = initializeSkipLink();
    const user = userEvent.setup({ document });
    await user.click(menu.querySelector("summary")!);
    expect(menu.open).toBe(true);
    expect(visible()).toBe(false);
    await user.click(menu.querySelector("summary")!);
    expect(menu.open).toBe(false);
    expect(visible()).toBe(true);
  });

  it("does not suppress the link for an open disclosure hidden by a desktop layout", () => {
    menu.open = true;
    menuVisible = false;
    marker = rectangle(50, -10, 1, 1);
    cleanup = initializeSkipLink();
    expect(visible()).toBe(true);
  });

  it("avoids collisions with visible header controls and recovers when they move", () => {
    marker = rectangle(50, -10, 1, 1);
    const headerLink =
      document.querySelector<HTMLAnchorElement>("body > header a")!;
    let control = rectangle(20, 12, 100, 40);
    vi.spyOn(headerLink, "getBoundingClientRect").mockImplementation(
      () => control
    );
    cleanup = initializeSkipLink();
    expect(visible()).toBe(false);
    control = rectangle(400, 12, 100, 40);
    fireEvent.resize(window);
    expect(visible()).toBe(true);
  });

  it("reserves four pixels around header controls", () => {
    marker = rectangle(50, -10, 1, 1);
    const headerLink =
      document.querySelector<HTMLAnchorElement>("body > header a")!;
    let control = rectangle(173, 12, 100, 40);
    vi.spyOn(headerLink, "getBoundingClientRect").mockImplementation(
      () => control
    );
    cleanup = initializeSkipLink();
    expect(visible()).toBe(false);
    control = rectangle(174, 12, 100, 40);
    fireEvent.resize(window);
    expect(visible()).toBe(true);
  });

  it("ignores zero-sized header controls", () => {
    marker = rectangle(50, -10, 1, 1);
    const headerLink =
      document.querySelector<HTMLAnchorElement>("body > header a")!;
    vi.spyOn(headerLink, "getBoundingClientRect").mockReturnValue(
      rectangle(20, 12, 0, 40)
    );
    cleanup = initializeSkipLink();
    expect(visible()).toBe(true);
  });

  it("ignores links inside closed compact details even if a stale rectangle overlaps", () => {
    marker = rectangle(50, -10, 1, 1);
    const mobileLink = menu.querySelector<HTMLAnchorElement>("a")!;
    vi.spyOn(mobileLink, "getBoundingClientRect").mockReturnValue(
      rectangle(20, 12, 100, 40)
    );
    cleanup = initializeSkipLink();
    expect(visible()).toBe(true);
  });

  it("still considers the summary of a closed menu a visible control", () => {
    marker = rectangle(50, -10, 1, 1);
    vi.spyOn(
      menu.querySelector("summary")!,
      "getBoundingClientRect"
    ).mockReturnValue(rectangle(20, 12, 100, 40));
    cleanup = initializeSkipLink();
    expect(visible()).toBe(false);
  });

  it("refreshes geometry after fonts finish loading", async () => {
    cleanup = initializeSkipLink();
    marker = rectangle(50, 900, 1, 1);
    expect(visible()).toBe(false);
    fontResolve();
    await Promise.resolve();
    expect(visible()).toBe(true);
  });

  it("ignores a late font-ready callback after cleanup", async () => {
    cleanup = initializeSkipLink();
    cleanup?.();
    cleanup = null;
    marker = rectangle(50, 900, 1, 1);
    fontResolve();
    await Promise.resolve();
    expect(visible()).toBe(false);
  });

  it("removes window, visual viewport, and disclosure listeners on cleanup", () => {
    const removeWindow = vi.spyOn(window, "removeEventListener");
    const removeViewport = vi.spyOn(viewport, "removeEventListener");
    const removeMenu = vi.spyOn(menu, "removeEventListener");
    cleanup = initializeSkipLink();
    cleanup?.();
    cleanup = null;
    expect(removeWindow).toHaveBeenCalledWith("scroll", expect.any(Function));
    expect(removeWindow).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(removeViewport).toHaveBeenCalledWith("scroll", expect.any(Function));
    expect(removeViewport).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(removeMenu).toHaveBeenCalledWith("toggle", expect.any(Function));
    marker = rectangle(50, 900, 1, 1);
    fireEvent.scroll(window);
    viewport.dispatchEvent(new Event("resize"));
    fireEvent(menu, new Event("toggle"));
    expect(visible()).toBe(false);
  });

  it("continues to work when a page has no main heading", () => {
    main.querySelector("h1")!.remove();
    cleanup = initializeSkipLink();
    expect(visible()).toBe(false);
    marker = rectangle(50, 900, 1, 1);
    fireEvent.resize(window);
    expect(visible()).toBe(true);
  });

  it("works when no compact disclosure exists", () => {
    menu.remove();
    marker = rectangle(50, 900, 1, 1);
    cleanup = initializeSkipLink();
    expect(visible()).toBe(true);
  });

  it("works without the optional Font Loading API", () => {
    Reflect.deleteProperty(document, "fonts");
    marker = rectangle(50, 900, 1, 1);
    expect(() => {
      cleanup = initializeSkipLink();
    }).not.toThrow();
    expect(visible()).toBe(true);
  });

  it.each(["link", "hash", "target", "marker"])(
    "returns without subscribing when the %s is absent",
    (missing) => {
      if (missing === "link") skipLink.remove();
      if (missing === "hash") skipLink.removeAttribute("href");
      if (missing === "target") main.remove();
      if (missing === "marker")
        main.querySelector("[data-main-start-marker]")!.remove();
      const subscribe = vi.spyOn(window, "addEventListener");
      expect(initializeSkipLink()).toBeNull();
      expect(subscribe).not.toHaveBeenCalled();
    }
  );

  it("returns safely for a detached document without a browsing context", () => {
    const detached = document.implementation.createHTMLDocument("Detached");
    detached.documentElement.innerHTML = document.documentElement.innerHTML;
    expect(initializeSkipLink(detached)).toBeNull();
  });
});
