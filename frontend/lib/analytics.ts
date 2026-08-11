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

export const isBadPosture = (landmarks: Landmark[]): boolean => {
  const head = landmarks[0]; // nose
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  if (!head || !leftShoulder || !rightShoulder) return false;
  const shoulderWidth = Math.hypot(
    leftShoulder.x - rightShoulder.x,
    leftShoulder.y - rightShoulder.y
  );
  if (shoulderWidth < 1e-4) return false;
  if ((leftShoulder.visibility ?? 1) < 0.55 || (rightShoulder.visibility ?? 1) < 0.55) return false;
  const midShoulders = { x: (leftShoulder.x + rightShoulder.x) / 2, y: (leftShoulder.y + rightShoulder.y) / 2 };
  const shoulderTilt = Math.abs(leftShoulder.y - rightShoulder.y) / shoulderWidth;
  const headOffset = Math.abs(head.x - midShoulders.x) / shoulderWidth;
  const headGap = (midShoulders.y - head.y) / shoulderWidth;
  // Conservative cues avoid flagging normal movement as poor posture.
  return shoulderTilt > 0.18 || headOffset > 0.5 || headGap < 0.34;
};
