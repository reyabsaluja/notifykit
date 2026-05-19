"use client";

import { useSession } from "@/lib/auth-client";
import Link from "next/link";

export default function DashboardPage() {
  const { data: session } = useSession();

  return (
    <div className="dashboard">
      <h2>Dashboard</h2>
      <p>Welcome back, {session?.user.name}.</p>

      <div className="card-grid">
        <div className="card">
          <h3>Notifications</h3>
          <p>Click the bell icon to view your inbox.</p>
        </div>
        <Link href="/settings" className="card">
          <h3>Settings</h3>
          <p>Manage your notification preferences.</p>
        </Link>
      </div>

      <div className="demo-section">
        <h3>Send a test notification</h3>
        <p>
          Use the API to send yourself a notification:
        </p>
        <pre>{`// In a server action or API route:
await notify.send({
  recipientId: "${session?.user.id ?? "user_id"}",
  notificationId: "comment_mentioned",
  payload: {
    actorName: "Alice",
    postTitle: "Launch Plan",
    postUrl: "/posts/1",
  },
})`}</pre>
      </div>
    </div>
  );
}
