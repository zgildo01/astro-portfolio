import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initializeFrameInterference } from "../../../src/lib/atmosphere/frameInterference";

let cleanup: (() => void) | null = null;
let intersection: IntersectionObserverCallback;
let hidden = false;
const observe = vi.fn();
const disconnect = vi.fn();

function frame(): HTMLElement {
  return document.querySelector<HTMLElement>("[data-frame-interference]")!;
}

function image(): HTMLImageElement {
  return frame().querySelector("img")!;
}

function intersect(target: Element, isIntersecting: boolean): void {
  intersection(
    [{ target, isIntersecting } as IntersectionObserverEntry],
    {} as IntersectionObserver
  );
}

beforeEach(() => {
  document.body.innerHTML = `
    <figure>
      <div data-frame-interference>
        <img src="/flower.webp" alt="A pale flower in an upright glass." />
        <span class="frame-grain" aria-hidden="true"></span>
        <span class="frame-track" aria-hidden="true"></span>
      </div>
      <figcaption>Good people are so hard to find.</figcaption>
    </figure>`;
  hidden = false;
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        intersection = callback;
      }
      observe = observe;
      disconnect = disconnect;
    }
  );
});

afterEach(() => {
  cleanup?.();
  cleanup = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("responsive decorative frame interference", () => {
  it("enhances only intersecting frames and leaves captions and image semantics intact", () => {
    const caption = document.querySelector("figcaption")!;
    cleanup = initializeFrameInterference();
    expect(frame().dataset.frameVisible).toBe("false");
    expect(observe).toHaveBeenCalledWith(frame());
    expect(frame().style.getPropertyValue("--frame-source")).toBe(
      'url("https://portfolio.test/flower.webp")'
    );
    intersect(frame(), true);
    expect(frame().dataset.frameVisible).toBe("true");
    intersect(frame(), false);
    expect(frame().dataset.frameVisible).toBe("false");
    expect(caption.outerHTML).toBe(
      "<figcaption>Good people are so hard to find.</figcaption>"
    );
    expect(document.querySelectorAll("img")).toHaveLength(1);
    expect(image().alt).toBe("A pale flower in an upright glass.");
    for (const layer of frame().querySelectorAll("span")) {
      expect(layer.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("follows responsive currentSrc after load, resize, and back/forward restoration", () => {
    let source = "https://portfolio.test/flower-768.webp";
    vi.spyOn(image(), "currentSrc", "get").mockImplementation(() => source);
    cleanup = initializeFrameInterference();
    expect(frame().style.getPropertyValue("--frame-source")).toContain(
      "flower-768.webp"
    );
    source = "https://portfolio.test/flower-1536.webp";
    image().dispatchEvent(new Event("load"));
    expect(frame().style.getPropertyValue("--frame-source")).toContain(
      "flower-1536.webp"
    );
    source = "https://portfolio.test/flower-480.webp";
    window.dispatchEvent(new Event("resize"));
    expect(frame().style.getPropertyValue("--frame-source")).toContain(
      "flower-480.webp"
    );
    source = "https://portfolio.test/flower-restored.webp";
    window.dispatchEvent(new Event("pageshow"));
    expect(frame().style.getPropertyValue("--frame-source")).toContain(
      "flower-restored.webp"
    );
  });

  it("resets hidden pages and restores only frames still in view", () => {
    cleanup = initializeFrameInterference();
    intersect(frame(), true);
    hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(frame().dataset.frameVisible).toBe("false");
    hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(frame().dataset.frameVisible).toBe("true");
    window.dispatchEvent(new Event("pagehide"));
    expect(frame().dataset.frameVisible).toBe("false");
    window.dispatchEvent(new Event("pageshow"));
    expect(frame().dataset.frameVisible).toBe("true");
    intersect(frame(), false);
    window.dispatchEvent(new Event("pageshow"));
    expect(frame().dataset.frameVisible).toBe("false");
  });

  it("initializes a background page without activating the frame", () => {
    hidden = true;
    cleanup = initializeFrameInterference();
    intersect(frame(), true);
    expect(frame().dataset.frameVisible).toBe("false");
  });

  it("keeps separate frames independent and tolerates an image not yet available", () => {
    document.body.insertAdjacentHTML(
      "beforeend",
      '<div data-frame-interference id="second"></div>'
    );
    const second = document.getElementById("second")!;
    cleanup = initializeFrameInterference();
    intersect(frame(), true);
    expect(second.dataset.frameVisible).toBe("false");
    intersect(second, true);
    expect(frame().dataset.frameVisible).toBe("true");
    expect(second.dataset.frameVisible).toBe("true");
    expect(second.style.getPropertyValue("--frame-source")).toBe("");
  });

  it("clears a stale tracking source if its image source is removed", () => {
    cleanup = initializeFrameInterference();
    image().removeAttribute("src");
    image().dispatchEvent(new Event("load"));
    expect(frame().style.getPropertyValue("--frame-source")).toBe("");
  });

  it("initializes once and fully removes its subscriptions and decorative state", () => {
    const removeImage = vi.spyOn(image(), "removeEventListener");
    const removeDocument = vi.spyOn(document, "removeEventListener");
    const removeWindow = vi.spyOn(window, "removeEventListener");
    cleanup = initializeFrameInterference();
    expect(initializeFrameInterference()).toBe(cleanup);
    expect(observe).toHaveBeenCalledTimes(1);
    intersect(frame(), true);
    cleanup?.();
    cleanup = null;
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(frame().hasAttribute("data-frame-visible")).toBe(false);
    expect(frame().style.getPropertyValue("--frame-source")).toBe("");
    expect(removeImage).toHaveBeenCalledWith("load", expect.any(Function));
    expect(removeDocument).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function)
    );
    for (const event of ["resize", "pagehide", "pageshow"]) {
      expect(removeWindow).toHaveBeenCalledWith(event, expect.any(Function));
      window.dispatchEvent(new Event(event));
    }
    image().dispatchEvent(new Event("load"));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(frame().hasAttribute("data-frame-visible")).toBe(false);
    expect(frame().style.getPropertyValue("--frame-source")).toBe("");
    cleanup = initializeFrameInterference();
    expect(observe).toHaveBeenCalledTimes(2);
  });

  it("leaves clean still frames intact when observation or a browsing context is unavailable", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    expect(initializeFrameInterference()).toBeNull();
    expect(frame().hasAttribute("data-frame-visible")).toBe(false);
    const detached = document.implementation.createHTMLDocument("Detached");
    detached.body.innerHTML = "<div data-frame-interference></div>";
    expect(initializeFrameInterference(detached)).toBeNull();
    document.body.replaceChildren();
    expect(initializeFrameInterference()).toBeNull();
  });
});
