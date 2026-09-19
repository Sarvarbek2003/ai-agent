import { config } from "../config";

export function localDateKey(date = new Date(), timeZone = config.timezone): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addOneDay(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function timezoneOffset(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
  }).formatToParts(date);
  const value = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT+5";
  const match = value.match(/([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!match) {
    return "+05:00";
  }
  const sign = match[1];
  const hours = match[2]?.padStart(2, "0") ?? "05";
  const minutes = (match[3] ?? "00").padStart(2, "0");
  return `${sign}${hours}:${minutes}`;
}

export function localDayRange(dateKey: string, timeZone = config.timezone): { gte: Date; lt: Date } {
  const sample = new Date(`${dateKey}T12:00:00Z`);
  const offset = timezoneOffset(sample, timeZone);
  return {
    gte: new Date(`${dateKey}T00:00:00${offset}`),
    lt: new Date(`${addOneDay(dateKey)}T00:00:00${offset}`),
  };
}

export function localDateRange(fromKey: string, toKey = fromKey, timeZone = config.timezone): { gte: Date; lt: Date } {
  const start = localDayRange(fromKey, timeZone);
  const end = localDayRange(toKey, timeZone);
  return { gte: start.gte, lt: end.lt };
}

export function unixToDate(unix?: number | string | null): Date | undefined {
  if (unix === null || unix === undefined || unix === "") {
    return undefined;
  }

  const value = typeof unix === "string" ? Number(unix) : unix;
  if (!Number.isFinite(value)) {
    return undefined;
  }

  return new Date(value * 1000);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
