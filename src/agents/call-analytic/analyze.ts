import { Call, Transcript } from "@prisma/client";
import { config } from "../../config";
import { extractOutputText, getOpenAI, parseJsonText } from "../../lib/openai";
import { OperatorWithApp } from "../../lib/operators";
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
    operator?: OperatorWithApp | null;
    apps?: AppHint[];
  },
): Promise<{
  result: CallAnalysisResult;
  responseId?: string;
}> {
  const openai = getOpenAI();
  const apps = options?.apps ?? [];
  const operator = options?.operator;

  const response = await openai.responses.create({
    model: config.analysisModel,
    instructions: CALL_ANALYSIS_INSTRUCTIONS,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: JSON.stringify(
              {
                metadata: {
                  vpbxId: call.vpbxId,
                  direction: call.direction,
                  customerNumber: call.customerNumber,
                  operatorNumber: call.operatorNumber,
                  firstAnswer: call.firstAnswer,
                  allAnswer: call.allAnswer,
                  durationSec: call.durationSec,
                  startedAt: call.startedAt,
                  endedAt: call.endedAt,
                  languagePriority: {
                    default: "uz",
                    note: "Operators mostly speak Uzbek. Detect any other language from the transcript.",
                  },
                  knownApps: apps.map((app) => ({ name: app.name, slug: app.slug })),
                  operatorDirectoryHint: operator
                    ? {
                        extensionCode: operator.code,
                        possibleName: operator.name,
                        possibleApp: operator.app.name,
                        note: "Helper only. Prefer names spoken in the transcript.",
                      }
                    : null,
                },
                transcript: formatTranscript(transcript),
              },
              null,
              2,
            ),
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
