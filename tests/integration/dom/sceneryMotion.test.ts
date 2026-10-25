import { experimental_AstroContainer as AstroContainer } from "astro/container";
import userEvent from "@testing-library/user-event";
import { fireEvent, getAllByRole, getByRole } from "@testing-library/dom";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import SceneryMotionControl from "../../../src/components/atmosphere/SceneryMotionControl.astro";
import BaseLayout from "../../../src/layouts/BaseLayout.astro";
import {
  initializeSceneryMotion,
  SCENERY_MOTION_STORAGE_KEY
} from "../../../src/lib/atmosphere/sceneryMotion";
import { mountHtml } from "../../helpers/dom";

let shellHtml: string;
let extraControlHtml: string;
let cleanup: (() => void) | null;
let hidden = false;

function mount(html = shellHtml): void {
  mountHtml(html);
}

function matchMedia(initial = false) {
  const media = new EventTarget();
  let matches = initial;
  Object.defineProperties(media, {
    matches: { get: () => matches },
    media: { value: "(prefers-reduced-motion: reduce)" }
  });
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => media)
  );
  return {
    media,
    change(value: boolean) {
      matches = value;
      media.dispatchEvent(new Event("change"));
    }
  };
}

function radios(): HTMLInputElement[] {
  return getAllByRole(document.body, "radio") as HTMLInputElement[];
}

function state(): string | undefined {
  return document.documentElement.dataset.sceneryMotion;
}

beforeAll(async () => {
  const container = await AstroContainer.create();
  [shellHtml, extraControlHtml] = await Promise.all([
    container.renderToString(BaseLayout, {
      request: new Request("https://portfolio.test/"),
      props: { title: "Motion integration fixture" },
      slots: { default: "<h1>A readable professional page</h1>" },
      partial: false
    }),
    container.renderToString(SceneryMotionControl)
  ]);
});

beforeEach(() => {
  mount();
  window.localStorage.clear();
  window.sessionStorage.clear();
  hidden = false;
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  cleanup = null;
});

afterEach(() => {
  cleanup?.();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("rendered scenery controls and browser preferences", () => {
  it("keeps its native Still fallback hidden before JavaScript enhancement", () => {
    const group = document.querySelector<HTMLFieldSetElement>(
      "[data-scenery-control]"
    )!;
    expect(group.hidden).toBe(true);
    expect(
      group.querySelector<HTMLInputElement>('input[value="still"]')!.checked
    ).toBe(true);
    expect(document.documentElement.dataset.sceneryMotion).toBe("still");
    expect(document.documentElement.dataset.sceneryPaused).toBe("true");
  });

  it.each([
    { reduced: false, stored: null, expected: "motion" },
    { reduced: true, stored: null, expected: "still" },
    { reduced: false, stored: "still", expected: "still" },
    { reduced: true, stored: "motion", expected: "motion" },
    { reduced: true, stored: "STILL", expected: "still" },
    { reduced: false, stored: "<script>bad()</script>", expected: "motion" }
  ])(
    "resolves reduced=$reduced and stored=$stored before revealing controls",
    ({ reduced, stored, expected }) => {
      matchMedia(reduced);
      if (stored !== null)
        window.localStorage.setItem(SCENERY_MOTION_STORAGE_KEY, stored);
      cleanup = initializeSceneryMotion();
      expect(state()).toBe(expected);
      expect(document.documentElement.dataset.sceneryPaused).toBe("false");
      expect(
        document.querySelector<HTMLFieldSetElement>("[data-scenery-control]")!
          .hidden
      ).toBe(false);
      expect(
        radios()
          .filter((radio) => radio.checked)
          .map((radio) => radio.value)
      ).toEqual([expected]);
      expect(document.querySelector("main h1")!.textContent).toBe(
        "A readable professional page"
      );
    }
  );

  it("uses accessible native radio labels for a deliberate click choice", async () => {
    matchMedia();
    cleanup = initializeSceneryMotion();
    const user = userEvent.setup({ document });
    await user.click(getByRole(document.body, "radio", { name: "Still" }));
    expect(state()).toBe("still");
    expect(window.localStorage.getItem(SCENERY_MOTION_STORAGE_KEY)).toBe(
      "still"
    );
    expect(radios().map((radio) => radio.checked)).toEqual([false, true]);
  });

  it("supports activating a focused radio with the keyboard", async () => {
    matchMedia(true);
    cleanup = initializeSceneryMotion();
    const user = userEvent.setup({ document });
    const motion = getByRole(document.body, "radio", { name: "Motion" });
    motion.focus();
    await user.keyboard(" ");
    expect(state()).toBe("motion");
    expect(window.localStorage.getItem(SCENERY_MOTION_STORAGE_KEY)).toBe(
      "motion"
    );
    expect(document.activeElement).toBe(motion);
  });

  it("uses arrow keys to move between native radio options", async () => {
    matchMedia(true);
    cleanup = initializeSceneryMotion();
    const user = userEvent.setup({ document });
    getByRole(document.body, "radio", { name: "Still" }).focus();
    await user.keyboard("{ArrowLeft}");
    expect(state()).toBe("motion");
    expect(document.activeElement).toBe(
      getByRole(document.body, "radio", { name: "Motion" })
    );
    await user.keyboard("{ArrowRight}");
    expect(state()).toBe("still");
    expect(window.localStorage.getItem(SCENERY_MOTION_STORAGE_KEY)).toBe(
      "still"
    );
  });

  it("follows later OS changes until the visitor makes an explicit choice", async () => {
    const preference = matchMedia();
    cleanup = initializeSceneryMotion();
    preference.change(true);
    expect(state()).toBe("still");
    preference.change(false);
    expect(state()).toBe("motion");
    await userEvent
      .setup({ document })
      .click(getByRole(document.body, "radio", { name: "Still" }));
    preference.change(true);
    preference.change(false);
    expect(state()).toBe("still");
  });

  it("restores persisted preferences after a complete page remount", async () => {
    matchMedia();
    cleanup = initializeSceneryMotion();
    await userEvent
      .setup({ document })
      .click(getByRole(document.body, "radio", { name: "Still" }));
    cleanup?.();
    mount();
    cleanup = initializeSceneryMotion();
    expect(state()).toBe("still");
    expect(getByRole(document.body, "radio", { name: "Still" })).toHaveProperty(
      "checked",
      true
    );
  });

  it("pauses while hidden and resumes the same selection when visible", () => {
    matchMedia();
    window.localStorage.setItem(SCENERY_MOTION_STORAGE_KEY, "motion");
    cleanup = initializeSceneryMotion();
    hidden = true;
    fireEvent(document, new Event("visibilitychange"));
    expect(document.documentElement.dataset.sceneryPaused).toBe("true");
    expect(state()).toBe("motion");
    hidden = false;
    fireEvent(document, new Event("visibilitychange"));
    expect(document.documentElement.dataset.sceneryPaused).toBe("false");
    expect(state()).toBe("motion");
  });

  it("initializes a background tab in the paused state", () => {
    matchMedia();
    hidden = true;
    cleanup = initializeSceneryMotion();
    expect(document.documentElement.dataset.sceneryPaused).toBe("true");
  });

  it("accepts same-origin localStorage changes without writing another event", () => {
    matchMedia();
    cleanup = initializeSceneryMotion();
    const write = vi.spyOn(Storage.prototype, "setItem");
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: SCENERY_MOTION_STORAGE_KEY,
        newValue: "still",
        storageArea: window.localStorage,
        url: "https://portfolio.test/work/"
      })
    );
    expect(state()).toBe("still");
    expect(write).not.toHaveBeenCalled();
  });

  it("ignores storage notifications for another preference key", () => {
    matchMedia();
    cleanup = initializeSceneryMotion();
    window.dispatchEvent(
      new StorageEvent("storage", { key: "another-setting", newValue: "still" })
    );
    expect(state()).toBe("motion");
  });

  it.each([null, "invalid", "", "STILL"])(
    "returns to the OS default for a cleared or invalid stored choice: %j",
    (value) => {
      matchMedia(true);
      window.localStorage.setItem(SCENERY_MOTION_STORAGE_KEY, "motion");
      cleanup = initializeSceneryMotion();
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: SCENERY_MOTION_STORAGE_KEY,
          newValue: value,
          storageArea: window.localStorage
        })
      );
      expect(state()).toBe("still");
    }
  );

  it("handles localStorage.clear notifications", () => {
    matchMedia(true);
    window.localStorage.setItem(SCENERY_MOTION_STORAGE_KEY, "motion");
    cleanup = initializeSceneryMotion();
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: null,
        newValue: null,
        storageArea: window.localStorage
      })
    );
    expect(state()).toBe("still");
  });

  it("refreshes preferences from storage after back/forward page restoration", () => {
    matchMedia();
    cleanup = initializeSceneryMotion();
    window.localStorage.setItem(SCENERY_MOTION_STORAGE_KEY, "still");
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true })
    );
    expect(state()).toBe("still");
    expect(getByRole(document.body, "radio", { name: "Still" })).toHaveProperty(
      "checked",
      true
    );
  });

  it("continues to render and respond when reading localStorage throws", async () => {
    matchMedia(true);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Denied", "SecurityError");
    });
    expect(() => {
      cleanup = initializeSceneryMotion();
    }).not.toThrow();
    await userEvent
      .setup({ document })
      .click(getByRole(document.body, "radio", { name: "Motion" }));
    expect(state()).toBe("motion");
  });

  it("continues working when access to the localStorage property itself is denied", async () => {
    matchMedia(true);
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("Denied", "SecurityError");
    });
    expect(() => {
      cleanup = initializeSceneryMotion();
    }).not.toThrow();
    await userEvent
      .setup({ document })
      .click(getByRole(document.body, "radio", { name: "Motion" }));
    expect(state()).toBe("motion");
  });

  it("keeps a choice active when saving it is blocked", async () => {
    matchMedia(true);
    cleanup = initializeSceneryMotion();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota", "QuotaExceededError");
    });
    await userEvent
      .setup({ document })
      .click(getByRole(document.body, "radio", { name: "Motion" }));
    expect(state()).toBe("motion");
    expect(
      getByRole(document.body, "radio", { name: "Motion" })
    ).toHaveProperty("checked", true);
  });

  it("ignores unchecked change notifications and unsupported radio values", () => {
    matchMedia(true);
    cleanup = initializeSceneryMotion();
    const motion = getByRole(document.body, "radio", {
      name: "Motion"
    }) as HTMLInputElement;
    motion.checked = false;
    fireEvent.change(motion);
    expect(state()).toBe("still");
    motion.value = "unsupported";
    motion.checked = true;
    fireEvent.change(motion);
    expect(state()).toBe("still");
    expect(window.localStorage.getItem(SCENERY_MOTION_STORAGE_KEY)).toBeNull();
  });

  it("leaves the safe fallback untouched when the scenery is absent", () => {
    matchMedia();
    document.querySelector("[data-scenery-environment]")!.remove();
    expect(initializeSceneryMotion()).toBeNull();
    expect(document.documentElement.dataset.sceneryMotion).toBe("still");
    expect(
      document.querySelector<HTMLFieldSetElement>("[data-scenery-control]")!
        .hidden
    ).toBe(true);
  });

  it("leaves the safe fallback untouched without matchMedia", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(initializeSceneryMotion()).toBeNull();
    expect(state()).toBe("still");
  });

  it("returns safely for a detached document without a window", () => {
    const detached = document.implementation.createHTMLDocument("Detached");
    detached.body.innerHTML = "<div data-scenery-environment></div>";
    expect(initializeSceneryMotion(detached)).toBeNull();
  });

  it("can apply the preference even when a page has no visible controls", () => {
    matchMedia(true);
    document.querySelector("[data-scenery-control]")!.remove();
    cleanup = initializeSceneryMotion();
    expect(state()).toBe("still");
    expect(document.documentElement.dataset.sceneryPaused).toBe("false");
  });

  it("removes all subscribed listeners and restores the hidden fallback on cleanup", () => {
    const preference = matchMedia();
    const removeMedia = vi.spyOn(preference.media, "removeEventListener");
    const removeWindow = vi.spyOn(window, "removeEventListener");
    const removeDocument = vi.spyOn(document, "removeEventListener");
    cleanup = initializeSceneryMotion();
    cleanup?.();
    cleanup = null;
    expect(removeMedia).toHaveBeenCalledWith("change", expect.any(Function));
    expect(removeDocument).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function)
    );
    expect(removeWindow).toHaveBeenCalledWith("storage", expect.any(Function));
    expect(removeWindow).toHaveBeenCalledWith("pageshow", expect.any(Function));
    expect(state()).toBe("still");
    expect(document.documentElement.dataset.sceneryPaused).toBe("true");
    expect(
      document.querySelector<HTMLFieldSetElement>("[data-scenery-control]")!
        .hidden
    ).toBe(true);
    preference.change(false);
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: SCENERY_MOTION_STORAGE_KEY,
        newValue: "motion"
      })
    );
    window.dispatchEvent(new Event("pageshow"));
    expect(state()).toBe("still");
  });

  it("allows cleanup to be called twice without reactivating anything", () => {
    matchMedia();
    cleanup = initializeSceneryMotion();
    expect(() => {
      cleanup?.();
      cleanup?.();
    }).not.toThrow();
    expect(state()).toBe("still");
  });

  it("keeps separate rendered control groups synchronized", async () => {
    matchMedia();
    document
      .querySelector("main")!
      .insertAdjacentHTML("beforeend", extraControlHtml);
    cleanup = initializeSceneryMotion();
    const groups = [
      ...document.querySelectorAll<HTMLFieldSetElement>(
        "[data-scenery-control]"
      )
    ];
    expect(groups).toHaveLength(2);
    for (const group of groups) {
      expect(
        group.querySelector<HTMLInputElement>('input[value="motion"]')!.checked
      ).toBe(true);
    }
    await userEvent
      .setup({ document })
      .click(getByRole(groups[0], "radio", { name: "Still" }));
    for (const group of groups) {
      expect(
        group.querySelector<HTMLInputElement>('input[value="still"]')!.checked
      ).toBe(true);
    }
    cleanup?.();
    cleanup = null;
    for (const group of groups) {
      expect(group.hidden).toBe(true);
      for (const input of group.querySelectorAll("input")) {
        expect(input.name).toBe("scenery-motion");
      }
    }
  });

  it("does not let sessionStorage notifications overwrite the localStorage preference", () => {
    matchMedia();
    cleanup = initializeSceneryMotion();
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: SCENERY_MOTION_STORAGE_KEY,
        newValue: "still",
        storageArea: window.sessionStorage,
        url: "https://portfolio.test/embedded/"
      })
    );
    expect(state()).toBe("motion");
  });

  it("ignores sessionStorage.clear while preserving an explicit local preference", () => {
    matchMedia(true);
    window.localStorage.setItem(SCENERY_MOTION_STORAGE_KEY, "motion");
    cleanup = initializeSceneryMotion();
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: null,
        newValue: null,
        storageArea: window.sessionStorage,
        url: "https://portfolio.test/embedded/"
      })
    );
    expect(state()).toBe("motion");
  });

  it("ignores an incoming storage event if storage access becomes blocked", () => {
    matchMedia();
    const storage = window.localStorage;
    cleanup = initializeSceneryMotion();
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("Denied", "SecurityError");
    });
    expect(() =>
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: SCENERY_MOTION_STORAGE_KEY,
          newValue: "still",
          storageArea: storage,
          url: "https://portfolio.test/work/"
        })
      )
    ).not.toThrow();
    expect(state()).toBe("motion");
  });
});
