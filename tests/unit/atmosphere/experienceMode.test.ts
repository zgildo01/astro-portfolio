import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

import {
  EXPERIENCE_MODE_STORAGE_KEY,
  experienceModeBootstrap,
  parseExperienceMode,
  resolveExperienceMode
} from "../../../src/lib/atmosphere/experienceMode";

describe("experience mode preferences", () => {
  it("maps the removed Professional preference to Minimal", () => {
    expect(parseExperienceMode("professional")).toBe("minimal");
    expect(resolveExperienceMode(parseExperienceMode("professional"))).toBe(
      "minimal"
    );
  });

  it.each(["immersive", "minimal"] as const)(
    "accepts and retains the explicit %s choice",
    (mode) => {
      expect(parseExperienceMode(mode)).toBe(mode);
      expect(resolveExperienceMode(mode)).toBe(mode);
    }
  );

  it.each([
    null,
    "",
    "Professional",
    "MINIMAL",
    " immersive ",
    "auto",
    "<script>bad()</script>"
  ])("rejects an unknown preference and uses the default: %j", (value) => {
    expect(parseExperienceMode(value)).toBeNull();
    expect(resolveExperienceMode(parseExperienceMode(value))).toBe("immersive");
  });
});

describe("pre-content mode bootstrap", () => {
  it.each([
    [null, "immersive"],
    ["professional", "minimal"],
    ["immersive", "immersive"],
    ["minimal", "minimal"],
    ["MINIMAL", "immersive"],
    ["<script>throw Error()</script>", "immersive"]
  ])(
    "applies stored %j before content using the validated %s mode",
    (stored, expected) => {
      const dataset: Record<string, string> = {};
      const getItem = vi.fn(() => stored);
      runInNewContext(experienceModeBootstrap, {
        window: { localStorage: { getItem } },
        document: { documentElement: { dataset } }
      });
      expect(dataset).toEqual({ experienceMode: expected });
      expect(getItem).toHaveBeenCalledExactlyOnceWith(
        EXPERIENCE_MODE_STORAGE_KEY
      );
    }
  );

  it.each(["access", "read"])(
    "keeps the Immersive fallback if storage %s fails",
    (failure) => {
      const dataset: Record<string, string> = {};
      const localWindow = Object.defineProperty({}, "localStorage", {
        get() {
          if (failure === "access") throw new Error("Storage denied");
          return {
            getItem() {
              throw new Error("Storage read denied");
            }
          };
        }
      });
      expect(() =>
        runInNewContext(experienceModeBootstrap, {
          window: localWindow,
          document: { documentElement: { dataset } }
        })
      ).not.toThrow();
      expect(dataset).toEqual({ experienceMode: "immersive" });
    }
  );
});
