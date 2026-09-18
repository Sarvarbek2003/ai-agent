import { Router } from "express";
import { listAgents } from "../agents/registry";
import { webhookUrl } from "../config";

export const agentsRouter = Router();

agentsRouter.get("/", (_req, res) => {
  res.json({
    agents: listAgents(),
    webhookUrl: webhookUrl(),
  });
});
