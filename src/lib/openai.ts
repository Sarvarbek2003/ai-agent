import OpenAI from "openai";
import { config } from "../config";

let client: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (!config.openaiApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  if (!client) {
    client = new OpenAI({ apiKey: config.openaiApiKey });
  }

  return client;
}

export function extractOutputText(response: OpenAI.Responses.Response): string {
  if (response.output_text?.trim()) {
    return response.output_text.trim();
  }

  const chunks: string[] = [];
  for (const item of response.output ?? []) {
    if (item.type !== "message") {
      continue;
    }
    for (const content of item.content ?? []) {
      if (content.type === "output_text") {
        chunks.push(content.text);
      }
    }
  }

  return chunks.join("\n").trim();
}

export function parseJsonText<T>(text: string): T {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1]?.trim() ?? trimmed;
  return JSON.parse(raw) as T;
}
