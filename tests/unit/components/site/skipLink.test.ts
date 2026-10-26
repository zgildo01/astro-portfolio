import { describe, expect, it, vi } from "vitest";

import {
  getSkipLinkTargetId,
  initializeSkipLink,
  shouldShowFloatingSkipLink,
  updateSkipLinkState
} from "../../../../src/components/site/SkipLink/skipLink";

function rectangle(
  left: number,
  top: number,
  right: number,
  bottom: number
): DOMRect {
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top
  } as DOMRect;
}

function createBrowser() {
  const state = {
    scrollY: 0,
    markerTop: 250,
    markerBottom: 251,
    controlLeft: 50,
    controlRight: 100,
    menuOpen: false
  };
  const viewListeners = new Map<string, () => void>();
  const menuListeners = new Map<string, () => void>();
  const rootListeners = new Map<string, () => void>();
  const skipLink = {
    hash: "#main-content",
    dataset: {} as DOMStringMap,
    getBoundingClientRect: () => rectangle(170, 148, 280, 192)
  } as HTMLAnchorElement;
  const marker = {
    getBoundingClientRect: () =>
      rectangle(20, state.markerTop, 21, state.markerBottom)
  } as HTMLElement;
  const control = {
    tagName: "A",
    closest: () => null,
    getBoundingClientRect: () =>
      rectangle(state.controlLeft, 145, state.controlRight, 189)
  } as unknown as HTMLElement;
  const closedMenuLink = {
    tagName: "A",
    closest: () => ({ open: false }),
    getBoundingClientRect: () => rectangle(170, 148, 280, 192)
  } as unknown as HTMLElement;
  const menu = {
    get open() {
      return state.menuOpen;
    },
    getClientRects: () => ({ length: 1 }),
    addEventListener: vi.fn((name: string, listener: () => void) => {
      menuListeners.set(name, listener);
    }),
    removeEventListener: vi.fn()
  } as unknown as HTMLDetailsElement;
  const header = {
    querySelector: () => menu
  } as unknown as HTMLElement;
  const main = {
    querySelector: (selector: string) =>
      selector === "[data-main-start-marker]" ? marker : null
  } as unknown as HTMLElement;
  const view = {
    innerHeight: 200,
    get scrollY() {
      return state.scrollY;
    },
    addEventListener: vi.fn((name: string, listener: () => void) => {
      viewListeners.set(name, listener);
    }),
    removeEventListener: vi.fn()
  } as unknown as Window;
  const root = {
    defaultView: view,
    querySelector: (selector: string) => {
      if (selector === "a[data-skip-link]") return skipLink;
      if (selector === "body > header") return header;
      return null;
    },
    querySelectorAll: () => [skipLink, control, closedMenuLink],
    addEventListener: vi.fn((name: string, listener: () => void) => {
      rootListeners.set(name, listener);
    }),
    removeEventListener: vi.fn(),
    getElementById: (id: string) => (id === "main-content" ? main : null)
  } as unknown as Document;

  return {
    root,
    state,
    skipLink,
    view,
    menu,
    emitView: (name: string) => viewListeners.get(name)?.(),
    emitMenu: (name: string) => menuListeners.get(name)?.(),
    emitRoot: (name: string) => rootListeners.get(name)?.()
  };
}

describe("getSkipLinkTargetId", () => {
  it("extracts a main element ID from a URL fragment", () => {
    expect(getSkipLinkTargetId("#main-content")).toBe("main-content");
  });

  it.each(["", "#", "/main-content"])(
    "rejects the invalid fragment %j",
    (hash) => {
      expect(getSkipLinkTargetId(hash)).toBeNull();
    }
  );
});

describe("shouldShowFloatingSkipLink", () => {
  const visibleMarker = {
    markerTop: 100,
    markerRight: 21,
    markerBottom: 101,
    markerLeft: 20,
    headingTop: null,
    headingBottom: null,
    viewportTop: 0,
    viewportRight: 200,
    viewportBottom: 200,
    viewportLeft: 0,
    scrollDistance: 0,
    menuOpen: false,
    overlapsInteractiveControl: false
  };

  it("shows when zoom leaves main below the viewport at page load", () => {
    expect(
      shouldShowFloatingSkipLink({
        ...visibleMarker,
        markerTop: 250,
        markerBottom: 251
      })
    ).toBe(true);
  });

  it("reveals the link when only a sliver of the main heading is visible", () => {
    expect(
      shouldShowFloatingSkipLink({
        ...visibleMarker,
        headingTop: 199,
        headingBottom: 295
      })
    ).toBe(true);
    expect(
      shouldShowFloatingSkipLink({
        ...visibleMarker,
        headingTop: 150,
        headingBottom: 250
      })
    ).toBe(false);
  });

  it("shows after main passes above the viewport or after a modest scroll", () => {
    expect(
      shouldShowFloatingSkipLink({
        ...visibleMarker,
        markerTop: -2,
        markerBottom: -1
      })
    ).toBe(true);
    expect(
      shouldShowFloatingSkipLink({ ...visibleMarker, scrollDistance: 48 })
    ).toBe(true);
    expect(
      shouldShowFloatingSkipLink({ ...visibleMarker, scrollDistance: 47 })
    ).toBe(false);
    expect(
      shouldShowFloatingSkipLink({
        ...visibleMarker,
        markerLeft: 220,
        markerRight: 221
      })
    ).toBe(true);
  });

  it("stays hidden while the menu is open or the button covers an interactive control", () => {
    expect(
      shouldShowFloatingSkipLink({
        ...visibleMarker,
        markerTop: 250,
        markerBottom: 251,
        menuOpen: true
      })
    ).toBe(false);
    expect(
      shouldShowFloatingSkipLink({
        ...visibleMarker,
        markerTop: 250,
        markerBottom: 251,
        overlapsInteractiveControl: true
      })
    ).toBe(false);
  });
});

describe("updateSkipLinkState", () => {
  it("records the pointer-visible state without changing the native anchor", () => {
    const skipLink = { dataset: {} } as Pick<HTMLAnchorElement, "dataset">;

    updateSkipLinkState(skipLink, true);
    expect(skipLink.dataset.floatingVisible).toBe("true");

    updateSkipLinkState(skipLink, false);
    expect(skipLink.dataset.floatingVisible).toBe("false");
  });
});

describe("initializeSkipLink", () => {
  it("updates on scroll, resize, and menu changes while avoiding header overlap", () => {
    const browser = createBrowser();
    const cleanup = initializeSkipLink(browser.root);

    expect(cleanup).toBeTypeOf("function");
    expect(browser.skipLink.dataset.floatingVisible).toBe("true");

    browser.state.controlLeft = 180;
    browser.state.controlRight = 240;
    browser.emitRoot("focusin");
    expect(browser.skipLink.dataset.floatingVisible).toBe("false");

    browser.state.controlLeft = 50;
    browser.state.controlRight = 100;
    browser.state.menuOpen = true;
    browser.emitMenu("toggle");
    expect(browser.skipLink.dataset.floatingVisible).toBe("false");

    browser.state.menuOpen = false;
    browser.state.markerTop = 100;
    browser.state.markerBottom = 101;
    browser.emitMenu("toggle");
    expect(browser.skipLink.dataset.floatingVisible).toBe("false");

    browser.state.scrollY = 48;
    browser.emitView("scroll");
    expect(browser.skipLink.dataset.floatingVisible).toBe("true");

    cleanup?.();
    expect(browser.view.removeEventListener).toHaveBeenCalled();
    expect(browser.menu.removeEventListener).toHaveBeenCalled();
  });

  it("leaves the link visible as a fallback when its target is unavailable", () => {
    const browser = createBrowser();
    browser.skipLink.hash = "#missing";

    expect(initializeSkipLink(browser.root)).toBeNull();
    expect(browser.skipLink.dataset).toEqual({});
  });
});
