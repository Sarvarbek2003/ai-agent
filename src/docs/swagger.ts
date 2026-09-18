import { Express, Router } from "express";
import swaggerUi from "swagger-ui-express";
import { openApiSpec } from "./openapi";

export function mountSwagger(app: Express): void {
  const router = Router();
  router.use(swaggerUi.serve);
  router.get("/", swaggerUi.setup(openApiSpec, {
    customSiteTitle: "AI Agent API",
    swaggerOptions: {
      persistAuthorization: true,
    },
  }));
  app.use("/docs", router);
  app.get("/openapi.json", (_req, res) => {
    res.json(openApiSpec);
  });
}
