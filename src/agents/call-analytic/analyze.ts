import { Call, Transcript } from "@prisma/client";
import { parseJsonText } from "../../lib/openai";
import { getActiveAnalysisPrompt } from "../../lib/settings";
import { getActiveScoringAgent } from "../../lib/scoring-agents";
import {
  openaiAgentIdForCall,
  runOpenAIAgentSession,
  syncOpenAIScoringAgent,
} from "../../lib/openai-agents";
import { OperatorWithApp } from "../../lib/operators";
import { CallAnalysisResult } from "./prompts";

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
  responseId?: string;
  promptId: string;
  scoringAgentId?: string;
  model: string;
}> {
  const operator = options?.operator ?? null;
  const prompt = await getActiveAnalysisPrompt();
  const scoringAgent = await getActiveScoringAgent();
  const direction = call.direction === "outbound" ? "outbound" : "inbound";
  const readyAgent =
    scoringAgent && (!scoringAgent.openaiInboundAgentId || !scoringAgent.openaiOutboundAgentId)
      ? await syncOpenAIScoringAgent(scoringAgent)
      : scoringAgent;
  const agentId = readyAgent ? openaiAgentIdForCall(readyAgent, direction) : undefined;

  const input = JSON.stringify({
    vpbxId: call.vpbxId,
    direction: call.direction,
    firstAnswer: call.firstAnswer,
    operatorNumber: call.operatorNumber,
    durationSec: call.durationSec,
    transcript: formatTranscript(transcript),
  });

  const session = await runOpenAIAgentSession({
    agentId: agentId ?? undefined,
    instructions: agentId ? undefined : prompt.instructions,
    input,
  });

  const result = parseJsonText<CallAnalysisResult>(session.text);
  result.operatorName = operator?.name || "unknown";
  result.operatorCode = operator?.code || call.firstAnswer || call.operatorNumber || "unknown";
  result.appName = options?.appName || operator?.app.name || "unknown";

  return {
    result,
    responseId: session.sessionId,
    promptId: prompt.id,
    scoringAgentId: readyAgent?.id,
    model: session.model,
  };
}
