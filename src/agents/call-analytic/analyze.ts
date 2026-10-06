import { Call, Transcript } from "@prisma/client";
import { parseJsonText } from "../../lib/openai";
import { getActiveAnalysisPrompt } from "../../lib/settings";
import { getActiveScoringAgent } from "../../lib/scoring-agents";
import { runFileSearchAnalysis, vectorStoreIdForCall } from "../../lib/openai-file-search";
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
  const scoringAgent = await getActiveScoringAgent();
  if (!scoringAgent) {
    throw new Error("Faol baholash agenti yo‘q. Sozlamalardan kiruvchi/chiquvchi mezon .docx yuklang.");
  }

  const direction = call.direction === "outbound" ? "outbound" : "inbound";
  const vectorStoreId = vectorStoreIdForCall(scoringAgent, direction);
  if (!vectorStoreId) {
    throw new Error(`${direction} vector store hali yaratilmagan. Baholash agentini qayta saqlang.`);
  }

  const operator = options?.operator ?? null;
  const prompt = await getActiveAnalysisPrompt();
  const scoringFile = direction === "outbound" ? scoringAgent.outboundCriteriaFileName : scoringAgent.inboundCriteriaFileName;
  const toolName = direction === "outbound" ? "chiquvchi file_search" : "kiruvchi file_search";

  const input = JSON.stringify({
    type: "new_call",
    vpbxId: call.vpbxId,
    direction: call.direction,
    scoringFile,
    fileSearchTool: toolName,
    firstAnswer: call.firstAnswer,
    operatorNumber: call.operatorNumber,
    durationSec: call.durationSec,
    transcript: formatTranscript(transcript),
  });

  const instructions = `${prompt.instructions}

Bu qo'ng'iroq ${direction === "outbound" ? "chiquvchi (outbound)" : "kiruvchi (inbound)"}.
file_search tool orqali faqat shu yo'nalish uchun yuklangan mezon faylini o'qi: ${scoringFile}.
Boshqa yo'nalish mezonini ishlatma. Faylda yo'q mezon yoki qoidani o'zing yaratma.`;

  const session = await runFileSearchAnalysis({
    vectorStoreId,
    instructions,
    input,
  });

  const parsed = parseJsonText<Record<string, unknown>>(session.text);
  if (!isScoringAnalysis(parsed)) {
    throw new Error("OpenAI file search returned an unexpected scoring JSON");
  }

  const result = normalizeCallAnalysis(parsed, {
    operatorName: operator?.name || "unknown",
    operatorCode: operator?.code || call.firstAnswer || call.operatorNumber || "unknown",
    appName: options?.appName || operator?.app.name || "unknown",
  });

  return {
    result,
    raw: parsed,
    responseId: session.responseId,
    promptId: prompt.id,
    scoringAgentId: scoringAgent.id,
    model: session.model,
  };
}
