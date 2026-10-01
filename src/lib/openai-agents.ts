import { ScoringAgent } from "@prisma/client";
import { APIError } from "openai";
import { config } from "../config";
import { callAnalysisJsonSchema } from "../agents/call-analytic/prompts";
import { getOrCreateDailyThread } from "../agents/call-analytic/daily-thread";
import { getActiveAnalysisPrompt } from "./settings";
import { prisma } from "./prisma";
import { getOpenAI } from "./openai";
import { sleep } from "./dates";

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

export function dailySessionInstructions(params: {
  name?: string;
  prompt: string;
  inboundCriteria?: string;
  outboundCriteria?: string;
}): string {
  const inbound = params.inboundCriteria?.trim();
  const outbound = params.outboundCriteria?.trim();
  const name = params.name ? `"${params.name}" ` : "";
  return `${params.prompt}

You are the ${name}daily call scoring agent.
This session lasts one local day. Each user message is a new call.
Analyze only the latest call. Do not mix facts from earlier calls into this JSON.
Use inbound criteria for inbound calls and outbound criteria for outbound calls.
Do not use tools, web search, shell, files, or subagents.
Do not write commentary, reasoning, or markdown. Return one JSON object only.
Write analysis text in Uzbek. Score from 0 to 100 using the matching criteria.

${inbound ? `Inbound scoring criteria:\n${inbound}\n` : ""}
${outbound ? `Outbound scoring criteria:\n${outbound}` : ""}`.trim();
}

let dailySessionLock: Promise<void> = Promise.resolve();

function withDailySessionLock<T>(run: () => Promise<T>): Promise<T> {
  const next = dailySessionLock.then(run, run);
  dailySessionLock = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
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

export async function runDailyOpenAIAgentSession(params: {
  localDate: Date | string;
  agentId?: string;
  instructions: string;
  input: string;
}): Promise<{ sessionId: string; text: string; model: string }> {
  return withDailySessionLock(async () => {
    const thread = await getOrCreateDailyThread(params.localDate);
    if (thread.openaiAgentSessionId) {
      try {
        return await continueAgentSession(thread.openaiAgentSessionId, params.input);
      } catch (error) {
        console.error("Daily OpenAI agent session failed; opening a new one", error);
      }
    }

    const created = await createAgentSession({
      agentId: params.agentId,
      instructions: params.instructions,
      input: params.input,
    });

    await prisma.dailyThread.update({
      where: { id: thread.id },
      data: { openaiAgentSessionId: created.sessionId },
    });
    return created;
  });
}

export async function runOpenAIAgentSession(params: {
  agentId?: string;
  instructions?: string;
  input: string;
}): Promise<{ sessionId: string; text: string; model: string }> {
  return createAgentSession(params);
}

type SessionEvent = {
  type: string;
  session?: { id: string; agent?: { model?: string | null }; error?: string | null };
  text?: string;
  turn?: { error?: { message?: string } | null };
};

async function collectTurnOutput(
  events: AsyncIterable<SessionEvent>,
  abort: () => void,
  knownSessionId?: string,
): Promise<{ sessionId: string; text: string; model: string }> {
  let sessionId = knownSessionId ?? "";
  let model = config.agentModel;
  const outputs: string[] = [];
  let failed: string | null = null;

  try {
    for await (const event of events) {
      if (event.type === "agent.session.created" && event.session) {
        sessionId = event.session.id;
        model = event.session.agent?.model || model;
      } else if (event.type === "agent.session.turn.output_text.done" && event.text?.trim()) {
        outputs.push(event.text.trim());
      } else if (event.type === "agent.session.failed") {
        failed = event.session?.error || "OpenAI agent session failed";
      } else if (event.type === "agent.session.turn.failed") {
        failed = event.turn?.error?.message || "OpenAI agent turn failed";
      }
    }
  } finally {
    abort();
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

async function waitUntilIdle(sessionId: string): Promise<void> {
  const openai = getOpenAI();
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const session = await openai.beta.agents.sessions.retrieve(sessionId);
    if (session.status === "idle") {
      return;
    }
    if (session.status === "failed") {
      throw new Error(session.error || "OpenAI agent session failed");
    }
    await sleep(1000);
  }
  throw new Error("Daily OpenAI agent session stayed busy");
}

async function createAgentSession(params: {
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
  return collectTurnOutput(events, () => events.controller.abort());
}

async function continueAgentSession(
  sessionId: string,
  input: string,
): Promise<{ sessionId: string; text: string; model: string }> {
  const openai = getOpenAI();
  await waitUntilIdle(sessionId);
  const events = openai.beta.agents.sessions.stream(
    sessionId,
    { input },
    { timeout: AGENT_REQUEST_TIMEOUT_MS },
  );
  return collectTurnOutput(events, () => events.abort(), sessionId);
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

