import { createHandler } from "notifykit";
import { notify } from "../../../../lib/notifykit";
import { getOrCreateVisitorId } from "../../../../lib/session";

const handler = createHandler(notify, {
  identify: () => getOrCreateVisitorId(),
  unsubscribeSecret: process.env.NOTIFYKIT_SECRET,
});

export const GET = handler;
export const POST = handler;
