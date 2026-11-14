import { act, createElement, type ReactNode } from "react";
import userEvent from "@testing-library/user-event";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import {
  fireEvent,
  getAllByRole,
  getByRole,
  queryByRole
} from "@testing-library/dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ExperienceRoot, {
  ConsoleErrorBoundary
} from "../../../src/features/experience/ExperienceRoot";
import {
  SCENE_IDS,
  type SceneImage
} from "../../../src/features/experience/types";
import { CONFIDENTIAL_NOTICE } from "../../../src/features/experience/console/state";
import {
  deferred,
  flushMicrotasks,
  mountHtml,
  setRect
} from "../../helpers/dom";

const names = [
  "Waiting area",
  "Control room",
  "Botanical study",
  "Lower stair",
  "Office hall",
  "Reception",
  "Town approach",
  "Signal room",
  "Clinical bloom",
  "Reflection room",
  "Closed passage"
];
const scenes: SceneImage[] = SCENE_IDS.map((id, index) => ({
  id,
  number: String(index + 1).padStart(2, "0"),
  name: names[index]!,
  location: "WEST WING",
  label: "INTERIOR / RETAINED",
  description: `${names[index]} — retained view`,
  alt: `Empty ${names[index]!.toLowerCase()}`,
  src: `/assets/${id}.webp`,
  srcSet: `/assets/${id}.webp 1672w`,
  width: 1672,
  height: 941
}));
const NETWORK = {
  clientIp: "192.0.2.1",
  country: "US",
  city: "Example city",
  region: "Example region",
  provider: "Example network",
  source: "Cloudflare request metadata",
  locationBasis: "IP-derived"
};
let root: Root | null;
let host: HTMLElement;
let reduced: MediaQueryList;
let fetchMock: ReturnType<typeof vi.fn>;

function media(matches: boolean) {
  const target = new EventTarget();
  return Object.assign(target, {
    matches,
    media: "",
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: target.dispatchEvent.bind(target)
  }) as MediaQueryList;
}
async function mount(endpoint = "/api/experience/network", images = scenes) {
  root = createRoot(host);
  await act(async () => {
    root!.render(
      createElement(ExperienceRoot, {
        scenes: images,
        networkEndpoint: endpoint
      })
    );
    await flushMicrotasks();
  });
}
async function click(name: string | RegExp) {
  await act(async () => {
    fireEvent.click(getByRole(document.body, "button", { name }));
    await flushMicrotasks();
  });
}
function frame() {
  return document.querySelector<HTMLImageElement>(".feed-image")!;
}
function readout(label: string) {
  const dt = [...document.querySelectorAll("dt")].find(
    (node) => node.textContent === label
  );
  return dt?.nextElementSibling?.textContent;
}
function notice() {
  return getByRole(document.body, "status").textContent;
}
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
async function dispatch(target: EventTarget, event: Event) {
  await act(async () => {
    target.dispatchEvent(event);
    await flushMicrotasks();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-01T12:00:00Z"));
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  mountHtml(
    '<header><h1>Station 04</h1><a id="experience-exit" href="/">Disconnect</a></header><main id="main-content"><div id="react-console"></div><section id="retained-views"><h2>Retained views</h2></section></main>'
  );
  host = document.getElementById("react-console")!;
  root = null;
  window.localStorage.clear();
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  reduced = media(false);
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) =>
      query.includes("reduced-motion") ? reduced : media(query.includes("fine"))
    )
  );
  fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify(NETWORK), {
        headers: { "Content-Type": "application/json" }
      })
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  document.getSelection()?.removeAllRanges();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("React observation console", () => {
  it("allows repeated native pointer and keyboard ambient toggles while recording activity", async () => {
    await mount();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const checkbox = getByRole(host, "checkbox", {
      name: /Ambient signal/
    }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    await act(async () => {
      await user.click(checkbox);
    });
    expect(checkbox.checked).toBe(false);
    await act(async () => {
      await user.click(checkbox);
    });
    expect(checkbox.checked).toBe(true);
    await act(async () => {
      checkbox.focus();
      await user.keyboard(" ");
    });
    expect(checkbox.checked).toBe(false);
    expect(
      document.querySelector(".experience-console")?.getAttribute("data-motion")
    ).toBe("off");
  });
  it("renders a static first frame with disabled controls before hydration", () => {
    const html = renderToString(
      createElement(ExperienceRoot, {
        scenes,
        networkEndpoint: "/api/experience/network"
      })
    );
    const fixture = document.createElement("div");
    fixture.innerHTML = html;
    expect(
      fixture.querySelector(".experience-console")?.getAttribute("data-ready")
    ).toBe("false");
    expect(fixture.querySelector(".feed-image")?.getAttribute("src")).toBe(
      "/assets/waiting.webp"
    );
    expect(
      [...fixture.querySelectorAll("button")].every((button) => button.disabled)
    ).toBe(true);
    expect(fixture.querySelector('a[href="#retained-views"]')).not.toBeNull();
    expect(fixture.querySelector("main,h1")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("attaches all eleven manual channels and selects every complete, uncropped scene", async () => {
    await mount();
    const group = getByRole(host, "group", { name: "Camera selection" });
    expect(getAllByRole(group, "button")).toHaveLength(11);
    expect(
      document.querySelector(".experience-console")?.getAttribute("data-ready")
    ).toBe("true");
    for (const scene of scenes) {
      await click(new RegExp(`^${scene.name}`));
      expect(frame().getAttribute("src")).toBe(scene.src);
      expect(frame().alt).toBe(scene.alt);
      expect(
        getByRole(group, "button", { pressed: true }).textContent
      ).toContain(scene.name);
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://portfolio.test/api/experience/network",
      expect.objectContaining({
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error"
      })
    );
    expect(window.localStorage.length).toBe(0);
  });

  it("holds the console room while the nested monitor follows selection and the local clock continues", async () => {
    await mount();
    await click(/^Control room/);
    await advance(900);
    expect(document.querySelectorAll(".mini-recursion")).toHaveLength(1);
    await click("Hold image");
    await click(/^Office hall/);
    expect(frame().src).toContain("control.webp");
    expect(
      document.querySelector<HTMLImageElement>(".mini-image img")?.src
    ).toContain("control.webp");
    await advance(900);
    expect(
      document.querySelector<HTMLImageElement>(".mini-image img")?.src
    ).toContain("hall.webp");
    expect(document.querySelector(".mini-recursion")).toBeNull();
    const clock = document.querySelector(".osd-clock time")?.textContent;
    await advance(1000);
    expect(document.querySelector(".osd-clock time")?.textContent).not.toBe(
      clock
    );
    await click("Release image");
    expect(frame().src).toContain("hall.webp");
    expect(document.querySelector(".monitor-window")).toBeNull();
  });

  it("updates the echo immediately in still mode and obeys live reduced-motion changes", async () => {
    window.localStorage.setItem("portfolio-scenery-motion", "still");
    await mount();
    await click(/^Control room/);
    await click("Hold image");
    await click(/^Lower stair/);
    expect(
      document.querySelector<HTMLImageElement>(".mini-image img")?.src
    ).toContain("stairs.webp");
    expect(document.querySelector(".scanlines,.roll")).toBeNull();
    await act(async () => {
      fireEvent.click(getByRole(host, "checkbox", { name: /Ambient signal/ }));
    });
    expect(document.querySelector(".roll")).not.toBeNull();
    Object.defineProperty(reduced, "matches", {
      value: true,
      configurable: true
    });
    await dispatch(reduced, new Event("change"));
    expect(
      (
        getByRole(host, "checkbox", {
          name: /Ambient signal/
        }) as HTMLInputElement
      ).disabled
    ).toBe(true);
    expect(document.querySelector(".scanlines,.roll")).toBeNull();
    expect(window.localStorage.getItem("portfolio-scenery-motion")).toBe(
      "still"
    );
  });

  it("retries image failures only on request and restores the selected frame", async () => {
    await mount();
    await dispatch(frame(), new Event("error"));
    expect(queryByRole(host, "alert")).not.toBeNull();
    await advance(10000);
    expect(queryByRole(host, "alert")).not.toBeNull();
    const failed = frame();
    await click("Retry image");
    expect(queryByRole(host, "alert")).toBeNull();
    expect(frame()).not.toBe(failed);
    await dispatch(frame(), new Event("error"));
    await click(/^Office hall/);
    expect(queryByRole(host, "alert")).toBeNull();
  });

  it("counts real visits and visible dwell, pauses hidden time, and resumes one clock after page restoration", async () => {
    await mount();
    await advance(5000);
    expect(readout("Visible selection time")).toBe("00:05");
    await click(/^Waiting area/);
    expect(readout("Actual view entries")).toBe("1");
    await click(/^Control room/);
    await advance(2000);
    await dispatch(window, new Event("pagehide"));
    await advance(10000);
    expect(readout("Visible selection time")).toBe("00:02");
    await dispatch(window, new Event("pageshow"));
    await dispatch(window, new Event("pageshow"));
    expect(readout("Last hidden interval")).toBe("00:10");
    expect(notice()).toContain("Return path restored");
    await advance(3000);
    expect(readout("Visible selection time")).toBe("00:05");
    await click(/^Waiting area/);
    expect(readout("Actual view entries")).toBe("2");
    expect(readout("Visible selection time")).toBe("00:05");
    expect(notice()).toContain("revisited");
  });

  it("announces idleness once per episode without collecting actual keys or pointer positions", async () => {
    await mount();
    await advance(30000);
    expect(notice()).toContain("No recent input");
    const events = () => document.querySelectorAll(".activity-log li");
    expect(events()).toHaveLength(2);
    await advance(5000);
    expect(events()).toHaveLength(2);
    await dispatch(
      host,
      new KeyboardEvent("keydown", { key: "SECRET", bubbles: true })
    );
    await advance(30000);
    expect(events()).toHaveLength(3);
    expect(host.textContent).not.toContain("SECRET");
  });

  it("shows an exit notice on header focus and pointer approach without cancelling departure", async () => {
    await mount();
    const exit = document.getElementById("experience-exit")!;
    setRect(exit, { left: 800, top: 0, width: 120, height: 44 });
    await act(async () => exit.focus());
    expect(notice()).toBe("All departures are accounted for.");
    expect(document.activeElement).toBe(exit);
    await act(async () => exit.blur());
    await dispatch(
      document,
      new MouseEvent("pointermove", {
        clientX: 790,
        clientY: 20,
        bubbles: true
      })
    );
    expect(notice()).toBe("All departures are accounted for.");
    const event = new MouseEvent("click", { cancelable: true });
    expect(exit.dispatchEvent(event)).toBe(true);
    expect(event.defaultPrevented).toBe(false);
    expect(exit.getAttribute("href")).toBe("/");
  });

  it("leaves copying and selecting available while issuing the exact confidentiality notice", async () => {
    await mount();
    const note = document.querySelector(".assurance")!;
    const selection = document.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(note);
    selection.addRange(range);
    await dispatch(document, new Event("selectionchange"));
    await advance(200);
    expect(notice()).toBe(CONFIDENTIAL_NOTICE);
    expect(selection.toString()).toBe("No one has been overlooked.");
    const count = document.querySelectorAll(".activity-log li").length;
    await dispatch(document, new Event("selectionchange"));
    await advance(200);
    expect(document.querySelectorAll(".activity-log li")).toHaveLength(count);
    const copy = new Event("copy", { bubbles: true, cancelable: true });
    await dispatch(note, copy);
    expect(copy.defaultPrevented).toBe(false);
    expect(readout("Information handling")).toBe("Notice issued");
    expect(document.querySelector(".activity-log")?.textContent).not.toContain(
      "No one has been overlooked."
    );
  });

  it("does not observe selections outside the console or text in editable fields", async () => {
    await mount();
    const outside = document.querySelector("h1")!;
    const selection = document.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(outside);
    selection.addRange(range);
    await dispatch(document, new Event("selectionchange"));
    await advance(200);
    expect(notice()).not.toBe(CONFIDENTIAL_NOTICE);
    const input = document.createElement("input");
    input.value = "Private value";
    host.append(input);
    await dispatch(input, new Event("copy", { bubbles: true }));
    expect(notice()).not.toBe(CONFIDENTIAL_NOTICE);
  });

  it("resets room visits, hold, notices, timer, and local log without adding document listeners", async () => {
    await mount();
    await click(/^Control room/);
    await click("Hold image");
    await advance(5000);
    await click("Reset station");
    expect(frame().src).toContain("waiting.webp");
    expect(readout("Actual view entries")).toBe("1");
    expect(readout("Visible selection time")).toBe("00:00");
    expect(document.querySelectorAll(".activity-log li")).toHaveLength(1);
    expect(
      getByRole(host, "button", { name: "Hold image" }).getAttribute(
        "aria-pressed"
      )
    ).toBe("false");
    await advance(30000);
    expect(document.querySelectorAll(".activity-log li")).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("handles missing scenes without losing the independent exit and archive", async () => {
    await mount("/api/experience/network", []);
    expect(host.textContent).toContain("No retained signal");
    expect(
      getByRole(document.body, "link", { name: "Disconnect" }).getAttribute(
        "href"
      )
    ).toBe("/");
    expect(
      getByRole(host, "link", { name: "Open retained views" }).getAttribute(
        "href"
      )
    ).toBe("#retained-views");
  });
});

describe("terminal and network failure behavior", () => {
  it("reports optional browser APIs honestly and renders actual Worker network metadata as text", async () => {
    await mount();
    expect(readout("Reported battery")).toBe("Unavailable");
    expect(readout("Approximate memory")).toBe("Unavailable");
    expect(readout("Public connection address")).toBe("192.0.2.1");
    expect(readout("Network provider")).toBe("Example network");
    expect(host.textContent).toContain("Cloudflare request metadata");
    expect(host.textContent).toContain("proxy or VPN");
  });

  it("supports battery and estimated connection changes, then detaches listeners when suspended", async () => {
    const battery = Object.assign(new EventTarget(), {
      level: 0.65,
      charging: false
    });
    const connection = Object.assign(new EventTarget(), {
      effectiveType: "4g",
      downlink: 7.5
    });
    Object.defineProperty(navigator, "getBattery", {
      configurable: true,
      value: vi.fn(async () => battery)
    });
    Object.defineProperty(navigator, "deviceMemory", {
      configurable: true,
      value: 8
    });
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: connection
    });
    try {
      await mount();
      expect(readout("Reported battery")).toBe("65%");
      expect(readout("Reported power state")).toBe("On battery");
      expect(readout("Approximate memory")).toBe("Approximately 8 GiB");
      expect(readout("Connection estimate")).toContain("7.5 Mb/s");
      battery.level = 0.8;
      battery.charging = true;
      await dispatch(battery, new Event("levelchange"));
      expect(readout("Reported battery")).toBe("80%");
      expect(readout("Reported power state")).toBe("Charging");
      await dispatch(window, new Event("pagehide"));
      battery.level = 0.9;
      await dispatch(battery, new Event("levelchange"));
      expect(readout("Reported battery")).toBe("80%");
      await dispatch(window, new Event("pageshow"));
      expect(readout("Reported battery")).toBe("90%");
    } finally {
      delete (navigator as Navigator & { getBattery?: unknown }).getBattery;
      delete (navigator as Navigator & { deviceMemory?: unknown }).deviceMemory;
      delete (navigator as Navigator & { connection?: unknown }).connection;
    }
  });

  it("blocks external endpoints and keeps local readings when the same-origin service fails", async () => {
    await mount("https://outside.test/lookup");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(readout("Public connection address")).toBe("Unavailable");
    expect(readout("Local time")).not.toContain("Unavailable");
    await act(async () => root!.unmount());
    root = null;
    fetchMock.mockResolvedValue(
      new Response("temporarily unavailable", { status: 503 })
    );
    await mount();
    expect(readout("Public connection address")).toBe("Unavailable");
    expect(host.textContent).toContain("Local readings remain active");
  });

  it("bounds a hanging network request, aborts it, and ignores late results", async () => {
    const pending = deferred<Response>();
    fetchMock.mockReturnValue(pending.promise);
    await mount();
    const signal = fetchMock.mock.calls[0]![1].signal as AbortSignal;
    await advance(8000);
    expect(signal.aborted).toBe(true);
    expect(readout("Public connection address")).toBe("Unavailable");
    await act(async () => {
      pending.resolve(new Response(JSON.stringify(NETWORK)));
      await flushMicrotasks();
    });
    expect(readout("Public connection address")).toBe("Unavailable");
  });

  it("aborts pending reads on pagehide, refetches on restoration, and ignores stale response generations", async () => {
    const pending = deferred<Response>();
    fetchMock.mockReturnValueOnce(pending.promise);
    await mount();
    const signal = fetchMock.mock.calls[0]![1].signal as AbortSignal;
    await dispatch(window, new Event("pagehide"));
    expect(signal.aborted).toBe(true);
    await dispatch(window, new Event("pageshow"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(readout("Public connection address")).toBe("192.0.2.1");
    await act(async () => {
      pending.resolve(
        new Response(JSON.stringify({ ...NETWORK, clientIp: "192.0.2.2" }))
      );
      await flushMicrotasks();
    });
    expect(readout("Public connection address")).toBe("192.0.2.1");
  });

  it("recovers a failed React circuit through its boundary while native navigation remains intact", async () => {
    let crash = true;
    function Circuit(): ReactNode {
      if (crash) throw new Error("Synthetic circuit failure");
      return createElement("p", null, "Circuit restored");
    }
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const reset = vi.fn(() => {
      crash = false;
    });
    root = createRoot(host);
    await act(async () =>
      root!.render(
        createElement(ConsoleErrorBoundary, {
          onReset: reset,
          children: createElement(Circuit)
        })
      )
    );
    expect(getByRole(host, "alert").textContent).toContain(
      "Station unavailable"
    );
    expect(
      getByRole(document.body, "link", { name: "Disconnect" })
    ).not.toBeNull();
    expect(
      getByRole(host, "link", { name: "Open retained views" }).getAttribute(
        "href"
      )
    ).toBe("#retained-views");
    await click("Retry station");
    expect(reset).toHaveBeenCalledOnce();
    expect(host.textContent).toContain("Circuit restored");
    expect(error).toHaveBeenCalled();
  });
});
