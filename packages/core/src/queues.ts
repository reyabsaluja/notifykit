import type { DeliveryJob, Queue, RetryPolicy } from "./types.js";

export const defaultRetryPolicy: RetryPolicy = {
  maxAttempts: 3,
  delayMs(attempt) {
    // First attempt has no wait. Exponential-ish backoff afterwards.
    if (attempt <= 1) return 0;
    const backoff = [250, 1000, 2500];
    return backoff[attempt - 2] ?? 5000;
  },
};

/**
 * Runs jobs synchronously inside `send()`. The default — `send()` only
 * resolves after delivery has been attempted. Drop-in compatible with
 * the pre-queue behavior.
 */
export function inlineQueue(): Queue {
  let pending: Promise<void> = Promise.resolve();
  return {
    async enqueue(job, run) {
      let error: unknown;
      const next = pending.then(() => run(job)).catch((err) => { error = err; });
      pending = next;
      await next;
      if (error !== undefined) throw error;
    },
    async drain() {
      await pending;
    },
  };
}

/**
 * Runs jobs asynchronously via setTimeout. `send()` returns immediately;
 * delivery happens on the event loop. Use `notify.drain()` in tests or
 * during shutdown to wait for outstanding jobs.
 */
export function setTimeoutQueue(options?: {
  onError?: (err: unknown, job: DeliveryJob) => void;
}): Queue {
  const inflight = new Set<Promise<void>>();
  return {
    enqueue(job, run) {
      const task = new Promise<void>((resolve) => {
        setTimeout(() => {
          run(job)
            .catch((err) => {
              try { options?.onError?.(err, job); } catch {}
            })
            .finally(() => resolve());
        }, 0);
      });
      inflight.add(task);
      task.finally(() => inflight.delete(task));
    },
    async drain() {
      while (inflight.size > 0) {
        await Promise.all(Array.from(inflight));
      }
    },
  };
}

export type { DeliveryJob, Queue, RetryPolicy };
