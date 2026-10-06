import { ScoringAgent } from "@prisma/client";
import { APIError, toFile } from "openai";
import { config } from "../config";
import { callAnalysisJsonSchema } from "../agents/call-analytic/prompts";
import { getRecordingObject } from "./minio";
import { getOpenAI, extractOutputText } from "./openai";
import { prisma } from "./prisma";

const FILE_SEARCH_TIMEOUT_MS = 10 * 60 * 1000;

type CallDirection = "inbound" | "outbound";

export type CriteriaUpload = {
  buffer: Buffer;
  originalname: string;
};

const analysisJsonSchema = JSON.parse(JSON.stringify(callAnalysisJsonSchema)) as {
  [key: string]: unknown;
};

export function openaiFileSearchErrorMessage(error: unknown): string {
  if (error instanceof APIError) {
    return error.message || `OpenAI error ${error.status}`;
  }
  return error instanceof Error ? error.message : "OpenAI file search request failed";
}

export function scoringFileSearchTool(vectorStoreId: string) {
  return {
    type: "file_search" as const,
    vector_store_ids: [vectorStoreId],
    max_num_results: 50,
  };
}

export function vectorStoreIdForCall(agent: ScoringAgent, direction: CallDirection): string | null {
  return (direction === "outbound" ? agent.openaiOutboundVectorStoreId : agent.openaiInboundVectorStoreId) ?? null;
}

async function ignoreMissing(run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (error instanceof APIError && error.status === 404) {
      return;
    }
    throw error;
  }
}

async function ensureVectorStore(params: {
  name: string;
  existingId: string | null | undefined;
  scoringAgentId: string;
  direction: CallDirection;
}): Promise<string> {
  const openai = getOpenAI();
  if (params.existingId) {
    try {
      const existing = await openai.vectorStores.retrieve(params.existingId);
      if (existing.id) {
        await openai.vectorStores.update(existing.id, { name: params.name }).catch(() => undefined);
        return existing.id;
      }
    } catch (error) {
      if (!(error instanceof APIError && error.status === 404)) {
        throw error;
      }
    }
  }

  const created = await openai.vectorStores.create({
    name: params.name,
    metadata: {
      scoringAgentId: params.scoringAgentId,
      direction: params.direction,
    },
  });
  return created.id;
}

async function detachStoredFile(vectorStoreId: string, fileId: string | null | undefined): Promise<void> {
  if (!fileId) {
    return;
  }
  const openai = getOpenAI();
  await ignoreMissing(() =>
    openai.vectorStores.files.delete(fileId, { vector_store_id: vectorStoreId }),
  );
  await ignoreMissing(() => openai.files.delete(fileId));
}

async function replaceVectorStoreFile(params: {
  vectorStoreId: string;
  previousFileId: string | null | undefined;
  file: CriteriaUpload;
}): Promise<string> {
  const openai = getOpenAI();
  await detachStoredFile(params.vectorStoreId, params.previousFileId);

  const uploaded = await openai.vectorStores.files.uploadAndPoll(
    params.vectorStoreId,
    await toFile(params.file.buffer, params.file.originalname),
  );
  if (uploaded.status !== "completed") {
    const detail = uploaded.last_error?.message || uploaded.status;
    throw new Error(`Vector store file failed: ${detail}`);
  }
  return uploaded.id;
}

async function loadStoredCriteria(agent: ScoringAgent, direction: CallDirection): Promise<CriteriaUpload> {
  const objectKey = direction === "outbound" ? agent.outboundCriteriaObjectKey : agent.inboundCriteriaObjectKey;
  const fileName = direction === "outbound" ? agent.outboundCriteriaFileName : agent.inboundCriteriaFileName;
  const text = direction === "outbound" ? agent.outboundCriteriaText : agent.inboundCriteriaText;

  if (objectKey) {
    try {
      return {
        buffer: await getRecordingObject(objectKey),
        originalname: fileName,
      };
    } catch (error) {
      console.error("Failed to load scoring criteria from MinIO", objectKey, error);
    }
  }

  const fallbackName = fileName.replace(/\.docx$/i, ".txt") || `${direction}.txt`;
  return {
    buffer: Buffer.from(text, "utf8"),
    originalname: fallbackName.endsWith(".txt") ? fallbackName : `${fallbackName}.txt`,
  };
}

async function syncDirectionStore(
  agent: ScoringAgent,
  direction: CallDirection,
  uploaded?: CriteriaUpload,
): Promise<{ vectorStoreId: string; fileId: string }> {
  const label = direction === "outbound" ? "Chiquvchi" : "Kiruvchi";
  const currentStoreId = direction === "outbound" ? agent.openaiOutboundVectorStoreId : agent.openaiInboundVectorStoreId;
  const currentFileId = direction === "outbound" ? agent.openaiOutboundFileId : agent.openaiInboundFileId;
  const vectorStoreId = await ensureVectorStore({
    name: `${agent.name} · ${label}`,
    existingId: currentStoreId,
    scoringAgentId: agent.id,
    direction,
  });

  const needsUpload = Boolean(uploaded) || !currentFileId || currentStoreId !== vectorStoreId;
  if (!needsUpload) {
    return { vectorStoreId, fileId: currentFileId as string };
  }

  const file = uploaded ?? (await loadStoredCriteria(agent, direction));
  const fileId = await replaceVectorStoreFile({
    vectorStoreId,
    previousFileId: currentStoreId === vectorStoreId ? currentFileId : null,
    file,
  });
  return { vectorStoreId, fileId };
}

export async function syncScoringVectorStores(
  agent: ScoringAgent,
  files?: { inbound?: CriteriaUpload; outbound?: CriteriaUpload },
): Promise<ScoringAgent> {
  const inbound = await syncDirectionStore(agent, "inbound", files?.inbound);
  const outbound = await syncDirectionStore(agent, "outbound", files?.outbound);

  if (
    inbound.vectorStoreId === agent.openaiInboundVectorStoreId &&
    outbound.vectorStoreId === agent.openaiOutboundVectorStoreId &&
    inbound.fileId === agent.openaiInboundFileId &&
    outbound.fileId === agent.openaiOutboundFileId
  ) {
    return agent;
  }

  return prisma.scoringAgent.update({
    where: { id: agent.id },
    data: {
      openaiInboundVectorStoreId: inbound.vectorStoreId,
      openaiOutboundVectorStoreId: outbound.vectorStoreId,
      openaiInboundFileId: inbound.fileId,
      openaiOutboundFileId: outbound.fileId,
    },
  });
}

export async function deleteScoringVectorStores(agent: ScoringAgent): Promise<void> {
  const openai = getOpenAI();
  const pairs: Array<{ storeId: string | null; fileId: string | null }> = [
    { storeId: agent.openaiInboundVectorStoreId, fileId: agent.openaiInboundFileId },
    { storeId: agent.openaiOutboundVectorStoreId, fileId: agent.openaiOutboundFileId },
  ];

  for (const pair of pairs) {
    if (pair.storeId && pair.fileId) {
      await detachStoredFile(pair.storeId, pair.fileId);
    } else if (pair.fileId) {
      await ignoreMissing(() => openai.files.delete(pair.fileId as string));
    }
    if (pair.storeId) {
      await ignoreMissing(() => openai.vectorStores.delete(pair.storeId as string));
    }
  }
}

export async function runFileSearchAnalysis(params: {
  vectorStoreId: string;
  instructions: string;
  input: string;
}): Promise<{ text: string; responseId?: string; model: string }> {
  const openai = getOpenAI();
  const response = await openai.responses.create(
    {
      model: config.analysisModel,
      instructions: params.instructions,
      input: params.input,
      tools: [scoringFileSearchTool(params.vectorStoreId)],
      tool_choice: { type: "file_search" },
      text: {
        format: {
          type: "json_schema",
          name: "call_analysis",
          strict: true,
          schema: analysisJsonSchema,
        },
      },
    },
    { timeout: FILE_SEARCH_TIMEOUT_MS },
  );

  const text = extractOutputText(response);
  if (!text.trim()) {
    throw new Error("OpenAI file search returned empty output");
  }

  return {
    text,
    responseId: response.id,
    model: response.model || config.analysisModel,
  };
}
