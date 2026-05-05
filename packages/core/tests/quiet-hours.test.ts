import { describe, expect, test } from "bun:test";
import {
  channel,
  createNotifyKit,
  fakeEmailProvider,
  memoryAdapter,
  notification,
} from "../src/index.js";
import {
  isWithinQuietHours,
  nextQuietHoursEnd,
} from "../src/quiet-hours.js";

const inbox = channel.inbox();
const email = channel.email();

const notif = notification({
  id: "alert",
  payload: { msg: "string" },
  channels: [
    inbox({ title: "{{msg}}" }),
    email({ subject: "{{msg}}", body: "{{msg}}" }),
  ],
});

function kitWithQuietSelf(quietHoursWindow: "in" | "out") {
  // Build a quiet-hours range that either contains "now" or excludes it.
  // We use UTC because memory/Intl both agree on it.
  const now = new Date();
  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const fmt = (m: number) => {
    const norm = ((m % (24 * 60)) + 24 * 60) % (24 * 60);
    const h = Math.floor(norm / 60);
    const mm = norm % 60;
    return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  };
  const qh =
    quietHoursWindow === "in"
      ? { start: fmt(nowMinutes - 60), end: fmt(nowMinutes + 60) }
      : { start: fmt(nowMinutes + 60), end: fmt(nowMinutes + 120) };

  const db = memoryAdapter();
  const provider = fakeEmailProvider();
  const notify = createNotifyKit({
    notifications: [notif] as const,
    database: db,
    providers: { email: provider },
  });
  return { notify, db, provider, qh };
}

describe("quiet-hours helpers", () => {
  test("isWithinQuietHours handles non-wrapping windows", () => {
    const d = new Date("2026-04-30T10:00:00Z");
    expect(
      isWithinQuietHours({ start: "09:00", end: "11:00" }, d),
    ).toBe(true);
    expect(
      isWithinQuietHours({ start: "11:00", end: "13:00" }, d),
    ).toBe(false);
  });

  test("isWithinQuietHours handles windows that cross midnight", () => {
    const late = new Date("2026-04-30T23:00:00Z");
    const early = new Date("2026-04-30T03:00:00Z");
    const noon = new Date("2026-04-30T12:00:00Z");
    const qh = { start: "22:00", end: "08:00" };
    expect(isWithinQuietHours(qh, late)).toBe(true);
    expect(isWithinQuietHours(qh, early)).toBe(true);
    expect(isWithinQuietHours(qh, noon)).toBe(false);
  });

  test("isWithinQuietHours respects timezone", () => {
    // 08:00 UTC is 04:00 America/New_York, which is inside "22:00 → 08:00".
    const d = new Date("2026-04-30T08:00:00Z");
    expect(
      isWithinQuietHours(
        { start: "22:00", end: "08:00", timezone: "America/New_York" },
        d,
      ),
    ).toBe(true);
    // But at 13:00 UTC (09:00 EDT) we're out of the window.
    const later = new Date("2026-04-30T13:00:00Z");
    expect(
      isWithinQuietHours(
        { start: "22:00", end: "08:00", timezone: "America/New_York" },
        later,
      ),
    ).toBe(false);
  });

  test("nextQuietHoursEnd points at the upcoming end time", () => {
    const d = new Date("2026-04-30T10:00:00Z");
    const endAt = nextQuietHoursEnd(
      { start: "09:00", end: "11:00" },
      d,
    );
    expect(endAt.getTime()).toBe(new Date("2026-04-30T11:00:00Z").getTime());
  });

  test("nextQuietHoursEnd returns now when outside the window", () => {
    const d = new Date("2026-04-30T12:00:00Z");
    const endAt = nextQuietHoursEnd(
      { start: "09:00", end: "11:00" },
      d,
    );
    expect(endAt.getTime()).toBe(d.getTime());
  });
});

describe("quiet hours in send()", () => {
  test("without quiet hours, email delivers immediately", async () => {
    const { notify, db, provider } = kitWithQuietSelf("out");
    await notify.upsertRecipient({ id: "u1", email: "u@x.com" });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "hi" },
    });

    expect(result.deferredChannels).toEqual([]);
    expect(result.inboxItems).toHaveLength(1);
    expect(result.deliveries).toHaveLength(1);
    expect(result.deliveries[0]!.status).toBe("sent");
    expect(provider.sent).toHaveLength(1);
    expect(db._state.scheduledSends).toEqual([]);
  });

  test("inside quiet hours: inbox delivers, email defers", async () => {
    const { notify, db, provider, qh } = kitWithQuietSelf("in");
    await notify.upsertRecipient({
      id: "u1",
      email: "u@x.com",
      quietHours: qh,
    });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "hi" },
    });

    expect(result.deferredChannels).toEqual(["email"]);
    expect(result.inboxItems).toHaveLength(1);
    expect(result.deliveries).toEqual([]);
    expect(provider.sent).toEqual([]);
    expect(db._state.scheduledSends).toHaveLength(1);
    expect(db._state.scheduledSends[0]!.reason).toBe("quiet_hours");
  });

  test("flushScheduledSends fires the deferred email", async () => {
    const { notify, db, provider, qh } = kitWithQuietSelf("in");
    await notify.upsertRecipient({
      id: "u1",
      email: "u@x.com",
      quietHours: qh,
    });

    await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "hi" },
    });

    expect(provider.sent).toEqual([]);

    await notify.flushScheduledSends();

    expect(provider.sent).toHaveLength(1);
    expect(db._state.scheduledSends).toEqual([]);
    // Deferred flush should NOT re-create an inbox item — that was already done.
    const inboxItems = await notify.inbox.list("u1");
    expect(inboxItems).toHaveLength(1);
  });

  test("recoverScheduledSends leaves active future quiet-hours timers alone", async () => {
    const { notify, db, provider, qh } = kitWithQuietSelf("in");
    await notify.upsertRecipient({
      id: "u1",
      email: "u@x.com",
      quietHours: qh,
    });

    await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "hi" },
    });

    await notify.recoverScheduledSends();

    expect(provider.sent).toEqual([]);
    expect(db._state.scheduledSends).toHaveLength(1);
    expect(db._state.scheduledSends[0]!.status).toBe("pending");

    await notify.close();
  });

  test("flushed deferred send respects preference changes made during quiet hours", async () => {
    const { notify, db, provider, qh } = kitWithQuietSelf("in");
    await notify.upsertRecipient({
      id: "u1",
      email: "u@x.com",
      quietHours: qh,
    });

    await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "hi" },
    });

    // User opts out of email before the flush fires.
    await notify.preferences.update({
      recipientId: "u1",
      notificationId: "alert",
      channels: { email: false },
    });

    await notify.flushScheduledSends();

    expect(provider.sent).toEqual([]);
    expect(db._state.deliveries).toEqual([]);
  });

  test("upsertRecipient({ quietHours: null }) clears the window", async () => {
    const { notify, qh } = kitWithQuietSelf("in");
    await notify.upsertRecipient({
      id: "u1",
      email: "u@x.com",
      quietHours: qh,
    });
    await notify.upsertRecipient({
      id: "u1",
      quietHours: null,
    });

    const result = await notify.send({
      recipientId: "u1",
      notificationId: "alert",
      payload: { msg: "hi" },
    });
    expect(result.deferredChannels).toEqual([]);
    expect(result.deliveries).toHaveLength(1);
  });

  test("notifications without email channels ignore quiet hours entirely", async () => {
    const onlyInbox = notification({
      id: "only_inbox",
      payload: { msg: "string" },
      channels: [inbox({ title: "{{msg}}" })],
    });
    const db = memoryAdapter();
    const notify = createNotifyKit({
      notifications: [onlyInbox] as const,
      database: db,
      providers: { email: fakeEmailProvider() },
    });
    const { qh } = kitWithQuietSelf("in");
    await notify.upsertRecipient({
      id: "u1",
      quietHours: qh,
    });
    const result = await notify.send({
      recipientId: "u1",
      notificationId: "only_inbox",
      payload: { msg: "hi" },
    });
    expect(result.deferredChannels).toEqual([]);
    expect(result.inboxItems).toHaveLength(1);
    expect(db._state.scheduledSends).toEqual([]);
  });

  test("deferred send does not double-transform a non-idempotent custom validator", async () => {
    let validateCallCount = 0;
    const transforming = notification({
      id: "transform_notif",
      payload: { count: "number" },
      channels: [
        inbox({ title: "Count: {{count}}" }),
        email({ subject: "Count: {{count}}", body: "Count: {{count}}" }),
      ],
      validate: (payload) => {
        validateCallCount++;
        const p = payload as { count: number };
        return { count: p.count + 1 };
      },
    });

    const { qh } = kitWithQuietSelf("in");
    const db = memoryAdapter();
    const provider = fakeEmailProvider();
    const notify = createNotifyKit({
      notifications: [transforming] as const,
      database: db,
      providers: { email: provider },
    });
    await notify.upsertRecipient({
      id: "u1",
      email: "u@x.com",
      quietHours: qh,
    });

    await notify.send({
      recipientId: "u1",
      notificationId: "transform_notif",
      payload: { count: 0 },
    });

    expect(validateCallCount).toBe(1);
    const inboxItems = await notify.inbox.list("u1");
    expect(inboxItems[0]!.title).toBe("Count: 1");

    await notify.flushScheduledSends();

    // The custom validator must NOT have been called again during flush.
    expect(validateCallCount).toBe(1);
    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0]!.subject).toBe("Count: 1");
  });

  test("deferred send preserves custom-validated payload shape", async () => {
    const transforming = notification({
      id: "custom_shape",
      payload: { count: "number" },
      channels: [
        inbox({ title: "Count: {{count}}" }),
        email({ subject: "Count: {{count}}", body: "Count: {{count}}" }),
      ],
      validate: (payload) => {
        const p = payload as { rawCount: unknown };
        if (typeof p.rawCount !== "string") {
          throw new Error("rawCount must be a string");
        }
        return { count: Number(p.rawCount) };
      },
    });

    const { qh } = kitWithQuietSelf("in");
    const db = memoryAdapter();
    const provider = fakeEmailProvider();
    const notify = createNotifyKit({
      notifications: [transforming] as const,
      database: db,
      providers: { email: provider },
    });
    await notify.upsertRecipient({
      id: "u1",
      email: "u@x.com",
      quietHours: qh,
    });

    await notify.send({
      recipientId: "u1",
      notificationId: "custom_shape",
      payload: { rawCount: "7" } as never,
    });

    await notify.flushScheduledSends();

    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0]!.subject).toBe("Count: 7");
    expect(db._state.scheduledSends).toEqual([]);
  });
});
