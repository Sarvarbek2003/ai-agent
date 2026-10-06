import { Call, Transcript } from "@prisma/client";
import { config } from "../../config";
import { parseJsonText } from "../../lib/openai";
import { getActiveAnalysisPrompt } from "../../lib/settings";
import { getActiveScoringAgent } from "../../lib/scoring-agents";
import { runDailyOpenAIAgentSession } from "../../lib/openai-agents";
import { OperatorWithApp } from "../../lib/operators";
import { isScoringAnalysis, normalizeCallAnalysis, CallAnalysisResult } from "./prompts";

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
  options?: {
    operator?: OperatorWithApp | null;
    appName?: string | null;
  },
): Promise<{
  result: CallAnalysisResult;
  raw: Record<string, unknown>;
  responseId?: string;
  promptId: string;
  scoringAgentId?: string;
  model: string;
}> {
  if (!config.openaiAgentId) {
    throw new Error("OPENAI_AGENT_ID is not configured");
  }

  const operator = options?.operator ?? null;
  const prompt = await getActiveAnalysisPrompt();
  const scoringAgent = await getActiveScoringAgent();
  const direction = call.direction === "outbound" ? "outbound" : "inbound";
  const scoringFile = direction === "outbound" ? "Chiqish.docx" : "Kirish.docx";

  const input = JSON.stringify({
    type: "new_call",
    vpbxId: call.vpbxId,
    direction: call.direction,
    scoringFile,
    firstAnswer: call.firstAnswer,
    operatorNumber: call.operatorNumber,
    durationSec: call.durationSec,
    transcript: formatTranscript(transcript),
  });

  const session = await runDailyOpenAIAgentSession({
    localDate: call.endedAt ?? call.createdAt,
    agentId: config.openaiAgentId,
    input,
  });

  const parsed = parseJsonText<Record<string, unknown>>(session.text);
  if (!isScoringAnalysis(parsed)) {
    throw new Error("OpenAI agent returned an unexpected scoring JSON");
  }

  const result = normalizeCallAnalysis(parsed, {
    operatorName: operator?.name || "unknown",
    operatorCode: operator?.code || call.firstAnswer || call.operatorNumber || "unknown",
    appName: options?.appName || operator?.app.name || "unknown",
  });

  return {
    result,
    raw: parsed,
    responseId: session.sessionId,
    promptId: prompt.id,
    scoringAgentId: scoringAgent?.id,
    model: session.model,
  };
}
