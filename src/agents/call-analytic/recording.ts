import { localDateKey, sleep } from "../../lib/dates";
import { uploadRecordingObject } from "../../lib/minio";

const AUDIO_TYPES: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
};

export type StoredRecording = {
  bucket: string;
  objectKey: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  fileName: string;
  body: Buffer;
};

function extensionFrom(url: string, contentType?: string | null): string {
  const mime = contentType?.split(";")[0]?.trim().toLowerCase();
  if (mime && AUDIO_TYPES[mime]) {
    return AUDIO_TYPES[mime];
  }

  const cleanUrl = url.split("?")[0] ?? url;
  const ext = cleanUrl.split(".").pop()?.toLowerCase();
  if (ext && ext.length <= 5 && /^[a-z0-9]+$/.test(ext)) {
    return ext;
  }

  return "mp3";
}

function safeKeyPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

export async function downloadAndStoreRecording(params: {
  url: string;
  vpbxId: string;
  attempts?: number;
}): Promise<StoredRecording> {
  const attempts = params.attempts ?? 5;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(params.url);
      if (!response.ok) {
        throw new Error(`Recording download failed with HTTP ${response.status}`);
      }

      const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() || "audio/mpeg";
      const extension = extensionFrom(params.url, mimeType);
      const body = Buffer.from(await response.arrayBuffer());
      if (body.length < 256) {
        throw new Error("Recording file is too small, likely not ready yet");
      }

      const fileName = `${safeKeyPart(params.vpbxId)}.${extension}`;
      const objectKey = `calls/${localDateKey()}/${fileName}`;
      const stored = await uploadRecordingObject({
        objectKey,
        body,
        mimeType,
      });

      return {
        ...stored,
        mimeType,
        fileName,
        body,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < attempts) {
        await sleep(attempt * 3000);
      }
    }
  }

  throw lastError ?? new Error("Unable to download and store call recording");
}
