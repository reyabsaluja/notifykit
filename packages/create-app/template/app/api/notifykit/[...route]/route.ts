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

export const dynamic = "force-dynamic";
export const GET = handler;
export const POST = handler;
export const DELETE = handler;
export const OPTIONS = handler;
