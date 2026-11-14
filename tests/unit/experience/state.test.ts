import { describe, expect, it } from "vitest";
import {
  activityReducer,
  CONFIDENTIAL_NOTICE,
  displayedId,
  feedReducer,
  initialActivity,
  initialFeed,
  isSceneId,
  visibleSelectionMs
} from "../../../src/features/experience/console/state";

describe("console feed state", () => {
  it("starts at the waiting room and ignores unknown channels", () => {
    const feed = initialFeed();
    expect(displayedId(feed)).toBe("waiting");
    expect(isSceneId("control")).toBe(true);
    expect(isSceneId("__proto__")).toBe(false);
    expect(feedReducer(feed, { type: "select", id: "elsewhere" })).toBe(feed);
    expect(feedReducer(feed, { type: "echo", id: "elsewhere" })).toBe(feed);
    expect(feedReducer(feed, { type: "select", id: "waiting" })).toBe(feed);
  });

  it("holds the outer image while selection and recursive echo move independently", () => {
    let feed = initialFeed("control");
    feed = feedReducer(feed, { type: "hold" });
    feed = feedReducer(feed, { type: "select", id: "hall" });
    feed = feedReducer(feed, { type: "echo", id: "hall" });
    expect(displayedId(feed)).toBe("control");
    expect(feed.selectedId).toBe("hall");
    expect(feed.echoId).toBe("hall");
    expect(feedReducer(feed, { type: "echo", id: "hall" })).toBe(feed);
    feed = feedReducer(feed, { type: "hold" });
    expect(displayedId(feed)).toBe("hall");
    expect(feed.heldId).toBeNull();
  });

  it("retries one failed image explicitly and clears failures on a new unheld feed", () => {
    let feed = feedReducer(initialFeed(), { type: "image-failed" });
    expect(feed.imageFailed).toBe(true);
    feed = feedReducer(feed, { type: "retry" });
    expect(feed.imageFailed).toBe(false);
    expect(feed.imageAttempt).toBe(1);
    feed = feedReducer(feedReducer(feed, { type: "image-failed" }), {
      type: "select",
      id: "stairs"
    });
    expect(feed.imageFailed).toBe(false);
  });

  it("retains a failed held image until retry or release", () => {
    let feed = feedReducer(initialFeed(), { type: "hold" });
    feed = feedReducer(feed, { type: "image-failed" });
    feed = feedReducer(feed, { type: "select", id: "hall" });
    expect(feed.imageFailed).toBe(true);
    expect(feedReducer(feed, { type: "hold" }).imageFailed).toBe(false);
  });
});

describe("ephemeral observation state", () => {
  it("counts genuine entries and accumulates visible selected time across revisits", () => {
    let state = initialActivity(1000, "waiting", true);
    state = activityReducer(state, { type: "tick", now: 5000 });
    expect(visibleSelectionMs(state)).toBe(4000);
    state = activityReducer(state, {
      type: "select",
      id: "waiting",
      name: "Waiting area",
      now: 6000
    });
    expect(state.rooms.waiting?.visits).toBe(1);
    state = activityReducer(state, {
      type: "select",
      id: "control",
      name: "Control room",
      now: 7000
    });
    expect(state.rooms.waiting?.visibleMs).toBe(6000);
    expect(state.notice).toBe("Observation suite access remains authorized.");
    state = activityReducer(state, {
      type: "select",
      id: "waiting",
      name: "Waiting area",
      now: 10000
    });
    expect(state.rooms.waiting?.visits).toBe(2);
    expect(state.rooms.control?.visibleMs).toBe(3000);
    expect(state.notice).toContain("revisited");
    state = activityReducer(state, { type: "tick", now: 12000 });
    expect(visibleSelectionMs(state)).toBe(8000);
  });

  it("excludes hidden and page-cache intervals without double-counting duplicate lifecycle events", () => {
    let state = initialActivity(0, "waiting", true);
    state = activityReducer(state, { type: "hide", now: 5000 });
    expect(activityReducer(state, { type: "hide", now: 7000 })).toBe(state);
    state = activityReducer(state, {
      type: "select",
      id: "hall",
      name: "Office hall",
      now: 9000
    });
    expect(state.selectedSince).toBeNull();
    expect(visibleSelectionMs(state)).toBe(0);
    state = activityReducer(state, { type: "show", now: 65000 });
    expect(state.awayMs).toBe(60000);
    expect(state.notice).toContain("Return path restored");
    state = activityReducer(state, { type: "show", now: 66000 });
    expect(
      state.events.filter((event) => event.message.includes("Return path"))
    ).toHaveLength(1);
    state = activityReducer(state, { type: "tick", now: 70000 });
    expect(visibleSelectionMs(state)).toBe(5000);
    expect(state.notice).toContain("Return path restored");
  });

  it("announces idleness once per input episode, with no hidden idle announcements", () => {
    let state = initialActivity(0, "waiting", true);
    state = activityReducer(state, { type: "tick", now: 30000 });
    expect(state.notice).toContain("No recent input");
    const count = state.events.length;
    state = activityReducer(state, { type: "tick", now: 40000 });
    expect(state.events).toHaveLength(count);
    state = activityReducer(state, { type: "input", now: 41000 });
    state = activityReducer(state, { type: "tick", now: 71000 });
    expect(state.events).toHaveLength(count + 1);
    state = activityReducer(state, { type: "hide", now: 72000 });
    state = activityReducer(state, { type: "tick", now: 100000 });
    expect(state.events).toHaveLength(count + 1);
  });

  it("bounds the log and resets all local observations without retaining copied content", () => {
    let state = initialActivity(0, "waiting", false);
    expect(visibleSelectionMs(state)).toBe(0);
    for (let i = 1; i < 12; i++)
      state = activityReducer(state, {
        type: "notice",
        now: i * 1000,
        message: CONFIDENTIAL_NOTICE,
        copy: true
      });
    expect(state.events).toHaveLength(8);
    expect(state.events[0]?.at).toBe(11000);
    expect(state.copyNotice).toBe(true);
    expect(
      state.events.every(
        (event) => Object.keys(event).sort().join(",") === "at,message"
      )
    ).toBe(true);
    state = activityReducer(state, {
      type: "reset",
      now: 12000,
      id: "waiting",
      visible: true
    });
    expect(state.events).toHaveLength(1);
    expect(state.copyNotice).toBe(false);
    expect(state.rooms).toEqual({ waiting: { visits: 1, visibleMs: 0 } });
    expect(state.startedAt).toBe(12000);
  });
});
