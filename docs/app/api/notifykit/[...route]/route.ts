import { createHandler } from "notifykit";
import { notify } from "../../../../lib/notifykit";
import { getOrCreateVisitorId } from "../../../../lib/session";

const handler = createHandler(notify, {
  identify: () => getOrCreateVisitorId(),
  unsubscribeSecret: process.env.NOTIFYKIT_SECRET,
});

export const dynamic = "force-dynamic";
export const GET = handler;
export const POST = handler;
export const DELETE = handler;
export const OPTIONS = handler;
