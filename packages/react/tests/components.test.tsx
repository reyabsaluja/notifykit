import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  channel,
  createHandler,
  createNotifyKit,
  fakeEmailProvider,
  memoryAdapter,
  notification,
} from "notifykit";
import {
  Inbox,
  NotificationBell,
  NotifyKitProvider,
  createNotifyKitClient,
} from "../src/index.js";

const inboxCh = channel.inbox();

const welcome = notification({
  id: "user_welcome",
  payload: { name: "string" },
  channels: [inboxCh({ title: "Welcome, {{name}}" })],
});

function makeClient(authed = true) {
  const notify = createNotifyKit({
    notifications: [welcome] as const,
    database: memoryAdapter(),
    providers: { email: fakeEmailProvider() },
  });
  const handler = createHandler(notify, {
    identify: () => (authed ? "user_1" : null),
  });
  const client = createNotifyKitClient({
    baseUrl: "http://test/api/notifykit",
    fetch: (input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      return handler(new Request(url, init));
    },
  });
  return { notify, client };
}

describe("React components", () => {
  test("NotificationBell renders initial state without crashing", () => {
    const { client } = makeClient();
    const html = renderToStaticMarkup(
      <NotifyKitProvider client={client}>
        <NotificationBell />
      </NotifyKitProvider>,
    );
    expect(html).toContain("unread notifications");
  });

  test("NotificationBell accepts a render prop", () => {
    const { client } = makeClient();
    const html = renderToStaticMarkup(
      <NotifyKitProvider client={client}>
        <NotificationBell
          render={({ unreadCount }) => (
            <span data-count={unreadCount}>bell</span>
          )}
        />
      </NotifyKitProvider>,
    );
    expect(html).toContain('data-count="0"');
    expect(html).toContain("bell");
  });

  test("Inbox renders loading state when no items", () => {
    const { client } = makeClient();
    const html = renderToStaticMarkup(
      <NotifyKitProvider client={client}>
        <Inbox />
      </NotifyKitProvider>,
    );
    // On first render (SSR), the hook hasn't resolved yet — idle status shows
    // the empty state since status !== "loading" && items.length === 0.
    expect(
      html.includes("Loading") || html.includes("Nothing here yet"),
    ).toBe(true);
  });

  test("Inbox renders items once loaded on the client", async () => {
    const { notify, client } = makeClient();
    await notify.upsertRecipient({ id: "user_1" });
    await notify.send({
      recipientId: "user_1",
      notificationId: "user_welcome",
      payload: { name: "Alice" },
    });
    // Preload state so first-render already has items
    await client.inbox.list();

    const html = renderToStaticMarkup(
      <NotifyKitProvider client={client}>
        <Inbox />
      </NotifyKitProvider>,
    );
    expect(html).toContain("Welcome, Alice");
    expect(html).toContain("Mark read");
  });

  test("useNotifyKitClient throws outside provider", () => {
    expect(() =>
      renderToStaticMarkup(<NotificationBell />),
    ).toThrow(/must be used inside <NotifyKitProvider>/);
  });
});
