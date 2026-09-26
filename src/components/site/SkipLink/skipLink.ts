const skipLinkSelector = "a[data-skip-link]";
const mainStartSelector = "[data-main-start-marker]";

export type MainOutOfViewValue = "true" | "false";

/**
 * Extracts an element ID from a same-page URL fragment.
 *
 * @example
 * getSkipLinkTargetId("#main-content") // "main-content"
 */
export function getSkipLinkTargetId(hash: string): string | null {
  if (!hash.startsWith("#")) {
    return null;
  }

  const targetId = hash.slice(1);

  return targetId || null;
}

/**
 * Converts the main-start marker intersection into the string expected by the
 * data-main-out-of-view HTML attribute.
 */
export function getMainOutOfViewValue(
  isMainStartIntersecting: boolean
): MainOutOfViewValue {
  return isMainStartIntersecting ? "false" : "true";
}

/**
 * Records whether the start of main is visible on the skip link.
 */
export function updateSkipLinkState(
  skipLink: Pick<HTMLAnchorElement, "dataset">,
  isMainStartIntersecting: boolean
): void {
  skipLink.dataset.mainOutOfView = getMainOutOfViewValue(
    isMainStartIntersecting
  );

  skipLink.dataset.enhanced = "true";
}

/**
 * Observes whether the start of main is inside the viewport. The native
 * same-page link handles scrolling and the next keyboard focus position.
 */
export function initializeSkipLink(
  root: Document = document
): IntersectionObserver | null {
  const skipLink = root.querySelector<HTMLAnchorElement>(skipLinkSelector);

  if (!skipLink) {
    return null;
  }

  const targetId = getSkipLinkTargetId(skipLink.hash);

  if (!targetId) {
    return null;
  }

  const mainContent = root.getElementById(targetId);

  if (!mainContent) {
    return null;
  }

  const mainStart = mainContent.querySelector<HTMLElement>(mainStartSelector);

  if (!mainStart) {
    return null;
  }

  /*
   * Leave the link permanently visible as a fallback when the browser does
   * not support IntersectionObserver.
   */
  if (typeof IntersectionObserver === "undefined") {
    return null;
  }

  const observer = new IntersectionObserver(([entry]) => {
    if (!entry) {
      return;
    }

    updateSkipLinkState(skipLink, entry.isIntersecting);
  });

  observer.observe(mainStart);

  return observer;
}
