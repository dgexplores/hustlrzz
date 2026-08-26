import { Landmark } from "./types";

const GAZE_MIN = 0.26;
const GAZE_MAX = 0.74;

export const isFacingForward = (landmarks: Landmark[]): boolean => {
  const eyeRatios = [
    [33, 133, 468], // right eye and iris center in the FaceLandmarker topology
    [263, 362, 473], // left eye and iris center
  ].flatMap(([outer, inner, irisStart]) => {
    const a = landmarks[outer], b = landmarks[inner];
    const iris = landmarks.slice(irisStart, irisStart + 5);
    if (!a || !b || iris.length !== 5) return [];
    const center = iris.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
    const dx = b.x - a.x, dy = b.y - a.y, lengthSquared = dx * dx + dy * dy;
    if (lengthSquared < 1e-6) return [];
    return [((center.x / 5 - a.x) * dx + (center.y / 5 - a.y) * dy) / lengthSquared];
  });
  return eyeRatios.length > 0 && eyeRatios.every((ratio) => ratio >= GAZE_MIN && ratio <= GAZE_MAX);
};

export interface PostureDetails {
  shoulderTiltDeg: number;
  headTiltDeg: number;
  headGapRatio: number;
  headOffsetRatio: number;
  isBad: boolean;
}

const RAD_TO_DEG = 180 / Math.PI;

/**
 * Richer posture geometry from pose landmarks.
 * - shoulder tilt: uneven shoulders (leaning/slouching sideways)
 * - head tilt: ear-line rotation relative to the shoulder line
 * - head gap: chin-to-shoulder distance; shrinking gap reads as slumping
 */
export const postureDetails = (landmarks: Landmark[]): PostureDetails | null => {
  const nose = landmarks[0];
  const leftEar = landmarks[7];
  const rightEar = landmarks[8];
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  if (!nose || !leftShoulder || !rightShoulder) return null;
  const leftVis = (leftShoulder.visibility ?? 1) >= 0.55;
  const rightVis = (rightShoulder.visibility ?? 1) >= 0.55;
  if (!leftVis && !rightVis) return null;

  const shoulderWidth = Math.hypot(leftShoulder.x - rightShoulder.x, leftShoulder.y - rightShoulder.y);
  if (shoulderWidth < 1e-4) return null;

  const midShoulders = {
    x: (leftShoulder.x + rightShoulder.x) / 2,
    y: (leftShoulder.y + rightShoulder.y) / 2,
  };
  const shoulderTiltDeg = Math.abs(Math.atan2(rightShoulder.y - leftShoulder.y, rightShoulder.x - leftShoulder.x)) * RAD_TO_DEG;
  const normalizedTilt = Math.min(90, Math.abs(leftShoulder.y - rightShoulder.y) / shoulderWidth * 100);

  let headTiltDeg = 0;
  if (leftEar && rightEar) {
    const angle = Math.atan2(rightEar.y - leftEar.y, rightEar.x - leftEar.x) * RAD_TO_DEG;
    headTiltDeg = Math.abs(angle > 90 ? angle - 180 : angle < -90 ? angle + 180 : angle);
  }

  const headOffsetRatio = Math.abs(nose.x - midShoulders.x) / shoulderWidth;
  const headGapRatio = (midShoulders.y - nose.y) / shoulderWidth;

  const isBad =
    (leftVis && rightVis && shoulderTiltDeg > 10.3) ||
    headOffsetRatio > 0.5 ||
    headGapRatio < 0.34;

  // Keep the legacy numeric scale meaningful for downstream consumers.
  return {
    shoulderTiltDeg: Number(normalizedTilt.toFixed(1)),
    headTiltDeg: Number(headTiltDeg.toFixed(1)),
    headGapRatio: Number(headGapRatio.toFixed(3)),
    headOffsetRatio: Number(headOffsetRatio.toFixed(3)),
    isBad,
  };
};

/** Legacy boolean cue retained for compatibility with the overlay pipeline. */
export const isBadPosture = (landmarks: Landmark[]): boolean =>
  postureDetails(landmarks)?.isBad ?? false;

/** Exponential moving average used to keep live numbers calm and readable. */
export const smooth = (previous: number, next: number, alpha = 0.12): number =>
  previous * (1 - alpha) + next * alpha;

export const clamp = (value: number, min = 0, max = 100): number =>
  Math.min(max, Math.max(min, value));
