import express from "express";
import { config, webhookUrl } from "./config";
import { mountSwagger } from "./docs/swagger";
import { errorHandler } from "./http";
import { minioStatus } from "./lib/minio";
import { prisma } from "./lib/prisma";
import { appsRouter } from "./routes/apps";
import { agentsRouter } from "./routes/agents";
import { callsRouter } from "./routes/calls";
import { operatorsRouter } from "./routes/operators";
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

  const minio = await minioStatus();

  res.json({
    ok: true,
    database,
    minio,
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
app.use("/apps", appsRouter);
app.use("/operators", operatorsRouter);
app.use("/webhooks", webhookRouter);
app.use("/calls", callsRouter);
app.use("/reports", reportsRouter);

mountSwagger(app);
app.use(errorHandler);
