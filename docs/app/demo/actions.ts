"use server";

import { revalidatePath } from "next/cache";
import { notify } from "../../lib/notifykit";
import { getOrCreateVisitorId } from "../../lib/session";

export async function sendDemoComment(formData: FormData) {
  const recipientId = await getOrCreateVisitorId();
  const actorName = String(formData.get("actorName") ?? "Rey");
  const postTitle = String(formData.get("postTitle") ?? "Launch Plan");

  await notify.send({
    recipientId,
    notificationId: "comment_mentioned",
    payload: {
      actorName,
      postTitle,
      postUrl: "/posts/42",
    },
  });

  revalidatePath("/demo");
}

export async function sendWelcome() {
  const recipientId = await getOrCreateVisitorId();
  await notify.send({
    recipientId,
    notificationId: "welcome",
    payload: { name: "friend" },
  });
  revalidatePath("/demo");
}
