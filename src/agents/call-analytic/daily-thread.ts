import { Call, CallAnalysis, DailyThread, Transcript } from "@prisma/client";
import { config } from "../../config";
import { localDateKey } from "../../lib/dates";
import { extractOutputText, getOpenAI, parseJsonText } from "../../lib/openai";
import { prisma } from "../../lib/prisma";
import {
  DAILY_REPORT_PROMPT,
  DAILY_THREAD_INSTRUCTIONS,
  DailyReportResult,
  dailyReportJsonSchema,
} from "./prompts";

export async function getOrCreateDailyThread(date?: Date | string): Promise<DailyThread> {
  const localDate = typeof date === "string" ? date : localDateKey(date);

  const existing = await prisma.dailyThread.findUnique({
    where: { localDate },
  });
  if (existing) {
    return existing;
  }

  const openai = getOpenAI();
  const conversation = await openai.conversations.create({
    metadata: {
      agent: "call-analytic",
      localDate,
      timezone: config.timezone,
    },
    items: [
      {
        type: "message",
        role: "system",
        content: DAILY_THREAD_INSTRUCTIONS,
      },
    ],
  });

  return prisma.dailyThread.create({
    data: {
      localDate,
      timezone: config.timezone,
      openaiConversationId: conversation.id,
    },
  });
}

export async function appendCallToDailyThread(params: {
  call: Call;
  transcript: Transcript;
  analysis: CallAnalysisResultLike;
}): Promise<DailyThread> {
  const thread = await getOrCreateDailyThread(params.call.endedAt ?? params.call.createdAt);
  const openai = getOpenAI();

  await openai.conversations.items.create(thread.openaiConversationId, {
    items: [
      {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: JSON.stringify(
              {
                type: "analyzed_call",
                vpbxId: params.call.vpbxId,
                direction: params.call.direction,
                operatorNumber: params.call.operatorNumber,
                customerNumber: params.call.customerNumber,
                durationSec: params.call.durationSec,
                transcript: params.transcript.fullText,
                analysis: params.analysis,
              },
              null,
              2,
            ),
          },
        ],
      },
    ],
  });

  return thread;
}

type CallAnalysisResultLike = Pick<
  CallAnalysis,
  | "customerMainProblem"
  | "problemCategory"
  | "customerEmotionalState"
  | "operatorCommunicationQuality"
  | "operatorUnderstoodCustomer"
  | "customerUnderstoodOperator"
  | "problemResolved"
  | "summary"
  | "internalNote"
  | "score"
>;

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
