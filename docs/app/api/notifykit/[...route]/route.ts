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
  if (contentLength > 2_048) {
    return Response.json({ error: "Payload too large" }, { status: 413 });
  }

  let body: { notificationId?: unknown; actorName?: unknown; postTitle?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const recipientId = await getOrCreateVisitorId();
  if (body.notificationId === "welcome") {
    const result = await notify.send({
      recipientId,
      notificationId: "welcome",
      payload: { name: "friend" },
    });
    return Response.json({ data: result });
  }
  if (body.notificationId === "comment_mentioned") {
    if (typeof body.actorName !== "string" || typeof body.postTitle !== "string") {
      return Response.json({ error: "Actor name and post title are required" }, { status: 400 });
    }
    const actorName = body.actorName.trim().slice(0, 80);
    const postTitle = body.postTitle.trim().slice(0, 120);
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
