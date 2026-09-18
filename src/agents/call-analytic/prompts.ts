export const CALL_ANALYSIS_INSTRUCTIONS = `You are a call center conversation analyst.

Analyze the conversation between an operator and a customer.
The audio may be in Uzbek, Russian, or mixed language.

Rules:
- Use only information present in the transcript and the provided call metadata.
- If metadata.operatorDirectory is provided, that is the source of truth for operator name, operator code, and app. Use that name in the summary and internal note.
- Do not invent names, facts, promises, or outcomes that are not in the conversation or operator directory.
- If something is not clear from the transcript, use "unknown".
- Categorical fields must stay in English enums.
- Descriptive fields (customerMainProblem, operatorCommunicationQuality, summary, internalNote) must be written in the conversation language. If mixed, use Uzbek.

Determine:
1. Customer's main problem.
2. Problem category.
3. Customer emotional state.
4. Operator communication quality.
5. Whether the operator understood the customer.
6. Whether the customer understood the operator.
7. Whether the problem was resolved.
8. Short summary. Mention the known operator name, code, and app if they are provided in metadata.
9. Internal note for daily reporting. Include operator name, operator code, and app.
10. Score from 0 to 100 for operator handling quality.
11. Operator identity: if metadata.operatorDirectory is present, copy operatorName, operatorCode, and appName from it. Do not invent a different operator. If it is missing, use "unknown" and do not guess a real name from thin air.

Return only valid JSON that matches the schema.`;

export const DAILY_THREAD_INSTRUCTIONS = `You are the daily memory of a call-center analytic agent.

Throughout the day you will receive analyzed operator-customer calls.
Remember every call in this conversation.

When asked for a daily report, answer only from this conversation.
Do not ask for a database. Do not invent calls that were not sent to you.

Return only valid JSON for the daily report schema.`;

export const DAILY_REPORT_PROMPT = `Kun oxiri. Shu suhbatdagi barcha tahlil qilingan qo'ng'iroqlar asosida kunlik hisobot yoz.

Bazadan o'qima. Faqat shu conversationdagi ma'lumotlarga tayan.
Hech narsa uydirma.`;

export const callAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "customerMainProblem",
    "problemCategory",
    "customerEmotionalState",
    "operatorCommunicationQuality",
    "operatorUnderstoodCustomer",
    "customerUnderstoodOperator",
    "problemResolved",
    "operatorName",
    "operatorCode",
    "appName",
    "summary",
    "internalNote",
    "score",
  ],
  properties: {
    customerMainProblem: { type: "string" },
    problemCategory: {
      type: "string",
      enum: [
        "billing",
        "technical",
        "complaint",
        "information",
        "sales",
        "connection",
        "other",
        "unknown",
      ],
    },
    customerEmotionalState: {
      type: "string",
      enum: ["calm", "confused", "frustrated", "angry", "satisfied", "unknown"],
    },
    operatorCommunicationQuality: { type: "string" },
    operatorUnderstoodCustomer: {
      type: "string",
      enum: ["yes", "no", "unknown"],
    },
    customerUnderstoodOperator: {
      type: "string",
      enum: ["yes", "no", "unknown"],
    },
    problemResolved: {
      type: "string",
      enum: ["yes", "no", "partial", "unknown"],
    },
    operatorName: { type: "string" },
    operatorCode: { type: "string" },
    appName: { type: "string" },
    summary: { type: "string" },
    internalNote: { type: "string" },
    score: { type: "integer", minimum: 0, maximum: 100 },
  },
} as const;

export const dailyReportJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "date",
    "totalCalls",
    "resolvedCount",
    "unresolvedCount",
    "partialCount",
    "averageScore",
    "topProblemCategories",
    "customerMoodSummary",
    "operatorQualitySummary",
    "notableCalls",
    "dailySummary",
    "recommendations",
  ],
  properties: {
    date: { type: "string" },
    totalCalls: { type: "integer" },
    resolvedCount: { type: "integer" },
    unresolvedCount: { type: "integer" },
    partialCount: { type: "integer" },
    averageScore: { type: "number" },
    topProblemCategories: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["category", "count"],
        properties: {
          category: { type: "string" },
          count: { type: "integer" },
        },
      },
    },
    customerMoodSummary: { type: "string" },
    operatorQualitySummary: { type: "string" },
    notableCalls: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["vpbxId", "operatorName", "appName", "reason", "score"],
        properties: {
          vpbxId: { type: "string" },
          operatorName: { type: "string" },
          appName: { type: "string" },
          reason: { type: "string" },
          score: { type: "integer" },
        },
      },
    },
    dailySummary: { type: "string" },
    recommendations: {
      type: "array",
      items: { type: "string" },
    },
  },
} as const;

export type CallAnalysisResult = {
  customerMainProblem: string;
  problemCategory: string;
  customerEmotionalState: string;
  operatorCommunicationQuality: string;
  operatorUnderstoodCustomer: string;
  customerUnderstoodOperator: string;
  problemResolved: string;
  operatorName: string;
  operatorCode: string;
  appName: string;
  summary: string;
  internalNote: string;
  score: number;
};

export type DailyReportResult = {
  date: string;
  totalCalls: number;
  resolvedCount: number;
  unresolvedCount: number;
  partialCount: number;
  averageScore: number;
  topProblemCategories: Array<{ category: string; count: number }>;
  customerMoodSummary: string;
  operatorQualitySummary: string;
  notableCalls: Array<{ vpbxId: string; operatorName: string; appName: string; reason: string; score: number }>;
  dailySummary: string;
  recommendations: string[];
};
