import { describe, expect, it } from "vitest";

import {
  initializeSceneryMotion,
  parseSceneryMotion,
  resolveSceneryMotion,
  SCENERY_MOTION_STORAGE_KEY
} from "../../../src/lib/atmosphere/sceneryMotion";

function browser(options: { reduced?: boolean; stored?: string } = {}) {
  const state = {
    reduced: options.reduced ?? false,
    hidden: false,
    denyStorage: false,
    hasScenery: true
  };
  const storage = new Map<string, string>();
  if (options.stored !== undefined) {
    storage.set(SCENERY_MOTION_STORAGE_KEY, options.stored);
  }
  function target() {
    const listeners = new Map<string, EventListener>();
    return {
      addEventListener: (name: string, listener: EventListener) => {
        listeners.set(name, listener);
      },
      removeEventListener: (name: string) => {
        listeners.delete(name);
      },
      emit: (name: string, event = {}): void => {
        listeners.get(name)?.(event as Event);
      }
    };
  }
  const media = {
    ...target(),
    get matches() {
      return state.reduced;
    }
  };
  const view = {
    ...target(),
    matchMedia: () => media,
    get localStorage() {
      if (state.denyStorage) throw new Error("Storage unavailable");
      return {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value)
      };
    }
  };
  const inputs = ["motion", "still"].map((value) => ({
    ...target(),
    value,
    checked: value === "still"
  }));
  const control = { hidden: true };
  const root = {
    ...target(),
    defaultView: view,
    documentElement: {
      dataset: { sceneryMotion: "still", sceneryPaused: "true" }
    },
    get hidden() {
      return state.hidden;
    },
    querySelector: () => (state.hasScenery ? {} : null),
    querySelectorAll: (selector: string) =>
      selector === "[data-scenery-control]" ? [control] : inputs
  };

  return {
    root,
    state,
    media,
    view,
    inputs,
    control,
    storage,
    start: () => initializeSceneryMotion(root as unknown as Document),
    select: (value: string) => {
      const input = inputs.find((item) => item.value === value)!;
      input.checked = true;
      input.emit("change", { currentTarget: input });
    }
  };
}

describe("scenery motion preferences", () => {
  it("accepts only the two stored choices", () => {
    expect(parseSceneryMotion("motion")).toBe("motion");
    expect(parseSceneryMotion("still")).toBe("still");
    expect(parseSceneryMotion("auto")).toBeNull();
    expect(parseSceneryMotion(null)).toBeNull();
    expect(resolveSceneryMotion(null, true)).toBe("still");
    expect(resolveSceneryMotion(null, false)).toBe("motion");
    expect(resolveSceneryMotion("motion", true)).toBe("motion");
  });

  it("uses the OS preference before revealing the native controls", () => {
    const page = browser({ reduced: true });
    page.start();

    expect(page.root.documentElement.dataset.sceneryMotion).toBe("still");
    expect(page.inputs.map((input) => input.checked)).toEqual([false, true]);
    expect(page.control.hidden).toBe(false);

    page.state.reduced = false;
    page.media.emit("change");
    expect(page.root.documentElement.dataset.sceneryMotion).toBe("motion");
    expect(page.inputs.map((input) => input.checked)).toEqual([true, false]);
  });

  it("persists a deliberate choice across pages and later OS changes", () => {
    const page = browser();
    page.start();
    page.select("still");
    expect(page.storage.get(SCENERY_MOTION_STORAGE_KEY)).toBe("still");

    page.state.reduced = true;
    page.media.emit("change");
    page.state.reduced = false;
    page.media.emit("change");
    expect(page.root.documentElement.dataset.sceneryMotion).toBe("still");

    const nextPage = browser({
      stored: page.storage.get(SCENERY_MOTION_STORAGE_KEY)
    });
    nextPage.start();
    expect(nextPage.root.documentElement.dataset.sceneryMotion).toBe("still");
  });

  it("allows an explicit Motion selection with reduced motion enabled", () => {
    const page = browser({ reduced: true });
    page.start();
    page.select("motion");
    expect(page.root.documentElement.dataset.sceneryMotion).toBe("motion");
    expect(page.storage.get(SCENERY_MOTION_STORAGE_KEY)).toBe("motion");
  });

  it("pauses a hidden page and resumes without losing Still or Motion", () => {
    const page = browser();
    page.start();
    page.state.hidden = true;
    page.root.emit("visibilitychange");
    expect(page.root.documentElement.dataset.sceneryPaused).toBe("true");

    page.select("still");
    page.state.hidden = false;
    page.root.emit("visibilitychange");
    expect(page.root.documentElement.dataset.sceneryPaused).toBe("false");
    expect(page.root.documentElement.dataset.sceneryMotion).toBe("still");
  });

  it("works with denied storage and ignores invalid saved values", () => {
    const page = browser({ reduced: true, stored: "unrecognized" });
    page.start();
    expect(page.root.documentElement.dataset.sceneryMotion).toBe("still");

    const restrictedPage = browser({ reduced: true });
    restrictedPage.state.denyStorage = true;
    expect(() => restrictedPage.start()).not.toThrow();
    expect(() => restrictedPage.select("motion")).not.toThrow();
    expect(restrictedPage.root.documentElement.dataset.sceneryMotion).toBe(
      "motion"
    );
  });

  it("syncs same-origin tabs and restores current storage after back navigation", () => {
    const page = browser({ stored: "motion", reduced: true });
    page.start();
    page.view.emit("storage", { key: "other-setting", newValue: "still" });
    expect(page.root.documentElement.dataset.sceneryMotion).toBe("motion");

    page.view.emit("storage", {
      key: SCENERY_MOTION_STORAGE_KEY,
      newValue: "still"
    });
    expect(page.root.documentElement.dataset.sceneryMotion).toBe("still");

    page.view.emit("storage", { key: null, newValue: null });
    expect(page.root.documentElement.dataset.sceneryMotion).toBe("still");
    page.storage.set(SCENERY_MOTION_STORAGE_KEY, "motion");
    page.view.emit("pageshow");
    expect(page.root.documentElement.dataset.sceneryMotion).toBe("motion");
  });

  it("leaves the fallback untouched on pages without scenery", () => {
    const page = browser();
    page.state.hasScenery = false;
    expect(page.start()).toBeNull();
    expect(page.control.hidden).toBe(true);
    expect(page.root.documentElement.dataset.sceneryMotion).toBe("still");
  });

  it("cleans up listeners and returns the page to its still fallback", () => {
    const page = browser();
    const cleanup = page.start();
    cleanup?.();
    page.select("motion");
    page.media.emit("change");
    page.root.emit("visibilitychange");
    expect(page.control.hidden).toBe(true);
    expect(page.root.documentElement.dataset).toEqual({
      sceneryMotion: "still",
      sceneryPaused: "true"
    });
  });
});
