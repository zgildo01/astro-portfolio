import { describe, expect, it } from "vitest";

import {
  getMainOutOfViewValue,
  getSkipLinkTargetId,
  updateSkipLinkState
} from "../../../../src/components/site/SkipLink/skipLink";

describe("getSkipLinkTargetId", () => {
  it("extracts an element ID from a URL fragment", () => {
    expect(getSkipLinkTargetId("#main-content")).toBe(
      "main-content"
    );
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
      expect(
        getMainOutOfViewValue(isIntersecting)
      ).toBe(expectedValue);
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