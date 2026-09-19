import { config } from "../config";
import { extractOutputText, getOpenAI } from "../lib/openai";
import { queryCallAnalytics, AnalyticsQuery } from "./query";

const INSTRUCTIONS = `You are a call-center analyst assistant for an internal Telegram bot.

Answer only from tool results. Never invent counts, names, or outcomes.
If the tool returns 0, say 0. If there is no matching data, say so clearly.
Use Asia/Tashkent dates. "bugun" = today's local date.

Payment / to'lov / pul / karta / billing problems → problemCategory=billing. You may also pass search="to'lov".
Technical / texnik → technical.
Complaint / shikoyat → complaint.

Reply in the user's language (usually Uzbek). Be short and specific.
When giving numbers, state the date range, matchingCalls, and uniqueCustomers if available.
Mention if some calls are not analyzed yet (totalCalls vs analyzedCalls).`;

const TOOL = {
  type: "function" as const,
  name: "query_call_analytics",
  strict: false,
  description:
    "Read real analyzed call statistics from the database. Always call this before answering a count, ranking, or 'how many' question.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      date: { type: "string", description: "Start date YYYY-MM-DD. Default: today." },
      dateTo: { type: "string", description: "Inclusive end date YYYY-MM-DD. Default: same as date." },
      appName: { type: "string", description: "App/product filter: MilliyPay, AnjirPay, Migsend, etc." },
      operatorName: { type: "string" },
      operatorCode: { type: "string", description: "Extension code, e.g. 103" },
      problemCategory: {
        type: "string",
        enum: ["billing", "technical", "complaint", "information", "sales", "connection", "other", "unknown"],
      },
      problemResolved: { type: "string", enum: ["yes", "no", "partial", "unknown"] },
      customerEmotionalState: {
        type: "string",
        enum: ["calm", "confused", "frustrated", "angry", "satisfied", "unknown"],
      },
      search: { type: "string", description: "Search problem/summary text, e.g. to'lov, SMS, karta" },
    },
    required: [],
  },
};

function parseToolArgs(raw: string): AnalyticsQuery {
  try {
    return JSON.parse(raw) as AnalyticsQuery;
  } catch {
    return {};
  }
}

export async function answerTelegramQuestion(question: string): Promise<string> {
  const openai = getOpenAI();
  let response = await openai.responses.create({
    model: config.analysisModel,
    instructions: INSTRUCTIONS,
    input: question,
    tools: [TOOL],
  });

  for (let i = 0; i < 3; i += 1) {
    const calls = (response.output ?? []).filter((item) => item.type === "function_call");
    if (calls.length === 0) {
      break;
    }

    const outputs = [];
    for (const call of calls) {
      const args = parseToolArgs(call.arguments);
      const result = await queryCallAnalytics(args);
      outputs.push({
        type: "function_call_output" as const,
        call_id: call.call_id,
        output: JSON.stringify(result),
      });
    }

    response = await openai.responses.create({
      model: config.analysisModel,
      instructions: INSTRUCTIONS,
      previous_response_id: response.id,
      input: outputs,
      tools: [TOOL],
    });
  }

  const text = extractOutputText(response);
  if (text) {
    return text;
  }

  return "Bazadan javob chiqarib bo'lmadi. Savolni boshqacha berib ko'ring.";
}
