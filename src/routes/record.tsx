import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { estimateFrame, type FramePose } from "@/lib/pose/detector";
import { analyzeSwing } from "@/lib/pose/analyze";
import { saveSession } from "@/lib/storage";
import {
  Camera, CameraOff, ChevronLeft, RefreshCw, Upload, Loader2, CircleDot, HelpCircle, X,
} from "lucide-react";

export const Route = createFileRoute("/record")({
  head: () => ({ meta: [{ title: "Record swing — SwingSense AI" }] }),
  component: RecordPage,
});

type Phase = "setup" | "ready" | "countdown" | "recording" | "analyzing" | "error";

function RecordPage() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [phase, setPhase] = useState<Phase>("setup");
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [countdown, setCountdown] = useState(5);
  const [recordSecs, setRecordSecs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("Loading model…");
  const [showTutorial, setShowTutorial] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const startCamera = useCallback(async () => {
    setError(null);
    try {
      streamRef.current?.getTracks().forEach(t => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 720 }, height: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        v.onloadedmetadata = () => { v.play().catch(() => {}); };
        // Belt-and-braces: some mobile browsers don't fire onloadedmetadata reliably.
        try { await v.play(); } catch {}
      }
      setPhase("ready");
    } catch (e: any) {
      setError(e?.message ?? "Camera access denied");
      setPhase("error");
    }
  }, [facing]);

  useEffect(() => { startCamera(); return () => { streamRef.current?.getTracks().forEach(t => t.stop()); }; }, [startCamera]);

  const beginCountdown = () => {
    setPhase("countdown");
    setCountdown(5);
    let n = 5;
    const id = setInterval(() => {
      n -= 1;
      if (n <= 0) { clearInterval(id); startRecording(); } else setCountdown(n);
    }, 1000);
  };

  const startRecording = () => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : MediaRecorder.isTypeSupported("video/webm;codecs=vp8") ? "video/webm;codecs=vp8" : "video/webm";
    const rec = new MediaRecorder(streamRef.current, { mimeType: mime });
    rec.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data); };
    rec.onstop = () => handleStop(mime);
    recorderRef.current = rec;
    rec.start();
    setPhase("recording");
    setRecordSecs(0);

    let secs = 0;
    const tick = setInterval(() => {
      secs += 0.1;
      setRecordSecs(secs);
      if (secs >= 10) { clearInterval(tick); stopRecording(); }
    }, 100);
    (rec as any)._tick = tick;
  };

  const stopRecording = () => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
    if (rec && (rec as any)._tick) clearInterval((rec as any)._tick);
  };

  const handleStop = async (mime: string) => {
    setPhase("analyzing");
    const blob = new Blob(chunksRef.current, { type: mime });
    await analyzeBlob(blob);
  };

  const onFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPhase("analyzing");
    await analyzeBlob(f);
  };

  const analyzeBlob = async (blob: Blob) => {
    try {
      setProgress(5); setProgressLabel("Loading AI model…");
      // Create offscreen video
      const url = URL.createObjectURL(blob);
      const v = document.createElement("video");
      v.src = url; v.muted = true; v.playsInline = true; v.preload = "auto";
      await new Promise<void>((res, rej) => {
        v.onloadedmetadata = () => res();
        v.onerror = () => rej(new Error("Could not load video"));
      });
      const duration = v.duration && isFinite(v.duration) ? v.duration : 5;
      const w = v.videoWidth, h = v.videoHeight;
      if (duration < 1.5) throw new Error("Video too short — please record at least 2 seconds.");

      // Helper: seek to a timestamp and resolve when the frame is ready.
      // Mobile browsers sometimes never fire 'seeked' if the listener is
      // attached *after* setting currentTime, or if the seek is a no-op.
      // We attach first, then seek, and bail out with a timeout so the
      // analyzer can never hang forever on "Loading AI model…".
      const seekTo = (t: number) => new Promise<void>(resolve => {
        let done = false;
        const finish = () => { if (done) return; done = true; v.removeEventListener("seeked", finish); resolve(); };
        v.addEventListener("seeked", finish, { once: true });
        try { v.currentTime = t; } catch { finish(); return; }
        setTimeout(finish, 800);
      });

      // Thumbnail at 25% time
      await seekTo(Math.min(duration * 0.25, 1.5));
      const tc = document.createElement("canvas");
      tc.width = 240; tc.height = Math.round(240 * h / w);
      tc.getContext("2d")!.drawImage(v, 0, 0, tc.width, tc.height);
      const thumbnail = tc.toDataURL("image/jpeg", 0.75);

      // Sample frames at ~10 fps (lighter on phones)
      const fps = 10;
      const total = Math.max(8, Math.floor(duration * fps));
      const frames: FramePose[] = [];
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

      setProgressLabel("Analyzing your swing…");
      for (let i = 0; i < total; i++) {
        const t = (i / total) * duration;
        await seekTo(t);
        ctx.drawImage(v, 0, 0, w, h);
        try {
          const kp = await estimateFrame(canvas);
          if (kp) frames.push({ t, keypoints: kp });
        } catch {}
        setProgress(10 + Math.round((i / total) * 80));
      }

      if (frames.length < 6) throw new Error("No golfer found in frame. Ensure your whole body is visible and try again.");

      setProgressLabel("Computing angles & tempo…");
      setProgress(95);
      const analysis = analyzeSwing(frames);
      const id = crypto.randomUUID();
      await saveSession({
        id, createdAt: Date.now(), videoBlob: blob, thumbnail,
        videoWidth: w, videoHeight: h, duration, analysis,
      });
      URL.revokeObjectURL(url);
      navigate({ to: "/results/$id", params: { id } });
    } catch (e: any) {
      setError(e?.message ?? "Analysis failed");
      setPhase("error");
    }
  };

  return (
    <AppShell fullscreen>
      <div className="relative min-h-dvh bg-black text-white">
        {/* Top bar */}
        <div className="absolute top-0 inset-x-0 z-30 safe-top">
          <div className="flex items-center justify-between px-4 py-3">
            <button onClick={() => history.back()} className="h-10 w-10 grid place-items-center rounded-full bg-black/40 backdrop-blur">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="px-3 py-1.5 rounded-full bg-black/40 backdrop-blur text-xs font-medium">
              {phase === "recording" ? `● ${recordSecs.toFixed(1)}s` : phase === "ready" ? "Ready" : phase === "setup" ? "Setup" : ""}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowTutorial(true)}
                className="h-10 w-10 grid place-items-center rounded-full bg-black/40 backdrop-blur"
                aria-label="How to use"
              >
                <HelpCircle className="h-5 w-5" />
              </button>
              <button
                onClick={() => setFacing(f => f === "environment" ? "user" : "environment")}
                className="h-10 w-10 grid place-items-center rounded-full bg-black/40 backdrop-blur"
                aria-label="Flip camera"
              >
                <RefreshCw className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Camera viewport */}
        <div className="absolute inset-0">
          {phase !== "error" && (
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              playsInline muted autoPlay
              style={{ transform: facing === "user" ? "scaleX(-1)" : undefined }}
            />
          )}
          {/* Golf-stance silhouette guide — bright yellow with dark outline so it stays
              visible on any background (grass, indoor, bright sky). */}
          {(phase === "setup" || phase === "ready") && (
            <div className="absolute inset-0 grid place-items-center pointer-events-none">
              <svg
                viewBox="0 0 120 240"
                className="h-[75%] w-auto drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]"
                fill="none"
                stroke="#FFD23F"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ filter: "drop-shadow(0 0 1px #000) drop-shadow(0 0 1px #000)" }}
              >
                {/* Head — tilted slightly forward, addressing the ball */}
                <circle cx="62" cy="28" r="11" fill="rgba(255,210,63,0.18)" />
                {/* Spine — tilted forward over the ball */}
                <path d="M62 39 L56 110" />
                {/* Shoulders — slightly turned */}
                <path d="M44 56 L72 52" />
                {/* Lead arm (front) reaching down to grip */}
                <path d="M44 56 L52 95 L60 128" />
                {/* Trail arm meeting at the grip */}
                <path d="M72 52 L66 92 L60 128" />
                {/* Hands / grip dot */}
                <circle cx="60" cy="130" r="3" fill="#FFD23F" />
                {/* Club shaft + head down to the ball */}
                <path d="M60 130 L78 200" />
                <ellipse cx="80" cy="204" rx="6" ry="3" fill="#FFD23F" />
                {/* Hips */}
                <path d="M48 112 L68 110" />
                {/* Lead leg (slightly flexed) */}
                <path d="M48 112 L46 170 L44 215" />
                {/* Trail leg */}
                <path d="M68 110 L74 170 L78 215" />
                {/* Feet — shoulder width apart */}
                <path d="M36 218 L52 218" strokeWidth="5" />
                <path d="M70 218 L86 218" strokeWidth="5" />
                {/* Ball */}
                <circle cx="80" cy="210" r="3" fill="#fff" stroke="#000" strokeWidth="1" />
              </svg>
              <div className="absolute bottom-[18%] left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/60 text-[11px] font-semibold text-yellow-300 tracking-wide">
                Match this stance
              </div>
            </div>
          )}
          {/* Countdown overlay */}
          {phase === "countdown" && (
            <div className="absolute inset-0 grid place-items-center bg-black/30">
              <div className="text-[140px] font-extrabold drop-shadow-lg">{countdown}</div>
            </div>
          )}
          {phase === "recording" && (
            <div className="absolute top-20 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-destructive/90 text-destructive-foreground text-xs font-bold flex items-center gap-2">
              <CircleDot className="h-3.5 w-3.5 animate-pulse" /> RECORDING
            </div>
          )}
          {phase === "analyzing" && (
            <div className="absolute inset-0 bg-black/80 grid place-items-center px-8 text-center">
              <div className="w-full max-w-xs">
                <Loader2 className="h-10 w-10 animate-spin mx-auto text-accent" />
                <p className="mt-4 text-sm font-semibold">{progressLabel}</p>
                <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full bg-accent transition-all" style={{ width: `${progress}%` }} />
                </div>
                <p className="mt-2 text-xs text-white/60">All processing happens on your device. Nothing is uploaded.</p>
              </div>
            </div>
          )}
          {phase === "error" && (
            <div className="absolute inset-0 bg-black/85 grid place-items-center px-6 text-center">
              <div className="max-w-sm">
                <CameraOff className="h-10 w-10 mx-auto text-destructive" />
                <p className="mt-4 text-sm">{error}</p>
                <div className="mt-5 flex flex-col gap-2">
                  <button onClick={startCamera} className="rounded-full bg-accent text-accent-foreground px-5 py-2.5 text-sm font-semibold">
                    Try camera again
                  </button>
                  <button onClick={() => fileInputRef.current?.click()} className="rounded-full border border-white/30 px-5 py-2.5 text-sm font-semibold flex items-center justify-center gap-2">
                    <Upload className="h-4 w-4" /> Upload a video instead
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom controls */}
        {(phase === "ready" || phase === "setup") && (
          <div className="absolute bottom-0 inset-x-0 z-30 safe-bottom">
            <div className="px-6 pb-6 pt-10 bg-gradient-to-t from-black/80 to-transparent">
              <p className="text-center text-xs text-white/70 mb-4">
                Stand sideways · full body in frame · 6–8 ft away
              </p>
              <div className="flex items-center justify-center gap-6">
                <button onClick={() => fileInputRef.current?.click()} className="h-12 w-12 grid place-items-center rounded-full bg-white/10 backdrop-blur" aria-label="Upload video">
                  <Upload className="h-5 w-5" />
                </button>
                <button
                  onClick={beginCountdown}
                  className="h-20 w-20 rounded-full bg-accent text-accent-foreground grid place-items-center shadow-xl ring-4 ring-white/20 active:scale-95 transition"
                  aria-label="Record"
                >
                  <Camera className="h-7 w-7" />
                </button>
                <div className="h-12 w-12" />
              </div>
            </div>
          </div>
        )}
        {phase === "recording" && (
          <div className="absolute bottom-0 inset-x-0 z-30 safe-bottom">
            <div className="px-6 pb-6 pt-10 bg-gradient-to-t from-black/80 to-transparent">
              <div className="flex justify-center">
                <button
                  onClick={stopRecording}
                  className="h-20 w-20 rounded-full bg-destructive text-destructive-foreground grid place-items-center shadow-xl ring-4 ring-white/20 active:scale-95 transition"
                  aria-label="Stop"
                >
                  <div className="h-6 w-6 rounded bg-white" />
                </button>
              </div>
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={onFileUpload}
        />

        {/* Tutorial modal */}
        {showTutorial && (
          <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur grid place-items-end sm:place-items-center">
            <div className="w-full sm:max-w-md bg-card text-card-foreground rounded-t-3xl sm:rounded-3xl p-6 max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-bold">How to record your swing</h2>
                <button
                  onClick={() => setShowTutorial(false)}
                  className="h-9 w-9 grid place-items-center rounded-full bg-muted"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <ol className="space-y-3 text-sm">
                {[
                  { t: "Prop your phone up", d: "Place it at hip-to-waist height, 6–8 feet away, in portrait mode." },
                  { t: "Stand sideways (down-the-line)", d: "Camera should see you from behind, looking down the target line." },
                  { t: "Match the yellow stance guide", d: "Line up your head, shoulders, hips and feet with the silhouette so your full body is in frame." },
                  { t: "Tap the yellow record button", d: "You get a 5-second countdown to settle into your stance." },
                  { t: "Swing naturally", d: "Recording auto-stops after 10 seconds. We'll analyze posture, rotation, plane, tempo and balance — all on-device." },
                ].map((s, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="h-7 w-7 shrink-0 rounded-full bg-accent text-accent-foreground grid place-items-center text-xs font-bold">{i + 1}</span>
                    <div>
                      <p className="font-semibold">{s.t}</p>
                      <p className="text-muted-foreground text-[13px]">{s.d}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <button
                onClick={() => setShowTutorial(false)}
                className="mt-5 w-full rounded-full bg-primary text-primary-foreground py-3 text-sm font-semibold"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
