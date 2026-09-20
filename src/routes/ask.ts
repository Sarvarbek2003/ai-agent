import { randomUUID } from "crypto";
import { Router } from "express";
import { asyncHandler, HttpError } from "../http";
import { answerQuestion } from "../telegram/answer";

export const askRouter = Router();

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseWebhookUrl(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new HttpError(400, "webhookUrl must be a valid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new HttpError(400, "webhookUrl must be http or https");
  }
  return parsed;
}

async function deliverAskResult(params: {
  requestId: string;
  question: string;
  webhookUrl: string;
}): Promise<void> {
  let payload: Record<string, unknown> = {
    requestId: params.requestId,
    question: params.question,
    success: false,
  };

  try {
    const answer = await answerQuestion(params.question);
    payload = {
      requestId: params.requestId,
      question: params.question,
      success: true,
      answer,
    };
  } catch (error) {
    payload.error = error instanceof Error ? error.message : String(error);
    console.error("Ask answer failed", error);
  }

  try {
    const response = await fetch(params.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      console.error(`Ask webhook failed ${response.status} ${params.webhookUrl}`);
    }
  } catch (error) {
    console.error("Ask webhook delivery failed", error);
  }
}

askRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const question = asString(req.body?.question ?? req.body?.q);
    const webhookUrl = asString(req.body?.webhookUrl ?? req.body?.webhook_url);
    const requestId = asString(req.body?.requestId) || randomUUID();

    if (!question) {
      throw new HttpError(400, "question is required");
    }
    parseWebhookUrl(webhookUrl);

    res.status(202).json({
      success: true,
      accepted: true,
      requestId,
    });

    void deliverAskResult({ requestId, question, webhookUrl });
  }),
);
