import { Router } from "express";
import { config, webhookUrl } from "../config";
import { asyncHandler } from "../http";
import { ingestNewtelWebhook } from "../webhooks/newtel/ingest";

export const webhookRouter = Router();

webhookRouter.get(
  "/newtel",
  (_req, res) => {
    res.json({
      source: "newtel",
      method: "POST",
      url: webhookUrl(),
      setup: {
        cabinet: "https://my.new-tel.net/",
        steps: [
          "Webhook-оповещения bo'limida 'Ключ для подписи данных' yarating",
          "Kalitni NEWTEL_WEBHOOK_KEY sifatida .env ga yozing",
          "Оповещения bo'limiga ushbu URL ni qo'ying",
          "Kerakli ichki raqamlarni tanlang",
        ],
      },
      acceptedEvents: [
        "inboundCallStart",
        "inboundCallEnd",
        "outboundCallStart",
        "outboundCallEnd",
        "ringingStart",
        "ringingEnd",
        "inboundCallAnswer",
      ],
      signatureConfigured: Boolean(config.newtelWebhookKey),
    });
  },
);

webhookRouter.post(
  "/newtel",
  asyncHandler(async (req, res) => {
    const result = await ingestNewtelWebhook(req.body);
    res.status(200).json(result);
  }),
);
