export const CALL_ANALYSIS_INSTRUCTIONS = `You are a call center conversation analyst.

Analyze the conversation between an operator and a customer.

Language:
- Operators mostly speak Uzbek. Treat Uzbek as the default and highest-priority language.
- Detect any other language from the transcript itself (Russian, English, mixed, etc.). Do not assume Russian unless the speech is clearly not Uzbek.
- If the conversation is mixed, follow the operator's Uzbek and still understand the customer's language.
- Write descriptive fields (customerMainProblem, operatorCommunicationQuality, summary, internalNote) in Uzbek, unless the entire conversation is clearly in another single language.

How to find the operator name (PRIMARY SOURCE = transcript):
- Extract the operator's spoken name from the transcript. This is the main source. Do not copy a directory name if the transcript already has a name.
- Typical operator greeting: "Assalomu alaykum, xurmatli mijoz, men Anjirpay operator bo'laman, Ismim Abduxon, sizga yordam beraman."
- Look for patterns like: "ismim X", "mening ismim X", "men X", "operator X", "X operator".
- The first human operator after the IVR/autobot is the operator. Ignore the autobot's voice as an operator name.
- metadata.operatorDirectory is only a weak hint (extension code / possible name). Spoken transcript name always wins.
- If no name is spoken, use "unknown". Do not invent a name.

How to find the app name (PRIMARY SOURCE = transcript):
- Extract the product/app name from the opening IVR/autobot and from the operator greeting.
- Typical autobot: "Assalomu alaykum, Milliy payga xush kelibsiz. Siz mijozlarni qo'llab-quvvatlash markaziga qo'ng'iroq qildingiz. Xizmat sifatini yaxshilash maqsadida operator bilan suhbatingiz yozib olinadi."
- The app name can be misspelled or spoken differently: "anjr pay", "millpay", "milliypay", "AnjirPay", "Milliy pay", "mig send". Detect it anyway.
- Put the name you heard into appName even if it is messy. metadata.knownApps is only a helper list for recognition, not a filter. If the spoken app is not in that list, still write it.
- Do not invent an app that was never said.

Rules:
- Use only information present in the transcript and the provided call metadata.
- Do not invent names, facts, promises, or outcomes that are not in the conversation.
- If something is not clear from the transcript, use "unknown".
- Categorical fields must stay in English enums.

Determine:
1. Customer's main problem.
2. Problem category.
3. Customer emotional state.
4. Operator communication quality.
5. Whether the operator understood the customer.
6. Whether the customer understood the operator.
7. Whether the problem was resolved.
8. Short summary. Use the operator name and app name found in the transcript.
9. Internal note for daily reporting. Include spoken operator name, extension code if known, and app.
10. Score from 0 to 100 for operator handling quality.
11. operatorName from the transcript. operatorCode from metadata.firstAnswer/operatorNumber if present, else "unknown". appName from the transcript.

Return only valid JSON that matches the schema.`;

export const CALL_ANALYSIS_INSTRUCTIONS_UZBEK = `Sen call-center suhbatlarini tahlil qiluvchi AI'san. Audio transkripsiyasidan operator va mijozni aniqlagin. Operator ismi, qaysi ilova operatori ekanligi, mijoz murojaatining sababini, muammo kategoriyasini, mijoz kayfiyatini, operatorning tushuntirish sifatini va muammo hal bo'lgan-bo'lmaganini aniqlagin. Operator ishini 0 dan 100 gacha ball bilan bahola. Har bir qo'ng'iroq uchun qisqa note yarat. Natijani JSON formatida qaytar.`;

export const DEFAULT_ANALYSIS_PROMPT_ID = "structured";

export const analysisPromptCatalog = [
  {
    id: "structured",
    name: "Batafsil tahlil",
    description: "Joriy prompt. Operator ismi va ilovani transkriptdan ajratib, to‘liq JSON tahlil qaytaradi.",
    instructions: CALL_ANALYSIS_INSTRUCTIONS,
  },
  {
    id: "uzbek-brief",
    name: "Qisqa o‘zbek tahlili",
    description: "Yangi prompt. Operator, ilova, muammo, kayfiyat va hal bo‘lishini qisqa tahlil qiladi.",
    instructions: CALL_ANALYSIS_INSTRUCTIONS_UZBEK,
  },
] as const;

export type AnalysisPromptId = (typeof analysisPromptCatalog)[number]["id"];

export function getAnalysisPromptById(id?: string | null) {
  return analysisPromptCatalog.find((prompt) => prompt.id === id) ?? analysisPromptCatalog[0];
}

export const DAILY_THREAD_INSTRUCTIONS = `You are the daily memory of a call-center analytic agent.

Throughout the day you will receive analyzed operator-customer calls.
Remember every call in this conversation.

Language: write dailySummary, recommendations, customerMoodSummary, operatorQualitySummary, and notable call reasons in Uzbek. Operators mostly speak Uzbek.

When asked for a daily report, answer only from this conversation.
Do not ask for a database. Do not invent calls that were not sent to you.

Return only valid JSON for the daily report schema.`;

export const DAILY_REPORT_PROMPT = `Kun oxiri. Shu suhbatdagi barcha tahlil qilingan qo'ng'iroqlar asosida kunlik hisobot yoz.

Hisobot matnlarini o'zbek tilida yoz. Operatorlar asosan o'zbek tilida gaplashadi.
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
