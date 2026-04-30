export const defaultRetryPolicy = {
    maxAttempts: 3,
    delayMs(attempt) {
        // First attempt has no wait. Exponential-ish backoff afterwards.
        if (attempt <= 1)
            return 0;
        const backoff = [250, 1000, 2500];
        return backoff[attempt - 2] ?? 5000;
    },
};
/**
 * Runs jobs synchronously inside `send()`. The default — `send()` only
 * resolves after delivery has been attempted. Drop-in compatible with
 * the pre-queue behavior.
 */
export function inlineQueue() {
    let pending = Promise.resolve();
    return {
        async enqueue(job, run) {
            const next = pending.then(() => run(job)).catch(() => { });
            pending = next;
            await next;
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
export function setTimeoutQueue() {
    const inflight = new Set();
    return {
        enqueue(job, run) {
            const task = new Promise((resolve) => {
                setTimeout(() => {
                    run(job)
                        .catch(() => { })
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
//# sourceMappingURL=queues.js.map