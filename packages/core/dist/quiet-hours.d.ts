import type { QuietHours } from "./types.js";
/**
 * Returns whether `now` falls inside the recipient's quiet-hours window, in
 * the recipient's configured timezone (default UTC). Handles windows that
 * cross midnight (e.g. 22:00 → 08:00).
 */
export declare function isWithinQuietHours(quietHours: QuietHours, now?: Date): boolean;
/**
 * Returns the next moment at or after `now` when the quiet-hours window
 * ends. If `now` is already outside the window, returns `now`.
 */
export declare function nextQuietHoursEnd(quietHours: QuietHours, now?: Date): Date;
//# sourceMappingURL=quiet-hours.d.ts.map