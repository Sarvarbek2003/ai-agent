import { toFile } from "openai";
import { config } from "../../config";
import { getOpenAI } from "../../lib/openai";

export type TranscriptSegment = {
  id?: string;
  speaker?: string;
  start?: number;
  end?: number;
  text: string;
};

export type DiarizedTranscript = {
  text: string;
  duration?: number;
  segments: TranscriptSegment[];
  raw: unknown;
};

function asSegments(value: unknown): TranscriptSegment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }
    const row = item as Record<string, unknown>;
    if (typeof row.text !== "string") {
      return [];
    }
    return [
      {
        id: typeof row.id === "string" ? row.id : undefined,
        speaker: typeof row.speaker === "string" ? row.speaker : undefined,
        start: typeof row.start === "number" ? row.start : undefined,
        end: typeof row.end === "number" ? row.end : undefined,
        text: row.text,
      },
    ];
  });
}

export async function transcribeCallRecording(
  audio: Buffer,
  fileName: string,
): Promise<DiarizedTranscript> {
  const openai = getOpenAI();
  const file = await toFile(audio, fileName);

  const result = await openai.audio.transcriptions.create({
    file,
    model: config.transcribeModel,
    response_format: "diarized_json",
    chunking_strategy: "auto",
  });

  const raw = result as unknown as {
    text?: string;
    duration?: number;
    segments?: unknown;
  };

  const segments = asSegments(raw.segments);
  const text =
    raw.text?.trim() ||
    segments
      .map((segment) => `${segment.speaker ? `${segment.speaker}: ` : ""}${segment.text}`)
      .join("\n");

  return {
    text,
    duration: raw.duration,
    segments,
    raw: result,
  };
}
