/**
 * NotifyKit — Comprehensive Product Test
 *
 * This exercises EVERY major feature as a real developer would use them.
 * Run with: bun run start (from examples/full-test)
 *
 * Each section is independent. If something crashes, you know exactly
 * which feature is broken.
 */

import {
  channel,
  createNotifyKit,
  createHandler,
  fakeEmailProvider,
  memoryAdapter,
  notification,
  type SendResult,
} from "@notifykitjs/core";
import {
  createTestNotifyKit,
  assertSentEmail,
  assertInboxItem,
} from "@notifykitjs/testing";
import { nodemailerProvider } from "@notifykitjs/nodemailer";

// ─── Helpers ─────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
let currentSection = "";

function section(name: string) {
  currentSection = name;
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${name}`);
  console.log(`${"═".repeat(60)}`);
}

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ FAIL: ${label}`);
  }
}

function assertThrows(fn: () => any, match: RegExp, label: string) {
  try {
    fn();
    failed++;
    console.log(`  ✗ FAIL (no throw): ${label}`);
  } catch (e: any) {
    if (match.test(e.message)) {
      passed++;
      console.log(`  ✓ ${label}`);
    } else {
      failed++;
      console.log(`  ✗ FAIL (wrong error: "${e.message}"): ${label}`);
    }
  }
}

async function assertRejects(fn: () => Promise<any>, match: RegExp, label: string) {
  try {
    await fn();
    failed++;
    console.log(`  ✗ FAIL (no rejection): ${label}`);
  } catch (e: any) {
    if (match.test(e.message)) {
      passed++;
      console.log(`  ✓ ${label}`);
    } else {
      failed++;
      console.log(`  ✗ FAIL (wrong error: "${e.message}"): ${label}`);
    }
  }
}

// ─── Notification Definitions ────────────────────────────────────────
const inbox = channel.inbox();
const email = channel.email();
const webhook = channel.webhook();

const commentMentioned = notification({
  id: "comment_mentioned",
  payload: {
    actorName: "string",
    postTitle: "string",
    postUrl: "string",
  },
  channels: [
    inbox({
      title: "{{actorName}} mentioned you",
      body: "In {{postTitle}}",
      actionUrl: "{{postUrl}}",
    }),
    email({
      subject: "{{actorName}} mentioned you in {{postTitle}}",
      body: "Hey! {{actorName}} mentioned you in {{postTitle}}. Check it out at {{postUrl}}.",
    }),
  ],
});

const taskAssigned = notification({
  id: "task_assigned",
  payload: {
    assignerName: "string",
    taskTitle: "string",
    taskUrl: "string",
  },
  channels: [
    inbox({
      title: "{{assignerName}} assigned you a task",
      body: "{{taskTitle}}",
      actionUrl: "{{taskUrl}}",
    }),
    email({
      subject: "New task: {{taskTitle}}",
      body: '{{assignerName}} assigned you "{{taskTitle}}". Open {{taskUrl}}.',
    }),
  ],
  category: "tasks",
});

const digestNotification = notification({
  id: "activity_update",
  payload: {
    actorName: "string",
    action: "string",
  },
  channels: [
    inbox({
      title: "{{actorName}} {{action}}",
      body: "New activity",
    }),
    email({
      subject: "{{actorName}} {{action}}",
      body: "{{actorName}} {{action}} on your project.",
    }),
  ],
  digest: {
    windowMs: 1_000, // 1 second for testing
    render: ({ payloads, count }) => {
      if (count === 1) return payloads[0]!;
      return {
        actorName: `${count} people`,
        action: "were active on your project",
      };
    },
  },
});

const rateLimitedNotification = notification({
  id: "new_follower",
  payload: {
    followerName: "string",
  },
  channels: [
    inbox({
      title: "{{followerName}} followed you",
    }),
    email({
      subject: "{{followerName}} followed you",
      body: "{{followerName}} is now following you!",
    }),
  ],
  rateLimit: {
    max: 2,
    windowMs: 60_000,
    scope: "recipient",
  },
});

const notificationWithFallback = notification({
  id: "payment_received",
  payload: {
    amount: "string",
    from: "string",
  },
  channels: [
    email({
      subject: "Payment received: {{amount}}",
      body: "{{from}} sent you {{amount}}.",
    }),
  ],
  fallback: inbox({
    title: "Payment received: {{amount}}",
    body: "From {{from}}",
  }),
});

const orderShipped = notification({
  id: "order_shipped",
  payload: {
    orderId: "string",
    carrier: "string",
  },
  channels: [
    inbox({
      title: "Order {{orderId}} shipped",
      body: "Via {{carrier}}",
    }),
    email({
      subject: "Your order {{orderId}} has shipped",
      body: "Shipped via {{carrier}}.",
    }),
  ],
});

// ─── Main Test Runner ────────────────────────────────────────────────
async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  NotifyKit — Comprehensive Product Test                  ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  // ═══════════════════════════════════════════════════════════════════
  // TEST 1: Basic send + inbox + email delivery
  // ═══════════════════════════════════════════════════════════════════
  section("1. Basic notification send");

  const provider = fakeEmailProvider();
  const notify = createNotifyKit({
    notifications: [
      commentMentioned,
      taskAssigned,
      digestNotification,
      rateLimitedNotification,
      notificationWithFallback,
      orderShipped,
    ] as const,
    database: memoryAdapter(),
    providers: { email: provider },
  });

  await notify.upsertRecipient({
    id: "user_1",
    email: "jane@example.com",
    name: "Jane",
  });

  const result = await notify.send({
    recipientId: "user_1",
    notificationId: "comment_mentioned",
    payload: {
      actorName: "Rey",
      postTitle: "Launch Plan",
      postUrl: "/posts/123",
    },
  });

  assert(result.deliveries.length > 0, "Deliveries created");
  assert(result.inboxItems.length === 1, "Inbox item created");
  assert(result.deliveries.some(d => d.channel === "email" && d.status === "sent"), "Email delivered");
  assert(provider.sent.length === 1, "Fake provider received email");
  assert(provider.sent[0]?.to === "jane@example.com", "Email sent to correct address");
  assert(provider.sent[0]?.subject === "Rey mentioned you in Launch Plan", "Email subject interpolated correctly");

  // ═══════════════════════════════════════════════════════════════════
  // TEST 2: Inbox operations
  // ═══════════════════════════════════════════════════════════════════
  section("2. Inbox operations");

  const items = await notify.inbox.list("user_1");
  assert(items.length === 1, "Inbox list returns 1 item");
  assert(items[0]!.title === "Rey mentioned you", "Inbox title interpolated");
  assert(items[0]!.body === "In Launch Plan", "Inbox body interpolated");
  assert(items[0]!.readAt === null, "Item starts unread");

  await notify.inbox.markReadForRecipient(items[0]!.id, "user_1");
  const afterRead = await notify.inbox.list("user_1");
  assert(afterRead[0]!.readAt !== null, "Mark read works");

  const unreadCount = await notify.inbox.unreadCount("user_1");
  assert(unreadCount === 0, "Inbox unread count is 0 after mark read");

  // ═══════════════════════════════════════════════════════════════════
  // TEST 3: Preferences — opt out of channels
  // ═══════════════════════════════════════════════════════════════════
  section("3. Preferences");

  await notify.preferences.update({
    recipientId: "user_1",
    notificationId: "comment_mentioned",
    channels: { email: false },
  });

  const prefs = await notify.preferences.get({
    recipientId: "user_1",
    notificationId: "comment_mentioned",
  });
  assert(prefs !== null && prefs.channels.email === false, "Preference saved correctly");

  provider.sent.length = 0; // reset
  const r2 = await notify.send({
    recipientId: "user_1",
    notificationId: "comment_mentioned",
    payload: { actorName: "Ada", postTitle: "Q2", postUrl: "/posts/2" },
  });
  assert(provider.sent.length === 0, "Email skipped when preference is off");
  assert(r2.skipped.some(s => s.channel === "email" && s.reason === "preferences_disabled"), "Skip reason is 'preferences_disabled'");
  assert(r2.inboxItems.length === 1, "Inbox still delivered when only email is off");

  // ═══════════════════════════════════════════════════════════════════
  // TEST 4: Preference explain (why is a channel on/off?)
  // ═══════════════════════════════════════════════════════════════════
  section("4. Preference explain");

  const explanation = await notify.preferences.explain({
    recipientId: "user_1",
    notificationId: "comment_mentioned",
  });
  const emailRes = explanation.channels.find((c: any) => c.channel === "email");
  const inboxExplain = explanation.channels.find((c: any) => c.channel === "inbox");
  assert(emailRes?.allowed === false, "Explain shows email disabled");
  assert(emailRes?.trail.length! > 0, "Explain shows resolution layers");
  assert(inboxExplain?.allowed === true, "Explain shows inbox enabled");
  console.log(`    Resolution trail for email: ${emailRes?.trail.map((l: any) => l.layer).join(" → ")}`);

  // ═══════════════════════════════════════════════════════════════════
  // TEST 5: Digests (batching)
  // ═══════════════════════════════════════════════════════════════════
  section("5. Digests (batching)");

  await notify.upsertRecipient({ id: "user_2", email: "bob@example.com", name: "Bob" });
  provider.sent.length = 0;

  const d1 = await notify.send({
    recipientId: "user_2",
    notificationId: "activity_update",
    payload: { actorName: "Alice", action: "commented" },
  });
  const d2 = await notify.send({
    recipientId: "user_2",
    notificationId: "activity_update",
    payload: { actorName: "Charlie", action: "liked" },
  });
  const d3 = await notify.send({
    recipientId: "user_2",
    notificationId: "activity_update",
    payload: { actorName: "Diana", action: "shared" },
  });

  assert(d1.digested === true, "First send is digested");
  assert(d2.digested === true, "Second send is digested");
  assert(d3.digested === true, "Third send is digested");
  assert(provider.sent.length === 0, "No email sent yet (buffered in digest)");

  // Wait for digest window to expire
  console.log("    Waiting 1.5s for digest window...");
  await new Promise(r => setTimeout(r, 1_500));
  await notify.flushDigests();

  assert(provider.sent.length === 1, "Single batched email sent after digest flush");
  assert(provider.sent[0]?.subject === "3 people were active on your project", "Digest render() coalesced payloads");

  // ═══════════════════════════════════════════════════════════════════
  // TEST 6: Rate limiting
  // ═══════════════════════════════════════════════════════════════════
  section("6. Rate limiting");

  await notify.upsertRecipient({ id: "user_3", email: "carol@example.com", name: "Carol" });
  provider.sent.length = 0;

  const rateLimitResults: SendResult[] = [];
  for (let i = 1; i <= 5; i++) {
    const r = await notify.send({
      recipientId: "user_3",
      notificationId: "new_follower",
      payload: { followerName: `Follower${i}` },
    });
    rateLimitResults.push(r);
  }

  const delivered = rateLimitResults.filter(r => !r.rateLimited);
  const limited = rateLimitResults.filter(r => r.rateLimited);
  assert(delivered.length === 2, `2 notifications delivered (got ${delivered.length})`);
  assert(limited.length === 3, `3 notifications rate-limited (got ${limited.length})`);
  assert(provider.sent.length === 2, "Only 2 emails sent (rate limit: 2/minute)");

  // ═══════════════════════════════════════════════════════════════════
  // TEST 7: Fallback (email fails → inbox)
  // ═══════════════════════════════════════════════════════════════════
  section("7. Fallback channel");

  // Use a fresh instance with a provider that always fails
  const failProvider = fakeEmailProvider();
  failProvider.setFailOnNext(true);
  const fallbackNotify = createNotifyKit({
    notifications: [notificationWithFallback] as const,
    database: memoryAdapter(),
    providers: { email: failProvider },
    retry: { maxAttempts: 1, delayMs: () => 0 },
  });
  await fallbackNotify.upsertRecipient({ id: "fb_user", email: "fb@x.com" });

  const fallbackResult = await fallbackNotify.send({
    recipientId: "fb_user",
    notificationId: "payment_received",
    payload: { amount: "$50.00", from: "Acme Corp" },
  });

  assert(fallbackResult.deliveries.some(d => d.channel === "email" && d.status === "failed"), "Email delivery failed");
  const fallbackInbox = await fallbackNotify.inbox.list("fb_user");
  const fallbackItem = fallbackInbox.find(i => i.title === "Payment received: $50.00");
  assert(fallbackItem !== undefined, "Fallback inbox item created after email failure");

  // ═══════════════════════════════════════════════════════════════════
  // TEST 8: Deduplication
  // ═══════════════════════════════════════════════════════════════════
  section("8. Deduplication");

  provider.sent.length = 0;

  const dedup1 = await notify.send({
    recipientId: "user_1",
    notificationId: "order_shipped",
    payload: { orderId: "ORD-001", carrier: "FedEx" },
    dedupeKey: "order_shipped:ORD-001",
    dedupeWindowMs: 60_000,
  });
  const dedup2 = await notify.send({
    recipientId: "user_1",
    notificationId: "order_shipped",
    payload: { orderId: "ORD-001", carrier: "FedEx" },
    dedupeKey: "order_shipped:ORD-001",
    dedupeWindowMs: 60_000,
  });

  assert(dedup1.skipped.length === 0, "First send is not deduplicated");
  assert(dedup2.skipped.some((s: any) => s.reason === "duplicate"), "Second send IS deduplicated");
  assert(provider.sent.length === 1, "Only 1 email sent (second was deduped)");

  // ═══════════════════════════════════════════════════════════════════
  // TEST 9: Idempotency keys
  // ═══════════════════════════════════════════════════════════════════
  section("9. Idempotency keys");

  provider.sent.length = 0;

  const idem1 = await notify.send({
    recipientId: "user_1",
    notificationId: "comment_mentioned",
    payload: { actorName: "Eve", postTitle: "RFC", postUrl: "/rfc/1" },
    idempotencyKey: "send-abc-123",
  });
  const idem2 = await notify.send({
    recipientId: "user_1",
    notificationId: "comment_mentioned",
    payload: { actorName: "Eve", postTitle: "RFC", postUrl: "/rfc/1" },
    idempotencyKey: "send-abc-123",
  });

  assert(idem1.idempotent === false, "First send is fresh");
  assert(idem2.idempotent === true, "Second send is idempotent replay");

  // ═══════════════════════════════════════════════════════════════════
  // TEST 10: Multi-tenancy isolation
  // ═══════════════════════════════════════════════════════════════════
  section("10. Multi-tenancy");

  // Two users in different tenants
  await notify.upsertRecipient({ id: "alice_acme", email: "alice@acme.com", name: "Alice", tenantId: "acme" });
  await notify.upsertRecipient({ id: "bob_bigco", email: "bob@bigco.com", name: "Bob", tenantId: "bigco" });

  await notify.send({
    recipientId: "alice_acme",
    notificationId: "task_assigned",
    tenantId: "acme",
    payload: { assignerName: "Boss", taskTitle: "Ship it", taskUrl: "/tasks/1" },
  });
  await notify.send({
    recipientId: "bob_bigco",
    notificationId: "task_assigned",
    tenantId: "bigco",
    payload: { assignerName: "Mgr", taskTitle: "Review", taskUrl: "/tasks/2" },
  });

  const acmeInbox = await notify.inbox.list("alice_acme", { tenantId: "acme" });
  const bigcoInbox = await notify.inbox.list("bob_bigco", { tenantId: "bigco" });
  assert(acmeInbox.length === 1, "Acme tenant sees only their notification");
  assert(bigcoInbox.length === 1, "BigCo tenant sees only their notification");
  assert(acmeInbox[0]!.title === "Boss assigned you a task", "Correct item in acme scope");
  assert(bigcoInbox[0]!.title === "Mgr assigned you a task", "Correct item in bigco scope");

  // Cross-tenant isolation: acme user can't see bigco items
  const crossTenantInbox = await notify.inbox.list("alice_acme", { tenantId: "bigco" });
  assert(crossTenantInbox.length === 0, "Cross-tenant isolation enforced");

  // ═══════════════════════════════════════════════════════════════════
  // TEST 11: Hooks (event system)
  // ═══════════════════════════════════════════════════════════════════
  section("11. Hooks / event system");

  const hookEvents: string[] = [];
  const hookNotify = createNotifyKit({
    notifications: [commentMentioned] as const,
    database: memoryAdapter(),
    providers: { email: fakeEmailProvider() },
    on: {
      "notification.created": () => { hookEvents.push("notification.created"); },
      "inbox.created": () => { hookEvents.push("inbox.created"); },
      "delivery.sent": () => { hookEvents.push("delivery.sent"); },
    },
  });
  await hookNotify.upsertRecipient({ id: "h1", email: "h@x.com" });
  await hookNotify.send({
    recipientId: "h1",
    notificationId: "comment_mentioned",
    payload: { actorName: "A", postTitle: "B", postUrl: "/c" },
  });

  assert(hookEvents.includes("notification.created"), "notification.created hook fires");
  assert(hookEvents.includes("inbox.created"), "inbox.created hook fires");
  assert(hookEvents.includes("delivery.sent"), "delivery.sent hook fires");

  // ═══════════════════════════════════════════════════════════════════
  // TEST 12: HTTP Handler (REST API)
  // ═══════════════════════════════════════════════════════════════════
  section("12. HTTP handler");

  const handlerNotify = createNotifyKit({
    notifications: [commentMentioned] as const,
    database: memoryAdapter(),
    providers: { email: fakeEmailProvider() },
  });
  await handlerNotify.upsertRecipient({ id: "api_user", email: "api@x.com" });
  await handlerNotify.send({
    recipientId: "api_user",
    notificationId: "comment_mentioned",
    payload: { actorName: "X", postTitle: "Y", postUrl: "/z" },
  });

  const handler = createHandler(handlerNotify, {
    identify: (req) => req.headers.get("x-user-id"),
  });

  // GET /api/notifykit/inbox
  const inboxReq = new Request("http://localhost/api/notifykit/inbox", {
    headers: { "x-user-id": "api_user" },
  });
  const inboxRes = await handler(inboxReq);
  assert(inboxRes.status === 200, "GET /inbox returns 200");
  const inboxBody: any = await inboxRes.json();
  assert(inboxBody.data && inboxBody.data.length === 1, "GET /inbox returns items");

  // GET /api/notifykit/inbox/unread-count
  const countReq = new Request("http://localhost/api/notifykit/inbox/unread-count", {
    headers: { "x-user-id": "api_user" },
  });
  const countRes = await handler(countReq);
  assert(countRes.status === 200, "GET /inbox/unread-count returns 200");
  const countBody: any = await countRes.json();
  assert(countBody.data && countBody.data.count === 1, "Unread count is correct");

  // 401 without auth
  const noAuthReq = new Request("http://localhost/api/notifykit/inbox");
  const noAuthRes = await handler(noAuthReq);
  assert(noAuthRes.status === 401, "Returns 401 without user ID");

  // ═══════════════════════════════════════════════════════════════════
  // TEST 13: Testing utilities (@notifykitjs/testing)
  // ═══════════════════════════════════════════════════════════════════
  section("13. Testing utilities");

  const testKit = createTestNotifyKit([commentMentioned] as const);
  await testKit.upsertRecipient({ id: "test_u", email: "test@x.com" });
  await testKit.send({
    recipientId: "test_u",
    notificationId: "comment_mentioned",
    payload: { actorName: "Tester", postTitle: "PR #42", postUrl: "/pr/42" },
  });

  let assertionWorked = false;
  try {
    assertSentEmail(testKit, { to: "test@x.com", subject: /mentioned you/ });
    assertInboxItem(testKit, { recipientId: "test_u", title: /Tester/ });
    assertionWorked = true;
  } catch (e) {
    assertionWorked = false;
  }
  assert(assertionWorked, "assertSentEmail + assertInboxItem pass");

  let negativeAssertionWorked = false;
  try {
    assertSentEmail(testKit, { to: "wrong@x.com" });
    negativeAssertionWorked = false;
  } catch {
    negativeAssertionWorked = true;
  }
  assert(negativeAssertionWorked, "assertSentEmail throws when no match (correct behavior)");

  // ═══════════════════════════════════════════════════════════════════
  // TEST 14: Nodemailer provider (construction only — no real SMTP)
  // ═══════════════════════════════════════════════════════════════════
  section("14. Nodemailer provider");

  const nmProvider = nodemailerProvider({
    from: "Acme <no-reply@acme.com>",
    host: "smtp.sendgrid.net",
    port: 587,
    auth: { user: "apikey", pass: "SG.fake" },
  });
  assert(nmProvider.id === "nodemailer", "Provider creates successfully");
  assert(typeof nmProvider.send === "function", "Provider has send method");

  // URL-based config
  const nmUrl = nodemailerProvider({
    from: "a@b.c",
    url: "smtp://user:pass@smtp.example.com:587",
  });
  assert(nmUrl.id === "nodemailer", "URL-based config works");

  // Validation
  assertThrows(
    () => nodemailerProvider({ from: "", host: "x" } as any),
    /from/,
    "Throws on empty 'from'",
  );
  assertThrows(
    () => nodemailerProvider({ from: "a@b.c" } as any),
    /provide one of/,
    "Throws when no transport config given",
  );

  // ═══════════════════════════════════════════════════════════════════
  // TEST 15: Dry run / explain mode
  // ═══════════════════════════════════════════════════════════════════
  section("15. Dry run (explain what would happen)");

  const dryProvider = fakeEmailProvider();
  const dryNotify = createNotifyKit({
    notifications: [commentMentioned] as const,
    database: memoryAdapter(),
    providers: { email: dryProvider },
  });
  await dryNotify.upsertRecipient({ id: "dry_u", email: "dry@x.com" });

  const dryResult = await dryNotify.send({
    recipientId: "dry_u",
    notificationId: "comment_mentioned",
    payload: { actorName: "Ghost", postTitle: "Test", postUrl: "/x" },
    dryRun: true,
  });

  assert(dryProvider.sent.length === 0, "No actual email sent in dry run");
  assert(dryResult.channels.length > 0, "Dry run shows channel resolutions");
  assert(dryResult.channels.some((c: any) => c.channel === "email" || c.type === "email"), "Dry run includes email channel");
  assert(dryResult.recipientId === "dry_u", "Dry run returns recipient context");

  // ═══════════════════════════════════════════════════════════════════
  // TEST 16: Quiet hours
  // ═══════════════════════════════════════════════════════════════════
  section("16. Quiet hours");

  const quietProvider = fakeEmailProvider();
  const quietNotify = createNotifyKit({
    notifications: [commentMentioned] as const,
    database: memoryAdapter(),
    providers: { email: quietProvider },
  });
  // Set quiet hours on the recipient (always quiet for testing)
  await quietNotify.upsertRecipient({
    id: "quiet_u",
    email: "q@x.com",
    quietHours: { start: "00:00", end: "23:59", timezone: "UTC" },
  });

  const quietResult = await quietNotify.send({
    recipientId: "quiet_u",
    notificationId: "comment_mentioned",
    payload: { actorName: "Night", postTitle: "Late", postUrl: "/late" },
  });

  assert(quietResult.inboxItems.length === 1, "Inbox still delivered during quiet hours");
  assert(quietProvider.sent.length === 0, "Email deferred during quiet hours");
  assert(quietResult.deferredChannels.includes("email"), "Email appears in deferredChannels during quiet hours");

  // ═══════════════════════════════════════════════════════════════════
  // TEST 17: Type safety (compile-time checks)
  // ═══════════════════════════════════════════════════════════════════
  section("17. Type safety (runtime validation)");

  await assertRejects(
    () => notify.send({
      recipientId: "user_1",
      notificationId: "comment_mentioned",
      payload: { actorName: "X", postTitle: "Y" } as any, // missing postUrl
    }),
    /payload|postUrl|missing/i,
    "Missing payload field throws",
  );

  await assertRejects(
    () => notify.send({
      recipientId: "user_1",
      notificationId: "nonexistent_notification" as any,
      payload: {} as any,
    }),
    /notification|not found|unknown/i,
    "Unknown notification ID throws",
  );

  await assertRejects(
    () => notify.send({
      recipientId: "",
      notificationId: "comment_mentioned",
      payload: { actorName: "X", postTitle: "Y", postUrl: "/z" },
    }),
    /recipient|empty|required/i,
    "Empty recipient ID throws",
  );

  // ═══════════════════════════════════════════════════════════════════
  // TEST 18: Recipient management
  // ═══════════════════════════════════════════════════════════════════
  section("18. Recipient management");

  await notify.upsertRecipient({ id: "mgmt_user", email: "old@x.com", name: "Old" });
  await notify.upsertRecipient({ id: "mgmt_user", email: "new@x.com", name: "Updated" });

  provider.sent.length = 0;
  await notify.preferences.update({
    recipientId: "mgmt_user",
    notificationId: "comment_mentioned",
    channels: { email: true },
  });
  await notify.send({
    recipientId: "mgmt_user",
    notificationId: "comment_mentioned",
    payload: { actorName: "Z", postTitle: "T", postUrl: "/t" },
  });
  assert(provider.sent[0]?.to === "new@x.com", "Upsert updates email address");

  // ═══════════════════════════════════════════════════════════════════
  // TEST 19: Timeline / audit trail
  // ═══════════════════════════════════════════════════════════════════
  section("19. Timeline / audit trail");

  // Use a fresh send to get a notificationRecordId
  const timelineProvider = fakeEmailProvider();
  const timelineNotify = createNotifyKit({
    notifications: [commentMentioned] as const,
    database: memoryAdapter(),
    providers: { email: timelineProvider },
  });
  await timelineNotify.upsertRecipient({ id: "tl_u", email: "tl@x.com" });
  const tlResult = await timelineNotify.send({
    recipientId: "tl_u",
    notificationId: "comment_mentioned",
    payload: { actorName: "A", postTitle: "B", postUrl: "/c" },
  });
  const notifId = tlResult.notification?.id;
  assert(!!notifId, "Send returns a notification with an id");

  const timeline = await timelineNotify.timeline(notifId!);
  assert(timeline.length > 0, "Timeline has entries");
  assert(timeline.some((e: any) => e.event === "recipient.resolved"), "Timeline records recipient.resolved");
  assert(timeline.some((e: any) => e.event === "delivery.sent"), "Timeline records delivery.sent");

  // ═══════════════════════════════════════════════════════════════════
  // TEST 20: Graceful shutdown
  // ═══════════════════════════════════════════════════════════════════
  section("20. Graceful shutdown");

  await Promise.all([
    notify.close(),
    fallbackNotify.close(),
    hookNotify.close(),
    handlerNotify.close(),
    testKit.close(),
    dryNotify.close(),
    quietNotify.close(),
    timelineNotify.close(),
  ]);
  assert(true, "close() releases all schedulers and completes without error");

  // ─── Summary ───────────────────────────────────────────────────────
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`${"═".repeat(60)}`);

  if (failed > 0) {
    console.log("\n  ⚠️  Some tests failed. Fix these before launch.\n");
    process.exit(1);
  } else {
    console.log("\n  All features working. Ship it. 🚀\n");
  }
}

main().catch((err) => {
  console.error("\n  FATAL:", err);
  process.exit(1);
});
