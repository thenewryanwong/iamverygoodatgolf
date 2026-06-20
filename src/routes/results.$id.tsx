import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { getSession, updateFeedback, type SessionRecord } from "@/lib/storage";
import { KP } from "@/lib/pose/detector";
import { idealPose, fitPoseToBox, type IdealPhase } from "@/lib/pose/idealPose";
import {
  ChevronLeft, Activity, Sparkles, Play, ThumbsUp, ThumbsDown, Share2,
  Pause, Eye, EyeOff, Gauge, Layers,
} from "lucide-react";
import type { SwingError } from "@/lib/pose/analyze";

export const Route = createFileRoute("/results/$id")({
  head: () => ({ meta: [{ title: "Your swing — SwingSense AI" }] }),
  component: ResultsPage,
});

type Tab = "rating" | "metrics" | "tips" | "replay";

function ResultsPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [tab, setTab] = useState<Tab>("rating");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [feedback, setFeedbackState] = useState<"up" | "down" | undefined>();

  useEffect(() => {
    getSession(id).then(s => {
      if (!s) { navigate({ to: "/" }); return; }
      setSession(s);
      setVideoUrl(URL.createObjectURL(s.videoBlob));
      setFeedbackState(s.feedback);
    });
    return () => { if (videoUrl) URL.revokeObjectURL(videoUrl); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!session || !videoUrl) {
    return (
      <AppShell><div className="p-10 text-center text-sm text-muted-foreground">Loading…</div></AppShell>
    );
  }
  const { analysis, duration } = session;
  const { scores, errors, metrics } = analysis;

  const sendFeedback = async (f: "up" | "down") => { setFeedbackState(f); await updateFeedback(id, f); };

  return (
    <AppShell>
      <header className="px-5 pt-4 flex items-center justify-between">
        <button onClick={() => history.back()} className="h-10 w-10 grid place-items-center rounded-full bg-card border border-border">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <p className="text-xs text-muted-foreground">{new Date(session.createdAt).toLocaleString()}</p>
        <button
          onClick={() => shareScore(scores.overall)}
          className="h-10 w-10 grid place-items-center rounded-full bg-card border border-border"
        ><Share2 className="h-4 w-4" /></button>
      </header>

      {/* Tab strip */}
      <nav className="px-5 mt-4 overflow-x-auto no-scrollbar">
        <div className="flex gap-2">
          {([
            { k: "rating", label: "Rating", icon: Gauge },
            { k: "metrics", label: "Mechanics", icon: Activity },
            { k: "tips", label: "Tips", icon: Sparkles },
            { k: "replay", label: "Replay", icon: Play },
          ] as const).map(({ k, label, icon: Icon }) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold transition-colors whitespace-nowrap ${
                tab === k ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>
      </nav>

      <main className="px-5 mt-5">
        {tab === "rating" && <RatingPanel scores={scores} errors={errors} onJump={(e) => { setTab("replay"); setTimeout(() => jumpEvent(e), 50); }} />}
        {tab === "metrics" && <MetricsPanel session={session} />}
        {tab === "tips" && <TipsPanel errors={errors} session={session} onPlay={(e) => { setTab("replay"); setTimeout(() => jumpEvent(e), 50); }} />}
        {tab === "replay" && <ReplayPanel session={session} videoUrl={videoUrl} />}
      </main>

      {/* Feedback bar */}
      <section className="px-5 mt-6">
        <div className="rounded-2xl bg-card border border-border p-4 flex items-center justify-between">
          <p className="text-sm">Was this helpful?</p>
          <div className="flex gap-2">
            <button onClick={() => sendFeedback("up")} className={`h-10 w-10 grid place-items-center rounded-full border ${feedback === "up" ? "bg-good/20 border-good text-good" : "border-border"}`} aria-label="Helpful">
              <ThumbsUp className="h-4 w-4" />
            </button>
            <button onClick={() => sendFeedback("down")} className={`h-10 w-10 grid place-items-center rounded-full border ${feedback === "down" ? "bg-destructive/20 border-destructive text-destructive" : "border-border"}`} aria-label="Not helpful">
              <ThumbsDown className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      <section className="px-5 mt-4">
        <Link to="/record" className="block text-center rounded-full bg-primary text-primary-foreground py-3 font-semibold">
          Record another swing
        </Link>
      </section>

      <div className="h-6" aria-hidden />
    </AppShell>
  );
}

/* ---------------- Rating ---------------- */

function RatingPanel({ scores, errors, onJump }: { scores: any; errors: SwingError[]; onJump: (e: SwingError) => void }) {
  const subs = [
    { k: "posture", label: "Posture", v: scores.posture },
    { k: "rotation", label: "Rotation", v: scores.rotation },
    { k: "plane", label: "Swing Plane", v: scores.plane },
    { k: "tempo", label: "Tempo", v: scores.tempo },
    { k: "balance", label: "Balance", v: scores.balance },
  ];
  return (
    <>
      <div className="rounded-3xl hero-gradient text-primary-foreground p-6 shadow-xl">
        <div className="flex items-center gap-5">
          <CircularGauge value={scores.overall} />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] uppercase tracking-widest text-accent font-bold">Swing rating</p>
            <p className="text-3xl font-extrabold leading-tight">{verdict(scores.overall)}</p>
            <p className="text-xs text-primary-foreground/80 mt-1">
              {errors.length} {errors.length === 1 ? "issue" : "issues"} flagged
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {subs.map(s => (
          <button key={s.k} onClick={() => { const e = errors[0]; if (e) onJump(e); }} className="text-left rounded-2xl bg-card border border-border p-4">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{s.label}</p>
            <p className="mt-1 text-2xl font-extrabold" style={{ color: scoreColor(s.v) }}>{s.v}</p>
            <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${s.v}%`, backgroundColor: scoreColor(s.v) }} />
            </div>
          </button>
        ))}
      </div>

      {errors.length > 0 && (
        <div className="mt-4 rounded-2xl bg-card border border-border p-4">
          <p className="text-[11px] uppercase tracking-wider text-accent font-bold">Top focus</p>
          <p className="mt-1 text-sm font-semibold">{errors[0].issue}</p>
          <p className="mt-1 text-sm text-muted-foreground">{errors[0].tip}</p>
        </div>
      )}
    </>
  );
}

function CircularGauge({ value }: { value: number }) {
  const r = 44, c = 2 * Math.PI * r;
  const offset = c * (1 - Math.min(100, Math.max(0, value)) / 100);
  return (
    <div className="relative h-28 w-28 shrink-0">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} stroke="rgba(255,255,255,0.15)" strokeWidth="8" fill="none" />
        <circle cx="50" cy="50" r={r} stroke="currentColor" strokeWidth="8" fill="none"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
          style={{ color: scoreColor(value), transition: "stroke-dashoffset 1s ease" }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <p className="text-3xl font-extrabold leading-none">{value}</p>
          <p className="text-[10px] uppercase tracking-widest text-primary-foreground/70 mt-0.5">/ 100</p>
        </div>
      </div>
    </div>
  );
}

function verdict(v: number) {
  if (v >= 85) return "Excellent";
  if (v >= 70) return "Solid swing";
  if (v >= 55) return "Work to do";
  if (v >= 35) return "Needs attention";
  return "Let's rebuild it";
}
function scoreColor(v: number) {
  if (v >= 75) return "oklch(0.7 0.18 145)";
  if (v >= 50) return "oklch(0.82 0.16 85)";
  return "oklch(0.62 0.22 27)";
}

/* ---------------- Metrics ---------------- */

function MetricsPanel({ session }: { session: SessionRecord }) {
  const m = session.analysis.metrics;
  const [phase, setPhase] = useState<IdealPhase>("top");
  const [overlay, setOverlay] = useState(false);

  const rows = [
    { label: "Shoulder turn", val: `${Math.round(m.shoulderTurn)}°`, ideal: "85–105°", v: m.shoulderTurn, range: [85, 105] as const },
    { label: "Hip turn", val: `${Math.round(m.hipTurn)}°`, ideal: "40–55°", v: m.hipTurn, range: [40, 55] as const },
    { label: "X-Factor (coil)", val: `${Math.round(m.xFactor)}°`, ideal: "35–55°", v: m.xFactor, range: [35, 55] as const },
    { label: "Spine tilt at address", val: `${Math.round(m.spineTiltAddress)}°`, ideal: "25–40°", v: m.spineTiltAddress, range: [25, 40] as const },
    { label: "Posture drift", val: `${Math.round(m.spineTiltDrift)}°`, ideal: "≤ 10°", v: m.spineTiltDrift, range: [0, 10] as const },
    { label: "Lead arm at top", val: `${Math.round(m.leadArmStraightness)}°`, ideal: "160–180°", v: m.leadArmStraightness, range: [160, 180] as const },
    { label: "Wrist hinge", val: `${Math.round(m.wristHinge)}°`, ideal: "75–100°", v: m.wristHinge, range: [75, 100] as const },
    { label: "Head sway", val: `${m.headLateral.toFixed(1)}%`, ideal: "≤ 4%", v: m.headLateral, range: [0, 4] as const },
    { label: "Head lift", val: `${m.headVertical.toFixed(1)}%`, ideal: "≤ 4%", v: m.headVertical, range: [0, 4] as const },
    { label: "Tempo ratio", val: m.tempoRatio.toFixed(2), ideal: "2.6–3.4", v: m.tempoRatio, range: [2.6, 3.4] as const },
  ];

  // Pick the user's frame closest to the requested phase.
  const userKp = useMemo(() => {
    const ph = session.analysis.phases;
    const target = ph[phase];
    const frames = session.analysis.frames;
    if (!frames.length) return null;
    let best = 0, bd = Infinity;
    for (let i = 0; i < frames.length; i++) {
      const d = Math.abs(frames[i].t - target);
      if (d < bd) { bd = d; best = i; }
    }
    return frames[best].keypoints;
  }, [session, phase]);

  return (
    <>
      {/* Phase picker drives both the video frame and the skeleton boxes */}
      <div className="grid grid-cols-3 gap-2">
        {(["address", "top", "impact"] as IdealPhase[]).map(p => (
          <button
            key={p}
            onClick={() => setPhase(p)}
            className={`py-2 rounded-full text-xs font-semibold border capitalize ${
              phase === p ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground"
            }`}
          >
            {p === "top" ? "Top of swing" : p}
          </button>
        ))}
      </div>

      {/* Video frame at the selected phase, with user's skeleton overlaid */}
      <div className="mt-3">
        <PhaseFrame session={session} phase={phase} userKp={userKp} />
      </div>

      {/* Two small skeleton-only boxes (you vs perfect), with overlay toggle */}
      <div className="mt-4 rounded-2xl bg-card border border-border p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-accent font-bold">Compare</p>
            <h3 className="text-sm font-semibold">Your swing vs perfect</h3>
          </div>
          <button
            onClick={() => setOverlay(o => !o)}
            className={`h-9 px-3 rounded-full text-xs font-semibold border flex items-center gap-1.5 ${
              overlay ? "bg-accent text-accent-foreground border-accent" : "bg-card border-border text-muted-foreground"
            }`}
            aria-label="Overlay ideal swing"
          >
            <Layers className="h-3.5 w-3.5" />
            {overlay ? "Overlay on" : "Overlay"}
          </button>
        </div>

        <SkeletonCompare session={session} phase={phase} userKp={userKp} overlay={overlay} />

        <IdealNotes phase={phase} session={session} />
      </div>

      <div className="mt-4 rounded-2xl bg-card border border-border overflow-hidden">
        {rows.map((r, i) => {
          const ok = r.v >= r.range[0] && r.v <= r.range[1];
          return (
            <div key={r.label} className={`flex items-center justify-between px-4 py-3 ${i ? "border-t border-border" : ""}`}>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{r.label}</p>
                <p className="text-[11px] text-muted-foreground">Ideal: {r.ideal}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold" style={{ color: ok ? "var(--color-good)" : "var(--color-bad)" }}>{r.val}</p>
                <p className="text-[10px] uppercase tracking-wider" style={{ color: ok ? "var(--color-good)" : "var(--color-bad)" }}>
                  {ok ? "On range" : "Off"}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/** Top "playing box" — paints the user's video frame at the selected phase
 *  and overlays the detected skeleton. Uses a mobile-robust seek that
 *  attaches the seeked listener before assigning currentTime and falls
 *  back to a timeout, so iOS / Android Chrome don't get stuck on black. */
function PhaseFrame({
  session, phase, userKp,
}: { session: SessionRecord; phase: IdealPhase; userKp: any[] | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const urlRef = useRef<string | null>(null);

  // Create the (offscreen) decode video once per session.
  useEffect(() => {
    const url = URL.createObjectURL(session.videoBlob);
    urlRef.current = url;
    const v = document.createElement("video");
    v.src = url;
    v.muted = true;
    v.playsInline = true;
    (v as any).preload = "auto";
    videoRef.current = v;
    // iOS Safari needs a play/pause to prime decoding before seeking.
    const prime = async () => {
      try { await v.play(); v.pause(); } catch { /* ignore autoplay block */ }
    };
    const onLoaded = () => { prime(); };
    v.addEventListener("loadedmetadata", onLoaded, { once: true });
    return () => {
      v.removeEventListener("loadedmetadata", onLoaded);
      v.src = "";
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
      videoRef.current = null;
    };
  }, [session]);

  // Re-paint whenever the phase changes.
  useEffect(() => {
    const v = videoRef.current;
    const canvas = canvasRef.current;
    if (!v || !canvas) return;
    let cancelled = false;

    const paint = () => {
      if (cancelled) return;
      const W = session.videoWidth || v.videoWidth || 720;
      const H = session.videoHeight || v.videoHeight || 1280;
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      try { ctx.drawImage(v, 0, 0, W, H); } catch { /* video not ready */ }
      if (userKp) drawSkeleton(ctx, userKp, session.analysis);
    };

    const seekAndPaint = async () => {
      const targetT = session.analysis.phases[phase] ?? 0;
      // Wait for metadata if not ready yet.
      if (!v.duration || Number.isNaN(v.duration)) {
        await new Promise<void>(res => {
          const on = () => res();
          v.addEventListener("loadedmetadata", on, { once: true });
        });
      }
      if (cancelled) return;
      const safeT = Math.max(0, Math.min(v.duration - 0.05, targetT));
      // Attach listener BEFORE setting currentTime (iOS reliability), with timeout fallback.
      await new Promise<void>(res => {
        let done = false;
        const finish = () => { if (done) return; done = true; v.removeEventListener("seeked", finish); res(); };
        v.addEventListener("seeked", finish, { once: true });
        try { v.currentTime = safeT; } catch { finish(); }
        setTimeout(finish, 900);
      });
      // Give the decoder one frame to commit.
      await new Promise(r => requestAnimationFrame(() => r(null)));
      paint();
    };

    seekAndPaint();
    return () => { cancelled = true; };
  }, [phase, userKp, session]);

  const aspect = `${session.videoWidth || 9} / ${session.videoHeight || 16}`;
  return (
    <div
      className="rounded-2xl overflow-hidden bg-black mx-auto"
      style={{ aspectRatio: aspect, maxHeight: "60vh", maxWidth: "100%" }}
    >
      <canvas ref={canvasRef} className="h-full w-full block object-contain" />
    </div>
  );
}

/** Two small skeleton-only boxes (you vs perfect), with optional overlay. */
function SkeletonCompare({
  session, phase, userKp, overlay,
}: { session: SessionRecord; phase: IdealPhase; userKp: any[] | null; overlay: boolean }) {
  const yourCanvasRef = useRef<HTMLCanvasElement>(null);
  const idealCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const render = (canvas: HTMLCanvasElement | null, kp: any[] | null, srcW?: number, srcH?: number) => {
      if (!canvas || !kp) return;
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.clientWidth, H = canvas.clientHeight;
      if (!W || !H) return;
      canvas.width = W * dpr; canvas.height = H * dpr;
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const fitted = srcW
        ? fitPoseToBox(kp, W, H, srcW, srcH)
        : fitPoseToBox(kp, W, H, session.videoWidth, session.videoHeight);
      drawSkeleton(ctx, fitted as any, session.analysis);
    };

    if (!overlay) {
      render(yourCanvasRef.current, userKp ?? null);
      render(idealCanvasRef.current, idealPose(phase), 100, 220);
      return;
    }

    const oc = overlayCanvasRef.current;
    if (oc && userKp) {
      const dpr = window.devicePixelRatio || 1;
      const W = oc.clientWidth, H = oc.clientHeight;
      if (!W || !H) return;
      oc.width = W * dpr; oc.height = H * dpr;
      const ctx = oc.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const userFitted = fitPoseToBox(userKp as any, W, H, session.videoWidth, session.videoHeight);
      drawSkeleton(ctx, userFitted as any, session.analysis);
      const ideal = fitPoseToBox(idealPose(phase), W, H, 100, 220);
      const alignedIdeal = alignPoseTo(ideal, userFitted as any);
      drawIdealOverlay(ctx, alignedIdeal);
    }
  }, [userKp, phase, overlay, session]);

  if (overlay) {
    return (
      <div className="mt-4">
        <div className="rounded-xl bg-black aspect-[3/4] overflow-hidden">
          <canvas ref={overlayCanvasRef} className="h-full w-full block" />
        </div>
        <div className="mt-2 flex items-center justify-center gap-4 text-[11px] text-muted-foreground">
          <LegendDot color="rgba(80,200,120,0.95)" label="Your pose" />
          <LegendDot color="rgba(201,162,39,0.95)" label="Ideal pose" dashed />
        </div>
      </div>
    );
  }
  return (
    <div className="mt-4 grid grid-cols-2 gap-3">
      <FigureBox label="You" canvasRef={yourCanvasRef} />
      <FigureBox label="Perfect" canvasRef={idealCanvasRef} />
    </div>
  );
}

function FigureBox({ label, canvasRef }: { label: string; canvasRef: React.RefObject<HTMLCanvasElement | null> }) {
  return (
    <div>
      <div className="rounded-xl bg-black aspect-[3/4] overflow-hidden">
        <canvas ref={canvasRef} className="h-full w-full block" />
      </div>
      <p className="mt-1.5 text-center text-[11px] font-semibold tracking-wide uppercase text-muted-foreground">{label}</p>
    </div>
  );
}

function LegendDot({ color, label, dashed = false }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-3 w-5 rounded-sm"
        style={{
          background: dashed
            ? `repeating-linear-gradient(90deg, ${color} 0 3px, transparent 3px 6px)`
            : color,
        }}
      />
      {label}
    </span>
  );
}

// Translate + scale an ideal pose so its shoulder-mid and hip-mid match the
// user's, keeping the comparison meaningful regardless of camera framing.
function alignPoseTo(ideal: { x: number; y: number; score?: number }[], user: { x: number; y: number; score?: number }[]) {
  const mid = (a: any, b: any) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const dist = (a: any, b: any) => Math.hypot(a.x - b.x, a.y - b.y);
  const uShoul = mid(user[KP.LEFT_SHOULDER], user[KP.RIGHT_SHOULDER]);
  const uHip   = mid(user[KP.LEFT_HIP], user[KP.RIGHT_HIP]);
  const iShoul = mid(ideal[KP.LEFT_SHOULDER], ideal[KP.RIGHT_SHOULDER]);
  const iHip   = mid(ideal[KP.LEFT_HIP], ideal[KP.RIGHT_HIP]);
  const userTorso = dist(uShoul, uHip) || 1;
  const idealTorso = dist(iShoul, iHip) || 1;
  const s = userTorso / idealTorso;
  return ideal.map(p => ({
    x: uShoul.x + (p.x - iShoul.x) * s,
    y: uShoul.y + (p.y - iShoul.y) * s,
    score: p.score,
  }));
}

function drawIdealOverlay(ctx: CanvasRenderingContext2D, kp: { x: number; y: number }[]) {
  const segs: [number, number][] = [
    [KP.LEFT_SHOULDER, KP.RIGHT_SHOULDER],
    [KP.LEFT_SHOULDER, KP.LEFT_ELBOW], [KP.LEFT_ELBOW, KP.LEFT_WRIST],
    [KP.RIGHT_SHOULDER, KP.RIGHT_ELBOW], [KP.RIGHT_ELBOW, KP.RIGHT_WRIST],
    [KP.LEFT_HIP, KP.RIGHT_HIP],
    [KP.LEFT_HIP, KP.LEFT_KNEE], [KP.LEFT_KNEE, KP.LEFT_ANKLE],
    [KP.RIGHT_HIP, KP.RIGHT_KNEE], [KP.RIGHT_KNEE, KP.RIGHT_ANKLE],
    [KP.LEFT_SHOULDER, KP.LEFT_HIP], [KP.RIGHT_SHOULDER, KP.RIGHT_HIP],
  ];
  ctx.save();
  ctx.strokeStyle = "rgba(201, 162, 39, 0.95)"; // brand gold
  ctx.lineWidth = Math.max(3, ctx.canvas.width / 180);
  ctx.setLineDash([6, 4]);
  ctx.lineCap = "round";
  for (const [a, b] of segs) {
    const pa = kp[a], pb = kp[b]; if (!pa || !pb) continue;
    ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
  }
  ctx.restore();
}

function IdealNotes({ phase, session }: { phase: IdealPhase; session: SessionRecord }) {
  const m = session.analysis.metrics;
  const notes: Record<IdealPhase, { title: string; rows: { k: string; you: string; ideal: string }[] }> = {
    address: {
      title: "Setup checkpoints",
      rows: [
        { k: "Spine tilt",    you: `${Math.round(m.spineTiltAddress)}°`, ideal: "25–40°" },
        { k: "Shoulders",     you: "—",                                  ideal: "Square to target" },
        { k: "Weight",        you: "—",                                  ideal: "50 / 50" },
      ],
    },
    top: {
      title: "Top-of-swing checkpoints",
      rows: [
        { k: "Shoulder turn",  you: `${Math.round(m.shoulderTurn)}°`,         ideal: "85–105°" },
        { k: "Hip turn",       you: `${Math.round(m.hipTurn)}°`,              ideal: "40–55°" },
        { k: "X-Factor",       you: `${Math.round(m.xFactor)}°`,              ideal: "35–55°" },
        { k: "Lead arm",       you: `${Math.round(m.leadArmStraightness)}°`,  ideal: "160–180°" },
        { k: "Wrist hinge",    you: `${Math.round(m.wristHinge)}°`,           ideal: "75–100°" },
      ],
    },
    impact: {
      title: "Impact checkpoints",
      rows: [
        { k: "Hips",           you: "—",                                ideal: "~40° open" },
        { k: "Posture drift",  you: `${Math.round(m.spineTiltDrift)}°`, ideal: "≤ 10°" },
        { k: "Head sway",      you: `${m.headLateral.toFixed(1)}%`,     ideal: "≤ 4%" },
      ],
    },
  };
  const data = notes[phase];
  return (
    <div className="mt-4 rounded-xl bg-muted/40 p-3">
      <p className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">{data.title}</p>
      <div className="mt-2 divide-y divide-border">
        {data.rows.map(r => (
          <div key={r.k} className="flex items-center justify-between py-1.5 text-xs">
            <span className="font-medium">{r.k}</span>
            <span className="text-muted-foreground">
              <span className="text-foreground font-semibold">{r.you}</span>
              <span className="mx-1.5 opacity-60">vs</span>
              <span className="text-accent font-semibold">{r.ideal}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Tips ---------------- */



function TipsPanel({ errors, session, onPlay }: { errors: SwingError[]; session: SessionRecord; onPlay: (e: SwingError) => void }) {
  if (!errors.length) {
    return (
      <div className="rounded-2xl bg-card border border-border p-6 text-center">
        <Sparkles className="h-6 w-6 mx-auto text-accent" />
        <p className="mt-2 font-semibold">Clean swing.</p>
        <p className="text-sm text-muted-foreground">Nothing flagged — keep grooving it.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {errors.map((e, i) => (
        <article key={e.id} className="rounded-2xl bg-card border border-border p-4">
          <div className="flex items-start gap-3">
            <div className="flex flex-col items-center gap-1">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">#{i + 1}</span>
              <span
                className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
                style={{
                  background: sevColor(e.severity, 0.15),
                  color: sevColor(e.severity, 1),
                }}
              >{e.severity}</span>
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-sm">{e.issue}</h4>
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{e.tip}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                <span className="px-2 py-1 rounded-md bg-muted text-muted-foreground font-medium">
                  {fmtTime(e.timestamp)} · {e.bodyPart}
                </span>
                {e.idealRange[1] > 0 && (
                  <span className="px-2 py-1 rounded-md bg-muted text-muted-foreground font-medium">
                    You: <b className="text-foreground">{e.actualValue}{e.unit ?? ""}</b> · Ideal: {e.idealRange[0]}–{e.idealRange[1]}{e.unit ?? ""}
                  </span>
                )}
              </div>
              <button onClick={() => onPlay(e)} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
                <Play className="h-3.5 w-3.5" /> Play from here
              </button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function sevColor(s: "high" | "medium" | "low", alpha = 1) {
  const c = s === "high" ? "240,80,80" : s === "medium" ? "230,170,40" : "120,160,200";
  return `rgba(${c}, ${alpha})`;
}
function fmtTime(t: number) {
  const m = Math.floor(t / 60), s = (t - m * 60);
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

/* ---------------- Replay ---------------- */

let jumpFn: ((t: number) => void) | null = null;
function jumpEvent(e: SwingError) { jumpFn?.(Math.max(0, e.timestamp - 1)); }

function ReplayPanel({ session, videoUrl }: { session: SessionRecord; videoUrl: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [rate, setRate] = useState(1);
  const [activeErr, setActiveErr] = useState<SwingError | null>(null);

  const duration = session.duration;
  const errors = session.analysis.errors;

  useEffect(() => {
    jumpFn = (t: number) => { if (videoRef.current) { videoRef.current.currentTime = t; videoRef.current.play(); setPlaying(true); } };
    return () => { jumpFn = null; };
  }, []);

  useEffect(() => {
    const v = videoRef.current; if (!v) return;
    v.playbackRate = rate;
  }, [rate]);

  // Draw overlay synced to current time
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const v = videoRef.current, c = overlayRef.current;
      if (v && c) {
        const W = c.width = v.clientWidth, H = c.height = v.clientHeight;
        const ctx = c.getContext("2d")!;
        ctx.clearRect(0, 0, W, H);
        if (showSkeleton) {
          // pick nearest frame
          const t = v.currentTime;
          const frames = session.analysis.frames;
          let bi = 0, bd = Infinity;
          for (let i = 0; i < frames.length; i++) {
            const d = Math.abs(frames[i].t - t);
            if (d < bd) { bd = d; bi = i; }
          }
          const kp = frames[bi]?.keypoints;
          if (kp) {
            const sx = W / session.videoWidth, sy = H / session.videoHeight;
            ctx.save(); ctx.scale(sx, sy);
            drawSkeleton(ctx, kp as any, session.analysis);
            ctx.restore();
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [session, showSkeleton]);

  const togglePlay = () => {
    const v = videoRef.current; if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); } else { v.pause(); setPlaying(false); }
  };

  return (
    <div>
      <div
        className="relative rounded-2xl overflow-hidden bg-black mx-auto"
        style={{ aspectRatio: `${session.videoWidth} / ${session.videoHeight}`, maxHeight: "70vh" }}
      >
        <video
          ref={videoRef}
          src={videoUrl}
          className="h-full w-full object-cover"
          playsInline
          onTimeUpdate={e => setTime((e.target as HTMLVideoElement).currentTime)}
          onEnded={() => setPlaying(false)}
        />
        <canvas ref={overlayRef} className="absolute inset-0 pointer-events-none" />
        <button onClick={togglePlay} className="absolute inset-0 grid place-items-center">
          {!playing && <div className="h-16 w-16 rounded-full bg-black/50 backdrop-blur grid place-items-center">
            <Play className="h-7 w-7 text-white" />
          </div>}
        </button>
      </div>

      {/* Scrubber + markers */}
      <div className="mt-4">
        <div className="relative h-8">
          <input
            type="range"
            min={0} max={duration} step={0.05} value={time}
            onChange={e => { const t = +e.target.value; setTime(t); if (videoRef.current) videoRef.current.currentTime = t; }}
            className="absolute inset-x-0 top-1/2 -translate-y-1/2 w-full accent-[var(--gold)]"
            aria-label="Seek"
          />
          {errors.map(e => (
            <button
              key={e.id}
              onClick={() => { setActiveErr(e); if (videoRef.current) videoRef.current.currentTime = Math.max(0, e.timestamp); }}
              className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full pulse-marker"
              style={{ left: `${(e.timestamp / duration) * 100}%`, transform: "translate(-50%,-50%)", background: sevColor(e.severity, 1) }}
              aria-label={e.issue}
            />
          ))}
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-1">
          <span>{fmtTime(time)}</span>
          <span>{fmtTime(duration)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <button onClick={togglePlay} className="rounded-full bg-primary text-primary-foreground h-10 w-10 grid place-items-center">
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <button
          onClick={() => setShowSkeleton(s => !s)}
          className="rounded-full bg-card border border-border h-10 px-3 text-xs font-semibold flex items-center gap-1.5"
        >
          {showSkeleton ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          Skeleton
        </button>
        {[1, 0.5, 0.25].map(r => (
          <button key={r} onClick={() => setRate(r)} className={`h-10 px-3 rounded-full text-xs font-semibold border ${rate === r ? "bg-accent text-accent-foreground border-accent" : "bg-card border-border"}`}>
            {r}×
          </button>
        ))}
      </div>

      {activeErr && (
        <div className="mt-4 rounded-2xl bg-card border border-border p-4">
          <p className="text-[11px] uppercase tracking-wider font-bold" style={{ color: sevColor(activeErr.severity, 1) }}>{activeErr.severity}</p>
          <p className="mt-1 font-semibold text-sm">{activeErr.issue}</p>
          <p className="mt-1 text-sm text-muted-foreground">{activeErr.tip}</p>
        </div>
      )}
    </div>
  );
}

/* ---------------- Share ---------------- */

async function shareScore(score: number) {
  const c = document.createElement("canvas");
  c.width = 1080; c.height = 1080;
  const ctx = c.getContext("2d")!;
  // bg
  const grad = ctx.createLinearGradient(0, 0, 1080, 1080);
  grad.addColorStop(0, "#0f2a20"); grad.addColorStop(1, "#1B3A2D");
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 1080, 1080);
  ctx.fillStyle = "#C9A227"; ctx.font = "700 36px Inter, sans-serif";
  ctx.fillText("SWINGSENSE AI", 80, 130);
  ctx.fillStyle = "#fff"; ctx.font = "800 220px Inter, sans-serif";
  ctx.fillText(String(score), 80, 600);
  ctx.font = "500 48px Inter, sans-serif"; ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.fillText("Swing Rating", 80, 680);
  ctx.font = "600 40px Inter, sans-serif"; ctx.fillStyle = "#C9A227";
  ctx.fillText(verdict(score), 80, 760);
  const blob = await new Promise<Blob | null>(res => c.toBlob(res, "image/png"));
  if (!blob) return;
  const file = new File([blob], "swingsense.png", { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "My SwingSense rating" }); return; } catch {}
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "swingsense-rating.png"; a.click();
  URL.revokeObjectURL(url);
}
