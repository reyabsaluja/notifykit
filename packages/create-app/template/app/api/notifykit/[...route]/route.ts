import { createHandler } from "@notifykitjs/core";
import { ensureDemoUser, notify } from "../../../../lib/notifykit";
import { getCurrentUserId } from "../../../../lib/session";

const handler = createHandler(notify, {
  identify: async () => {
    // Replace with your real auth lookup.
    await ensureDemoUser();
    return await getCurrentUserId();
  },
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

  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    !("actorName" in body) ||
    !("postTitle" in body) ||
    typeof body.actorName !== "string" ||
    typeof body.postTitle !== "string"
  ) {
    return Response.json(
      { error: "Actor name and post title are required" },
      { status: 400 },
    );
  }

  const actorName = body.actorName.trim().slice(0, 80);
  const postTitle = body.postTitle.trim().slice(0, 120);
  if (!actorName || !postTitle) {
    return Response.json(
      { error: "Actor name and post title are required" },
      { status: 400 },
    );
  }

  await ensureDemoUser();
  const recipientId = await getCurrentUserId();
  if (!recipientId) {
    return Response.json({ error: "Sign in first" }, { status: 401 });
  }

  await notify.send({
    recipientId,
    notificationId: "comment_mentioned",
    payload: { actorName, postTitle, postUrl: "/posts/42" },
  });
  return Response.json({ ok: true });
}

export const dynamic = "force-dynamic";
export const GET = handler;
export const POST = post;
export const DELETE = handler;
export const OPTIONS = handler;
