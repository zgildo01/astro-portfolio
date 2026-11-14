import { describe, expect, it } from "vitest";

import {
  getSkipLinkTargetId,
  shouldShowFloatingSkipLink,
  updateSkipLinkState
} from "../../../../src/components/site/SkipLink/skipLink";

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
