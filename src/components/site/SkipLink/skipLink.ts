const skipLinkSelector = "a[data-skip-link]";

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
 * Converts IntersectionObserver state into the string expected by the
 * data-main-out-of-view HTML attribute.
 */
export function getMainOutOfViewValue(
  isMainIntersecting: boolean
): MainOutOfViewValue {
  return isMainIntersecting ? "false" : "true";
}

/**
 * Records the current main-content visibility state on the skip link.
 */
export function updateSkipLinkState(
  skipLink: Pick<HTMLAnchorElement, "dataset">,
  isMainIntersecting: boolean
): void {
  skipLink.dataset.mainOutOfView = getMainOutOfViewValue(isMainIntersecting);

  skipLink.dataset.enhanced = "true";
}

/**
 * Connects the skip link to its target and observes whether the target is
 * currently inside the viewport.
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

  observer.observe(mainContent);

  skipLink.addEventListener("click", () => {
    requestAnimationFrame(() => {
      mainContent.focus({
        preventScroll: true
      });
    });
  });

  return observer;
}
