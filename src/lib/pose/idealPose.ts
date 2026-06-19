// Synthesized "ideal" / "perfect" swing poses used for the side-by-side
// comparison panel. These are NOT camera-detected — they are a procedurally
// drawn reference golfer at three canonical phases (address, top, impact)
// using the KP index layout from `detector.ts`. Coordinates are in a
// 100×220 virtual canvas with origin top-left, matching down-the-line view.
//
// We expose pose vectors so the renderer can use the same drawSkeleton
// pipeline as the user's detected pose, and we provide angle targets that
// match `IDEAL` so we can label "what good looks like" next to each metric.

import { KP } from "./detector";
import type { Pt } from "./math";

export type IdealPhase = "address" | "top" | "impact";

const P = (x: number, y: number): Pt => ({ x, y, score: 1 });

/**
 * Build a 17-keypoint pose for a right-handed golfer at the given phase.
 * Down-the-line view: camera behind golfer, target to the right.
 */
export function idealPose(phase: IdealPhase): Pt[] {
  const kp: Pt[] = new Array(17).fill(null).map(() => P(0, 0));

  if (phase === "address") {
    // Slight forward spine tilt (~33°), arms hanging, shoulder-width feet.
    kp[KP.NOSE]          = P(52, 32);
    kp[KP.LEFT_EYE]      = P(54, 30);
    kp[KP.RIGHT_EYE]     = P(50, 30);
    kp[KP.LEFT_EAR]      = P(55, 32);
    kp[KP.RIGHT_EAR]     = P(49, 32);
    kp[KP.LEFT_SHOULDER] = P(58, 58);
    kp[KP.RIGHT_SHOULDER]= P(42, 58);
    kp[KP.LEFT_ELBOW]    = P(60, 92);
    kp[KP.RIGHT_ELBOW]   = P(44, 92);
    kp[KP.LEFT_WRIST]    = P(54, 122);
    kp[KP.RIGHT_WRIST]   = P(50, 122);
    kp[KP.LEFT_HIP]      = P(56, 118);
    kp[KP.RIGHT_HIP]     = P(44, 118);
    kp[KP.LEFT_KNEE]     = P(56, 162);
    kp[KP.RIGHT_KNEE]    = P(44, 162);
    kp[KP.LEFT_ANKLE]    = P(57, 204);
    kp[KP.RIGHT_ANKLE]   = P(43, 204);
  } else if (phase === "top") {
    // Top of backswing: ~95° shoulder turn, ~50° hip turn, lead arm
    // straight (~175°), wrist hinged ~90°, spine angle preserved.
    kp[KP.NOSE]          = P(50, 32);
    kp[KP.LEFT_EYE]      = P(52, 30);
    kp[KP.RIGHT_EYE]     = P(48, 30);
    kp[KP.LEFT_EAR]      = P(53, 32);
    kp[KP.RIGHT_EAR]     = P(47, 32);
    // Shoulders coiled — lead shoulder under chin (left shoulder swung
    // toward camera/right of frame, trail shoulder pulled back/up).
    kp[KP.LEFT_SHOULDER] = P(62, 60);
    kp[KP.RIGHT_SHOULDER]= P(38, 56);
    // Hips turned less (~50°)
    kp[KP.LEFT_HIP]      = P(56, 118);
    kp[KP.RIGHT_HIP]     = P(42, 116);
    // Lead arm straight, across chest, hands high above trail shoulder.
    kp[KP.LEFT_ELBOW]    = P(48, 70);
    kp[KP.LEFT_WRIST]    = P(30, 50);
    // Trail arm folded (~90° at elbow), elbow points down.
    kp[KP.RIGHT_ELBOW]   = P(28, 78);
    kp[KP.RIGHT_WRIST]   = P(30, 50);
    // Legs stable, slight knee flex preserved.
    kp[KP.LEFT_KNEE]     = P(57, 162);
    kp[KP.RIGHT_KNEE]    = P(45, 160);
    kp[KP.LEFT_ANKLE]    = P(58, 204);
    kp[KP.RIGHT_ANKLE]   = P(44, 204);
  } else {
    // Impact: hips open (~40°), shoulders nearly square, hands ahead of ball,
    // head behind the ball, weight forward on lead leg.
    kp[KP.NOSE]          = P(48, 32);
    kp[KP.LEFT_EYE]      = P(50, 30);
    kp[KP.RIGHT_EYE]     = P(46, 30);
    kp[KP.LEFT_EAR]      = P(51, 32);
    kp[KP.RIGHT_EAR]     = P(45, 32);
    kp[KP.LEFT_SHOULDER] = P(58, 58);
    kp[KP.RIGHT_SHOULDER]= P(42, 60);
    kp[KP.LEFT_ELBOW]    = P(62, 92);
    kp[KP.RIGHT_ELBOW]   = P(48, 96);
    kp[KP.LEFT_WRIST]    = P(64, 126);
    kp[KP.RIGHT_WRIST]   = P(60, 124);
    // Hips rotated open toward target (left hip pulled back in DTL view).
    kp[KP.LEFT_HIP]      = P(60, 118);
    kp[KP.RIGHT_HIP]     = P(40, 116);
    kp[KP.LEFT_KNEE]     = P(58, 162);
    kp[KP.RIGHT_KNEE]    = P(46, 164);
    kp[KP.LEFT_ANKLE]    = P(57, 204);
    kp[KP.RIGHT_ANKLE]   = P(45, 204);
  }
  return kp;
}

// Normalize a pose into the target canvas size while preserving aspect.
export function fitPoseToBox(
  kp: Pt[],
  boxW: number,
  boxH: number,
  srcW = 100,
  srcH = 220,
  pad = 8,
): Pt[] {
  const sx = (boxW - pad * 2) / srcW;
  const sy = (boxH - pad * 2) / srcH;
  const s = Math.min(sx, sy);
  const offX = (boxW - srcW * s) / 2;
  const offY = (boxH - srcH * s) / 2;
  return kp.map(p => ({ x: p.x * s + offX, y: p.y * s + offY, score: p.score }));
}
