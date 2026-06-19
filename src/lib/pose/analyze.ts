import { KP, type FramePose } from "./detector";
import { angle3, angleFromVertical, dist, mid, scoreInRange, type Pt } from "./math";
import { IDEAL, WEIGHTS } from "./ideal";

export interface SwingError {
  id: string;
  timestamp: number;
  bodyPart: string;
  issue: string;
  actualValue: number;
  idealRange: [number, number];
  severity: "high" | "medium" | "low";
  tip: string;
  unit?: string;
}

export interface PhaseTimes {
  address: number;
  top: number;
  impact: number;
  finish: number;
}

export interface SwingMetrics {
  spineTiltAddress: number;
  spineTiltDrift: number;
  shoulderTurn: number;
  hipTurn: number;
  xFactor: number;
  leadArmStraightness: number;
  wristHinge: number;
  headLateral: number; // % body height
  headVertical: number;
  tempoRatio: number;
  handSpeedPeak: number; // normalized
}

export interface SwingScores {
  overall: number;
  posture: number;
  rotation: number;
  plane: number;
  tempo: number;
  balance: number;
}

export interface AnalysisResult {
  metrics: SwingMetrics;
  scores: SwingScores;
  errors: SwingError[];
  phases: PhaseTimes;
  keyFrameIdx: number; // index in frames for the still display (top of backswing)
  frames: FramePose[];
}

const goodKP = (p?: Pt) => !!p && (p.score ?? 0) > 0.3;

function shoulderLineAngle(kp: Pt[]): number {
  const l = kp[KP.LEFT_SHOULDER], r = kp[KP.RIGHT_SHOULDER];
  if (!goodKP(l) || !goodKP(r)) return 0;
  return (Math.atan2(r.y - l.y, r.x - l.x) * 180) / Math.PI;
}
function hipLineAngle(kp: Pt[]): number {
  const l = kp[KP.LEFT_HIP], r = kp[KP.RIGHT_HIP];
  if (!goodKP(l) || !goodKP(r)) return 0;
  return (Math.atan2(r.y - l.y, r.x - l.x) * 180) / Math.PI;
}

function spineTilt(kp: Pt[]): number {
  const sm = mid(kp[KP.LEFT_SHOULDER], kp[KP.RIGHT_SHOULDER]);
  const hm = mid(kp[KP.LEFT_HIP], kp[KP.RIGHT_HIP]);
  return angleFromVertical(hm, sm);
}

function bodyHeight(kp: Pt[]): number {
  const head = kp[KP.NOSE];
  const ank = goodKP(kp[KP.LEFT_ANKLE]) ? kp[KP.LEFT_ANKLE] : kp[KP.RIGHT_ANKLE];
  if (!goodKP(head) || !goodKP(ank)) return 1;
  return Math.max(1, Math.abs(ank.y - head.y));
}

export function analyzeSwing(frames: FramePose[]): AnalysisResult {
  // Filter frames that have enough confident keypoints
  const usable = frames.filter(f => {
    const k = f.keypoints;
    return [KP.LEFT_SHOULDER, KP.RIGHT_SHOULDER, KP.LEFT_HIP, KP.RIGHT_HIP, KP.NOSE]
      .every(i => goodKP(k[i]));
  });
  if (usable.length < 8) {
    // degenerate fallback
    return degenerate(frames);
  }

  // Determine lead side: assume right-handed golfer down-the-line — lead = left
  const LEAD_SHOULDER = KP.LEFT_SHOULDER, LEAD_ELBOW = KP.LEFT_ELBOW, LEAD_WRIST = KP.LEFT_WRIST;

  // Hand-Y (wrist midpoint) over time → top of backswing = max Y above start (image Y grows down)
  const handY = usable.map(f => {
    const lw = f.keypoints[KP.LEFT_WRIST], rw = f.keypoints[KP.RIGHT_WRIST];
    const y = goodKP(lw) && goodKP(rw) ? (lw.y + rw.y) / 2 : (goodKP(lw) ? lw.y : (goodKP(rw) ? rw.y : 0));
    return y;
  });

  // Address = first frame; find top = min handY (highest in image)
  const addressIdx = 0;
  let topIdx = 0;
  for (let i = 1; i < handY.length; i++) if (handY[i] < handY[topIdx]) topIdx = i;
  if (topIdx < 2) topIdx = Math.floor(usable.length / 3);

  // Impact = after top, hands return to roughly address Y (local min derivative)
  let impactIdx = topIdx;
  const addressY = handY[addressIdx];
  for (let i = topIdx + 1; i < handY.length; i++) {
    if (handY[i] >= addressY * 0.98) { impactIdx = i; break; }
  }
  if (impactIdx === topIdx) impactIdx = Math.min(handY.length - 1, topIdx + Math.max(3, Math.floor((handY.length - topIdx) / 2)));
  const finishIdx = usable.length - 1;

  const phases: PhaseTimes = {
    address: usable[addressIdx].t,
    top: usable[topIdx].t,
    impact: usable[impactIdx].t,
    finish: usable[finishIdx].t,
  };

  // Metrics
  const addrKP = usable[addressIdx].keypoints;
  const topKP = usable[topIdx].keypoints;
  const impactKP = usable[impactIdx].keypoints;

  const spineTiltAddress = spineTilt(addrKP);
  // Drift = max |tilt - address| through swing
  let drift = 0;
  for (const f of usable) {
    const t = spineTilt(f.keypoints);
    drift = Math.max(drift, Math.abs(t - spineTiltAddress));
  }

  const shAddr = shoulderLineAngle(addrKP);
  const shTop = shoulderLineAngle(topKP);
  const shoulderTurn = Math.abs(((shTop - shAddr + 540) % 360) - 180);

  const hipAddr = hipLineAngle(addrKP);
  const hipTop = hipLineAngle(topKP);
  const hipTurn = Math.abs(((hipTop - hipAddr + 540) % 360) - 180);

  const xFactor = Math.max(0, shoulderTurn - hipTurn);

  // Lead arm straightness at top
  const ls = topKP[LEAD_SHOULDER], le = topKP[LEAD_ELBOW], lw = topKP[LEAD_WRIST];
  const leadArmStraightness = goodKP(ls) && goodKP(le) && goodKP(lw) ? angle3(ls, le, lw) : 170;

  // Wrist hinge at top (angle between lead forearm and a "club" approximation = elbow→wrist extended)
  // Approximate as angle between (elbow→wrist) and (shoulder→elbow)
  const wristHinge = goodKP(ls) && goodKP(le) && goodKP(lw) ? 180 - angle3(ls, le, lw) + 60 : 85;

  // Head movement
  const bh = bodyHeight(addrKP);
  const headAddr = addrKP[KP.NOSE], headImp = impactKP[KP.NOSE];
  const headLateral = goodKP(headAddr) && goodKP(headImp) ? (Math.abs(headImp.x - headAddr.x) / bh) * 100 : 0;
  const headVertical = goodKP(headAddr) && goodKP(headImp) ? (Math.abs(headImp.y - headAddr.y) / bh) * 100 : 0;

  // Tempo
  const tBack = usable[topIdx].t - usable[addressIdx].t;
  const tDown = Math.max(0.05, usable[impactIdx].t - usable[topIdx].t);
  const tempoRatio = tBack / tDown;

  // Hand speed peak (downswing): pixels/sec normalized by body height
  let handSpeedPeak = 0;
  for (let i = topIdx + 1; i <= impactIdx && i < usable.length; i++) {
    const a = usable[i - 1], b = usable[i];
    const aw = a.keypoints[KP.LEFT_WRIST], bw = b.keypoints[KP.LEFT_WRIST];
    if (goodKP(aw) && goodKP(bw)) {
      const dt = Math.max(0.001, b.t - a.t);
      const v = dist(aw, bw) / dt / bh;
      handSpeedPeak = Math.max(handSpeedPeak, v);
    }
  }

  const metrics: SwingMetrics = {
    spineTiltAddress, spineTiltDrift: drift,
    shoulderTurn, hipTurn, xFactor,
    leadArmStraightness, wristHinge,
    headLateral, headVertical,
    tempoRatio, handSpeedPeak,
  };

  // Scores
  const sPosture = Math.round(
    (scoreInRange(spineTiltAddress, IDEAL.spineTiltAddress.min, IDEAL.spineTiltAddress.max, 8) +
      scoreInRange(drift, IDEAL.spineTiltDrift.min, IDEAL.spineTiltDrift.max, 6)) / 2
  );
  const sRotation = Math.round(
    (scoreInRange(shoulderTurn, IDEAL.shoulderTurn.min, IDEAL.shoulderTurn.max, 18) +
      scoreInRange(hipTurn, IDEAL.hipTurn.min, IDEAL.hipTurn.max, 12) +
      scoreInRange(xFactor, IDEAL.xFactor.min, IDEAL.xFactor.max, 15)) / 3
  );
  const sPlane = Math.round(
    (scoreInRange(leadArmStraightness, IDEAL.leadArmStraightness.min, IDEAL.leadArmStraightness.max, 12) +
      scoreInRange(wristHinge, IDEAL.wristHinge.min, IDEAL.wristHinge.max, 15)) / 2
  );
  const sTempo = scoreInRange(tempoRatio, IDEAL.tempoRatio.min, IDEAL.tempoRatio.max, 0.7);
  const sBalance = Math.round(
    (scoreInRange(headLateral, IDEAL.headLateral.min, IDEAL.headLateral.max, 3) +
      scoreInRange(headVertical, IDEAL.headVertical.min, IDEAL.headVertical.max, 3)) / 2
  );

  const overall = Math.round(
    sPosture * WEIGHTS.posture +
    sRotation * WEIGHTS.rotation +
    sPlane * WEIGHTS.plane +
    sTempo * WEIGHTS.tempo +
    sBalance * WEIGHTS.balance
  );

  const scores: SwingScores = { overall, posture: sPosture, rotation: sRotation, plane: sPlane, tempo: sTempo, balance: sBalance };

  // Errors
  const errors: SwingError[] = [];
  const sev = (delta: number, tol: number): "high" | "medium" | "low" =>
    delta > tol * 2 ? "high" : delta > tol ? "medium" : "low";

  const add = (
    cond: boolean, e: Omit<SwingError, "id">
  ) => { if (cond) errors.push({ id: crypto.randomUUID(), ...e }); };

  add(shoulderTurn < IDEAL.shoulderTurn.min, {
    timestamp: phases.top, bodyPart: "shoulders",
    issue: "Limited shoulder turn",
    actualValue: Math.round(shoulderTurn), idealRange: [IDEAL.shoulderTurn.min, IDEAL.shoulderTurn.max],
    severity: sev(IDEAL.shoulderTurn.min - shoulderTurn, 10),
    tip: "Rotate your upper body further on the backswing. Feel your lead shoulder reach under your chin to load more power.",
    unit: "°",
  });
  add(shoulderTurn > IDEAL.shoulderTurn.max, {
    timestamp: phases.top, bodyPart: "shoulders",
    issue: "Over-rotated shoulders",
    actualValue: Math.round(shoulderTurn), idealRange: [IDEAL.shoulderTurn.min, IDEAL.shoulderTurn.max],
    severity: sev(shoulderTurn - IDEAL.shoulderTurn.max, 10),
    tip: "You're turning past parallel. Shorten the backswing slightly to stay in control through impact.", unit: "°",
  });
  add(xFactor < IDEAL.xFactor.min, {
    timestamp: phases.top, bodyPart: "hips/shoulders",
    issue: "Low X-Factor (poor coil)",
    actualValue: Math.round(xFactor), idealRange: [IDEAL.xFactor.min, IDEAL.xFactor.max],
    severity: sev(IDEAL.xFactor.min - xFactor, 10),
    tip: "Quiet your hips on the backswing while your shoulders keep turning. The separation creates clubhead speed.", unit: "°",
  });
  add(leadArmStraightness < IDEAL.leadArmStraightness.min, {
    timestamp: phases.top, bodyPart: "lead arm",
    issue: "Lead arm bends at top",
    actualValue: Math.round(leadArmStraightness), idealRange: [IDEAL.leadArmStraightness.min, 180],
    severity: sev(IDEAL.leadArmStraightness.min - leadArmStraightness, 8),
    tip: "Keep your lead arm straight at the top for a wider arc and more consistent contact.", unit: "°",
  });
  add(drift > IDEAL.spineTiltDrift.max, {
    timestamp: phases.impact, bodyPart: "spine",
    issue: "Posture changes during swing",
    actualValue: Math.round(drift), idealRange: [0, IDEAL.spineTiltDrift.max],
    severity: sev(drift - IDEAL.spineTiltDrift.max, 5),
    tip: "Maintain your spine angle from address through impact. Avoid standing up early — keep your chest down to the ball.", unit: "°",
  });
  add(headLateral > IDEAL.headLateral.max, {
    timestamp: phases.impact, bodyPart: "head",
    issue: "Head sways laterally",
    actualValue: +headLateral.toFixed(1), idealRange: [0, IDEAL.headLateral.max],
    severity: sev(headLateral - IDEAL.headLateral.max, 3),
    tip: "Keep your head centered over the ball. Excess lateral sway makes solid contact difficult.", unit: "%",
  });
  add(headVertical > IDEAL.headVertical.max, {
    timestamp: phases.impact, bodyPart: "head",
    issue: "Head lifts before impact",
    actualValue: +headVertical.toFixed(1), idealRange: [0, IDEAL.headVertical.max],
    severity: sev(headVertical - IDEAL.headVertical.max, 3),
    tip: "Stay down through the shot. Lifting your head pulls the club off plane and thins or tops the ball.", unit: "%",
  });
  add(tempoRatio < IDEAL.tempoRatio.min, {
    timestamp: phases.top, bodyPart: "tempo",
    issue: "Rushed transition",
    actualValue: +tempoRatio.toFixed(2), idealRange: [IDEAL.tempoRatio.min, IDEAL.tempoRatio.max],
    severity: sev(IDEAL.tempoRatio.min - tempoRatio, 0.6),
    tip: "Slow your backswing. Aim for a 3:1 backswing-to-downswing rhythm — smoother tempo means better timing.",
  });
  add(tempoRatio > IDEAL.tempoRatio.max, {
    timestamp: phases.top, bodyPart: "tempo",
    issue: "Slow transition / decelerating",
    actualValue: +tempoRatio.toFixed(2), idealRange: [IDEAL.tempoRatio.min, IDEAL.tempoRatio.max],
    severity: sev(tempoRatio - IDEAL.tempoRatio.max, 0.6),
    tip: "Commit to the downswing. A slightly quicker transition produces more clubhead speed.",
  });
  add(hipTurn < IDEAL.hipTurn.min, {
    timestamp: phases.impact, bodyPart: "hips",
    issue: "Hips fire late or under-rotate",
    actualValue: Math.round(hipTurn), idealRange: [IDEAL.hipTurn.min, IDEAL.hipTurn.max],
    severity: sev(IDEAL.hipTurn.min - hipTurn, 8),
    tip: "Start the downswing with your hips. Feel them open toward the target before your arms fall.", unit: "°",
  });

  // Sort by severity then timestamp
  const rank = { high: 0, medium: 1, low: 2 } as const;
  errors.sort((a, b) => rank[a.severity] - rank[b.severity] || a.timestamp - b.timestamp);

  // Pick keyframe = top of backswing index in the ORIGINAL frames array
  const topT = usable[topIdx].t;
  let keyFrameIdx = 0, best = Infinity;
  for (let i = 0; i < frames.length; i++) {
    const d = Math.abs(frames[i].t - topT);
    if (d < best) { best = d; keyFrameIdx = i; }
  }

  return { metrics, scores, errors, phases, keyFrameIdx, frames };
}

function degenerate(frames: FramePose[]): AnalysisResult {
  return {
    metrics: {
      spineTiltAddress: 0, spineTiltDrift: 0, shoulderTurn: 0, hipTurn: 0, xFactor: 0,
      leadArmStraightness: 0, wristHinge: 0, headLateral: 0, headVertical: 0, tempoRatio: 0, handSpeedPeak: 0,
    },
    scores: { overall: 0, posture: 0, rotation: 0, plane: 0, tempo: 0, balance: 0 },
    errors: [{
      id: crypto.randomUUID(), timestamp: 0, bodyPart: "body", issue: "Pose not detected reliably",
      actualValue: 0, idealRange: [0, 0], severity: "high",
      tip: "We couldn't track your body clearly. Stand 6–8 feet from the camera, sideways, with your whole body in frame and good lighting.",
    }],
    phases: { address: 0, top: 0, impact: 0, finish: frames.at(-1)?.t ?? 0 },
    keyFrameIdx: 0,
    frames,
  };
}
