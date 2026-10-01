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
import { openaiAgentErrorMessage, syncAllOpenAIScoringAgents } from "../lib/openai-agents";

export const settingsRouter = Router();

settingsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const settings = await getAppSettings();
    const [scoringAgents, dnids, operators] = await Promise.all([
      prisma.scoringAgent.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.appDnid.findMany({ include: { app: true }, orderBy: { phone: "asc" } }),
      prisma.operator.findMany({ include: { app: true }, orderBy: [{ app: { name: "asc" } }, { code: "asc" }] }),
    ]);
    res.json({
      activeAnalysisPromptId: settings.activeAnalysisPromptId,
      updatedAt: settings.updatedAt,
      prompts: listAnalysisPrompts(),
      scoringAgents: scoringAgents.map((item) => serializeScoringAgent(item)),
      activeScoringAgentId: scoringAgents.find((item) => item.isActive)?.id ?? null,
      dnids,
      operators,
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
    try {
      await syncAllOpenAIScoringAgents();
    } catch (error) {
      throw new HttpError(502, openaiAgentErrorMessage(error));
    }
    res.json({
      activeAnalysisPromptId: settings.activeAnalysisPromptId,
      updatedAt: settings.updatedAt,
      prompts: listAnalysisPrompts(),
    });
  }),
);
