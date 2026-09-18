type Job = {
  key: string;
  run: () => Promise<void>;
};

const pending = new Map<string, Job>();
const running = new Set<string>();

export function enqueueUnique(key: string, run: () => Promise<void>): void {
  if (running.has(key) || pending.has(key)) {
    return;
  }

  pending.set(key, { key, run });
  void drain();
}

async function drain(): Promise<void> {
  for (const [key, job] of pending) {
    pending.delete(key);
    running.add(key);
    try {
      await job.run();
    } catch (error) {
      console.error(`Background job failed [${key}]`, error);
    } finally {
      running.delete(key);
    }
  }
}
