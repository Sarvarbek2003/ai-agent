import { config } from "../config";
import { extractOutputText, getOpenAI } from "../lib/openai";
import { queryCallAnalytics, AnalyticsQuery } from "./query";
import { getDatabaseSchema, runSql } from "./sql";

const INSTRUCTIONS = `You are a call-center analyst assistant for an internal Telegram bot.

Answer only from tool results. Never invent counts, names, or outcomes.
If a tool returns 0, say 0. If there is no matching data, say so clearly.
Use Asia/Tashkent dates. "bugun" = today's local date.

Payment / to'lov / pul / karta / billing problems → problemCategory=billing. You may also pass search="to'lov".
Technical / texnik → technical.
Complaint / shikoyat → complaint.

Tool choice:
1. First try query_call_analytics for ordinary stats (counts by day, app, category, operator, resolved).
2. If that tool cannot answer — custom join, raw text in transcript, mutation, unusual filter, exact SQL needed — call run_sql.
3. If you need SQL, call get_database_schema first, then run_sql.
4. run_sql has full access: SELECT, INSERT, UPDATE, DELETE.
5. Quote table and column names exactly as returned by get_database_schema.
6. Limit SELECT results (LIMIT 50) unless a single aggregate.

Reply in the user's language (usually Uzbek). Be short and specific.
When giving numbers, state the date range and the counts from the tool.
Do not write "manba: sql" yourself.`;

const ANALYTICS_TOOL = {
  type: "function" as const,
  name: "query_call_analytics",
  strict: false,
  description:
    "Preferred tool for ordinary analyzed-call statistics. Use this first for counts, rankings, and 'how many' questions.",
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

const SCHEMA_TOOL = {
  type: "function" as const,
  name: "get_database_schema",
  strict: false,
  description: "Load the live Prisma datamodel (models, fields, enums) before writing SQL.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {},
    required: [],
  },
};

const SQL_TOOL = {
  type: "function" as const,
  name: "run_sql",
  strict: false,
  description:
    "Run raw PostgreSQL when query_call_analytics cannot answer. SELECT uses queryRaw; INSERT/UPDATE/DELETE uses executeRaw. Full access. Call get_database_schema first.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      sql: { type: "string", description: "One PostgreSQL statement. Quote Prisma identifiers." },
    },
    required: ["sql"],
  },
};

const TOOLS = [ANALYTICS_TOOL, SCHEMA_TOOL, SQL_TOOL];

function parseJson(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function answerQuestion(question: string): Promise<string> {
  const openai = getOpenAI();
  let usedSql = false;
  let response = await openai.responses.create({
    model: config.analysisModel,
    instructions: INSTRUCTIONS,
    input: question,
    tools: TOOLS,
  });

  for (let i = 0; i < 5; i += 1) {
    const calls = (response.output ?? []).filter((item) => item.type === "function_call");
    if (calls.length === 0) {
      break;
    }

    const outputs = [];
    for (const call of calls) {
      const args = parseJson(call.arguments);
      let result: unknown;
      if (call.name === "get_database_schema") {
        result = { schema: getDatabaseSchema() };
      } else if (call.name === "run_sql") {
        usedSql = true;
        result = await runSql(typeof args.sql === "string" ? args.sql : "");
      } else {
        result = await queryCallAnalytics(args as AnalyticsQuery);
      }
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
      tools: TOOLS,
    });
  }

  const text = extractOutputText(response);
  if (!text) {
    return "Bazadan javob chiqarib bo'lmadi. Savolni boshqacha berib ko'ring.";
  }

  if (usedSql && !/manba:\s*sql/i.test(text)) {
    return `${text}\n\nmanba: sql`;
  }

  return text;
}
