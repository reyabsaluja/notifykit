/**
 * Returns whether `now` falls inside the recipient's quiet-hours window, in
 * the recipient's configured timezone (default UTC). Handles windows that
 * cross midnight (e.g. 22:00 → 08:00).
 */
export function isWithinQuietHours(quietHours, now = new Date()) {
    const [startMin, endMin] = parseWindowMinutes(quietHours);
    if (startMin === endMin)
        return false; // empty window
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
export function nextQuietHoursEnd(quietHours, now = new Date()) {
    if (!isWithinQuietHours(quietHours, now))
        return now;
    const [, endMin] = parseWindowMinutes(quietHours);
    const tz = quietHours.timezone ?? "UTC";
    const nowMin = minutesOfDay(now, tz);
    // Distance in minutes from "now" to the next occurrence of endMin (in tz).
    let diff = endMin - nowMin;
    if (diff <= 0)
        diff += 24 * 60;
    return new Date(now.getTime() + diff * 60_000);
}
function parseWindowMinutes(q) {
    return [parseHHMM(q.start), parseHHMM(q.end)];
}
function parseHHMM(s) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(s);
    if (!match) {
        throw new Error(`Invalid time "${s}": expected "HH:MM" 24h format (e.g. "22:00").`);
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
function minutesOfDay(d, timezone) {
    const fmt = new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
    const parts = fmt.formatToParts(d);
    let hour = 0;
    let minute = 0;
    for (const part of parts) {
        if (part.type === "hour")
            hour = Number(part.value);
        else if (part.type === "minute")
            minute = Number(part.value);
    }
    // Some Node versions format 24:00 for midnight; normalize.
    if (hour === 24)
        hour = 0;
    return hour * 60 + minute;
}
//# sourceMappingURL=quiet-hours.js.map