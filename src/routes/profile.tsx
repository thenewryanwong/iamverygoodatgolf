import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Shield, Cpu, Download, Wifi } from "lucide-react";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "Profile — SwingSense AI" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  return (
    <AppShell>
      <header className="px-5 pt-6">
        <p className="text-xs uppercase tracking-[0.22em] text-accent font-semibold">Profile</p>
        <h1 className="mt-1 text-2xl font-extrabold">You</h1>
      </header>

      <section className="px-5 mt-5 space-y-3">
        <Item icon={Shield} title="Private by design" body="All video and pose analysis runs on your device. Nothing is uploaded." />
        <Item icon={Cpu} title="On-device AI" body="Powered by MoveNet Thunder via TensorFlow.js with WebGL acceleration." />
        <Item icon={Wifi} title="Works offline" body="Installable as an app. Use it at the range with no signal." />
        <Item icon={Download} title="Add to Home Screen" body="On iPhone, tap Share → Add to Home Screen. On Android, use the install prompt in your browser." />
      </section>

      <section className="px-5 mt-6 text-center">
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground">SwingSense AI</p>
        <p className="text-xs text-muted-foreground mt-1">v1.0 · MoveNet Thunder</p>
      </section>
    </AppShell>
  );
}

function Item({ icon: Icon, title, body }: { icon: any; title: string; body: string }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-4 flex gap-3">
      <div className="h-10 w-10 shrink-0 rounded-full bg-primary/10 text-primary grid place-items-center">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="font-semibold text-sm">{title}</p>
        <p className="text-sm text-muted-foreground mt-0.5">{body}</p>
      </div>
    </div>
  );
}
