import { ScoringAgent } from "@prisma/client";
import { APIError } from "openai";
import { config } from "../config";
import { callAnalysisJsonSchema } from "../agents/call-analytic/prompts";
import { getActiveAnalysisPrompt } from "./settings";
import { prisma } from "./prisma";
import { getOpenAI } from "./openai";

const AGENT_REQUEST_TIMEOUT_MS = 10 * 60 * 1000;

type CallDirection = "inbound" | "outbound";

const analysisJsonSchema = JSON.parse(JSON.stringify(callAnalysisJsonSchema)) as {
  [key: string]: unknown;
};

function analysisTextFormat() {
  return {
    format: {
      type: "json_schema" as const,
      schema: analysisJsonSchema,
    },
  };
}

function lunaAgentConfig(instructions?: string) {
  return {
    model: config.agentModel,
    reasoning: {
      effort: "low" as const,
      summary: null,
    },
    multi_agent: { enabled: false },
    tools: [] as [],
    text: analysisTextFormat(),
    ...(instructions ? { instructions } : {}),
  };
}

export function openaiAgentErrorMessage(error: unknown): string {
  if (error instanceof APIError) {
    return error.message || `OpenAI error ${error.status}`;
  }
  return error instanceof Error ? error.message : "OpenAI agent request failed";
}

export function scoringAgentInstructions(params: {
  name: string;
  direction: CallDirection;
  prompt: string;
  criteria: string;
}): string {
  return `${params.prompt}

You are the "${params.name}" scoring agent for ${params.direction} calls.
Do not use tools, web search, shell, files, or subagents.
Do not write commentary, reasoning, or markdown. Return one JSON object only.
Score from 0 to 100 using only the criteria below. Write analysis text in Uzbek.

Scoring criteria (${params.direction}):

${params.criteria}`;
}

async function upsertDirectionAgent(
  agent: ScoringAgent,
  direction: CallDirection,
  existingId: string | null | undefined,
  instructions: string,
): Promise<string> {
  const openai = getOpenAI();
  const name = `${agent.name} (${direction})`;
  const body = {
    name,
    metadata: {
      scoringAgentId: agent.id,
      direction,
    },
    ...lunaAgentConfig(instructions),
  };

  if (existingId) {
    try {
      const updated = await openai.beta.agents.update(existingId, body, { timeout: 60_000 });
      return updated.id;
    } catch (error) {
      if (!(error instanceof APIError && error.status === 404)) {
        throw error;
      }
    }
  }

  const created = await openai.beta.agents.create(body, { timeout: 60_000 });
  return created.id;
}

export async function syncOpenAIScoringAgent(agent: ScoringAgent): Promise<ScoringAgent> {
  const prompt = await getActiveAnalysisPrompt();
  const inboundId = await upsertDirectionAgent(
    agent,
    "inbound",
    agent.openaiInboundAgentId,
    scoringAgentInstructions({
      name: agent.name,
      direction: "inbound",
      prompt: prompt.instructions,
      criteria: agent.inboundCriteriaText,
    }),
  );
  const outboundId = await upsertDirectionAgent(
    agent,
    "outbound",
    agent.openaiOutboundAgentId,
    scoringAgentInstructions({
      name: agent.name,
      direction: "outbound",
      prompt: prompt.instructions,
      criteria: agent.outboundCriteriaText,
    }),
  );

  if (inboundId === agent.openaiInboundAgentId && outboundId === agent.openaiOutboundAgentId) {
    return agent;
  }

  return prisma.scoringAgent.update({
    where: { id: agent.id },
    data: {
      openaiInboundAgentId: inboundId,
      openaiOutboundAgentId: outboundId,
    },
  });
}

export async function syncAllOpenAIScoringAgents(): Promise<void> {
  const agents = await prisma.scoringAgent.findMany();
  for (const agent of agents) {
    await syncOpenAIScoringAgent(agent);
  }
}

export async function deleteOpenAIScoringAgent(agent: ScoringAgent): Promise<void> {
  const openai = getOpenAI();
  for (const agentId of [agent.openaiInboundAgentId, agent.openaiOutboundAgentId]) {
    if (!agentId) {
      continue;
    }
    try {
      await openai.beta.agents.delete(agentId);
    } catch (error) {
      if (error instanceof APIError && error.status === 404) {
        continue;
      }
      console.error("Failed to delete OpenAI agent", agentId, error);
    }
  }
}

export function openaiAgentIdForCall(agent: ScoringAgent, direction: CallDirection): string | null {
  return (direction === "outbound" ? agent.openaiOutboundAgentId : agent.openaiInboundAgentId) ?? null;
}

function extractSessionItemText(item: { type?: string; role?: string; phase?: string | null; content?: Array<{ type?: string; text?: string }> }): string {
  if (item.type !== "message" || item.role !== "assistant" || item.phase === "commentary") {
    return "";
  }
  return (item.content ?? [])
    .filter((part) => part.type === "output_text" && part.text)
    .map((part) => part.text ?? "")
    .join("\n")
    .trim();
}

async function readSessionOutput(sessionId: string): Promise<string> {
  const openai = getOpenAI();
  const texts: string[] = [];
  for await (const item of openai.beta.agents.sessions.items.list(sessionId, { order: "desc" })) {
    const text = extractSessionItemText(item);
    if (!text) {
      continue;
    }
    if ("phase" in item && item.phase === "final_answer") {
      return text;
    }
    texts.push(text);
    if (texts.length >= 5) {
      break;
    }
  }
  return texts[0] ?? "";
}

export async function runOpenAIAgentSession(params: {
  agentId?: string;
  instructions?: string;
  input: string;
}): Promise<{ sessionId: string; text: string; model: string }> {
  const openai = getOpenAI();
  const request: {
    environment: { type: "none" };
    input: string;
    stream: true;
    agent_id?: string;
    agent?: ReturnType<typeof lunaAgentConfig>;
  } = {
    environment: { type: "none" },
    input: params.input,
    stream: true,
    agent: lunaAgentConfig(params.instructions),
  };

  if (params.agentId) {
    request.agent_id = params.agentId;
  }

  const events = await openai.beta.agents.sessions.create(request, { timeout: AGENT_REQUEST_TIMEOUT_MS });

  let sessionId = "";
  let model = config.agentModel;
  const outputs: string[] = [];
  let failed: string | null = null;

  try {
    for await (const event of events) {
      if (event.type === "agent.session.created") {
        sessionId = event.session.id;
        model = event.session.agent.model || model;
      } else if (event.type === "agent.session.turn.output_text.done") {
        if (event.text.trim()) {
          outputs.push(event.text.trim());
        }
      } else if (event.type === "agent.session.failed") {
        failed = event.session.error || "OpenAI agent session failed";
      } else if (event.type === "agent.session.turn.failed") {
        failed = event.turn.error?.message || "OpenAI agent turn failed";
      }
    }
  } finally {
    events.controller.abort();
  }

  if (failed) {
    throw new Error(failed);
  }

  let text = pickJsonOutput(outputs);
  if (!text && sessionId) {
    text = await readSessionOutput(sessionId);
  }
  if (!text.trim()) {
    throw new Error("OpenAI agent returned empty output");
  }

  return { sessionId, text, model };
}

function pickJsonOutput(outputs: string[]): string {
  for (let i = outputs.length - 1; i >= 0; i -= 1) {
    const candidate = outputs[i];
    if (!candidate) {
      continue;
    }
    try {
      const start = candidate.indexOf("{");
      const end = candidate.lastIndexOf("}");
      if (start >= 0 && end > start) {
        JSON.parse(candidate.slice(start, end + 1));
        return candidate;
      }
    } catch {
      continue;
    }
  }
  return outputs.at(-1) ?? "";
}
