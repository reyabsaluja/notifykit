import {
  createNotifyKit,
  memoryAdapter,
  fakeEmailProvider,
  fakeSmsProvider,
  fakeWebhookProvider,
  type CreateNotifyKitInput,
  type NotifyKit,
  type NotificationDefinition,
  type PayloadSchema,
  type MemoryAdapter,
  type FakeEmailProvider,
  type FakeSmsProvider,
  type FakeWebhookProvider,
  type SendResult,
  type InboxItem,
  type DeliveryRecord,
  type CapturedSend,
} from "@notifykitjs/core";

export type TestNotifyKitOptions<
  T extends readonly NotificationDefinition<string, PayloadSchema>[],
> = Partial<Omit<CreateNotifyKitInput<T>, "notifications" | "database" | "providers">> & {
  providers?: {
    email?: FakeEmailProvider;
    webhook?: FakeWebhookProvider;
    sms?: FakeSmsProvider;
  };
};

export type TestNotifyKit<
  T extends readonly NotificationDefinition<string, PayloadSchema>[],
> = NotifyKit<T> & {
  testing: {
    database: MemoryAdapter;
    providers: {
      email: FakeEmailProvider;
      webhook: FakeWebhookProvider;
      sms: FakeSmsProvider;
    };
    reset(): void;
    lastResult: SendResult | null;
    results: SendResult[];
    sentEmails(): FakeEmailProvider["sent"];
    sentSms(): FakeSmsProvider["sent"];
    sentWebhooks(): FakeWebhookProvider["sent"];
    inboxFor(recipientId: string): Promise<InboxItem[]>;
    deliveriesFor(recipientId: string): Promise<DeliveryRecord[]>;
  };
};

export function createTestNotifyKit<
  const T extends readonly NotificationDefinition<string, PayloadSchema>[],
>(
  notifications: T,
  options?: TestNotifyKitOptions<T>,
): TestNotifyKit<T> {
  const database = memoryAdapter();
  const email = options?.providers?.email ?? fakeEmailProvider();
  const webhook = options?.providers?.webhook ?? fakeWebhookProvider();
  const sms = options?.providers?.sms ?? fakeSmsProvider();

  const { providers: _providers, ...restOptions } = options ?? {};
  const config: CreateNotifyKitInput<T> = {
    notifications,
    database,
    providers: { email, webhook, sms },
    retry: { maxAttempts: 1, delayMs: () => 0 },
    ...restOptions,
  };

  const notify = createNotifyKit(config);

  const results: SendResult[] = [];
  let lastResult: SendResult | null = null;

  const testing = {
    database,
    providers: { email, webhook, sms },
    reset() {
      email.clear();
      webhook.clear();
      sms.clear();
      results.length = 0;
      lastResult = null;
      database._state.notifications.length = 0;
      database._state.inboxItems.length = 0;
      database._state.deliveries.length = 0;
      database._state.digests.length = 0;
      database._state.rateLimits.length = 0;
      database._state.scheduledSends.length = 0;
      database._state.dedupeRecords.length = 0;
      database._state.timelineEvents.length = 0;
    },
    get lastResult() {
      return lastResult;
    },
    get results() {
      return results;
    },
    sentEmails() {
      return email.sent;
    },
    sentSms() {
      return sms.sent;
    },
    sentWebhooks() {
      return webhook.sent;
    },
    async inboxFor(recipientId: string) {
      return notify.inbox.list(recipientId);
    },
    async deliveriesFor(recipientId: string) {
      return notify.deliveries.list(recipientId);
    },
  };

  return new Proxy(notify, {
    get(target, prop, receiver) {
      if (prop === "testing") return testing;
      if (prop === "send") {
        return async (input: any) => {
          const result: unknown = await target.send(input);
          if (!input.dryRun && result && typeof result === "object" && "deliveries" in result) {
            results.push(result as SendResult);
            lastResult = result as SendResult;
          }
          return result;
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as TestNotifyKit<T>;
}

export type AssertSentEmailMatch = {
  to?: string;
  subject?: string | RegExp;
  body?: string | RegExp;
};

export type AssertInboxItemMatch = {
  recipientId?: string;
  notificationId?: string;
  title?: string | RegExp;
  body?: string | RegExp;
};

export type AssertDeliveryMatch = {
  channel?: string;
  status?: string;
  recipientId?: string;
  notificationId?: string;
};

function matchString(actual: string | undefined, expected: string | RegExp | undefined): boolean {
  if (expected === undefined) return true;
  if (actual === undefined) return false;
  if (typeof expected === "string") return actual.includes(expected);
  return expected.test(actual);
}

export function assertSentEmail(
  notify: TestNotifyKit<any>,
  match?: AssertSentEmailMatch,
): void {
  const emails = notify.testing.sentEmails();
  if (emails.length === 0) {
    throw new Error("Expected at least one email to have been sent, but none were.");
  }
  if (!match) return;

  const found = emails.some(
    (e) =>
      (!match.to || e.to === match.to) &&
      matchString(e.subject, match.subject) &&
      matchString(e.body, match.body),
  );
  if (!found) {
    throw new Error(
      `No sent email matches ${JSON.stringify(match)}. Sent ${emails.length} email(s): ${emails.map((e) => `${e.to} "${e.subject}"`).join(", ")}`,
    );
  }
}

export function assertNoEmailSent(notify: TestNotifyKit<any>): void {
  const emails = notify.testing.sentEmails();
  if (emails.length > 0) {
    throw new Error(
      `Expected no emails to be sent, but ${emails.length} were: ${emails.map((e) => `${e.to} "${e.subject}"`).join(", ")}`,
    );
  }
}

export function assertInboxItem(
  notify: TestNotifyKit<any>,
  match?: AssertInboxItemMatch,
): void {
  const items = notify.testing.database._state.inboxItems;
  if (items.length === 0) {
    throw new Error("Expected at least one inbox item, but none exist.");
  }
  if (!match) return;

  const found = items.some(
    (i) =>
      (!match.recipientId || i.recipientId === match.recipientId) &&
      (!match.notificationId || i.notificationId === match.notificationId) &&
      matchString(i.title, match.title) &&
      matchString(i.body ?? undefined, match.body),
  );
  if (!found) {
    throw new Error(
      `No inbox item matches ${JSON.stringify(match)}. Found ${items.length} item(s): ${items.map((i) => `[${i.recipientId}] "${i.title}"`).join(", ")}`,
    );
  }
}

export function assertNoInboxItems(notify: TestNotifyKit<any>): void {
  const items = notify.testing.database._state.inboxItems;
  if (items.length > 0) {
    throw new Error(
      `Expected no inbox items, but ${items.length} exist: ${items.map((i) => `[${i.recipientId}] "${i.title}"`).join(", ")}`,
    );
  }
}

export function assertDelivery(
  notify: TestNotifyKit<any>,
  match?: AssertDeliveryMatch,
): void {
  const deliveries = notify.testing.database._state.deliveries;
  if (deliveries.length === 0) {
    throw new Error("Expected at least one delivery record, but none exist.");
  }
  if (!match) return;

  const found = deliveries.some(
    (d) =>
      (!match.channel || d.channel === match.channel) &&
      (!match.status || d.status === match.status) &&
      (!match.recipientId || d.recipientId === match.recipientId) &&
      (!match.notificationId || d.notificationId === match.notificationId),
  );
  if (!found) {
    throw new Error(
      `No delivery matches ${JSON.stringify(match)}. Found ${deliveries.length} delivery(ies): ${deliveries.map((d) => `${d.channel}/${d.status}`).join(", ")}`,
    );
  }
}

export function assertNotificationSent(
  notify: TestNotifyKit<any>,
  notificationId: string,
): void {
  const records = notify.testing.database._state.notifications;
  const found = records.some((r) => r.notificationId === notificationId);
  if (!found) {
    throw new Error(
      `Expected notification "${notificationId}" to have been sent. Sent: ${records.map((r) => r.notificationId).join(", ") || "(none)"}`,
    );
  }
}

export function assertNotificationNotSent(
  notify: TestNotifyKit<any>,
  notificationId: string,
): void {
  const records = notify.testing.database._state.notifications;
  const found = records.some((r) => r.notificationId === notificationId);
  if (found) {
    throw new Error(
      `Expected notification "${notificationId}" NOT to have been sent, but it was.`,
    );
  }
}

export {
  memoryAdapter,
  fakeEmailProvider,
  fakeSmsProvider,
  fakeWebhookProvider,
} from "@notifykitjs/core";

export type {
  CapturedSend,
  FakeEmailProvider,
  FakeSmsProvider,
  FakeWebhookProvider,
  MemoryAdapter,
  NotifyKit,
  SendResult,
} from "@notifykitjs/core";
