import { SCENE_IDS, type SceneId } from "../types";

export interface FeedState {
  selectedId: SceneId;
  echoId: SceneId;
  heldId: SceneId | null;
  imageFailed: boolean;
  imageAttempt: number;
}

export type FeedAction =
  | { type: "select"; id: string }
  | { type: "echo"; id: string }
  | { type: "hold" }
  | { type: "image-failed" }
  | { type: "retry" };

export function isSceneId(id: string): id is SceneId {
  return SCENE_IDS.some((value) => value === id);
}

export function initialFeed(id: SceneId = "waiting"): FeedState {
  return {
    selectedId: id,
    echoId: id,
    heldId: null,
    imageFailed: false,
    imageAttempt: 0
  };
}

export function displayedId(state: FeedState): SceneId {
  return state.heldId ?? state.selectedId;
}

export function feedReducer(state: FeedState, action: FeedAction): FeedState {
  switch (action.type) {
    case "select":
      if (!isSceneId(action.id) || action.id === state.selectedId) return state;
      return {
        ...state,
        selectedId: action.id,
        imageFailed: state.heldId ? state.imageFailed : false
      };
    case "echo":
      return isSceneId(action.id) && action.id !== state.echoId
        ? { ...state, echoId: action.id }
        : state;
    case "hold":
      return {
        ...state,
        heldId: state.heldId ? null : state.selectedId,
        imageFailed: state.heldId ? false : state.imageFailed
      };
    case "image-failed":
      return { ...state, imageFailed: true };
    case "retry":
      return {
        ...state,
        imageFailed: false,
        imageAttempt: state.imageAttempt + 1
      };
  }
}

export const CONFIDENTIAL_NOTICE =
  "Confidential information must not be shared.";
export const INITIAL_NOTICE = "Both ends of the circuit remain accounted for.";
export interface ActivityEvent {
  at: number;
  message: string;
}
export interface RoomActivity {
  visits: number;
  visibleMs: number;
}
export interface ActivityState {
  now: number;
  startedAt: number;
  lastInputAt: number;
  selectedId: SceneId;
  selectedSince: number | null;
  hiddenAt: number | null;
  awayMs: number | null;
  visible: boolean;
  rooms: Partial<Record<SceneId, RoomActivity>>;
  idleIssued: boolean;
  copyNotice: boolean;
  notice: string;
  events: ActivityEvent[];
}
export type ActivityAction =
  | { type: "reset"; now: number; id: SceneId; visible: boolean }
  | { type: "tick" | "input" | "hide" | "show"; now: number }
  | { type: "select"; now: number; id: SceneId; name: string }
  | { type: "notice"; now: number; message: string; copy?: boolean };

export function initialActivity(
  now: number,
  id: SceneId,
  visible: boolean
): ActivityState {
  return {
    now,
    startedAt: now,
    lastInputAt: now,
    selectedId: id,
    selectedSince: visible ? now : null,
    hiddenAt: visible ? null : now,
    awayMs: null,
    visible,
    rooms: { [id]: { visits: 1, visibleMs: 0 } },
    idleIssued: false,
    copyNotice: false,
    notice: INITIAL_NOTICE,
    events: [
      {
        at: now,
        message: "Observer channel attached. Coverage remains complete."
      }
    ]
  };
}

function record(
  state: ActivityState,
  at: number,
  message: string
): ActivityState {
  return {
    ...state,
    now: at,
    notice: message,
    events: [{ at, message }, ...state.events].slice(0, 8)
  };
}

export function visibleSelectionMs(state: ActivityState): number {
  return (
    (state.rooms[state.selectedId]?.visibleMs ?? 0) +
    (state.visible && state.selectedSince !== null
      ? Math.max(0, state.now - state.selectedSince)
      : 0)
  );
}

function commitRoom(state: ActivityState, now: number): ActivityState {
  const room = state.rooms[state.selectedId] ?? { visits: 0, visibleMs: 0 };
  return {
    ...state,
    selectedSince: null,
    rooms: {
      ...state.rooms,
      [state.selectedId]: {
        ...room,
        visibleMs:
          room.visibleMs +
          (state.visible && state.selectedSince !== null
            ? Math.max(0, now - state.selectedSince)
            : 0)
      }
    }
  };
}

export function activityReducer(
  state: ActivityState,
  action: ActivityAction
): ActivityState {
  switch (action.type) {
    case "reset":
      return initialActivity(action.now, action.id, action.visible);
    case "tick": {
      const next = { ...state, now: action.now };
      return state.visible &&
        action.now - state.lastInputAt >= 30000 &&
        !state.idleIssued
        ? record(
            { ...next, idleIssued: true },
            action.now,
            "No recent input. Coverage remains complete."
          )
        : next;
    }
    case "input":
      return {
        ...state,
        now: action.now,
        lastInputAt: action.now,
        idleIssued: false
      };
    case "hide":
      return state.visible
        ? {
            ...commitRoom(state, action.now),
            now: action.now,
            visible: false,
            hiddenAt: action.now
          }
        : state;
    case "show": {
      if (state.visible) return { ...state, now: action.now };
      return record(
        {
          ...state,
          now: action.now,
          visible: true,
          selectedSince: action.now,
          awayMs: Math.max(0, action.now - (state.hiddenAt ?? action.now)),
          hiddenAt: null,
          idleIssued: action.now - state.lastInputAt >= 30000
        },
        action.now,
        "Return path restored. Service continued during the absence."
      );
    }
    case "select": {
      if (action.id === state.selectedId)
        return record(
          state,
          action.now,
          `${action.name} reselected. Familiarity is encouraged.`
        );
      const room = state.rooms[action.id] ?? { visits: 0, visibleMs: 0 };
      const committed = commitRoom(state, action.now);
      const next = {
        ...committed,
        selectedId: action.id,
        selectedSince: state.visible ? action.now : null,
        rooms: {
          ...committed.rooms,
          [action.id]: { ...room, visits: room.visits + 1 }
        }
      };
      return record(
        next,
        action.now,
        room.visits > 0
          ? `${action.name} revisited. Familiarity is encouraged.`
          : action.id === "control"
            ? "Observation suite access remains authorized."
            : `${action.name} selected. Coverage remains complete.`
      );
    }
    case "notice":
      return record(
        { ...state, copyNotice: state.copyNotice || Boolean(action.copy) },
        action.now,
        action.message
      );
  }
}
