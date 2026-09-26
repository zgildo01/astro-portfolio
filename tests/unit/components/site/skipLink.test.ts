import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getMainOutOfViewValue,
  getSkipLinkTargetId,
  initializeSkipLink,
  updateSkipLinkState
} from "../../../../src/components/site/SkipLink/skipLink";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getSkipLinkTargetId", () => {
  it("extracts an element ID from a URL fragment", () => {
    expect(getSkipLinkTargetId("#main-content")).toBe("main-content");
  });

  it.each(["", "#", "/main-content"])(
    "returns null for the invalid fragment %j",
    (hash) => {
      expect(getSkipLinkTargetId(hash)).toBeNull();
    }
  );
});

describe("getMainOutOfViewValue", () => {
  it.each([
    [true, "false"],
    [false, "true"]
  ] as const)(
    "maps isIntersecting=%s to %s",
    (isIntersecting, expectedValue) => {
      expect(getMainOutOfViewValue(isIntersecting)).toBe(expectedValue);
    }
  );
});

describe("updateSkipLinkState", () => {
  it("records that the main content is outside the viewport", () => {
    const skipLink = {
      dataset: {}
    } as Pick<HTMLAnchorElement, "dataset">;

    updateSkipLinkState(skipLink, false);

    expect(skipLink.dataset.mainOutOfView).toBe("true");
    expect(skipLink.dataset.enhanced).toBe("true");
  });

  it("records that the main content intersects the viewport", () => {
    const skipLink = {
      dataset: {}
    } as Pick<HTMLAnchorElement, "dataset">;

    updateSkipLinkState(skipLink, true);

    expect(skipLink.dataset.mainOutOfView).toBe("false");
    expect(skipLink.dataset.enhanced).toBe("true");
  });
});

describe("initializeSkipLink", () => {
  it("observes the start of main rather than the entire main region", () => {
    const skipLink = {
      hash: "#main-content",
      dataset: {}
    } as Pick<HTMLAnchorElement, "hash" | "dataset">;
    const marker = {} as Element;
    const mainContent = {
      querySelector: vi.fn((selector: string) =>
        selector === "[data-main-start-marker]" ? marker : null
      )
    } as unknown as HTMLElement;
    const root = {
      querySelector: vi.fn(() => skipLink),
      getElementById: vi.fn(() => mainContent)
    } as unknown as Document;
    const observe = vi.fn();
    let onIntersection: IntersectionObserverCallback | undefined;
    const observer = { observe } as unknown as IntersectionObserver;
    const observerConstructor = vi.fn(function (
      callback: IntersectionObserverCallback
    ) {
      onIntersection = callback;
      return observer;
    });

    vi.stubGlobal("IntersectionObserver", observerConstructor);

    expect(initializeSkipLink(root)).toBe(observer);
    expect(root.getElementById).toHaveBeenCalledWith("main-content");
    expect(mainContent.querySelector).toHaveBeenCalledWith(
      "[data-main-start-marker]"
    );
    expect(observe).toHaveBeenCalledExactlyOnceWith(marker);

    onIntersection?.(
      [{ isIntersecting: false } as IntersectionObserverEntry],
      observer
    );

    expect(skipLink.dataset).toEqual({
      mainOutOfView: "true",
      enhanced: "true"
    });
  });

  it("leaves the link visible when the start marker is missing", () => {
    const skipLink = {
      hash: "#main-content",
      dataset: {}
    } as Pick<HTMLAnchorElement, "hash" | "dataset">;
    const mainContent = {
      querySelector: vi.fn(() => null)
    } as unknown as HTMLElement;
    const root = {
      querySelector: vi.fn(() => skipLink),
      getElementById: vi.fn(() => mainContent)
    } as unknown as Document;
    const observerConstructor = vi.fn();

    vi.stubGlobal("IntersectionObserver", observerConstructor);

    expect(initializeSkipLink(root)).toBeNull();
    expect(observerConstructor).not.toHaveBeenCalled();
    expect(skipLink.dataset).toEqual({});
  });
});
