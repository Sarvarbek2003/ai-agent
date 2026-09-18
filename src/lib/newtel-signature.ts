import { createHash, timingSafeEqual } from "node:crypto";

function phpJsonEncode(value: unknown): string {
  return JSON.stringify(value)
    .replace(/\//g, "\\/")
    .replace(/[\u007f-\uffff]/g, (char) => {
      return `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`;
    });
}

function stripSignature(data: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...data };
  delete copy.signature;
  return copy;
}

function sha1Hex(input: string): string {
  return createHash("sha1").update(input, "utf8").digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export function verifyNewtelSignature(params: {
  eventName: string;
  data: Record<string, unknown>;
  signature: string;
  webhookKey: string;
}): boolean {
  const payloads = [params.data, stripSignature(params.data)];
  const encodings = [
    (value: unknown) => phpJsonEncode(value),
    (value: unknown) => JSON.stringify(value),
  ];

  for (const payload of payloads) {
    for (const encode of encodings) {
      const digest = sha1Hex(`${params.eventName}\n${encode(payload)}\n${params.webhookKey}`);
      if (safeEqual(digest, params.signature.toLowerCase())) {
        return true;
      }
    }
  }

  return false;
}
