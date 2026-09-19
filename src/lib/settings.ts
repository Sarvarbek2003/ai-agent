import {
  analysisPromptCatalog,
  DEFAULT_ANALYSIS_PROMPT_ID,
  getAnalysisPromptById,
} from "../agents/call-analytic/prompts";
import { prisma } from "./prisma";

export async function ensureAppSettings() {
  await prisma.appSetting.upsert({
    where: { id: "app" },
    create: {
      id: "app",
      activeAnalysisPromptId: DEFAULT_ANALYSIS_PROMPT_ID,
    },
    update: {},
  });
}

export async function getAppSettings() {
  return prisma.appSetting.upsert({
    where: { id: "app" },
    create: {
      id: "app",
      activeAnalysisPromptId: DEFAULT_ANALYSIS_PROMPT_ID,
    },
    update: {},
  });
}

export function isAnalysisPromptId(value: string) {
  return analysisPromptCatalog.some((prompt) => prompt.id === value);
}

export async function getActiveAnalysisPrompt() {
  const settings = await getAppSettings();
  return getAnalysisPromptById(settings.activeAnalysisPromptId);
}

export async function setActiveAnalysisPrompt(id: string) {
  return prisma.appSetting.upsert({
    where: { id: "app" },
    create: {
      id: "app",
      activeAnalysisPromptId: id,
    },
    update: { activeAnalysisPromptId: id },
  });
}

export function listAnalysisPrompts() {
  return analysisPromptCatalog.map((prompt) => ({
    id: prompt.id,
    name: prompt.name,
    description: prompt.description,
    text: prompt.instructions,
  }));
}
