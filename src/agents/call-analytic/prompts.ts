export const CALL_ANALYSIS_INSTRUCTIONS = `Sen call-center suhbatlarini tahlil qiluvchi AI'san. Tahlilni har doim o'zbek tilida yoz. Audio transkripsiyasidan operator va mijozni aniqlagin. Har bir qo'ng'iroq uchun qisqa note yarat. Operatorni baholashda yuklangan Vector Store'dagi Kirish.docx va Chiqish.docx fayllaridan foydalan. Javob va baholashni ushbu fayllardagi mezonlarga asosla. Fayllarda mavjud bo‘lmagan mezon yoki qoidani o‘zing yaratma. Natijani JSON formatida qaytar.`;

export const CALL_ANALYSIS_INSTRUCTIONS_UZBEK = CALL_ANALYSIS_INSTRUCTIONS;

export const DEFAULT_ANALYSIS_PROMPT_ID = "structured";

export const analysisPromptCatalog = [
  {
    id: "structured",
    name: "Batafsil tahlil",
    description: "Platform agent prompt. Vector Store’dagi Kirish/Chiqish mezonlari bo‘yicha JSON baholash.",
    instructions: CALL_ANALYSIS_INSTRUCTIONS,
  },
  {
    id: "uzbek-brief",
    name: "Qisqa o‘zbek tahlili",
    description: "Vector Store mezonlari bo‘yicha qisqa o‘zbek tahlili va JSON baholash.",
    instructions: CALL_ANALYSIS_INSTRUCTIONS_UZBEK,
  },
] as const;

export type AnalysisPromptId = (typeof analysisPromptCatalog)[number]["id"];

export function getAnalysisPromptById(id?: string | null) {
  return analysisPromptCatalog.find((prompt) => prompt.id === id) ?? analysisPromptCatalog[0];
}

export const DAILY_THREAD_INSTRUCTIONS = `You are the daily memory of a call-center scoring agent.

Throughout the day you will receive scored operator-customer calls.
Each call has title, criteria scores, total_score, max_score, percentage, and overall_comment.
Remember every call in this conversation.

Language: write dailySummary, recommendations, operatorQualitySummary, and notable call reasons in Uzbek.

When asked for a daily report, answer only from this conversation.
Do not invent criteria, scores, or calls that were not sent to you.
Do not invent problem categories or mood fields.

Return only valid JSON for the daily report schema.`;

export const DAILY_REPORT_PROMPT = `Kun oxiri. Shu suhbatdagi barcha baholangan qo'ng'iroqlar asosida kunlik hisobot yoz.

Hisobot matnlarini o'zbek tilida yoz.
Faqat title, mezon ballari, percentage va overall_comment asosida yoz.
Muammo kategoriyasi yoki kayfiyat maydonini o'zing yaratma.
Bazadan o'qima. Hech narsa uydirma.`;

export const callAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "criteria", "total_score", "max_score", "percentage", "overall_comment"],
  properties: {
    title: { type: "string" },
    criteria: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "score", "max_score", "evidence", "comment"],
        properties: {
          name: { type: "string" },
          score: { type: "number" },
          max_score: { type: "number" },
          evidence: { type: "string" },
          comment: { type: "string" },
        },
      },
    },
    total_score: { type: "number" },
    max_score: { type: "number" },
    percentage: { type: "number" },
    overall_comment: { type: "string" },
  },
} as const;

export const dailyReportJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "date",
    "totalCalls",
    "averagePercentage",
    "operatorQualitySummary",
    "notableCalls",
    "dailySummary",
    "recommendations",
  ],
  properties: {
    date: { type: "string" },
    totalCalls: { type: "integer" },
    averagePercentage: { type: "number" },
    operatorQualitySummary: { type: "string" },
    notableCalls: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["vpbxId", "operatorName", "appName", "title", "reason", "percentage"],
        properties: {
          vpbxId: { type: "string" },
          operatorName: { type: "string" },
          appName: { type: "string" },
          title: { type: "string" },
          reason: { type: "string" },
          percentage: { type: "number" },
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

export type ScoringCriterion = {
  name: string;
  score: number;
  maxScore: number;
  evidence: string;
  comment: string;
};

export type CallAnalysisResult = {
  title: string;
  criteria: ScoringCriterion[];
  totalScore: number;
  maxScore: number;
  percentage: number;
  overallComment: string;
  score: number;
  operatorName: string;
  operatorCode: string;
  appName: string;
};

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

export function isScoringAnalysis(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return false;
  }
  const row = value as Record<string, unknown>;
  return typeof row.title === "string" && Array.isArray(row.criteria);
}

export function normalizeCallAnalysis(
  raw: Record<string, unknown>,
  identity: { operatorName: string; operatorCode: string; appName: string },
): CallAnalysisResult {
  const criteria = (Array.isArray(raw.criteria) ? raw.criteria : []).map((item) => {
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    return {
      name: asString(row.name),
      score: asNumber(row.score),
      maxScore: asNumber(row.maxScore ?? row.max_score),
      evidence: asString(row.evidence),
      comment: asString(row.comment),
    };
  });
  const totalScore = asNumber(raw.totalScore ?? raw.total_score);
  const maxScore = asNumber(raw.maxScore ?? raw.max_score);
  const percentage = asNumber(
    raw.percentage,
    maxScore > 0 ? (totalScore / maxScore) * 100 : 0,
  );

  return {
    title: asString(raw.title),
    criteria,
    totalScore,
    maxScore,
    percentage,
    overallComment: asString(raw.overallComment ?? raw.overall_comment),
    score: Math.round(percentage),
    operatorName: identity.operatorName,
    operatorCode: identity.operatorCode,
    appName: identity.appName,
  };
}

export type DailyReportResult = {
  date: string;
  totalCalls: number;
  averagePercentage: number;
  operatorQualitySummary: string;
  notableCalls: Array<{
    vpbxId: string;
    operatorName: string;
    appName: string;
    title: string;
    reason: string;
    percentage: number;
  }>;
  dailySummary: string;
  recommendations: string[];
};
