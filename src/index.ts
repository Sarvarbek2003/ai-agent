import "dotenv/config";
import { app } from "./app";
import { config, webhookUrl } from "./config";

const server = app.listen(config.port, () => {
  console.log(`Server running on http://localhost:${config.port}`);
  console.log(`Swagger UI: http://localhost:${config.port}/docs`);
  console.log(`NewTel webhook: ${webhookUrl()}`);
});

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${config.port} is already in use`);
    process.exit(1);
  }

  throw error;
});
