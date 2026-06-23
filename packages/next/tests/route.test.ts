import { describe, expect, test } from "bun:test";
import {
  channel,
  createNotifyKit,
  fakeEmailProvider,
  memoryAdapter,
  notification,
} from "@notifykitjs/core";
import { createRouteHandler } from "../src/route.js";

function buildKit() {
  const inbox = channel.inbox();
  const email = channel.email();

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
        body: "Open {{postUrl}} to reply.",
      }),
    ],
  });

  const db = memoryAdapter();
  const provider = fakeEmailProvider();

  const notifykit = createNotifyKit({
    notifications: [commentMentioned] as const,
    database: db,
    providers: { email: provider },
  });

  return { notifykit, db };
}

describe("createRouteHandler", () => {
  test("returns GET, POST, DELETE, OPTIONS handlers", () => {
    const { notifykit } = buildKit();
    const handlers = createRouteHandler({
      notifykit,
      identify: () => "user-1",
    });

    expect(typeof handlers.GET).toBe("function");
    expect(typeof handlers.POST).toBe("function");
    expect(typeof handlers.DELETE).toBe("function");
    expect(typeof handlers.OPTIONS).toBe("function");
  });

  test("GET /notifications returns notification metadata", async () => {
    const { notifykit } = buildKit();
    const handlers = createRouteHandler({
      notifykit,
      identify: () => "user-1",
      basePath: "/api/notifykit",
    });

    const request = new Request("http://localhost/api/notifykit/notifications");
    const response = await handlers.GET(request);
    expect(response.status).toBe(200);

    const body = (await response.json()) as { data: unknown[] };
    expect(body.data).toHaveLength(1);
    expect((body.data[0] as { id: string }).id).toBe("comment_mentioned");
  });

  test("GET /inbox returns 401 without identity", async () => {
    const { notifykit } = buildKit();
    const handlers = createRouteHandler({
      notifykit,
      identify: () => null,
    });

    const request = new Request("http://localhost/api/notifykit/inbox");
    const response = await handlers.GET(request);
    expect(response.status).toBe(401);
  });

  test("GET /inbox returns inbox items for identified user", async () => {
    const { notifykit, db } = buildKit();
    await notifykit.upsertRecipient({ id: "user-1", email: "u@x.com" });
    await notifykit.send({
      recipientId: "user-1",
      notificationId: "comment_mentioned",
      payload: {
        actorName: "Alice",
        postTitle: "My Post",
        postUrl: "/posts/1",
      },
    });

    const handlers = createRouteHandler({
      notifykit,
      identify: () => "user-1",
    });

    const request = new Request("http://localhost/api/notifykit/inbox");
    const response = await handlers.GET(request);
    expect(response.status).toBe(200);

    const body = (await response.json()) as { data: unknown[] };
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  test("GET /preferences returns preferences for identified user", async () => {
    const { notifykit } = buildKit();
    await notifykit.upsertRecipient({ id: "user-1", email: "u@x.com" });

    const handlers = createRouteHandler({
      notifykit,
      identify: () => "user-1",
    });

    const request = new Request("http://localhost/api/notifykit/preferences");
    const response = await handlers.GET(request);
    expect(response.status).toBe(200);

    const body = (await response.json()) as { data: unknown[] };
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("custom basePath works", async () => {
    const { notifykit } = buildKit();
    const handlers = createRouteHandler({
      notifykit,
      identify: () => "user-1",
      basePath: "/custom/api",
    });

    const hit = new Request("http://localhost/custom/api/notifications");
    const hitRes = await handlers.GET(hit);
    expect(hitRes.status).toBe(200);

    const miss = new Request("http://localhost/api/notifykit/notifications");
    const missRes = await handlers.GET(miss);
    expect(missRes.status).toBe(404);
  });

  test("root basePath works", async () => {
    const { notifykit } = buildKit();
    const handlers = createRouteHandler({
      notifykit,
      identify: () => "user-1",
      basePath: "/",
    });

    const response = await handlers.GET(new Request("http://localhost/notifications"));
    expect(response.status).toBe(200);
  });

  test("all methods route to the same handler", async () => {
    const { notifykit } = buildKit();
    const handlers = createRouteHandler({
      notifykit,
      identify: () => "user-1",
    });

    const getReq = new Request("http://localhost/api/notifykit/notifications");
    const postReq = new Request("http://localhost/api/notifykit/notifications", {
      method: "POST",
    });

    const getRes = await handlers.GET(getReq);
    const postRes = await handlers.POST(postReq);

    expect(getRes.status).toBe(200);
    expect(postRes.status).toBe(404);
  });
});
