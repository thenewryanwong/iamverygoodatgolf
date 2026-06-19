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

      // Thumbnail at 25% time
      v.currentTime = Math.min(duration * 0.25, 1.5);
      await new Promise<void>(res => { v.onseeked = () => res(); });
      const tc = document.createElement("canvas");
      tc.width = 240; tc.height = Math.round(240 * h / w);
      tc.getContext("2d")!.drawImage(v, 0, 0, tc.width, tc.height);
      const thumbnail = tc.toDataURL("image/jpeg", 0.75);

      // Sample frames at ~15 fps
      const fps = 15;
      const total = Math.max(8, Math.floor(duration * fps));
      const frames: FramePose[] = [];
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

      setProgressLabel("Analyzing your swing…");
      for (let i = 0; i < total; i++) {
        const t = (i / total) * duration;
        v.currentTime = t;
        await new Promise<void>(res => { v.onseeked = () => res(); });
        ctx.drawImage(v, 0, 0, w, h);
        const kp = await estimateFrame(canvas);
        if (kp) frames.push({ t, keypoints: kp });
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
            <button
              onClick={() => setFacing(f => f === "environment" ? "user" : "environment")}
              className="h-10 w-10 grid place-items-center rounded-full bg-black/40 backdrop-blur"
              aria-label="Flip camera"
            >
              <RefreshCw className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Camera viewport */}
        <div className="absolute inset-0">
          {phase !== "error" && (
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              playsInline muted
              style={{ transform: facing === "user" ? "scaleX(-1)" : undefined }}
            />
          )}
          {/* Silhouette guide */}
          {(phase === "setup" || phase === "ready") && (
            <svg viewBox="0 0 100 220" className="absolute inset-0 m-auto h-[70%] w-auto opacity-25 text-accent" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="50" cy="22" r="10" />
              <path d="M50 32 L50 110 M30 55 L70 55 M50 110 L34 180 M50 110 L66 180" strokeLinecap="round" />
            </svg>
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
      </div>
    </AppShell>
  );
}
