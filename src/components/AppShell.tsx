import type { ReactNode } from "react";
import { BottomNav } from "./BottomNav";

export function AppShell({ children, fullscreen = false }: { children: ReactNode; fullscreen?: boolean }) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className={`mx-auto max-w-[480px] ${fullscreen ? "" : "pb-32 safe-top"}`}>
        {children}
      </div>
      <BottomNav />
    </div>
  );
}
