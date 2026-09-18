import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../../config";
import { sleep } from "../../lib/dates";

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

function extensionFrom(url: string, contentType?: string | null): string {
  const mime = contentType?.split(";")[0]?.trim().toLowerCase();
  if (mime && AUDIO_TYPES[mime]) {
    return AUDIO_TYPES[mime];
  }

  const cleanUrl = url.split("?")[0] ?? url;
  const ext = path.extname(cleanUrl).replace(".", "").toLowerCase();
  if (ext) {
    return ext;
  }

  return "mp3";
}

export async function downloadRecording(params: {
  url: string;
  vpbxId: string;
  attempts?: number;
}): Promise<{ filePath: string; mimeType: string }> {
  const attempts = params.attempts ?? 5;
  let lastError: Error | null = null;

  await mkdir(config.storageDir, { recursive: true });

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(params.url);
      if (!response.ok) {
        throw new Error(`Recording download failed with HTTP ${response.status}`);
      }

      const mimeType = response.headers.get("content-type") || "audio/mpeg";
      const extension = extensionFrom(params.url, mimeType);
      const filePath = path.join(config.storageDir, `${params.vpbxId}.${extension}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      await writeFile(filePath, bytes);
      const info = await stat(filePath);
      if (info.size < 256) {
        throw new Error("Recording file is too small, likely not ready yet");
      }

      return { filePath, mimeType };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < attempts) {
        await sleep(attempt * 3000);
      }
    }
  }

  throw lastError ?? new Error("Unable to download call recording");
}
