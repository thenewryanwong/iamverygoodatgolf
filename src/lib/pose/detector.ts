// Browser-only MoveNet loader. Never import from server modules.
import type { Pt } from "./math";

export const KP = {
  NOSE: 0,
  LEFT_EYE: 1, RIGHT_EYE: 2,
  LEFT_EAR: 3, RIGHT_EAR: 4,
  LEFT_SHOULDER: 5, RIGHT_SHOULDER: 6,
  LEFT_ELBOW: 7, RIGHT_ELBOW: 8,
  LEFT_WRIST: 9, RIGHT_WRIST: 10,
  LEFT_HIP: 11, RIGHT_HIP: 12,
  LEFT_KNEE: 13, RIGHT_KNEE: 14,
  LEFT_ANKLE: 15, RIGHT_ANKLE: 16,
} as const;

export type FramePose = { t: number; keypoints: Pt[] };

let detectorPromise: Promise<any> | null = null;

export async function getDetector() {
  if (detectorPromise) return detectorPromise;
  detectorPromise = (async () => {
    const tf = await import("@tensorflow/tfjs");
    await import("@tensorflow/tfjs-backend-webgl");
    await tf.setBackend("webgl");
    await tf.ready();
    const posedetection = await import("@tensorflow-models/pose-detection");
    return posedetection.createDetector(posedetection.SupportedModels.MoveNet, {
      modelType: posedetection.movenet.modelType.SINGLEPOSE_THUNDER,
    });
  })();
  return detectorPromise;
}

export async function estimateFrame(source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap): Promise<Pt[] | null> {
  const detector = await getDetector();
  const poses = await detector.estimatePoses(source as any, { maxPoses: 1, flipHorizontal: false });
  if (!poses?.length) return null;
  return poses[0].keypoints.map((k: any) => ({ x: k.x, y: k.y, score: k.score }));
}
