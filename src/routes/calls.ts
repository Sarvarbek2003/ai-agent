import { CallStatus, Prisma } from "@prisma/client";
import { Router } from "express";
import { processCall } from "../agents/call-analytic/processor";
import { config } from "../config";
import { asyncHandler, HttpError, routeParam } from "../http";
import { localDateKey } from "../lib/dates";
import { presignRecordingUrl } from "../lib/minio";
import { prisma } from "../lib/prisma";
import { matchKnownAppName } from "../lib/slug";
import { enqueueUnique } from "../lib/queue";

export const callsRouter = Router();

function addOneDay(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function timezoneOffset(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
  }).formatToParts(date);
  const value = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT+5";
  const match = value.match(/([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!match) {
    return "+05:00";
  }
  const sign = match[1];
  const hours = match[2]?.padStart(2, "0") ?? "05";
  const minutes = (match[3] ?? "00").padStart(2, "0");
  return `${sign}${hours}:${minutes}`;
}

function localDayRange(dateKey: string) {
  const sample = new Date(`${dateKey}T12:00:00Z`);
  const offset = timezoneOffset(sample, config.timezone);
  return {
    gte: new Date(`${dateKey}T00:00:00${offset}`),
    lt: new Date(`${addOneDay(dateKey)}T00:00:00${offset}`),
  };
}

callsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const status = req.query.status ? String(req.query.status) : undefined;
    const date = req.query.date ? String(req.query.date) : undefined;
    const operatorNumber = req.query.operatorNumber ? String(req.query.operatorNumber) : undefined;
    const operatorCode = req.query.operatorCode ? String(req.query.operatorCode) : undefined;
    const customerNumber = req.query.customerNumber ? String(req.query.customerNumber) : undefined;
    const appId = req.query.appId ? String(req.query.appId) : req.query.app ? String(req.query.app) : undefined;

    const where: Prisma.CallWhereInput = {};
    if (status) {
      if (!Object.values(CallStatus).includes(status as CallStatus)) {
        throw new HttpError(400, `Unknown status: ${status}`);
      }
      where.status = status as CallStatus;
    }
    const code = operatorCode || operatorNumber;
    if (code) {
      where.operatorNumber = code;
    }
    if (appId) {
      const apps = await prisma.app.findMany({
        select: { id: true, name: true, slug: true },
      });
      const matchedApp =
        apps.find((app) => app.id === appId || app.slug === appId || app.name === appId) ??
        matchKnownAppName(appId, apps);
      const appNames = [...new Set([appId, matchedApp?.name, matchedApp?.slug].filter(Boolean))] as string[];

      where.OR = [
        ...(matchedApp ? [{ appId: matchedApp.id }] : []),
        { analysis: { appName: { in: appNames, mode: "insensitive" } } },
        { analysis: { appName: { contains: matchedApp?.name ?? appId, mode: "insensitive" } } },
        ...(matchedApp ? [{ operator: { appId: matchedApp.id } }] : []),
      ];
    }
    if (customerNumber) {
      where.customerNumber = customerNumber;
    }
    if (date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new HttpError(400, "date must be YYYY-MM-DD");
      }
      where.createdAt = localDayRange(date);
    }

    const [items, total] = await Promise.all([
      prisma.call.findMany({
        where,
        include: {
          analysis: true,
          transcript: { select: { id: true, durationSec: true } },
          operator: { include: { app: true } },
          app: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.call.count({ where }),
    ]);

    res.json({
      page,
      limit,
      total,
      date: date ?? localDateKey(),
      items,
    });
  }),
);

callsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    const call = await prisma.call.findFirst({
      where: {
        OR: [{ id }, { vpbxId: id }],
      },
      include: {
        events: { orderBy: { receivedAt: "asc" } },
        transcript: true,
        analysis: true,
        operator: { include: { app: true } },
        app: true,
      },
    });

    if (!call) {
      throw new HttpError(404, "Call not found");
    }

    res.json(call);
  }),
);

callsRouter.get(
  "/:id/recording",
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    const call = await prisma.call.findFirst({
      where: {
        OR: [{ id }, { vpbxId: id }],
      },
      select: {
        id: true,
        vpbxId: true,
        recordingObjectKey: true,
        recordingUrl: true,
        recordingMimeType: true,
        recordingSizeBytes: true,
      },
    });

    if (!call) {
      throw new HttpError(404, "Call not found");
    }

    if (!call.recordingObjectKey) {
      throw new HttpError(404, "Recording is not stored in MinIO yet");
    }

    const url = await presignRecordingUrl(call.recordingObjectKey);
    res.json({
      callId: call.id,
      vpbxId: call.vpbxId,
      objectKey: call.recordingObjectKey,
      mimeType: call.recordingMimeType,
      sizeBytes: call.recordingSizeBytes,
      url,
      expiresIn: 3600,
    });
  }),
);

callsRouter.post(
  "/:id/reprocess",
  asyncHandler(async (req, res) => {
    const id = routeParam(req.params.id);
    const call = await prisma.call.findFirst({
      where: {
        OR: [{ id }, { vpbxId: id }],
      },
    });

    if (!call) {
      throw new HttpError(404, "Call not found");
    }

    enqueueUnique(`call:${call.id}:force`, () => processCall(call.id, { force: true }));
    res.status(202).json({
      accepted: true,
      callId: call.id,
      vpbxId: call.vpbxId,
    });
  }),
);
