import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { listSessions, type SessionRecord } from "@/lib/storage";
import { ArrowRight, Sparkles, Target, TrendingUp, Video } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SwingSense AI — Your AI golf swing coach" },
      { name: "description", content: "Record your swing and get instant on-device AI analysis with timestamped tips." },
    ],
  }),
  component: Home,
});

function Home() {
  const [last, setLast] = useState<SessionRecord | null>(null);
  const [count, setCount] = useState(0);
  useEffect(() => { listSessions().then(s => { setLast(s[0] ?? null); setCount(s.length); }); }, []);

  return (
    <AppShell>
      <header className="px-5 pt-6">
        <p className="text-xs uppercase tracking-[0.22em] text-accent font-semibold">SwingSense AI</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Your AI<br/>swing coach.</h1>
        <p className="mt-2 text-sm text-muted-foreground">Private, on-device analysis of every swing.</p>
      </header>

      {/* Hero CTA */}
      <section className="px-5 mt-6">
        <Link
          to="/record"
          className="block relative overflow-hidden rounded-3xl hero-gradient text-primary-foreground p-6 shadow-xl"
        >
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-accent/30 blur-2xl" />
          <div className="relative">
            <div className="flex items-center gap-2 text-accent">
              <Sparkles className="h-4 w-4" />
              <span className="text-[11px] uppercase tracking-widest font-bold">New session</span>
            </div>
            <h2 className="mt-3 text-2xl font-bold leading-tight">Check your form</h2>
            <p className="mt-1 text-sm text-primary-foreground/80 max-w-[18rem]">
              Record one swing. We'll grade posture, rotation, plane, tempo, and balance.
            </p>
            <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-accent text-accent-foreground px-4 py-2 text-sm font-semibold">
              <Video className="h-4 w-4" /> Record swing <ArrowRight className="h-4 w-4" />
            </div>
          </div>
        </Link>
      </section>

      {/* Feature pills */}
      <section className="px-5 mt-6 grid grid-cols-3 gap-3">
        {[
          { icon: Target, label: "17 keypoints" },
          { icon: TrendingUp, label: "Tempo & speed" },
          { icon: Sparkles, label: "Timestamped tips" },
        ].map(({ icon: Icon, label }) => (
          <div key={label} className="rounded-2xl bg-card border border-border p-3 text-center">
            <Icon className="h-5 w-5 mx-auto text-primary" />
            <p className="mt-1 text-[11px] font-medium text-muted-foreground leading-tight">{label}</p>
          </div>
        ))}
      </section>

      {/* Last session */}
      <section className="px-5 mt-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">Recent</h3>
          <Link to="/history" className="text-xs text-muted-foreground">View all ({count})</Link>
        </div>
        {last ? (
          <Link
            to="/results/$id"
            params={{ id: last.id }}
            className="flex items-center gap-3 rounded-2xl bg-card border border-border p-3"
          >
            <img src={last.thumbnail} alt="" className="h-16 w-16 rounded-xl object-cover bg-muted" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">
                {new Date(last.createdAt).toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {last.analysis.errors[0]?.issue ?? "Clean swing"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xl font-extrabold text-primary leading-none">{last.analysis.scores.overall}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">score</p>
            </div>
          </Link>
        ) : (
          <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No swings yet. Tap <span className="font-semibold text-foreground">Record swing</span> to start.
          </div>
        )}
      </section>

      {/* Tips card */}
      <section className="px-5 mt-6">
        <div className="rounded-2xl bg-card border border-border p-4">
          <p className="text-xs uppercase tracking-widest font-bold text-accent">Setup tip</p>
          <p className="mt-1 text-sm">
            Stand <b>sideways</b> to the camera (down-the-line view), 6–8 feet away. Phone at hip height. Full body in frame.
          </p>
        </div>
      </section>
    </AppShell>
  );
}
