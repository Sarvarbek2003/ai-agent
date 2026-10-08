import { CallStatus } from "@prisma/client";
import { processCall } from "../agents/call-analytic/processor";
import { enqueueUnique } from "../lib/queue";
import { prisma } from "../lib/prisma";

const READY_AFTER_MS = 10 * 60 * 1000;
const LOOKBACK_MS = 24 * 60 * 60 * 1000;
const INTERVAL_MS = 60 * 1000;
const BATCH_SIZE = 20;

let ticking = false;
let interval: NodeJS.Timeout | undefined;

export async function retryStaleAnalyses(): Promise<number> {
  const now = Date.now();
  const readyBefore = new Date(now - READY_AFTER_MS);
  const lookbackAfter = new Date(now - LOOKBACK_MS);
  const calls = await prisma.call.findMany({
    where: {
      createdAt: { gte: lookbackAfter, lte: readyBefore },
      callRecordLink: { not: null },
      recordingObjectKey: null,
      status: {
        notIn: [CallStatus.analyzed, CallStatus.skipped, CallStatus.in_progress, CallStatus.no_answer, CallStatus.ringing],
      },
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
  });

  for (const call of calls) {
    enqueueUnique(`call:${call.id}:recording`, () => processCall(call.id, { storeRecordingOnly: true }));
  }

  return calls.length;
}

export function startStaleAnalysisCron(): void {
  if (interval) {
    return;
  }

  const tick = async () => {
    if (ticking) {
      return;
    }

    ticking = true;
    try {
      const count = await retryStaleAnalyses();
      if (count > 0) {
        console.log(`Recording download cron queued ${count} call(s)`);
      }
    } catch (error) {
      console.error("Recording download cron failed", error);
    } finally {
      ticking = false;
    }
  };

  void tick();
  interval = setInterval(() => {
    void tick();
  }, INTERVAL_MS);
  interval.unref();
}
