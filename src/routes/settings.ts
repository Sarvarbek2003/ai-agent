import { Router } from "express";
import { asyncHandler, HttpError } from "../http";
import {
  getAppSettings,
  isAnalysisPromptId,
  listAnalysisPrompts,
  setActiveAnalysisPrompt,
} from "../lib/settings";
import { prisma } from "../lib/prisma";
import { serializeScoringAgent } from "../lib/scoring-agents";

export const settingsRouter = Router();

settingsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const settings = await getAppSettings();
    const scoringAgents = await prisma.scoringAgent.findMany({ orderBy: { createdAt: "desc" } });
    res.json({
      activeAnalysisPromptId: settings.activeAnalysisPromptId,
      updatedAt: settings.updatedAt,
      prompts: listAnalysisPrompts(),
      scoringAgents: scoringAgents.map((item) => serializeScoringAgent(item)),
      activeScoringAgentId: scoringAgents.find((item) => item.isActive)?.id ?? null,
    });
  }),
);

settingsRouter.patch(
  "/",
  asyncHandler(async (req, res) => {
    const promptId = typeof req.body?.activeAnalysisPromptId === "string"
      ? req.body.activeAnalysisPromptId.trim()
      : "";

    if (!promptId || !isAnalysisPromptId(promptId)) {
      throw new HttpError(400, "Unknown analysis prompt");
    }

    const settings = await setActiveAnalysisPrompt(promptId);
    res.json({
      activeAnalysisPromptId: settings.activeAnalysisPromptId,
      updatedAt: settings.updatedAt,
      prompts: listAnalysisPrompts(),
    });
  }),
);
