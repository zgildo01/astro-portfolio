export const EXPERIENCE_MODES = ["immersive", "minimal"] as const;
export type ExperienceMode = (typeof EXPERIENCE_MODES)[number];

export const EXPERIENCE_MODE_STORAGE_KEY = "portfolio-experience-mode";
export const EXPERIENCE_MODE_CHANGE_EVENT = "portfolio:experience-mode-change";

/** Only named modes may enter the document or local preference store. */
export function parseExperienceMode(
  value: string | null
): ExperienceMode | null {
  // Preserve the quiet intent of a preference saved before the selector changed.
  if (value === "professional") return "minimal";
  return EXPERIENCE_MODES.find((mode) => mode === value) ?? null;
}

export function resolveExperienceMode(
  choice: ExperienceMode | null
): ExperienceMode {
  return choice ?? "immersive";
}

/** Runs after the head's CSP and before visible body content is parsed. */
export const experienceModeBootstrap = `(() => {
  let mode = "immersive";
  try {
    const saved = window.localStorage.getItem(${JSON.stringify(EXPERIENCE_MODE_STORAGE_KEY)});
    const choice = saved === "professional" ? "minimal" : saved;
    if (${JSON.stringify(EXPERIENCE_MODES)}.includes(choice)) mode = choice;
  } catch {}
  document.documentElement.dataset.experienceMode = mode;
})();`;

// Distinguish an unavailable store from a deliberately cleared preference.
function readPreference(view: Window): ExperienceMode | null | undefined {
  try {
    return parseExperienceMode(
      view.localStorage.getItem(EXPERIENCE_MODE_STORAGE_KEY)
    );
  } catch {
    return undefined;
  }
}

function savePreference(view: Window, mode: ExperienceMode): void {
  try {
    view.localStorage.setItem(EXPERIENCE_MODE_STORAGE_KEY, mode);
  } catch {
    // A blocked store must not disable the current page's controls.
  }
}

const controllers = new WeakMap<Document, () => void>();

/** Enhance native choices while keeping the static HTML fallback useful. */
export function initializeExperienceMode(
  root: Document = document
): (() => void) | null {
  const view = root.defaultView;
  if (!view) return null;
  const existing = controllers.get(root);
  if (existing) return existing;

  const controls = [
    ...root.querySelectorAll<HTMLElement>("[data-experience-control]")
  ];
  const inputs = [
    ...root.querySelectorAll<HTMLInputElement>(
      '[data-experience-control] input[type="radio"]'
    )
  ];
  const originalNames = new Map<HTMLInputElement, string>();
  inputs.forEach((input) => {
    originalNames.set(input, input.name);
    const group = controls.indexOf(
      input.closest<HTMLElement>("[data-experience-control]")!
    );
    input.name = `experience-mode-${group}`;
  });
  let choice = readPreference(view) ?? null;
  let active = true;

  function apply(mode: ExperienceMode): void {
    const changed = root.documentElement.dataset.experienceMode !== mode;
    root.documentElement.dataset.experienceMode = mode;
    inputs.forEach((input) => {
      input.checked = input.value === mode;
    });
    if (changed) {
      root.dispatchEvent(
        new view!.CustomEvent(EXPERIENCE_MODE_CHANGE_EVENT, {
          detail: { mode }
        })
      );
    }
  }

  function changeChoice(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const requested = parseExperienceMode(input.value);
    if (!input.checked || requested === null) return;
    choice = requested;
    savePreference(view!, requested);
    apply(requested);
  }

  function synchronizeStorage(event: StorageEvent): void {
    if (event.key !== null && event.key !== EXPERIENCE_MODE_STORAGE_KEY) return;
    try {
      if (event.storageArea && event.storageArea !== view!.localStorage) return;
    } catch {
      return;
    }
    choice = parseExperienceMode(event.newValue);
    apply(resolveExperienceMode(choice));
  }

  function restorePage(): void {
    const stored = readPreference(view!);
    if (stored !== undefined) choice = stored;
    apply(resolveExperienceMode(choice));
  }

  function cleanup(): void {
    if (!active) return;
    active = false;
    inputs.forEach((input) => {
      input.removeEventListener("change", changeChoice);
      input.name = originalNames.get(input)!;
    });
    view!.removeEventListener("storage", synchronizeStorage);
    view!.removeEventListener("pageshow", restorePage);
    controls.forEach((control) => {
      control.hidden = true;
    });
    apply("minimal");
    controllers.delete(root);
  }

  controllers.set(root, cleanup);
  apply(resolveExperienceMode(choice));
  controls.forEach((control) => {
    control.hidden = false;
  });
  inputs.forEach((input) => input.addEventListener("change", changeChoice));
  view.addEventListener("storage", synchronizeStorage);
  view.addEventListener("pageshow", restorePage);
  return cleanup;
}
