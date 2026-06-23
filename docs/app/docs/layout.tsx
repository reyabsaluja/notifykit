import type { ReactNode } from "react";
import { SideNav } from "../_components/side-nav";

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="docs-shell">
      <SideNav />
      <main className="docs-content">{children}</main>
    </div>
  );
}
