import { useEffect, useReducer, useState, type RefObject } from "react";
import type { SceneId } from "../types";
import { activityReducer, CONFIDENTIAL_NOTICE, initialActivity } from "./state";

/** All activity is ephemeral, scoped to this document, and contains no typed or selected content. */
export function useActivity(
  rootRef: RefObject<HTMLDivElement | null>,
  initialId: SceneId
) {
  const [ready, setReady] = useState(false);
  const [activity, dispatch] = useReducer(
    activityReducer,
    initialActivity(0, initialId, false)
  );

  useEffect(() => {
    const root = rootRef.current?.closest("main") ?? rootRef.current;
    if (!root) return;
    const exit = document.getElementById("experience-exit");
    let suspended = false;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let selectionTimer: ReturnType<typeof setTimeout> | undefined;
    let inputTimer: ReturnType<typeof setTimeout> | undefined;
    let pendingInputAt = 0;
    let lastPointerUpdate = -Infinity;
    let pointerNear = false;
    let exitFocused = false;
    let departureNoticed = false;
    let selectionArmed = true;
    let lastSelection: [Node | null, number, Node | null, number] | null = null;
    const now = Date.now();
    dispatch({ type: "reset", now, id: initialId, visible: !document.hidden });
    setReady(true);

    function active() {
      return !disposed && !suspended && !document.hidden;
    }
    function clearTimers() {
      clearTimeout(timer);
      clearTimeout(selectionTimer);
      clearTimeout(inputTimer);
      timer = selectionTimer = inputTimer = undefined;
    }
    function tick() {
      clearTimeout(timer);
      if (!active()) return;
      dispatch({ type: "tick", now: Date.now() });
      timer = setTimeout(tick, 1000 - (Date.now() % 1000));
    }
    function input(event: Event) {
      if (!active()) return;
      const time = Date.now();
      if (event.type === "pointermove" && time - lastPointerUpdate < 250)
        return;
      if (event.type === "pointermove") lastPointerUpdate = time;
      if (event.type === "pointerdown" || event.type === "keydown")
        selectionArmed = true;
      // Native capture runs before React's controlled checkbox handler. A new
      // task lets that handler finish before an unrelated controlled-input render;
      // microtasks can run between native listeners in a real browser.
      pendingInputAt = time;
      clearTimeout(inputTimer);
      inputTimer = setTimeout(() => {
        inputTimer = undefined;
        if (active()) dispatch({ type: "input", now: pendingInputAt });
      }, 0);
    }
    function notice(message: string, copy = false) {
      if (active())
        dispatch({ type: "notice", now: Date.now(), message, copy });
    }
    function checkDeparture() {
      if (pointerNear || exitFocused) {
        if (!departureNoticed) {
          departureNoticed = true;
          notice("All departures are accounted for.");
        }
      } else departureNoticed = false;
    }
    function approach(event: Event) {
      if (!exit || !active()) return;
      const pointer = event as PointerEvent;
      if (pointer.pointerType === "touch") return;
      const box = exit.getBoundingClientRect();
      // A hidden/unlaid-out exit is not a meaningful proximity target.
      if (box.width === 0 && box.height === 0) return;
      const distance = Math.hypot(
        Math.max(box.left - pointer.clientX, 0, pointer.clientX - box.right),
        Math.max(box.top - pointer.clientY, 0, pointer.clientY - box.bottom)
      );
      if (distance <= 80) pointerNear = true;
      else if (distance > 120) pointerNear = false;
      checkDeparture();
    }
    function leave() {
      pointerNear = false;
      checkDeparture();
    }
    function focusExit() {
      exitFocused = true;
      checkDeparture();
    }
    function blurExit() {
      exitFocused = false;
      checkDeparture();
    }
    function editable(node: Node | null) {
      const element = node instanceof Element ? node : node?.parentElement;
      return Boolean(
        element?.closest(
          'input,textarea,[contenteditable]:not([contenteditable="false"])'
        )
      );
    }
    function inspectSelection() {
      if (!active()) return;
      const selection = document.getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount) {
        selectionArmed = true;
        lastSelection = null;
        return;
      }
      if (
        !root!.contains(selection.anchorNode) ||
        !root!.contains(selection.focusNode) ||
        editable(selection.anchorNode) ||
        editable(selection.focusNode)
      )
        return;
      const key: [Node | null, number, Node | null, number] = [
        selection.anchorNode,
        selection.anchorOffset,
        selection.focusNode,
        selection.focusOffset
      ];
      if (
        !selectionArmed ||
        key.every((part, index) => part === lastSelection?.[index])
      )
        return;
      lastSelection = key;
      selectionArmed = false;
      notice(CONFIDENTIAL_NOTICE, true);
    }
    function selectionChanged() {
      clearTimeout(selectionTimer);
      if (active()) selectionTimer = setTimeout(inspectSelection, 200);
    }
    function copy(event: Event) {
      if (editable(event.target instanceof Node ? event.target : null)) return;
      input(event);
      notice(CONFIDENTIAL_NOTICE, true);
    }
    function visibility() {
      if (!active()) {
        clearTimers();
        dispatch({ type: "hide", now: Date.now() });
      } else {
        dispatch({ type: "show", now: Date.now() });
        tick();
      }
    }
    function hide() {
      suspended = true;
      visibility();
    }
    function show() {
      suspended = false;
      visibility();
    }
    const inputEvents = [
      "pointerdown",
      "pointermove",
      "click",
      "keydown",
      "scroll",
      "wheel",
      "touchstart"
    ];
    inputEvents.forEach((type) =>
      root.addEventListener(type, input, { passive: true, capture: true })
    );
    document.addEventListener("pointermove", approach, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave, {
      passive: true
    });
    root.addEventListener("copy", copy);
    exit?.addEventListener("focus", focusExit);
    exit?.addEventListener("blur", blurExit);
    document.addEventListener("selectionchange", selectionChanged);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", show);
    tick();
    return () => {
      disposed = true;
      clearTimers();
      inputEvents.forEach((type) =>
        root.removeEventListener(type, input, true)
      );
      document.removeEventListener("pointermove", approach);
      document.documentElement.removeEventListener("pointerleave", leave);
      root.removeEventListener("copy", copy);
      exit?.removeEventListener("focus", focusExit);
      exit?.removeEventListener("blur", blurExit);
      document.removeEventListener("selectionchange", selectionChanged);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", show);
    };
  }, [rootRef, initialId]);
  return { activity, dispatch, ready };
}
