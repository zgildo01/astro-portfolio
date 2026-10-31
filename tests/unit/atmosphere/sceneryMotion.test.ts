import { describe, expect, it } from "vitest";

import {
  parseSceneryMotion,
  resolveSceneryMotion
} from "../../../src/lib/atmosphere/sceneryMotion";

describe("scenery motion preferences", () => {
  it("accepts only the two stored choices", () => {
    expect(parseSceneryMotion("motion")).toBe("motion");
    expect(parseSceneryMotion("still")).toBe("still");
    expect(parseSceneryMotion("auto")).toBeNull();
    expect(parseSceneryMotion(null)).toBeNull();
    expect(resolveSceneryMotion(null, true)).toBe("still");
    expect(resolveSceneryMotion(null, false)).toBe("motion");
    expect(resolveSceneryMotion("motion", true)).toBe("motion");
    expect(resolveSceneryMotion("motion", false)).toBe("motion");
    expect(resolveSceneryMotion("still", true)).toBe("still");
    expect(resolveSceneryMotion("still", false)).toBe("still");
  });
});
