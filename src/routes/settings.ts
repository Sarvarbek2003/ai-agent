import { Router } from "express";
import { asyncHandler, HttpError } from "../http";
import {
  getAppSettings,
  isAnalysisPromptId,
  listAnalysisPrompts,
  setActiveAnalysisPrompt,
  setAutoAnalysisEnabled,
} from "../lib/settings";
import { prisma } from "../lib/prisma";
import { serializeScoringAgent } from "../lib/scoring-agents";

export const settingsRouter = Router();

async function settingsPayload() {
  const settings = await getAppSettings();
  const [scoringAgents, dnids, operators] = await Promise.all([
    prisma.scoringAgent.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.appDnid.findMany({ include: { app: true }, orderBy: { phone: "asc" } }),
    prisma.operator.findMany({ include: { app: true }, orderBy: [{ app: { name: "asc" } }, { code: "asc" }] }),
  ]);
  return {
    activeAnalysisPromptId: settings.activeAnalysisPromptId,
    autoAnalysisEnabled: settings.autoAnalysisEnabled,
    updatedAt: settings.updatedAt,
    prompts: listAnalysisPrompts(),
    scoringAgents: scoringAgents.map((item) => serializeScoringAgent(item)),
    activeScoringAgentId: scoringAgents.find((item) => item.isActive)?.id ?? null,
    dnids,
    operators,
  };
}

settingsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await settingsPayload());
  }),
);

settingsRouter.patch(
  "/",
  asyncHandler(async (req, res) => {
    const promptId = typeof req.body?.activeAnalysisPromptId === "string"
      ? req.body.activeAnalysisPromptId.trim()
      : "";
    const autoAnalysis = req.body?.autoAnalysisEnabled;
    const hasAutoAnalysis = typeof autoAnalysis === "boolean";

    if (!promptId && !hasAutoAnalysis) {
      throw new HttpError(400, "activeAnalysisPromptId or autoAnalysisEnabled is required");
    }
    if (promptId && !isAnalysisPromptId(promptId)) {
      throw new HttpError(400, "Unknown analysis prompt");
    }

    if (promptId) {
      await setActiveAnalysisPrompt(promptId);
    }
    if (hasAutoAnalysis) {
      await setAutoAnalysisEnabled(autoAnalysis);
    }

    res.json(await settingsPayload());
  }),
);
