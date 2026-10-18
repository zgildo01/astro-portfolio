export type SceneryMotion = "motion" | "still";

export const SCENERY_MOTION_STORAGE_KEY = "portfolio-scenery-motion";

export function parseSceneryMotion(value: string | null): SceneryMotion | null {
  return value === "motion" || value === "still" ? value : null;
}

export function resolveSceneryMotion(
  choice: SceneryMotion | null,
  prefersReducedMotion: boolean
): SceneryMotion {
  return choice ?? (prefersReducedMotion ? "still" : "motion");
}

function readPreference(view: Window): SceneryMotion | null {
  try {
    return parseSceneryMotion(
      view.localStorage.getItem(SCENERY_MOTION_STORAGE_KEY)
    );
  } catch {
    return null;
  }
}

function savePreference(view: Window, choice: SceneryMotion): void {
  try {
    view.localStorage.setItem(SCENERY_MOTION_STORAGE_KEY, choice);
  } catch {
    // Motion controls still work when the browser does not allow storage.
  }
}

export function initializeSceneryMotion(
  root: Document = document
): (() => void) | null {
  const view = root.defaultView;
  const scenery = root.querySelector("[data-scenery-environment]");
  if (!view || !scenery || typeof view.matchMedia !== "function") return null;

  const preference = view.matchMedia("(prefers-reduced-motion: reduce)");
  const controls = root.querySelectorAll<HTMLFieldSetElement>(
    "[data-scenery-control]"
  );
  const inputs = root.querySelectorAll<HTMLInputElement>(
    '[data-scenery-control] input[name="scenery-motion"]'
  );
  let choice = readPreference(view);

  function update() {
    const motion = resolveSceneryMotion(choice, preference.matches);
    root.documentElement.dataset.sceneryMotion = motion;
    root.documentElement.dataset.sceneryPaused = String(root.hidden);
    inputs.forEach((input) => {
      input.checked = input.value === motion;
    });
  }

  function changeChoice(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const requested = parseSceneryMotion(input.value);
    if (!input.checked || requested === null) return;
    choice = requested;
    savePreference(view!, requested);
    update();
  }

  function synchronizeStorage(event: StorageEvent) {
    if (event.key !== null && event.key !== SCENERY_MOTION_STORAGE_KEY) return;
    choice = parseSceneryMotion(event.newValue);
    update();
  }

  function restorePage() {
    choice = readPreference(view!);
    update();
  }

  // Apply the preference before revealing the control or starting any motion.
  update();
  controls.forEach((control) => {
    control.hidden = false;
  });
  inputs.forEach((input) => input.addEventListener("change", changeChoice));
  preference.addEventListener("change", update);
  root.addEventListener("visibilitychange", update);
  view.addEventListener("storage", synchronizeStorage);
  view.addEventListener("pageshow", restorePage);

  return () => {
    inputs.forEach((input) =>
      input.removeEventListener("change", changeChoice)
    );
    preference.removeEventListener("change", update);
    root.removeEventListener("visibilitychange", update);
    view.removeEventListener("storage", synchronizeStorage);
    view.removeEventListener("pageshow", restorePage);
    root.documentElement.dataset.sceneryMotion = "still";
    root.documentElement.dataset.sceneryPaused = "true";
    controls.forEach((control) => {
      control.hidden = true;
    });
  };
}
