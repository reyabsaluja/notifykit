"use client";

import { useEffect } from "react";

export function CopyButtonScript() {
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".code-copy");
      if (!btn) return;
      const code = btn.dataset.code;
      if (!code) return;
      navigator.clipboard.writeText(code).then(() => {
        btn.classList.add("copied");
        setTimeout(() => btn.classList.remove("copied"), 1500);
      });
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  return null;
}
