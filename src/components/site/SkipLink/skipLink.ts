const skipLinkSelector = "a[data-skip-link]";
const mainStartSelector = "[data-main-start-marker]";
const interactiveControlSelector =
  'a[href], button, input, select, textarea, summary, label, [tabindex], [role="status"], [role="alert"]';
const revealScrollDistance = 48;
const controlClearance = 4;
const meaningfulHeadingHeight = 44;

type Rectangle = Pick<DOMRect, "top" | "right" | "bottom" | "left">;

interface SkipLinkVisibilityState {
  markerTop: number;
  markerRight: number;
  markerBottom: number;
  markerLeft: number;
  headingTop: number | null;
  headingBottom: number | null;
  viewportTop: number;
  viewportRight: number;
  viewportBottom: number;
  viewportLeft: number;
  scrollDistance: number;
  menuOpen: boolean;
  overlapsInteractiveControl: boolean;
}

/** Extracts an element ID from a same-page URL fragment. */
export function getSkipLinkTargetId(hash: string): string | null {
  if (!hash.startsWith("#")) {
    return null;
  }

  const targetId = hash.slice(1);

  return targetId || null;
}

/**
 * Keep the floating link available when the start of main is outside the
 * visible viewport, including when zoom pushes main below the fold. A modest
 * scroll also reveals it before the one-pixel marker crosses the top edge.
 */
export function shouldShowFloatingSkipLink({
  markerTop,
  markerRight,
  markerBottom,
  markerLeft,
  headingTop,
  headingBottom,
  viewportTop,
  viewportRight,
  viewportBottom,
  viewportLeft,
  scrollDistance,
  menuOpen,
  overlapsInteractiveControl
}: SkipLinkVisibilityState): boolean {
  const mainStartOutsideViewport =
    markerBottom <= viewportTop ||
    markerTop >= viewportBottom ||
    markerRight <= viewportLeft ||
    markerLeft >= viewportRight;
  const headingVisibleHeight =
    headingTop === null || headingBottom === null
      ? Number.POSITIVE_INFINITY
      : Math.max(
          0,
          Math.min(headingBottom, viewportBottom) -
            Math.max(headingTop, viewportTop)
        );

  return (
    (mainStartOutsideViewport ||
      headingVisibleHeight < meaningfulHeadingHeight ||
      scrollDistance >= revealScrollDistance) &&
    !menuOpen &&
    !overlapsInteractiveControl
  );
}

function rectanglesOverlap(first: Rectangle, second: Rectangle): boolean {
  return (
    first.left < second.right + controlClearance &&
    first.right > second.left - controlClearance &&
    first.top < second.bottom + controlClearance &&
    first.bottom > second.top - controlClearance
  );
}

/** Stores visibility for the CSS rule while preserving keyboard focus access. */
export function updateSkipLinkState(
  skipLink: Pick<HTMLAnchorElement, "dataset">,
  visible: boolean
): void {
  skipLink.dataset.floatingVisible = String(visible);
}

/**
 * Recalculate from geometry on scroll and resize. This also catches zoom and
 * font changes that can move the marker without crossing an observer edge.
 * The ordinary anchor still handles navigation and keyboard focus.
 */
export function initializeSkipLink(
  root: Document = document
): (() => void) | null {
  const skipLink = root.querySelector<HTMLAnchorElement>(skipLinkSelector);

  if (!skipLink) {
    return null;
  }

  const targetId = getSkipLinkTargetId(skipLink.hash);

  if (!targetId) {
    return null;
  }

  const mainContent = root.getElementById(targetId);
  const mainStart = mainContent?.querySelector<HTMLElement>(mainStartSelector);
  const mainHeading = mainContent?.querySelector<HTMLElement>("h1");
  const view = root.defaultView;

  if (!mainStart || !view) {
    return null;
  }

  const header = root.querySelector<HTMLElement>("body > header");
  const compactMenu = header?.querySelector<HTMLDetailsElement>(
    "[data-mobile-navigation]"
  );
  let active = true;

  const update = () => {
    if (!active) {
      return;
    }

    const visualViewport = view.visualViewport;
    const viewportTop = visualViewport?.offsetTop ?? 0;
    const viewportLeft = visualViewport?.offsetLeft ?? 0;
    const viewportBottom =
      viewportTop + (visualViewport?.height ?? view.innerHeight);
    const viewportRight =
      viewportLeft + (visualViewport?.width ?? view.innerWidth);
    const marker = mainStart.getBoundingClientRect();
    const heading = mainHeading?.getBoundingClientRect();
    const button = skipLink.getBoundingClientRect();
    // Include controls and feedback added after initialization, such as errors.
    const controls = root.querySelectorAll<HTMLElement>(
      interactiveControlSelector
    );
    const overlapsInteractiveControl = [...controls].some((control) => {
      if (control === skipLink) return false;
      const closedDetails = control.closest("details:not([open])");

      if (closedDetails && control.tagName !== "SUMMARY") {
        return false;
      }

      const controlRect = control.getBoundingClientRect();

      return (
        controlRect.width > 0 &&
        controlRect.height > 0 &&
        rectanglesOverlap(button, controlRect)
      );
    });

    updateSkipLinkState(
      skipLink,
      shouldShowFloatingSkipLink({
        markerTop: marker.top,
        markerRight: marker.right,
        markerBottom: marker.bottom,
        markerLeft: marker.left,
        headingTop: heading?.top ?? null,
        headingBottom: heading?.bottom ?? null,
        viewportTop,
        viewportRight,
        viewportBottom,
        viewportLeft,
        scrollDistance: view.scrollY + viewportTop,
        menuOpen: Boolean(
          compactMenu?.open && compactMenu.getClientRects().length
        ),
        overlapsInteractiveControl
      })
    );
  };

  view.addEventListener("scroll", update, { passive: true });
  view.addEventListener("resize", update);
  view.visualViewport?.addEventListener("scroll", update);
  view.visualViewport?.addEventListener("resize", update);
  compactMenu?.addEventListener("toggle", update);
  root.addEventListener("focusin", update);
  root.fonts?.ready.then(update);
  update();

  return () => {
    active = false;
    view.removeEventListener("scroll", update);
    view.removeEventListener("resize", update);
    view.visualViewport?.removeEventListener("scroll", update);
    view.visualViewport?.removeEventListener("resize", update);
    compactMenu?.removeEventListener("toggle", update);
    root.removeEventListener("focusin", update);
  };
}
