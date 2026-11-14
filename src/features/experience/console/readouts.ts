import type { NetworkReadout } from "../types";

const pad = (value: number) => String(value).padStart(2, "0");
export function localTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
export function localDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
export function utcOffset(date: Date): string {
  const offset = -date.getTimezoneOffset();
  return `UTC${offset >= 0 ? "+" : "−"}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
}
export function duration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const tail = `${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`;
  return seconds >= 3600 ? `${pad(Math.floor(seconds / 3600))}:${tail}` : tail;
}
export function browserFamily(ua: string): string {
  if (/Edg(?:e|A|iOS)?\//i.test(ua)) return "Edge";
  if (/(?:OPR|Opera)\//i.test(ua)) return "Opera";
  if (/(?:Firefox|FxiOS)\//i.test(ua)) return "Firefox";
  if (/(?:Chrome|Chromium|CriOS)\//i.test(ua)) return "Chromium family";
  return /Safari\//i.test(ua) ? "Safari" : "Unknown";
}
export function platformFamily(ua: string): string {
  if (/Android/i.test(ua)) return "Android";
  if (/(iPhone|iPad|iPod)/i.test(ua)) return "iOS";
  if (/CrOS/i.test(ua)) return "ChromeOS";
  if (/Windows/i.test(ua)) return "Windows";
  if (/(Macintosh|Mac OS X)/i.test(ua)) return "macOS";
  return /Linux/i.test(ua) ? "Linux" : "Unknown";
}
export function safely<T>(read: () => T, fallback: T): T {
  try {
    return read();
  } catch {
    return fallback;
  }
}
export function reportedNumber(
  value: unknown,
  suffix = "",
  integer = false
): string {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    (!integer || Number.isInteger(value))
    ? `${value}${suffix}`
    : "Unavailable";
}
export function sameOriginEndpoint(
  endpoint: string,
  origin: string
): string | null {
  if (!endpoint.trim()) return null;
  try {
    const url = new URL(endpoint, origin);
    return /^https?:$/.test(url.protocol) &&
      url.origin === origin &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
function networkString(value: unknown): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 160)
    : null;
}
export function parseNetworkReadout(value: unknown): NetworkReadout | null {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  const data = value as Record<string, unknown>;
  const source = networkString(data.source);
  const locationBasis = networkString(data.locationBasis);
  if (!source || !locationBasis) return null;
  return {
    clientIp: networkString(data.clientIp),
    country: networkString(data.country),
    region: networkString(data.region),
    city: networkString(data.city),
    provider: networkString(data.provider),
    source,
    locationBasis
  };
}
