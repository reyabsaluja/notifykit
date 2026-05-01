import Link from "next/link";
import { PreferencesView } from "./preferences-view";

export default function PreferencesPage() {
  return (
    <main>
      <p>
        <Link href="/">← Back</Link>
      </p>
      <h1>Notification preferences</h1>
      <p>Choose which channels you want to hear about.</p>
      <PreferencesView />
    </main>
  );
}
