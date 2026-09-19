import { Call, Transcript } from "@prisma/client";
import { config } from "../../config";
import { extractOutputText, getOpenAI, parseJsonText } from "../../lib/openai";
import { AppHint, matchKnownAppName } from "../../lib/slug";
import {
  CALL_ANALYSIS_INSTRUCTIONS,
  CallAnalysisResult,
  callAnalysisJsonSchema,
} from "./prompts";

function formatTranscript(transcript: Transcript): string {
  const segments = Array.isArray(transcript.segments) ? transcript.segments : [];
  if (segments.length === 0) {
    return transcript.fullText;
  }

  return segments
    .map((item) => {
      const row = item as { speaker?: string; start?: number; text?: string };
      const speaker = row.speaker || "unknown";
      const start = typeof row.start === "number" ? ` [${row.start.toFixed(1)}s]` : "";
      return `${speaker}${start}: ${row.text ?? ""}`;
    })
    .join("\n");
}

function fallbackText(value: string | undefined, fallback = "unknown"): string {
  const text = value?.trim();
  return text ? text : fallback;
}

export async function analyzeTranscript(
  call: Call,
  transcript: Transcript,
  options?: {
    apps?: AppHint[];
  },
): Promise<{
  result: CallAnalysisResult;
  responseId?: string;
}> {
  const openai = getOpenAI();
  const apps = options?.apps ?? [];

  const response = await openai.responses.create({
    model: config.analysisModel,
    instructions: CALL_ANALYSIS_INSTRUCTIONS,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: JSON.stringify({
              vpbxId: call.vpbxId,
              direction: call.direction,
              firstAnswer: call.firstAnswer,
              operatorNumber: call.operatorNumber,
              durationSec: call.durationSec,
              transcript: formatTranscript(transcript),
            }),
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "call_analysis",
        strict: true,
        schema: callAnalysisJsonSchema,
      },
    },
  });

  const result = parseJsonText<CallAnalysisResult>(extractOutputText(response));
  const detectedAppName = fallbackText(result.appName);
  const matchedApp = matchKnownAppName(detectedAppName, apps);

  result.operatorName = fallbackText(result.operatorName);
  result.operatorCode = fallbackText(
    result.operatorCode !== "unknown" ? result.operatorCode : undefined,
    call.firstAnswer || call.operatorNumber || "unknown",
  );
  result.appName = matchedApp?.name ?? detectedAppName;

  return {
    result,
    responseId: response.id,
  };
}
