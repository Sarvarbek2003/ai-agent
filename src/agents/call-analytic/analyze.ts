import { Call, Transcript } from "@prisma/client";
import { config } from "../../config";
import { extractOutputText, getOpenAI, parseJsonText } from "../../lib/openai";
import { OperatorWithApp } from "../../lib/operators";
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

export async function analyzeTranscript(
  call: Call,
  transcript: Transcript,
  operator?: OperatorWithApp | null,
): Promise<{
  result: CallAnalysisResult;
  responseId?: string;
}> {
  const openai = getOpenAI();
  const operatorDirectory = operator
    ? {
        operatorName: operator.name,
        operatorCode: operator.code,
        appName: operator.app.name,
        appSlug: operator.app.slug,
      }
    : null;

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
                  operatorDirectory,
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
  if (operatorDirectory) {
    result.operatorName = operatorDirectory.operatorName;
    result.operatorCode = operatorDirectory.operatorCode;
    result.appName = operatorDirectory.appName;
  } else {
    result.operatorName = result.operatorName || "unknown";
    result.operatorCode = call.firstAnswer || call.operatorNumber || result.operatorCode || "unknown";
    result.appName = result.appName || "unknown";
  }

  return {
    result,
    responseId: response.id,
  };
}
