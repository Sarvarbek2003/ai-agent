import { DailyThread, Prisma } from "@prisma/client";
import { config } from "../../config";
import { localDateKey } from "../../lib/dates";
import { extractOutputText, getOpenAI, parseJsonText } from "../../lib/openai";
import { prisma } from "../../lib/prisma";
import { AppHint } from "../../lib/slug";
import {
  CALL_ANALYSIS_INSTRUCTIONS,
  DAILY_REPORT_PROMPT,
  DAILY_THREAD_INSTRUCTIONS,
  DailyReportResult,
  dailyReportJsonSchema,
} from "./prompts";

export const ANALYSIS_PROMPT_VERSION = 1;

function buildDailySystemPrompt(apps: AppHint[]): string {
  const knownApps =
    apps.length > 0
      ? apps.map((app) => `- ${app.name} (${app.slug})`).join("\n")
      : "- none";

  return [
    CALL_ANALYSIS_INSTRUCTIONS,
    "",
    "Known apps helper list:",
    knownApps,
    "",
    DAILY_THREAD_INSTRUCTIONS,
  ].join("\n");
}

async function loadApps(): Promise<AppHint[]> {
  return prisma.app.findMany({
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });
}

async function seedAnalysisPrompt(conversationId: string, apps: AppHint[]): Promise<void> {
  const openai = getOpenAI();
  await openai.conversations.items.create(conversationId, {
    items: [
      {
        type: "message",
        role: "system",
        content: buildDailySystemPrompt(apps),
      },
    ],
  });
}

export async function getOrCreateDailyThread(date?: Date | string): Promise<DailyThread> {
  const localDate = typeof date === "string" ? date : localDateKey(date);
  const apps = await loadApps();

  const existing = await prisma.dailyThread.findUnique({
    where: { localDate },
  });
  if (existing) {
    if (existing.promptVersion >= ANALYSIS_PROMPT_VERSION) {
      return existing;
    }

    await seedAnalysisPrompt(existing.openaiConversationId, apps);
    return prisma.dailyThread.update({
      where: { id: existing.id },
      data: { promptVersion: ANALYSIS_PROMPT_VERSION },
    });
  }

  const openai = getOpenAI();
  const conversation = await openai.conversations.create({
    metadata: {
      agent: "call-analytic",
      localDate,
      timezone: config.timezone,
      promptVersion: String(ANALYSIS_PROMPT_VERSION),
    },
    items: [
      {
        type: "message",
        role: "system",
        content: buildDailySystemPrompt(apps),
      },
    ],
  });

  try {
    return await prisma.dailyThread.create({
      data: {
        localDate,
        timezone: config.timezone,
        openaiConversationId: conversation.id,
        promptVersion: ANALYSIS_PROMPT_VERSION,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await prisma.dailyThread.findUnique({ where: { localDate } });
      if (raced) {
        return raced;
      }
    }
    throw error;
  }
}

export async function generateDailyReport(dateKey?: string) {
  const localDate = dateKey || localDateKey();
  const thread = await prisma.dailyThread.findUnique({
    where: { localDate },
  });

  if (!thread) {
    const error = new Error(`No daily thread found for ${localDate}`);
    (error as Error & { status: number }).status = 404;
    throw error;
  }

  const openai = getOpenAI();
  const response = await openai.responses.create({
    model: config.analysisModel,
    conversation: thread.openaiConversationId,
    input: `${DAILY_REPORT_PROMPT}\nDate: ${localDate}\nTimezone: ${thread.timezone}`,
    text: {
      format: {
        type: "json_schema",
        name: "daily_call_report",
        strict: true,
        schema: dailyReportJsonSchema,
      },
    },
  });

  const report = parseJsonText<DailyReportResult>(extractOutputText(response));
  const saved = await prisma.dailyThread.update({
    where: { id: thread.id },
    data: {
      lastResponseId: response.id,
      reportJson: report,
      reportText: extractOutputText(response),
      generatedAt: new Date(),
    },
  });

  return {
    source: "openai_thread" as const,
    usedDatabase: false,
    thread: saved,
    report,
  };
}
