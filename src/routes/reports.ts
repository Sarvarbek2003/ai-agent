import { Router } from "express";
import { generateDailyReport, getOrCreateDailyThread } from "../agents/call-analytic/daily-thread";
import { asyncHandler, HttpError } from "../http";
import { localDateKey } from "../lib/dates";
import { prisma } from "../lib/prisma";

export const reportsRouter = Router();

reportsRouter.get(
  "/daily",
  asyncHandler(async (req, res) => {
    const date = req.query.date ? String(req.query.date) : localDateKey();
    const thread = await prisma.dailyThread.findUnique({
      where: { localDate: date },
      include: {
        analyses: {
          select: {
            id: true,
            callId: true,
            score: true,
            problemCategory: true,
            problemResolved: true,
            createdAt: true,
          },
        },
      },
    });

    if (!thread) {
      throw new HttpError(404, `No daily thread for ${date}`);
    }

    res.json({
      date,
      openaiConversationId: thread.openaiConversationId,
      generatedAt: thread.generatedAt,
      report: thread.reportJson,
      analysisCount: thread.analyses.length,
    });
  }),
);

reportsRouter.post(
  "/daily",
  asyncHandler(async (req, res) => {
    const date = typeof req.body?.date === "string" ? req.body.date : localDateKey();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new HttpError(400, "date must be YYYY-MM-DD");
    }

    const result = await generateDailyReport(date);
    res.json(result);
  }),
);

reportsRouter.get(
  "/daily/thread",
  asyncHandler(async (req, res) => {
    const date = req.query.date ? String(req.query.date) : localDateKey();
    if (req.query.date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new HttpError(400, "date must be YYYY-MM-DD");
    }
    const create = String(req.query.create ?? "") === "true";
    const thread = create
      ? await getOrCreateDailyThread(date)
      : await prisma.dailyThread.findUnique({ where: { localDate: date } });

    if (!thread) {
      throw new HttpError(404, `No daily thread for ${date}`);
    }

    res.json(thread);
  }),
);
