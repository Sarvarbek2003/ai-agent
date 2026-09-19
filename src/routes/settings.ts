import { Router } from "express";
import { asyncHandler, HttpError } from "../http";
import {
  getAppSettings,
  isAnalysisPromptId,
  listAnalysisPrompts,
  setActiveAnalysisPrompt,
} from "../lib/settings";

export const settingsRouter = Router();

settingsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const settings = await getAppSettings();
    res.json({
      activeAnalysisPromptId: settings.activeAnalysisPromptId,
      updatedAt: settings.updatedAt,
      prompts: listAnalysisPrompts(),
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
