import type { DeliveryJob, Queue, RetryPolicy } from "./types.js";
export declare const defaultRetryPolicy: RetryPolicy;
/**
 * Runs jobs synchronously inside `send()`. The default — `send()` only
 * resolves after delivery has been attempted. Drop-in compatible with
 * the pre-queue behavior.
 */
export declare function inlineQueue(): Queue;
/**
 * Runs jobs asynchronously via setTimeout. `send()` returns immediately;
 * delivery happens on the event loop. Use `notify.drain()` in tests or
 * during shutdown to wait for outstanding jobs.
 */
export declare function setTimeoutQueue(): Queue;
export type { DeliveryJob, Queue, RetryPolicy };
//# sourceMappingURL=queues.d.ts.map