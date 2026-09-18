import "dotenv/config";

function optional(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

function requiredInProduction(name: string, fallback = ""): string {
  const value = optional(name, fallback);
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error(`${name} is required`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT) || 5050,
  databaseUrl: requiredInProduction("DATABASE_URL"),
  openaiApiKey: optional("OPENAI_API_KEY"),
  analysisModel: optional("OPENAI_ANALYSIS_MODEL", "gpt-4o"),
  transcribeModel: "gpt-4o-transcribe-diarize",
  newtelWebhookKey: optional("NEWTEL_WEBHOOK_KEY"),
  publicBaseUrl: optional("PUBLIC_BASE_URL", "http://localhost:5050").replace(/\/$/, ""),
  timezone: optional("APP_TIMEZONE", "Asia/Tashkent"),
  storageDir: optional("STORAGE_DIR", "storage/recordings"),
};

export function webhookUrl(): string {
  return `${config.publicBaseUrl}/webhooks/newtel`;
}
