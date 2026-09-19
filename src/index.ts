import "dotenv/config";
import { app } from "./app";
import { config, webhookUrl } from "./config";
import { startStaleAnalysisCron } from "./jobs/retry-stale-analyses";
import { ensureRecordingsBucket } from "./lib/minio";
import { ensureDefaultApps } from "./lib/operators";
import { startTelegramBot } from "./telegram/bot";

const server = app.listen(config.port, () => {
  console.log(`Server running on http://localhost:${config.port}`);
  console.log(`Swagger UI: http://localhost:${config.port}/docs`);
  console.log(`NewTel webhook: ${webhookUrl()}`);
  void ensureDefaultApps().catch((error) => {
    console.error("Default apps seed failed", error);
  });
  void ensureRecordingsBucket().catch((error) => {
    console.error("MinIO bucket setup failed", error);
  });
  startStaleAnalysisCron();
  startTelegramBot();
});

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${config.port} is already in use`);
    process.exit(1);
  }

  throw error;
});
