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
import ExperienceModeControl from "../../../src/components/atmosphere/ExperienceModeControl.astro";
import {
  EXPERIENCE_MODE_STORAGE_KEY,
  experienceModeBootstrap,
  initializeExperienceMode,
  type ExperienceMode
} from "../../../src/lib/atmosphere/experienceMode";
import {
  initializeSceneryMotion,
  SCENERY_MOTION_STORAGE_KEY
} from "../../../src/lib/atmosphere/sceneryMotion";
import { mountHtml } from "../../helpers/dom";

let shellHtml: string;
let extraControlHtml: string;
let cleanup: (() => void) | null;
let motionCleanup: (() => void) | null;

function state(): string | undefined {
  return document.documentElement.dataset.experienceMode;
}

function groups(): HTMLDetailsElement[] {
  return [
    ...document.querySelectorAll<HTMLDetailsElement>(
      "[data-experience-control]"
    )
  ];
}

function openControls(): void {
  for (const group of groups()) group.open = true;
}

function radio(mode: ExperienceMode, group = groups()[0]): HTMLInputElement {
  return getByRole(group, "radio", {
    name: new RegExp(`^${mode}`, "i")
  }) as HTMLInputElement;
}

function storageEvent(
  newValue: string | null,
  key: string | null = EXPERIENCE_MODE_STORAGE_KEY,
  area: Storage | null = window.localStorage
): void {
  window.dispatchEvent(
    new StorageEvent("storage", {
      key,
      newValue,
      storageArea: area,
      url: "https://portfolio.test/work/"
    })
  );
}

function mockMotionPreference(reduced = false): void {
  const media = new EventTarget();
  Object.defineProperties(media, {
    matches: { value: reduced },
    media: { value: "(prefers-reduced-motion: reduce)" }
  });
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => media)
  );
}

beforeAll(async () => {
  const container = await AstroContainer.create();
  [shellHtml, extraControlHtml] = await Promise.all([
    container.renderToString(BaseLayout, {
      request: new Request("https://portfolio.test/"),
      props: { title: "Appearance integration fixture" },
      slots: {
        default:
          '<h1>A dependable professional page</h1><p>Its content is available in every mode.</p><a href="/resume/">View my resume</a>'
      },
      partial: false
    }),
    container.renderToString(ExperienceModeControl)
  ]);
});

beforeEach(() => {
  mountHtml(shellHtml);
  window.localStorage.clear();
  window.sessionStorage.clear();
  cleanup = null;
  motionCleanup = null;
});

afterEach(() => {
  motionCleanup?.();
  cleanup?.();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("rendered appearance settings and persisted visitor choices", () => {
  it("places a synchronous validated bootstrap before any visible body content", () => {
    const bootstrap = document.body.firstElementChild as HTMLScriptElement;
    expect(bootstrap.tagName).toBe("SCRIPT");
    expect(bootstrap.textContent).toBe(experienceModeBootstrap);
    expect(bootstrap.src).toBe("");
    expect(bootstrap.type).not.toBe("module");
    expect(bootstrap.async).not.toBe(true);
    expect(bootstrap.defer).toBe(false);
  });

  it("ships the Immersive, still, useful HTML fallback before enhancement", () => {
    expect(state()).toBe("immersive");
    expect(document.documentElement.dataset.sceneryMotion).toBe("still");
    expect(groups()).toHaveLength(1);
    expect(groups()[0].querySelectorAll('input[type="radio"]')).toHaveLength(2);
    expect(groups()[0].hidden).toBe(true);
    expect(
      groups()[0].querySelector<HTMLInputElement>('input[value="immersive"]')!
        .checked
    ).toBe(true);
    expect(document.querySelector("main h1")!.textContent).toBe(
      "A dependable professional page"
    );
    expect(document.querySelector("main a")!.getAttribute("href")).toBe(
      "/resume/"
    );
  });

  it("migrates legacy Professional storage without exposing a third option", () => {
    window.localStorage.setItem(EXPERIENCE_MODE_STORAGE_KEY, "professional");
    const write = vi.spyOn(Storage.prototype, "setItem");
    cleanup = initializeExperienceMode();
    openControls();
    expect(state()).toBe("minimal");
    expect(radio("minimal").checked).toBe(true);
    expect(groups()[0].querySelectorAll('input[type="radio"]')).toHaveLength(2);
    expect(groups()[0].querySelector('input[value="professional"]')).toBeNull();
    storageEvent("immersive");
    storageEvent("professional");
    expect(state()).toBe("minimal");
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true })
    );
    expect(state()).toBe("minimal");
    expect(write).not.toHaveBeenCalled();
  });

  it.each(["immersive", "minimal"] as const)(
    "restores %s before revealing its settings",
    (mode) => {
      window.localStorage.setItem(EXPERIENCE_MODE_STORAGE_KEY, mode);
      const write = vi.spyOn(Storage.prototype, "setItem");
      cleanup = initializeExperienceMode();
      openControls();
      expect(state()).toBe(mode);
      expect(groups()[0].hidden).toBe(false);
      expect(radio(mode).checked).toBe(true);
      expect(write).not.toHaveBeenCalled();
    }
  );

  it.each([
    null,
    "",
    "Professional",
    " minimal ",
    "untrusted",
    "<script>alert(1)</script>"
  ])(
    "uses Immersive for an absent or unsupported stored value %j",
    (stored) => {
      if (stored !== null)
        window.localStorage.setItem(EXPERIENCE_MODE_STORAGE_KEY, stored);
      cleanup = initializeExperienceMode();
      openControls();
      expect(state()).toBe("immersive");
      expect(radio("immersive").checked).toBe(true);
      expect(document.querySelector("main h1")!.textContent).toBe(
        "A dependable professional page"
      );
    }
  );

  it.each(["immersive", "minimal"] as const)(
    "persists a deliberate native %s selection and announces the mode change internally",
    async (mode) => {
      cleanup = initializeExperienceMode();
      openControls();
      const changed = vi.fn();
      document.addEventListener("portfolio:experience-mode-change", changed);
      try {
        if (mode === "immersive")
          await userEvent.setup({ document }).click(radio("minimal"));
        changed.mockClear();
        await userEvent.setup({ document }).click(radio(mode));
        expect(state()).toBe(mode);
        expect(radio(mode).checked).toBe(true);
        expect(window.localStorage.getItem(EXPERIENCE_MODE_STORAGE_KEY)).toBe(
          mode
        );
        expect(changed).toHaveBeenCalledTimes(1);
        expect(document.querySelectorAll("main")).toHaveLength(1);
        expect(document.querySelector("main[tabindex]")).toBeNull();
      } finally {
        document.removeEventListener(
          "portfolio:experience-mode-change",
          changed
        );
      }
    }
  );

  it("supports native arrow-key selection while retaining focus on the chosen radio", async () => {
    cleanup = initializeExperienceMode();
    openControls();
    radio("immersive").focus();
    await userEvent.setup({ document }).keyboard("{ArrowRight}");
    expect(state()).toBe("minimal");
    expect(document.activeElement).toBe(radio("minimal"));
    await userEvent.setup({ document }).keyboard("{ArrowLeft}");
    expect(state()).toBe("immersive");
    expect(document.activeElement).toBe(radio("immersive"));
  });

  it("restores the selection after a complete document remount", async () => {
    cleanup = initializeExperienceMode();
    openControls();
    await userEvent.setup({ document }).click(radio("minimal"));
    cleanup?.();
    mountHtml(shellHtml);
    cleanup = initializeExperienceMode();
    openControls();
    expect(state()).toBe("minimal");
    expect(radio("minimal").checked).toBe(true);
  });

  it.each(["immersive", "minimal"])(
    "accepts a same-origin localStorage synchronization to %s without writing again",
    (mode) => {
      cleanup = initializeExperienceMode();
      openControls();
      const write = vi.spyOn(Storage.prototype, "setItem");
      storageEvent(mode);
      expect(state()).toBe(mode);
      expect(write).not.toHaveBeenCalled();
    }
  );

  it.each([null, "", "MINIMAL", "invalid"])(
    "safely resets an incoming invalid selection %j",
    (value) => {
      window.localStorage.setItem(EXPERIENCE_MODE_STORAGE_KEY, "minimal");
      cleanup = initializeExperienceMode();
      storageEvent(value);
      expect(state()).toBe("immersive");
    }
  );

  it("handles localStorage.clear and ignores unrelated setting updates", () => {
    window.localStorage.setItem(EXPERIENCE_MODE_STORAGE_KEY, "minimal");
    cleanup = initializeExperienceMode();
    storageEvent("immersive", "another-setting");
    expect(state()).toBe("minimal");
    storageEvent(null, null);
    expect(state()).toBe("immersive");
  });

  it.each([EXPERIENCE_MODE_STORAGE_KEY, null])(
    "ignores sessionStorage notifications for %j",
    (key) => {
      window.localStorage.setItem(EXPERIENCE_MODE_STORAGE_KEY, "minimal");
      cleanup = initializeExperienceMode();
      storageEvent("immersive", key, window.sessionStorage);
      expect(state()).toBe("minimal");
    }
  );

  it("accepts a compatible null-area storage notification", () => {
    cleanup = initializeExperienceMode();
    storageEvent("minimal", EXPERIENCE_MODE_STORAGE_KEY, null);
    expect(state()).toBe("minimal");
  });

  it("refreshes after back/forward restoration", () => {
    cleanup = initializeExperienceMode();
    window.localStorage.setItem(EXPERIENCE_MODE_STORAGE_KEY, "minimal");
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true })
    );
    expect(state()).toBe("minimal");
  });

  it("preserves a current choice if storage becomes unavailable during pageshow", async () => {
    cleanup = initializeExperienceMode();
    openControls();
    await userEvent.setup({ document }).click(radio("minimal"));
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Denied", "SecurityError");
    });
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true })
    );
    expect(state()).toBe("minimal");
    expect(radio("minimal").checked).toBe(true);
  });

  it("works when localStorage reads are blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Denied", "SecurityError");
    });
    expect(() => {
      cleanup = initializeExperienceMode();
    }).not.toThrow();
    openControls();
    await userEvent.setup({ document }).click(radio("minimal"));
    expect(state()).toBe("minimal");
  });

  it("works when localStorage property access is blocked", async () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("Denied", "SecurityError");
    });
    expect(() => {
      cleanup = initializeExperienceMode();
    }).not.toThrow();
    openControls();
    await userEvent.setup({ document }).click(radio("minimal"));
    expect(state()).toBe("minimal");
  });

  it("ignores a storage event if access to the expected storage area becomes blocked", () => {
    const storage = window.localStorage;
    cleanup = initializeExperienceMode();
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("Denied", "SecurityError");
    });
    expect(() =>
      storageEvent("minimal", EXPERIENCE_MODE_STORAGE_KEY, storage)
    ).not.toThrow();
    expect(state()).toBe("immersive");
  });

  it("keeps an active choice when saving fails", async () => {
    cleanup = initializeExperienceMode();
    openControls();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota", "QuotaExceededError");
    });
    await userEvent.setup({ document }).click(radio("minimal"));
    expect(state()).toBe("minimal");
    expect(radio("minimal").checked).toBe(true);
  });

  it("ignores unchecked change events and unsupported input values", () => {
    cleanup = initializeExperienceMode();
    openControls();
    const requested = radio("immersive");
    requested.checked = false;
    fireEvent.change(requested);
    expect(state()).toBe("immersive");
    requested.value = "unexpected";
    requested.checked = true;
    fireEvent.change(requested);
    expect(state()).toBe("immersive");
    expect(window.localStorage.getItem(EXPERIENCE_MODE_STORAGE_KEY)).toBeNull();
  });

  it("synchronizes separate control groups without colliding radio names", async () => {
    document
      .querySelector("main")!
      .insertAdjacentHTML("beforeend", extraControlHtml);
    cleanup = initializeExperienceMode();
    openControls();
    expect(groups()).toHaveLength(2);
    const first = radio("minimal", groups()[0]);
    const second = radio("minimal", groups()[1]);
    expect(first.name).not.toBe(second.name);
    await userEvent.setup({ document }).click(first);
    expect(first.checked).toBe(true);
    expect(second.checked).toBe(true);
    cleanup?.();
    cleanup = null;
    for (const group of groups()) {
      expect(group.hidden).toBe(true);
      for (const input of group.querySelectorAll("input"))
        expect(input.name).toBe("experience-mode");
    }
  });

  it("does not attach duplicate listeners when initialized twice", async () => {
    cleanup = initializeExperienceMode();
    expect(initializeExperienceMode()).toBe(cleanup);
    openControls();
    const write = vi.spyOn(Storage.prototype, "setItem");
    await userEvent.setup({ document }).click(radio("minimal"));
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("removes listeners, tolerates repeated cleanup, and supports fresh initialization", () => {
    const removeView = vi.spyOn(window, "removeEventListener");
    cleanup = initializeExperienceMode();
    const previous = cleanup;
    expect(() => {
      previous?.();
      previous?.();
    }).not.toThrow();
    cleanup = null;
    expect(removeView).toHaveBeenCalledWith("storage", expect.any(Function));
    expect(removeView).toHaveBeenCalledWith("pageshow", expect.any(Function));
    const afterCleanup = state();
    expect(afterCleanup).toBe("minimal");
    storageEvent("immersive");
    expect(state()).toBe(afterCleanup);
    window.localStorage.setItem(EXPERIENCE_MODE_STORAGE_KEY, "immersive");
    window.dispatchEvent(new Event("pageshow"));
    expect(state()).toBe(afterCleanup);
    cleanup = initializeExperienceMode();
    openControls();
    expect(cleanup).not.toBe(previous);
    expect(state()).toBe("immersive");
  });

  it("returns safely for a document without a window", () => {
    const detached = document.implementation.createHTMLDocument("Detached");
    expect(initializeExperienceMode(detached)).toBeNull();
  });
});

describe("mode policy and the independent scenery motion choice", () => {
  it.each(["minimal", "professional"] as const)(
    "never starts stored Motion for the quiet preference %s",
    (mode) => {
      mockMotionPreference();
      window.localStorage.setItem(EXPERIENCE_MODE_STORAGE_KEY, mode);
      window.localStorage.setItem(SCENERY_MOTION_STORAGE_KEY, "motion");
      cleanup = initializeExperienceMode();
      motionCleanup = initializeSceneryMotion();
      expect(state()).toBe("minimal");
      expect(document.documentElement.dataset.sceneryMotion).toBe("still");
      expect(
        document.querySelector<HTMLFieldSetElement>("[data-scenery-control]")!
          .hidden
      ).toBe(true);
      expect(window.localStorage.getItem(SCENERY_MOTION_STORAGE_KEY)).toBe(
        "motion"
      );
    }
  );

  it("keeps Still selected across immersive → minimal → immersive", async () => {
    mockMotionPreference();
    window.localStorage.setItem(EXPERIENCE_MODE_STORAGE_KEY, "immersive");
    cleanup = initializeExperienceMode();
    motionCleanup = initializeSceneryMotion();
    openControls();
    await userEvent
      .setup({ document })
      .click(getByRole(document.body, "radio", { name: /^Still$/ }));
    await userEvent.setup({ document }).click(radio("minimal"));
    expect(document.documentElement.dataset.sceneryMotion).toBe("still");
    await userEvent.setup({ document }).click(radio("immersive"));
    expect(document.documentElement.dataset.sceneryMotion).toBe("still");
    expect(
      getByRole(document.body, "radio", { name: /^Still$/ })
    ).toHaveProperty("checked", true);
  });

  it("respects reduced motion when entering Immersive without an explicit motion preference", async () => {
    mockMotionPreference(true);
    window.localStorage.setItem(EXPERIENCE_MODE_STORAGE_KEY, "minimal");
    cleanup = initializeExperienceMode();
    motionCleanup = initializeSceneryMotion();
    openControls();
    await userEvent.setup({ document }).click(radio("immersive"));
    expect(document.documentElement.dataset.sceneryMotion).toBe("still");
    expect(
      getByRole(document.body, "radio", { name: /^Still$/ })
    ).toHaveProperty("checked", true);
  });
});
