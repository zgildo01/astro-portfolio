const initializations = new WeakMap<Document, () => void>();

/** Keep decorative tracking plates aligned with the responsive image in view. */
export function initializeFrameInterference(
  root: Document = document
): (() => void) | null {
  const existing = initializations.get(root);
  if (existing) return existing;

  const view = root.defaultView;
  const frames = Array.from(
    root.querySelectorAll<HTMLElement>("[data-frame-interference]")
  );
  if (!view || !frames.length || !view.IntersectionObserver) return null;

  const images = frames.flatMap((frame) => {
    const image = frame.querySelector<HTMLImageElement>("img");
    return image ? [{ frame, image }] : [];
  });
  const visibleFrames = new Set<Element>();
  let suspended = false;

  const refreshVisibility = () => {
    for (const frame of frames) {
      frame.dataset.frameVisible = String(
        !suspended && !root.hidden && visibleFrames.has(frame)
      );
    }
  };

  const refreshSources = () => {
    for (const { frame, image } of images) {
      const source = image.currentSrc || image.src;
      if (source) {
        frame.style.setProperty(
          "--frame-source",
          `url(${JSON.stringify(source)})`
        );
      } else {
        frame.style.removeProperty("--frame-source");
      }
    }
  };

  const observer = new view.IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) visibleFrames.add(entry.target);
      else visibleFrames.delete(entry.target);
    }
    refreshVisibility();
  });

  const onPageHide = () => {
    suspended = true;
    refreshVisibility();
  };
  const onPageShow = () => {
    suspended = false;
    refreshSources();
    refreshVisibility();
  };

  refreshSources();
  refreshVisibility();
  for (const frame of frames) observer.observe(frame);
  for (const { image } of images)
    image.addEventListener("load", refreshSources);
  root.addEventListener("visibilitychange", refreshVisibility);
  view.addEventListener("resize", refreshSources, { passive: true });
  view.addEventListener("pagehide", onPageHide);
  view.addEventListener("pageshow", onPageShow);

  const cleanup = () => {
    observer.disconnect();
    for (const { image } of images)
      image.removeEventListener("load", refreshSources);
    for (const frame of frames) {
      delete frame.dataset.frameVisible;
      frame.style.removeProperty("--frame-source");
    }
    root.removeEventListener("visibilitychange", refreshVisibility);
    view.removeEventListener("resize", refreshSources);
    view.removeEventListener("pagehide", onPageHide);
    view.removeEventListener("pageshow", onPageShow);
    initializations.delete(root);
  };
  initializations.set(root, cleanup);
  return cleanup;
}
