import type { QuietHours } from "./types.js";

/**
 * Returns whether `now` falls inside the recipient's quiet-hours window, in
 * the recipient's configured timezone (default UTC). Handles windows that
 * cross midnight (e.g. 22:00 → 08:00).
 */
export function isWithinQuietHours(
  quietHours: QuietHours,
  now: Date = new Date(),
): boolean {
  const [startMin, endMin] = parseWindowMinutes(quietHours);
  if (startMin === endMin) return false; // empty window
  const nowMin = minutesOfDay(now, quietHours.timezone ?? "UTC");
  if (startMin < endMin) {
    return nowMin >= startMin && nowMin < endMin;
  }
  // Wraps past midnight.
  return nowMin >= startMin || nowMin < endMin;
}

/**
 * Returns the next moment at or after `now` when the quiet-hours window
 * ends. If `now` is already outside the window, returns `now`.
 */
export function nextQuietHoursEnd(
  quietHours: QuietHours,
  now: Date = new Date(),
): Date {
  if (!isWithinQuietHours(quietHours, now)) return now;
  const [, endMin] = parseWindowMinutes(quietHours);
  const tz = quietHours.timezone ?? "UTC";
  const nowMin = minutesOfDay(now, tz);

  let diff = endMin - nowMin;
  if (diff <= 0) diff += 24 * 60;

  // Converge on the exact wall-clock target to handle DST transitions where
  // 1 minute of wall-clock time != 60_000 ms. Multiple passes handle unusual
  // offsets (e.g., Lord Howe Island ±30/45 min).
  let candidate = new Date(now.getTime() + diff * 60_000);
  let prevAbsDrift = Infinity;
  for (let i = 0; i < 3; i++) {
    const candidateMin = minutesOfDay(candidate, tz);
    let drift = candidateMin - endMin;
    if (drift === 0) break;
    if (drift > 720) drift -= 1440;
    else if (drift < -720) drift += 1440;
    const absDrift = Math.abs(drift);
    if (absDrift >= prevAbsDrift) break;
    prevAbsDrift = absDrift;
    candidate = new Date(candidate.getTime() - drift * 60_000);
  }
  return candidate;
}

export function validateQuietHours(quietHours: unknown): string | null {
  if (!quietHours || typeof quietHours !== "object" || Array.isArray(quietHours)) {
    return "quietHours must be an object.";
  }
  const q = quietHours as Partial<QuietHours>;
  if (typeof q.start !== "string") return "quietHours.start must be a string.";
  if (typeof q.end !== "string") return "quietHours.end must be a string.";
  try {
    parseWindowMinutes({ start: q.start, end: q.end, timezone: q.timezone });
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
  if (q.timezone !== undefined) {
    if (typeof q.timezone !== "string" || q.timezone.trim() === "") {
      return "quietHours.timezone must be a non-empty IANA timezone string.";
    }
    try {
      new Intl.DateTimeFormat("en-GB", { timeZone: q.timezone });
    } catch {
      return `Invalid timezone "${q.timezone}".`;
    }
  }
  return null;
}

function parseWindowMinutes(q: QuietHours): [number, number] {
  return [parseHHMM(q.start), parseHHMM(q.end)];
}

function parseHHMM(s: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!match) {
    throw new Error(
      `Invalid time "${s}": expected "HH:MM" 24h format (e.g. "22:00").`,
    );
  }
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) {
    throw new Error(`Invalid time "${s}": out of range.`);
  }
  return h * 60 + m;
}

/**
 * Minutes-of-day in the given timezone. Uses Intl.DateTimeFormat so we don't
 * need a tz database — the runtime provides it.
 */
const fmtCache = new Map<string, Intl.DateTimeFormat>();

const MAX_CACHE_SIZE = 600;

function minutesOfDay(d: Date, timezone: string): number {
  let fmt = fmtCache.get(timezone);
  if (!fmt) {
    try {
      fmt = new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    } catch {
      fmt = new Intl.DateTimeFormat("en-GB", {
        timeZone: "UTC",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      console.error(`[notifykit] invalid timezone "${timezone}", falling back to UTC`);
    }
    if (fmtCache.size >= MAX_CACHE_SIZE) {
      const first = fmtCache.keys().next().value;
      if (first !== undefined) fmtCache.delete(first);
    }
    fmtCache.set(timezone, fmt);
  }
  const parts = fmt.formatToParts(d);
  let hour = 0;
  let minute = 0;
  for (const part of parts) {
    if (part.type === "hour") hour = Number(part.value);
    else if (part.type === "minute") minute = Number(part.value);
  }
  // Some Node versions format 24:00 for midnight; normalize.
  if (hour === 24) hour = 0;
  return hour * 60 + minute;
}
