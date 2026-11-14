import { useEffect, useState } from "react";
import type { NetworkReadout } from "../types";
import {
  browserFamily,
  parseNetworkReadout,
  platformFamily,
  reportedNumber,
  safely,
  sameOriginEndpoint
} from "./readouts";

interface BatteryReport extends EventTarget {
  level: number;
  charging: boolean;
}
interface ConnectionReport extends EventTarget {
  effectiveType?: string;
  downlink?: number;
}
interface OptionalNavigator extends Navigator {
  deviceMemory?: number;
  getBattery?: () => Promise<BatteryReport>;
  connection?: ConnectionReport;
}
export interface BrowserReadings {
  client: string;
  platform: string;
  locale: string;
  zone: string;
  viewport: string;
  display: string;
  input: string;
  threads: string;
  memory: string;
  battery: string;
  power: string;
  connection: string;
}
const unavailable = "Unavailable";
const INITIAL: BrowserReadings = {
  client: "Unknown",
  platform: "Unknown",
  locale: unavailable,
  zone: unavailable,
  viewport: unavailable,
  display: unavailable,
  input: unavailable,
  threads: unavailable,
  memory: unavailable,
  battery: unavailable,
  power: unavailable,
  connection: unavailable
};
function dimensions(width: number, height: number) {
  return Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0
    ? `${Math.round(width)} × ${Math.round(height)} CSS px`
    : unavailable;
}

export function useBrowserReadings() {
  const [readings, setReadings] = useState(INITIAL);
  useEffect(() => {
    let alive = true;
    let suspended = document.hidden;
    let battery: BatteryReport | null = null;
    let batteryRequested = false;
    let batteryListening = false;
    let connectionListening = false;
    const nav = navigator as OptionalNavigator;
    const connection = safely(() => nav.connection, undefined);
    const pointerQueries = ["coarse", "fine", "none"].map((type) =>
      safely(() => window.matchMedia(`(pointer: ${type})`), null)
    );
    function update(fields: Partial<BrowserReadings>) {
      if (alive && !suspended)
        setReadings((current) => ({ ...current, ...fields }));
    }
    function profile() {
      const agent = safely(() => nav.userAgent, "");
      const pointerIndex = pointerQueries.findIndex((query) => query?.matches);
      let input =
        ["Coarse pointer", "Fine pointer", "No primary pointer"][
          pointerIndex
        ] ?? unavailable;
      if (safely(() => nav.maxTouchPoints > 0, false))
        input =
          input === unavailable
            ? "Touch available"
            : `${input} / touch available`;
      const memory = safely(() => nav.deviceMemory, undefined);
      update({
        client: browserFamily(agent),
        platform: platformFamily(agent),
        locale: safely(() => nav.language || unavailable, unavailable),
        zone: safely(
          () => Intl.DateTimeFormat().resolvedOptions().timeZone || unavailable,
          unavailable
        ),
        viewport: safely(
          () => dimensions(window.innerWidth, window.innerHeight),
          unavailable
        ),
        display: safely(
          () => dimensions(window.screen.width, window.screen.height),
          unavailable
        ),
        input,
        threads: reportedNumber(
          safely(() => nav.hardwareConcurrency, 0),
          "",
          true
        ),
        memory:
          reportedNumber(memory) === unavailable
            ? unavailable
            : `Approximately ${memory} GiB`
      });
    }
    function power() {
      if (!battery) return;
      const level = safely(() => battery!.level, NaN);
      const charging = safely(() => battery!.charging, undefined);
      update({
        battery:
          Number.isFinite(level) && level >= 0 && level <= 1
            ? `${Math.round(level * 100)}%`
            : unavailable,
        power:
          typeof charging === "boolean"
            ? charging
              ? "Charging"
              : "On battery"
            : unavailable
      });
    }
    function link() {
      const type = safely(() => connection?.effectiveType, undefined);
      const downlink = safely(() => connection?.downlink, undefined);
      const parts: string[] = [];
      if (
        typeof type === "string" &&
        ["slow-2g", "2g", "3g", "4g"].includes(type)
      )
        parts.push(`${type.toUpperCase()} equivalent`);
      if (
        typeof downlink === "number" &&
        Number.isFinite(downlink) &&
        downlink >= 0
      )
        parts.push(`~${downlink} Mb/s`);
      update({
        connection: parts.length
          ? `${parts.join(" / ")} (estimated)`
          : unavailable
      });
    }
    function attach() {
      if (!alive || suspended) return;
      if (battery && !batteryListening) {
        safely(() => {
          battery!.addEventListener("levelchange", power);
          battery!.addEventListener("chargingchange", power);
          batteryListening = true;
        }, undefined);
      }
      if (connection && !connectionListening) {
        safely(() => {
          connection.addEventListener("change", link);
          connectionListening = true;
        }, undefined);
      }
      profile();
      power();
      link();
      const getBattery = safely(() => nav.getBattery, undefined);
      if (!batteryRequested && typeof getBattery === "function") {
        batteryRequested = true;
        Promise.resolve()
          .then(() => getBattery.call(nav))
          .then((result) => {
            if (!alive || !result || typeof result !== "object") return;
            battery = result;
            attach();
          })
          .catch(() => {
            /* Unsupported and privacy-restricted reports remain unavailable. */
          });
      }
    }
    function detach() {
      if (batteryListening && battery)
        safely(() => {
          battery!.removeEventListener("levelchange", power);
          battery!.removeEventListener("chargingchange", power);
        }, undefined);
      if (connectionListening && connection)
        safely(() => connection.removeEventListener("change", link), undefined);
      batteryListening = connectionListening = false;
    }
    function hide() {
      suspended = true;
      detach();
    }
    function show() {
      suspended = document.hidden;
      if (!suspended) attach();
    }
    function visibility() {
      if (document.hidden) hide();
      else show();
    }
    pointerQueries.forEach((query) =>
      safely(() => query?.addEventListener("change", profile), undefined)
    );
    window.addEventListener("resize", profile);
    window.addEventListener("languagechange", profile);
    window.addEventListener("focus", profile);
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", show);
    document.addEventListener("visibilitychange", visibility);
    attach();
    return () => {
      alive = false;
      detach();
      pointerQueries.forEach((query) =>
        safely(() => query?.removeEventListener("change", profile), undefined)
      );
      window.removeEventListener("resize", profile);
      window.removeEventListener("languagechange", profile);
      window.removeEventListener("focus", profile);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", show);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  return readings;
}

export function useNetworkReadings(endpoint: string) {
  const [network, setNetwork] = useState<NetworkReadout | null>(null);
  const [networkStatus, setStatus] = useState<
    "pending" | "available" | "unavailable"
  >("pending");
  useEffect(() => {
    let disposed = false;
    let suspended = document.hidden;
    let complete = false;
    let generation = 0;
    let controller: AbortController | null = null;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const address = sameOriginEndpoint(endpoint, window.location.origin);
    function start() {
      if (disposed || suspended || complete || controller) return;
      if (!address || typeof window.fetch !== "function") {
        complete = true;
        setStatus("unavailable");
        return;
      }
      const current = ++generation;
      controller = new AbortController();
      const signal = controller.signal;
      timeout = setTimeout(() => {
        if (disposed || suspended || generation !== current || complete) return;
        complete = true;
        controller?.abort();
        controller = null;
        setStatus("unavailable");
      }, 8000);
      Promise.resolve()
        .then(() => {
          if (signal.aborted) throw new Error("Readout suspended");
          return window.fetch(address, {
            method: "GET",
            credentials: "same-origin",
            cache: "no-store",
            redirect: "error",
            headers: { Accept: "application/json" },
            signal
          });
        })
        .then((response) => {
          if (!response.ok) throw new Error("Readout unavailable");
          return response.json();
        })
        .then((data: unknown) => {
          if (
            disposed ||
            suspended ||
            generation !== current ||
            complete ||
            signal.aborted
          )
            return;
          const parsed = parseNetworkReadout(data);
          if (!parsed) throw new Error("Invalid readout");
          clearTimeout(timeout);
          complete = true;
          controller = null;
          setNetwork(parsed);
          setStatus("available");
        })
        .catch(() => {
          if (disposed || suspended || generation !== current) return;
          clearTimeout(timeout);
          complete = true;
          controller = null;
          setStatus("unavailable");
        });
    }
    function hide() {
      suspended = true;
      generation++;
      clearTimeout(timeout);
      controller?.abort();
      controller = null;
    }
    function show() {
      suspended = document.hidden;
      if (!suspended) start();
    }
    function visibility() {
      if (document.hidden) hide();
      else show();
    }
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", show);
    document.addEventListener("visibilitychange", visibility);
    start();
    return () => {
      disposed = true;
      clearTimeout(timeout);
      controller?.abort();
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", show);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [endpoint]);
  return { network, networkStatus };
}

export function useAmbientSignal() {
  const [requested, setRequested] = useState(false);
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    const query = safely(
      () => window.matchMedia("(prefers-reduced-motion: reduce)"),
      null
    );
    // No media API means a still signal. Only a real preference is read; nothing is stored.
    const saved = safely(
      () => window.localStorage.getItem("portfolio-scenery-motion"),
      null
    );
    setRequested(saved !== "still");
    const update = () => setReduced(query ? query.matches : true);
    const legacy = query as unknown as {
      addListener?: (listener: () => void) => void;
      removeListener?: (listener: () => void) => void;
    } | null;
    update();
    safely(() => {
      if (typeof query?.addEventListener === "function")
        query.addEventListener("change", update);
      else legacy?.addListener?.(update);
    }, undefined);
    return () =>
      safely(() => {
        if (typeof query?.removeEventListener === "function")
          query.removeEventListener("change", update);
        else legacy?.removeListener?.(update);
      }, undefined);
  }, []);
  return { ambient: requested && !reduced, reduced, setRequested };
}
