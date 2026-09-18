export const NEWTEL_EVENTS = [
  "inboundCallStart",
  "inboundCallEnd",
  "outboundCallStart",
  "outboundCallEnd",
  "ringingStart",
  "ringingEnd",
  "inboundCallAnswer",
] as const;

export type NewtelEventName = (typeof NEWTEL_EVENTS)[number] | string;

export type NewtelEventData = {
  vpbxId?: string;
  time?: number | string;
  callRecordLink?: string;
  signature?: string;
  dnid?: string;
  clid?: string;
  status?: string;
  duration?: number | string;
  ringduration?: number | string;
  fisrtAnswer?: string;
  firstAnswer?: string;
  allAnswer?: unknown;
  externalClid?: string;
  internalClid?: string;
  ringingNumber?: string;
  activeNumber?: string;
  [key: string]: unknown;
};

export type NewtelWebhookPayload = {
  event?: NewtelEventName;
  data?: NewtelEventData;
  signature?: string;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

export function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}
