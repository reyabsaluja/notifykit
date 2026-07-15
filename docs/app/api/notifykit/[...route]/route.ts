import { createHandler } from "@notifykitjs/core";
import { notify } from "../../../../lib/notifykit";
import { getOrCreateVisitorId } from "../../../../lib/session";

const handler = createHandler(notify, {
  identify: () => getOrCreateVisitorId(),
  unsubscribeSecret: process.env.NOTIFYKIT_SECRET,
});

async function post(request: Request): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname !== "/api/notifykit/demo-send") {
    return handler(request);
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 2_048) {
    return Response.json({ error: "Payload too large" }, { status: 413 });
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > 2_048) {
    return Response.json({ error: "Payload too large" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const payload = body as Record<string, unknown>;

  const recipientId = await getOrCreateVisitorId();
  if (payload.notificationId === "welcome") {
    const result = await notify.send({
      recipientId,
      notificationId: "welcome",
      payload: { name: "friend" },
    });
    return Response.json({ data: result });
  }
  if (payload.notificationId === "comment_mentioned") {
    if (
      typeof payload.actorName !== "string" ||
      typeof payload.postTitle !== "string"
    ) {
      return Response.json({ error: "Actor name and post title are required" }, { status: 400 });
    }
    const actorName = payload.actorName.trim().slice(0, 80);
    const postTitle = payload.postTitle.trim().slice(0, 120);
    if (!actorName || !postTitle) {
      return Response.json({ error: "Actor name and post title are required" }, { status: 400 });
    }
    const result = await notify.send({
      recipientId,
      notificationId: "comment_mentioned",
      payload: { actorName, postTitle, postUrl: "/posts/42" },
    });
    return Response.json({ data: result });
  }
  return Response.json({ error: "Unknown demo notification" }, { status: 400 });
}

export const dynamic = "force-dynamic";
export const GET = handler;
export const POST = post;
export const DELETE = handler;
export const OPTIONS = handler;
