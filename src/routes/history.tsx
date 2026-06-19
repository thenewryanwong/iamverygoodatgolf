import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { deleteSession, listSessions, type SessionRecord } from "@/lib/storage";
import { Trash2, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/history")({
  head: () => ({ meta: [{ title: "History — SwingSense AI" }] }),
  component: HistoryPage,
});

function HistoryPage() {
  const [items, setItems] = useState<SessionRecord[]>([]);
  const refresh = () => listSessions().then(setItems);
  useEffect(() => { refresh(); }, []);

  const avg = items.length ? Math.round(items.reduce((s, i) => s + i.analysis.scores.overall, 0) / items.length) : 0;
  const trend = items.slice(0, 10).reverse();
  const max = Math.max(100, ...trend.map(t => t.analysis.scores.overall));

  return (
    <AppShell>
      <header className="px-5 pt-6">
        <p className="text-xs uppercase tracking-[0.22em] text-accent font-semibold">Progress</p>
        <h1 className="mt-1 text-2xl font-extrabold">Your sessions</h1>
      </header>

      {items.length > 0 && (
        <section className="px-5 mt-4">
          <div className="rounded-3xl hero-gradient text-primary-foreground p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-widest text-accent font-bold">Average</p>
                <p className="text-4xl font-extrabold leading-none mt-1">{avg}</p>
                <p className="text-xs text-primary-foreground/80 mt-1">across {items.length} swing{items.length === 1 ? "" : "s"}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-accent" />
            </div>
            {trend.length > 1 && (
              <svg viewBox={`0 0 ${trend.length * 30} 80`} className="mt-4 w-full h-20">
                <polyline
                  fill="none" stroke="var(--gold)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                  points={trend.map((t, i) => `${i * 30 + 15},${80 - (t.analysis.scores.overall / max) * 70}`).join(" ")}
                />
                {trend.map((t, i) => (
                  <circle key={t.id} cx={i * 30 + 15} cy={80 - (t.analysis.scores.overall / max) * 70} r="3.5" fill="var(--gold)" />
                ))}
              </svg>
            )}
          </div>
        </section>
      )}

      <section className="px-5 mt-5 space-y-3">
        {items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No sessions yet. <Link to="/record" className="text-primary font-semibold">Record your first swing</Link>.
          </div>
        )}
        {items.map(s => (
          <div key={s.id} className="flex items-center gap-3 rounded-2xl bg-card border border-border p-3">
            <Link to="/results/$id" params={{ id: s.id }} className="flex items-center gap-3 flex-1 min-w-0">
              <img src={s.thumbnail} alt="" className="h-16 w-16 rounded-xl object-cover bg-muted" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{new Date(s.createdAt).toLocaleString()}</p>
                <p className="text-xs text-muted-foreground truncate">{s.analysis.errors[0]?.issue ?? "Clean swing"}</p>
              </div>
              <div className="text-right pr-1">
                <p className="text-2xl font-extrabold text-primary leading-none">{s.analysis.scores.overall}</p>
              </div>
            </Link>
            <button
              onClick={async () => { await deleteSession(s.id); refresh(); }}
              className="h-9 w-9 grid place-items-center rounded-full text-muted-foreground hover:text-destructive"
              aria-label="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </section>
    </AppShell>
  );
}
