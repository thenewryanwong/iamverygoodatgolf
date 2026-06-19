// Empty stub for @mediapipe/pose. We use MoveNet, not BlazePose, so the
// mediapipe runtime is never executed. The pose-detection ESM bundle still
// statically imports `Pose` from this package; this stub satisfies the
// bundler without pulling in mediapipe's UMD/window-coupled code.
export class Pose {
  constructor(_opts?: unknown) {}
  setOptions(_o?: unknown) {}
  onResults(_cb?: unknown) {}
  send(_data?: unknown) { return Promise.resolve(); }
  close() {}
  reset() {}
  initialize() { return Promise.resolve(); }
}
export default { Pose };
