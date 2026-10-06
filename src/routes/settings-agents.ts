import { Request, Response, NextFunction } from "express";
import multer from "multer";
import { Router } from "express";
import { asyncHandler, HttpError, routeParam } from "../http";
import { assertDocxFile, extractDocxText } from "../lib/docx";
import { uploadRecordingObject } from "../lib/minio";
import { prisma } from "../lib/prisma";
import {
  serializeScoringAgent,
  setActiveScoringAgent,
  uniqueAgentSlug,
} from "../lib/scoring-agents";
import {
  deleteScoringVectorStores,
  openaiFileSearchErrorMessage,
  syncScoringVectorStores,
} from "../lib/openai-file-search";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

const criteriaUpload = upload.fields([
  { name: "inboundCriteria", maxCount: 1 },
  { name: "outboundCriteria", maxCount: 1 },
]);

function runUpload(req: Request, res: Response, next: NextFunction) {
  criteriaUpload(req, res, (error: unknown) => {
    if (error) {
      next(new HttpError(400, error instanceof Error ? error.message : "File upload failed"));
      return;
    }
    next();
  });
}

function filesOf(req: Request, field: string) {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  return files?.[field]?.[0];
}

async function storeCriteriaFile(agentId: string, direction: "inbound" | "outbound", file: Express.Multer.File) {
  const objectKey = `agents/${agentId}/${direction}.docx`;
  try {
    await uploadRecordingObject({
      objectKey,
      body: file.buffer,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    return objectKey;
  } catch (error) {
    console.error("Scoring agent file store failed", error);
    return null;
  }
}

export const scoringAgentsRouter = Router();

scoringAgentsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const items = await prisma.scoringAgent.findMany({ orderBy: { createdAt: "desc" } });
    res.json({ items: items.map((item) => serializeScoringAgent(item)) });
  }),
);

scoringAgentsRouter.post(
  "/",
  runUpload,
  asyncHandler(async (req, res) => {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name) {
      throw new HttpError(400, "name is required");
    }

    const inbound = filesOf(req, "inboundCriteria");
    const outbound = filesOf(req, "outboundCriteria");
    assertDocxFile(inbound, "inboundCriteria");
    assertDocxFile(outbound, "outboundCriteria");

    const inboundText = await extractDocxText(inbound.buffer);
    const outboundText = await extractDocxText(outbound.buffer);
    const slug = await uniqueAgentSlug(name);
    const makeActive = String(req.body?.isActive ?? "") === "true";

    const agent = await prisma.scoringAgent.create({
      data: {
        name,
        slug,
        isActive: false,
        inboundCriteriaFileName: inbound.originalname,
        inboundCriteriaText: inboundText,
        outboundCriteriaFileName: outbound.originalname,
        outboundCriteriaText: outboundText,
      },
    });

    const inboundKey = await storeCriteriaFile(agent.id, "inbound", inbound);
    const outboundKey = await storeCriteriaFile(agent.id, "outbound", outbound);
    const withFiles = await prisma.scoringAgent.update({
      where: { id: agent.id },
      data: {
        inboundCriteriaObjectKey: inboundKey,
        outboundCriteriaObjectKey: outboundKey,
      },
    });

    let synced;
    try {
      synced = await syncScoringVectorStores(withFiles, {
        inbound: { buffer: inbound.buffer, originalname: inbound.originalname },
        outbound: { buffer: outbound.buffer, originalname: outbound.originalname },
      });
    } catch (error) {
      await prisma.scoringAgent.delete({ where: { id: withFiles.id } }).catch(() => undefined);
      throw new HttpError(502, openaiFileSearchErrorMessage(error));
    }

    const saved = makeActive ? await setActiveScoringAgent(synced.id) : synced;
    res.status(201).json(serializeScoringAgent(saved, { includeText: true }));
  }),
);

scoringAgentsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    const agent = await prisma.scoringAgent.findFirst({
      where: { OR: [{ id }, { slug: id }] },
    });
    if (!agent) {
      throw new HttpError(404, "Agent not found");
    }
    res.json(serializeScoringAgent(agent, { includeText: true }));
  }),
);

scoringAgentsRouter.patch(
  "/:id",
  runUpload,
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    const existing = await prisma.scoringAgent.findFirst({
      where: { OR: [{ id }, { slug: id }] },
    });
    if (!existing) {
      throw new HttpError(404, "Agent not found");
    }

    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const inbound = filesOf(req, "inboundCriteria");
    const outbound = filesOf(req, "outboundCriteria");
    const data: {
      name?: string;
      slug?: string;
      inboundCriteriaFileName?: string;
      inboundCriteriaText?: string;
      inboundCriteriaObjectKey?: string | null;
      outboundCriteriaFileName?: string;
      outboundCriteriaText?: string;
      outboundCriteriaObjectKey?: string | null;
    } = {};

    if (name) {
      data.name = name;
      data.slug = await uniqueAgentSlug(name, existing.id);
    }
    if (inbound) {
      assertDocxFile(inbound, "inboundCriteria");
      data.inboundCriteriaFileName = inbound.originalname;
      data.inboundCriteriaText = await extractDocxText(inbound.buffer);
      data.inboundCriteriaObjectKey = await storeCriteriaFile(existing.id, "inbound", inbound);
    }
    if (outbound) {
      assertDocxFile(outbound, "outboundCriteria");
      data.outboundCriteriaFileName = outbound.originalname;
      data.outboundCriteriaText = await extractDocxText(outbound.buffer);
      data.outboundCriteriaObjectKey = await storeCriteriaFile(existing.id, "outbound", outbound);
    }

    const updated = await prisma.scoringAgent.update({
      where: { id: existing.id },
      data,
    });
    let synced;
    try {
      synced = await syncScoringVectorStores(updated, {
        inbound: inbound ? { buffer: inbound.buffer, originalname: inbound.originalname } : undefined,
        outbound: outbound ? { buffer: outbound.buffer, originalname: outbound.originalname } : undefined,
      });
    } catch (error) {
      throw new HttpError(502, openaiFileSearchErrorMessage(error));
    }
    const saved =
      String(req.body?.isActive ?? "") === "true" ? await setActiveScoringAgent(synced.id) : synced;
    res.json(serializeScoringAgent(saved, { includeText: true }));
  }),
);

scoringAgentsRouter.post(
  "/:id/activate",
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    const existing = await prisma.scoringAgent.findFirst({
      where: { OR: [{ id }, { slug: id }] },
    });
    if (!existing) {
      throw new HttpError(404, "Agent not found");
    }
    let synced = existing;
    try {
      synced = await syncScoringVectorStores(existing);
    } catch (error) {
      throw new HttpError(502, openaiFileSearchErrorMessage(error));
    }
    const saved = await setActiveScoringAgent(synced.id);
    res.json(serializeScoringAgent(saved));
  }),
);

scoringAgentsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    const existing = await prisma.scoringAgent.findFirst({
      where: { OR: [{ id }, { slug: id }] },
    });
    if (!existing) {
      throw new HttpError(404, "Agent not found");
    }
    await deleteScoringVectorStores(existing);
    await prisma.scoringAgent.delete({ where: { id: existing.id } });
    res.status(204).end();
  }),
);
