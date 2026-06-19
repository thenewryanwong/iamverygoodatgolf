export interface Pt { x: number; y: number; score?: number; }

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

// Angle ABC in degrees (at vertex B)
export function angle3(a: Pt, b: Pt, c: Pt): number {
  const v1x = a.x - b.x, v1y = a.y - b.y;
  const v2x = c.x - b.x, v2y = c.y - b.y;
  const dot = v1x * v2x + v1y * v2y;
  const m1 = Math.hypot(v1x, v1y), m2 = Math.hypot(v2x, v2y);
  if (m1 === 0 || m2 === 0) return 0;
  const cos = Math.max(-1, Math.min(1, dot / (m1 * m2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

// Angle of vector from->to relative to vertical (down). 0° = pointing down, 90° = horizontal.
export function angleFromVertical(from: Pt, to: Pt): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const a = (Math.atan2(dx, dy) * 180) / Math.PI; // 0 down, +right
  return Math.abs(a);
}

// Midpoint
export const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

// Score in [0,100] based on how close v is to [min,max]; exponential decay outside.
export function scoreInRange(v: number, min: number, max: number, tolerance = 15): number {
  if (v >= min && v <= max) return 100;
  const d = v < min ? min - v : v - max;
  return Math.max(0, Math.round(100 * Math.exp(-(d * d) / (2 * tolerance * tolerance))));
}

export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
