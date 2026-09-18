import express from "express";
import { config, webhookUrl } from "./config";
import { mountSwagger } from "./docs/swagger";
import { errorHandler } from "./http";
import { prisma } from "./lib/prisma";
import { agentsRouter } from "./routes/agents";
import { callsRouter } from "./routes/calls";
import { reportsRouter } from "./routes/reports";
import { webhookRouter } from "./routes/webhooks";

export const app = express();

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/health", async (_req, res) => {
  let database = "unknown";
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = "up";
  } catch {
    database = "down";
  }

  res.json({
    ok: true,
    database,
    timezone: config.timezone,
    webhookUrl: webhookUrl(),
    swagger: "/docs",
  });
});

app.get("/", (_req, res) => {
  res.json({
    name: "ai-agent",
    docs: "/docs",
    webhookUrl: webhookUrl(),
  });
});

app.use("/agents", agentsRouter);
app.use("/webhooks", webhookRouter);
app.use("/calls", callsRouter);
app.use("/reports", reportsRouter);

mountSwagger(app);
app.use(errorHandler);
