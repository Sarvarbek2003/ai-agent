import { CallStatus } from "@prisma/client";
import { processCall } from "../agents/call-analytic/processor";
import { enqueueUnique } from "../lib/queue";
import { prisma } from "../lib/prisma";

const STALE_AFTER_MS = 10 * 60 * 1000;
const INTERVAL_MS = 60 * 1000;
const BATCH_SIZE = 20;

let ticking = false;
let interval: NodeJS.Timeout | undefined;

export async function retryStaleAnalyses(): Promise<number> {
  const staleBefore = new Date(Date.now() - STALE_AFTER_MS);
  const calls = await prisma.call.findMany({
    where: {
      createdAt: { lte: staleBefore },
      status: {
        notIn: [
          CallStatus.analyzed,
          CallStatus.failed,
          CallStatus.skipped,
          // CallStatus.ringing,
          CallStatus.in_progress,
          CallStatus.no_answer,
        ],
      },
      analysis: { is: null },
    },
    select: {
      id: true,
      transcript: { select: { id: true } },
    },
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
  });

  for (const call of calls) {
    enqueueUnique(`call:${call.id}`, () =>
      processCall(call.id, call.transcript ? { fromTranscript: true } : undefined),
    );
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
        console.log(`Stale analysis cron queued ${count} call(s)`);
      }
    } catch (error) {
      console.error("Stale analysis cron failed", error);
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
