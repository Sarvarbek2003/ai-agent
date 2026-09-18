import "dotenv/config";
import { app } from "./app";

const port = Number(process.env.PORT) || 5050;

const server = app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use`);
    process.exit(1);
  }

  throw error;
});
