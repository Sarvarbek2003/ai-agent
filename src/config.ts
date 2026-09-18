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
  transcribeModel: "gpt-transcribe",
  newtelWebhookKey: optional("NEWTEL_WEBHOOK_KEY"),
  publicBaseUrl: optional("PUBLIC_BASE_URL", "http://localhost:5050").replace(/\/$/, ""),
  timezone: optional("APP_TIMEZONE", "Asia/Tashkent"),
  minio: {
    endPoint: optional("MINIO_ENDPOINT", "localhost"),
    port: Number(process.env.MINIO_PORT) || 9000,
    useSSL: optional("MINIO_USE_SSL", "false") === "true",
    accessKey: optional("MINIO_ACCESS_KEY", "minioadmin"),
    secretKey: optional("MINIO_SECRET_KEY", "minioadmin"),
    bucket: optional("MINIO_BUCKET", "call-recordings"),
    publicUrl: optional("MINIO_PUBLIC_URL").replace(/\/$/, ""),
  },
};

export function webhookUrl(): string {
  return `${config.publicBaseUrl}/webhooks/newtel`;
}
