import { Call, DailyThread, Transcript } from "@prisma/client";
import { config } from "../../config";
import { extractOutputText, getOpenAI, parseJsonText } from "../../lib/openai";
import { AppHint, matchKnownAppName } from "../../lib/slug";
import { prisma } from "../../lib/prisma";
import { getOrCreateDailyThread } from "./daily-thread";
import { CallAnalysisResult, callAnalysisJsonSchema } from "./prompts";

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
  thread: DailyThread;
}> {
  const openai = getOpenAI();
  const apps = options?.apps ?? [];
  const thread = await getOrCreateDailyThread(call.endedAt ?? call.createdAt);

  const response = await openai.responses.create({
    model: config.analysisModel,
    conversation: thread.openaiConversationId,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: JSON.stringify(
              {
                vpbxId: call.vpbxId,
                direction: call.direction,
                customerNumber: call.customerNumber,
                operatorNumber: call.operatorNumber,
                firstAnswer: call.firstAnswer,
                durationSec: call.durationSec,
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

  await prisma.dailyThread.update({
    where: { id: thread.id },
    data: { lastResponseId: response.id },
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
    thread,
  };
}
