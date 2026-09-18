import { config } from "../config";

export function localDateKey(date = new Date(), timeZone = config.timezone): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
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
