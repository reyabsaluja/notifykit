import { cookies } from "next/headers";
import { ensureRecipient } from "./notifykit";

const COOKIE = "notifykit_docs_visitor";

function randomId(): string {
  // Readable, URL-safe, collision-resistant enough for a per-browser demo id.
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return `v_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Get (or create) a per-browser demo recipient id. We don't bother with
 * auth — the docs demo is per-visitor, not per-user.
 */
export async function getOrCreateVisitorId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(COOKIE)?.value;
  if (existing) {
    await ensureRecipient(existing);
    return existing;
  }
  const id = randomId();
  store.set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    secure: process.env.NODE_ENV === "production",
  });
  await ensureRecipient(id);
  return id;
}
